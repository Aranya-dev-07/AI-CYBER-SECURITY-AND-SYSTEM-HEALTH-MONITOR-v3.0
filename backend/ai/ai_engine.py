"""
ai_engine.py

Main AI orchestration engine for the Lavender Trinetra system.
Coordinates anomaly_engine.py and recommendation_engine.py, aggregating
their outputs into a single unified AI analysis result.

This module does NOT collect system metrics, perform database
operations, or expose API endpoints. It only orchestrates AI logic
on data supplied by main.py.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .anomaly_engine import AnomalyEngine
from .recommendation_engine import RecommendationEngine


logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
logger.setLevel(logging.INFO)


class AIEngineError(Exception):
    """Raised when the AI engine cannot complete its analysis."""


@dataclass
class AIAnalysisResult:
    """Structured, unified result of a full AI analysis pass."""

    timestamp: str
    health_score: Optional[float] = None
    anomalies: List[Dict[str, Any]] = field(default_factory=list)
    trend_analysis: Dict[str, Any] = field(default_factory=dict)
    predictive_alerts: List[Dict[str, Any]] = field(default_factory=list)
    root_cause_analysis: Dict[str, Any] = field(default_factory=dict)
    recommendations: List[Dict[str, Any]] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "health_score": self.health_score,
            "anomalies": self.anomalies,
            "trend_analysis": self.trend_analysis,
            "predictive_alerts": self.predictive_alerts,
            "root_cause_analysis": self.root_cause_analysis,
            "recommendations": self.recommendations,
            "warnings": self.warnings,
            "errors": self.errors,
        }


def _validate_input_data(
    monitoring_data: Optional[Dict[str, Any]],
    security_data: Optional[Dict[str, Any]],
    errors: List[str],
) -> Dict[str, Any]:
    """
    Validates and normalizes the raw input into a single combined dict
    the sub-engines can consume. Never raises; issues are recorded.
    """
    if monitoring_data is None:
        errors.append("monitoring_data is missing (None).")
        monitoring_data = {}
    elif not isinstance(monitoring_data, dict):
        errors.append(
            f"monitoring_data must be a dict, got {type(monitoring_data).__name__}."
        )
        monitoring_data = {}

    if security_data is None:
        logger.info("security_data not provided; proceeding with monitoring data only.")
        security_data = {}
    elif not isinstance(security_data, dict):
        errors.append(
            f"security_data must be a dict, got {type(security_data).__name__}."
        )
        security_data = {}

    return {
        "monitoring": monitoring_data,
        "security": security_data,
    }


class AIEngine:
    """
    Principal AI orchestration engine.

    Coordinates anomaly detection/trend/prediction (AnomalyEngine) and
    health scoring/root cause/recommendations (RecommendationEngine),
    combining their outputs into a single AIAnalysisResult.

    Usage:
        engine = AIEngine()
        result = engine.analyze(monitoring_data, security_data)
        data = result.to_dict()
    """

    def __init__(
        self,
        anomaly_engine: Optional[AnomalyEngine] = None,
        recommendation_engine: Optional[RecommendationEngine] = None,
    ) -> None:
        """
        Args:
            anomaly_engine: Optional pre-constructed AnomalyEngine instance
                (useful for dependency injection / testing). A default
                instance is created if not provided.
            recommendation_engine: Optional pre-constructed
                RecommendationEngine instance. A default instance is
                created if not provided.
        """
        try:
            self.anomaly_engine = anomaly_engine or AnomalyEngine()
        except Exception as exc:
            logger.error("Failed to initialize AnomalyEngine: %s", exc)
            raise AIEngineError(f"Failed to initialize AnomalyEngine: {exc}") from exc

        try:
            self.recommendation_engine = recommendation_engine or RecommendationEngine()
        except Exception as exc:
            logger.error("Failed to initialize RecommendationEngine: %s", exc)
            raise AIEngineError(
                f"Failed to initialize RecommendationEngine: {exc}"
            ) from exc

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _run_anomaly_engine(
        self, combined_data: Dict[str, Any], errors: List[str], warnings: List[str]
    ) -> Dict[str, Any]:
        try:
            result = self.anomaly_engine.analyze(combined_data)
            if result is None:
                warnings.append("AnomalyEngine returned no result.")
                return {}
            if not isinstance(result, dict):
                warnings.append(
                    f"AnomalyEngine returned unexpected type: {type(result).__name__}."
                )
                return {}
            return result
        except Exception as exc:
            msg = f"AnomalyEngine execution failed: {exc}"
            logger.error(msg)
            errors.append(msg)
            return {}

    def _run_recommendation_engine(
        self,
        combined_data: Dict[str, Any],
        anomaly_results: Dict[str, Any],
        errors: List[str],
        warnings: List[str],
    ) -> Dict[str, Any]:
        try:
            result = self.recommendation_engine.analyze(combined_data, anomaly_results)
            if result is None:
                warnings.append("RecommendationEngine returned no result.")
                return {}
            if not isinstance(result, dict):
                warnings.append(
                    f"RecommendationEngine returned unexpected type: {type(result).__name__}."
                )
                return {}
            return result
        except Exception as exc:
            msg = f"RecommendationEngine execution failed: {exc}"
            logger.error(msg)
            errors.append(msg)
            return {}

    def analyze(
        self,
        monitoring_data: Optional[Dict[str, Any]],
        security_data: Optional[Dict[str, Any]] = None,
    ) -> AIAnalysisResult:
        """
        Run a full AI analysis pass over the supplied monitoring and
        cybersecurity data.

        Args:
            monitoring_data: Structured system monitoring data (CPU,
                memory, disk, network) as produced by the monitor/ engine.
            security_data: Structured cybersecurity data (process,
                network, firewall, threats) as produced by the
                cybersecurity/ engine. Optional.

        Returns:
            AIAnalysisResult with health score, anomalies, trends,
            predictive alerts, root cause analysis and recommendations.
            Never raises; failures are captured in `errors`/`warnings`.
        """
        timestamp = self._now_iso()
        errors: List[str] = []
        warnings: List[str] = []

        combined_data = _validate_input_data(monitoring_data, security_data, errors)

        anomaly_results = self._run_anomaly_engine(combined_data, errors, warnings)
        recommendation_results = self._run_recommendation_engine(
            combined_data, anomaly_results, errors, warnings
        )

        result = AIAnalysisResult(
            timestamp=timestamp,
            health_score=recommendation_results.get("health_score"),
            anomalies=anomaly_results.get("anomalies", []) or [],
            trend_analysis=anomaly_results.get("trend_analysis", {}) or {},
            predictive_alerts=anomaly_results.get("predictive_alerts", []) or [],
            root_cause_analysis=recommendation_results.get("root_cause_analysis", {}) or {},
            recommendations=recommendation_results.get("recommendations", []) or [],
            warnings=warnings,
            errors=errors,
        )

        if errors:
            logger.warning("AI analysis completed with %d error(s).", len(errors))
        elif warnings:
            logger.info("AI analysis completed with %d warning(s).", len(warnings))
        else:
            logger.debug("AI analysis completed successfully at %s", timestamp)

        return result

    def analyze_dict(
        self,
        monitoring_data: Optional[Dict[str, Any]],
        security_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Convenience method returning the analysis result as a plain dict."""
        return self.analyze(monitoring_data, security_data).to_dict()


def run_ai_analysis(
    monitoring_data: Optional[Dict[str, Any]],
    security_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Convenience function for callers (e.g. main.py) that just want a
    one-off AI analysis without managing an AIEngine instance.
    """
    engine = AIEngine()
    return engine.analyze_dict(monitoring_data, security_data)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    _sample_monitoring = {
        "cpu": {"cpu_percent": 42.0},
        "memory": {"virtual_memory": {"percent": 55.0}},
        "disk": {"partitions": []},
        "network": {"total_io": {"bytes_sent": 0, "bytes_recv": 0}},
    }
    _engine = AIEngine()
    _result = _engine.analyze(_sample_monitoring, {})
    print(_result.to_dict())