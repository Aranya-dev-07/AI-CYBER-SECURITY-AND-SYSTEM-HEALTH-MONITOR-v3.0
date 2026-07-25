"""
recommendation_engine.py

AI health scoring, root cause analysis and recommendation engine for
the Lavender Trinetra system.

Consumes the combined monitoring/security data and the output of
anomaly_engine.py (as orchestrated by ai_engine.py), calculates an
explainable AI Health Score, performs root cause analysis, and
generates system and security recommendations.

This module does NOT collect monitoring data, access the database, or
implement anomaly detection. It only produces scoring, root cause and
recommendation results for ai_engine.py to aggregate.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
logger.setLevel(logging.INFO)


class RecommendationEngineError(Exception):
    """Raised when the recommendation engine cannot complete its analysis."""


# Weights used when deducting from the base health score (100).
# Kept as module-level constants for transparency/explainability.
SEVERITY_PENALTIES: Dict[str, float] = {
    "low": 3.0,
    "medium": 8.0,
    "high": 18.0,
    "critical": 30.0,
}

METRIC_WARNING_THRESHOLDS: Dict[str, float] = {
    "cpu_percent": 80.0,
    "memory_percent": 80.0,
    "disk_percent": 85.0,
}

METRIC_CRITICAL_THRESHOLDS: Dict[str, float] = {
    "cpu_percent": 95.0,
    "memory_percent": 95.0,
    "disk_percent": 95.0,
}

SECURITY_METRIC_LABELS: Dict[str, str] = {
    "suspicious_process_count": "suspicious processes",
    "failed_login_count": "failed login attempts",
}


@dataclass
class RootCauseFinding:
    """A single root cause finding, with supporting evidence."""

    category: str
    cause: str
    confidence: str
    evidence: List[str] = field(default_factory=list)


@dataclass
class Recommendation:
    """A single actionable recommendation."""

    category: str
    priority: str
    title: str
    description: str
    related_metric: Optional[str] = None


def _safe_get(d: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    current: Any = d
    for key in keys:
        if not isinstance(current, dict):
            return default
        current = current.get(key, default)
    return current


def _extract_metric_values(monitoring: Dict[str, Any]) -> Dict[str, Optional[float]]:
    """Pulls the same core metrics used by anomaly_engine.py, for use
    in scoring/root-cause explanations here."""
    cpu = monitoring.get("cpu", {}) or {}
    memory = monitoring.get("memory", {}) or {}
    disk = monitoring.get("disk", {}) or {}

    memory_vm = memory.get("virtual_memory", {}) or {}

    disk_percent: Optional[float] = None
    partitions = disk.get("partitions") or []
    if partitions:
        percentages = [
            p.get("percent")
            for p in partitions
            if isinstance(p.get("percent"), (int, float))
        ]
        if percentages:
            disk_percent = sum(percentages) / len(percentages)

    return {
        "cpu_percent": cpu.get("cpu_percent"),
        "memory_percent": memory_vm.get("percent"),
        "disk_percent": disk_percent,
    }


class RecommendationEngine:
    """
    AI health scoring, root cause analysis and recommendation engine.

    Usage:
        engine = RecommendationEngine()
        result = engine.analyze(combined_data, anomaly_results)
    """

    def __init__(
        self,
        base_score: float = 100.0,
        min_score: float = 0.0,
        max_score: float = 100.0,
    ) -> None:
        """
        Args:
            base_score: Starting health score before penalties are applied.
            min_score: Floor for the final health score.
            max_score: Ceiling for the final health score.
        """
        self.base_score = base_score
        self.min_score = min_score
        self.max_score = max_score

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    # ------------------------------------------------------------------
    # Health score
    # ------------------------------------------------------------------

    def _calculate_health_score(
        self,
        anomalies: List[Dict[str, Any]],
        metrics: Dict[str, Optional[float]],
        errors: List[str],
    ) -> Tuple[float, List[str]]:
        """
        Returns the final health score and a list of human-readable
        explanations for each deduction (explainability).
        """
        score = self.base_score
        explanations: List[str] = []

        try:
            for anomaly in anomalies:
                severity = str(anomaly.get("severity", "low")).lower()
                penalty = SEVERITY_PENALTIES.get(severity, SEVERITY_PENALTIES["low"])
                score -= penalty
                explanations.append(
                    f"-{penalty:.1f} points: {severity} severity anomaly on "
                    f"'{anomaly.get('metric', 'unknown metric')}'."
                )

            for metric, value in metrics.items():
                if value is None:
                    continue
                critical_threshold = METRIC_CRITICAL_THRESHOLDS.get(metric)
                warning_threshold = METRIC_WARNING_THRESHOLDS.get(metric)

                if critical_threshold is not None and value >= critical_threshold:
                    penalty = 15.0
                    score -= penalty
                    explanations.append(
                        f"-{penalty:.1f} points: {metric} at {value:.1f} exceeds "
                        f"critical threshold ({critical_threshold})."
                    )
                elif warning_threshold is not None and value >= warning_threshold:
                    penalty = 6.0
                    score -= penalty
                    explanations.append(
                        f"-{penalty:.1f} points: {metric} at {value:.1f} exceeds "
                        f"warning threshold ({warning_threshold})."
                    )

        except Exception as exc:
            msg = f"Health score calculation encountered an error: {exc}"
            logger.error(msg)
            errors.append(msg)

        score = max(self.min_score, min(self.max_score, score))
        return round(score, 2), explanations

    # ------------------------------------------------------------------
    # Root cause analysis
    # ------------------------------------------------------------------

    def _perform_root_cause_analysis(
        self,
        anomalies: List[Dict[str, Any]],
        trend_analysis: Dict[str, Any],
        metrics: Dict[str, Optional[float]],
        security: Dict[str, Any],
        errors: List[str],
    ) -> List[RootCauseFinding]:
        findings: List[RootCauseFinding] = []

        try:
            anomaly_metrics = {a.get("metric") for a in anomalies if a.get("metric")}

            for metric in ("cpu_percent", "memory_percent", "disk_percent"):
                value = metrics.get(metric)
                trend = trend_analysis.get(metric, {}) if isinstance(trend_analysis, dict) else {}
                direction = trend.get("direction")

                if metric in anomaly_metrics or (
                    value is not None and value >= METRIC_WARNING_THRESHOLDS.get(metric, 999)
                ):
                    evidence = []
                    if value is not None:
                        evidence.append(f"current value: {value:.1f}")
                    if direction:
                        evidence.append(f"trend: {direction}")

                    confidence = "high" if direction == "increasing" else "medium"
                    findings.append(
                        RootCauseFinding(
                            category="performance",
                            cause=(
                                f"Sustained high {metric.replace('_', ' ')} is degrading "
                                f"overall system health."
                            ),
                            confidence=confidence,
                            evidence=evidence,
                        )
                    )

            suspicious_processes = security.get("suspicious_process_count")
            if isinstance(suspicious_processes, (int, float)) and suspicious_processes > 0:
                findings.append(
                    RootCauseFinding(
                        category="security",
                        cause="One or more suspicious processes detected on the system.",
                        confidence="high" if suspicious_processes > 1 else "medium",
                        evidence=[f"suspicious_process_count: {suspicious_processes}"],
                    )
                )

            failed_logins = security.get("failed_login_count")
            if isinstance(failed_logins, (int, float)) and failed_logins >= 5:
                findings.append(
                    RootCauseFinding(
                        category="security",
                        cause="Elevated failed login attempts suggest a possible brute-force attempt.",
                        confidence="high" if failed_logins >= 10 else "medium",
                        evidence=[f"failed_login_count: {failed_logins}"],
                    )
                )

            if not findings and anomalies:
                findings.append(
                    RootCauseFinding(
                        category="general",
                        cause="Anomalies detected but no single dominant root cause identified.",
                        confidence="low",
                        evidence=[
                            f"{len(anomalies)} anomaly(ies) reported by anomaly engine."
                        ],
                    )
                )

        except Exception as exc:
            msg = f"Root cause analysis encountered an error: {exc}"
            logger.error(msg)
            errors.append(msg)

        return findings

    # ------------------------------------------------------------------
    # Recommendations
    # ------------------------------------------------------------------

    def _generate_system_recommendations(
        self, metrics: Dict[str, Optional[float]], trend_analysis: Dict[str, Any]
    ) -> List[Recommendation]:
        recommendations: List[Recommendation] = []

        label_map = {
            "cpu_percent": ("CPU", "Investigate top CPU-consuming processes and consider scaling or optimizing workloads."),
            "memory_percent": ("Memory", "Review memory-heavy processes for leaks and consider adding RAM or restarting affected services."),
            "disk_percent": ("Disk", "Free up disk space, archive old data, or expand storage capacity."),
        }

        for metric, (label, action) in label_map.items():
            value = metrics.get(metric)
            if value is None:
                continue

            if value >= METRIC_CRITICAL_THRESHOLDS.get(metric, 100):
                recommendations.append(
                    Recommendation(
                        category="system",
                        priority="critical",
                        title=f"Critical {label} usage",
                        description=f"{label} usage is at {value:.1f}%. {action}",
                        related_metric=metric,
                    )
                )
            elif value >= METRIC_WARNING_THRESHOLDS.get(metric, 100):
                recommendations.append(
                    Recommendation(
                        category="system",
                        priority="warning",
                        title=f"Elevated {label} usage",
                        description=f"{label} usage is at {value:.1f}%. {action}",
                        related_metric=metric,
                    )
                )

        for metric, trend in (trend_analysis or {}).items():
            if not isinstance(trend, dict):
                continue
            if trend.get("direction") == "increasing" and metric in label_map:
                label, action = label_map[metric]
                recommendations.append(
                    Recommendation(
                        category="system",
                        priority="info",
                        title=f"{label} trending upward",
                        description=(
                            f"{label} usage has been trending upward. "
                            f"Proactively consider: {action.lower()}"
                        ),
                        related_metric=metric,
                    )
                )

        return recommendations

    def _generate_security_recommendations(
        self, security: Dict[str, Any]
    ) -> List[Recommendation]:
        recommendations: List[Recommendation] = []

        suspicious_processes = security.get("suspicious_process_count")
        if isinstance(suspicious_processes, (int, float)) and suspicious_processes > 0:
            recommendations.append(
                Recommendation(
                    category="security",
                    priority="high",
                    title="Suspicious process activity detected",
                    description=(
                        "Investigate flagged processes immediately, verify their "
                        "origin, and terminate or quarantine if confirmed malicious."
                    ),
                    related_metric="suspicious_process_count",
                )
            )

        failed_logins = security.get("failed_login_count")
        if isinstance(failed_logins, (int, float)) and failed_logins >= 5:
            priority = "critical" if failed_logins >= 10 else "high"
            recommendations.append(
                Recommendation(
                    category="security",
                    priority=priority,
                    title="Elevated failed login attempts",
                    description=(
                        "Review authentication logs, consider enabling account "
                        "lockout/rate limiting, and verify no accounts have been "
                        "compromised."
                    ),
                    related_metric="failed_login_count",
                )
            )

        active_connections = security.get("active_connections")
        if isinstance(active_connections, (int, float)) and active_connections > 200:
            recommendations.append(
                Recommendation(
                    category="security",
                    priority="medium",
                    title="High number of active network connections",
                    description=(
                        "Review active connections for unexpected or unauthorized "
                        "endpoints; consider firewall rule tightening."
                    ),
                    related_metric="active_connections",
                )
            )

        return recommendations

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def analyze(
        self,
        combined_data: Optional[Dict[str, Any]],
        anomaly_results: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Calculates health score, root cause analysis and recommendations
        from the combined monitoring/security data and anomaly_engine.py
        output.

        Args:
            combined_data: Dict with "monitoring" and "security" keys.
            anomaly_results: Dict as returned by AnomalyEngine.analyze()
                (anomalies, trend_analysis, predictive_alerts).

        Returns:
            Dict with keys: health_score, health_score_explanation,
            root_cause_analysis, recommendations, errors. Never raises.
        """
        errors: List[str] = []

        if combined_data is None or not isinstance(combined_data, dict):
            errors.append("combined_data missing or invalid; using empty payload.")
            combined_data = {}

        if anomaly_results is None or not isinstance(anomaly_results, dict):
            errors.append("anomaly_results missing or invalid; using empty payload.")
            anomaly_results = {}

        monitoring = combined_data.get("monitoring", {}) or {}
        security = combined_data.get("security", {}) or {}
        anomalies = anomaly_results.get("anomalies", []) or []
        trend_analysis = anomaly_results.get("trend_analysis", {}) or {}

        try:
            metrics = _extract_metric_values(monitoring)
        except Exception as exc:
            msg = f"Failed to extract metric values: {exc}"
            logger.error(msg)
            errors.append(msg)
            metrics = {}

        health_score, score_explanation = self._calculate_health_score(
            anomalies, metrics, errors
        )

        root_cause_findings = self._perform_root_cause_analysis(
            anomalies, trend_analysis, metrics, security, errors
        )

        system_recommendations = self._generate_system_recommendations(
            metrics, trend_analysis
        )
        security_recommendations = self._generate_security_recommendations(security)
        all_recommendations = system_recommendations + security_recommendations

        result = {
            "health_score": health_score,
            "health_score_explanation": score_explanation,
            "root_cause_analysis": {
                "findings": [
                    {
                        "category": f.category,
                        "cause": f.cause,
                        "confidence": f.confidence,
                        "evidence": f.evidence,
                    }
                    for f in root_cause_findings
                ],
            },
            "recommendations": [
                {
                    "category": r.category,
                    "priority": r.priority,
                    "title": r.title,
                    "description": r.description,
                    "related_metric": r.related_metric,
                }
                for r in all_recommendations
            ],
            "errors": errors,
        }

        if errors:
            logger.warning(
                "Recommendation engine completed with %d error(s).", len(errors)
            )
        else:
            logger.debug(
                "Recommendation engine completed successfully at %s", self._now_iso()
            )

        return result


def run_recommendation_analysis(
    combined_data: Optional[Dict[str, Any]],
    anomaly_results: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Convenience function for callers that just want a one-off
    recommendation analysis without managing a RecommendationEngine
    instance.
    """
    engine = RecommendationEngine()
    return engine.analyze(combined_data, anomaly_results)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    _combined = {
        "monitoring": {
            "cpu": {"cpu_percent": 92.0},
            "memory": {"virtual_memory": {"percent": 70.0}},
            "disk": {"partitions": [{"percent": 60.0}]},
        },
        "security": {
            "active_connections": 12,
            "suspicious_process_count": 1,
            "failed_login_count": 6,
        },
    }
    _anomalies = {
        "anomalies": [
            {"metric": "cpu_percent", "value": 92.0, "severity": "high", "score": -0.2}
        ],
        "trend_analysis": {
            "cpu_percent": {"direction": "increasing", "slope": 1.2, "current_value": 92.0}
        },
    }
    _engine = RecommendationEngine()
    print(_engine.analyze(_combined, _anomalies))