"""
threat_engine.py

Central cybersecurity threat detection engine for the Lavender
Trinetra system. Consumes structured outputs from process_security.py,
network_security.py and firewall_security.py, correlates their
findings/events, applies rule-based attack pattern detection, and
produces classified, prioritized, structured threat reports.

This module does NOT collect monitoring metrics directly, implement
AI recommendations, or access the database. It only correlates
already-collected security data and returns structured threat
results for cybersecurity/security_analysis.py and main.py to
consume.
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


class ThreatEngineError(Exception):
    """Raised when the threat engine cannot complete its analysis."""


# Numeric weight assigned to each severity level for scoring/sorting.
SEVERITY_WEIGHTS: Dict[str, int] = {
    "low": 1,
    "medium": 2,
    "high": 3,
    "critical": 4,
}

# Base confidence contribution per source signal type (0.0-1.0 scale).
SOURCE_CONFIDENCE_WEIGHTS: Dict[str, float] = {
    "process": 0.35,
    "network": 0.35,
    "firewall": 0.30,
}


@dataclass
class ThreatIndicator:
    """A single normalized indicator pulled from an upstream security module."""

    source: str  # "process" | "network" | "firewall"
    event_type: str
    severity: str
    description: str
    pid: Optional[int] = None
    local_port: Optional[int] = None
    remote_address: Optional[str] = None
    process_name: Optional[str] = None


@dataclass
class ThreatReport:
    """A single correlated, classified threat report."""

    timestamp: str
    threat_id: str
    title: str
    pattern: str
    severity: str
    confidence_score: float
    priority: int
    description: str
    indicators: List[ThreatIndicator] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "threat_id": self.threat_id,
            "title": self.title,
            "pattern": self.pattern,
            "severity": self.severity,
            "confidence_score": round(self.confidence_score, 3),
            "priority": self.priority,
            "description": self.description,
            "indicators": [
                {
                    "source": i.source,
                    "event_type": i.event_type,
                    "severity": i.severity,
                    "description": i.description,
                    "pid": i.pid,
                    "local_port": i.local_port,
                    "remote_address": i.remote_address,
                    "process_name": i.process_name,
                }
                for i in self.indicators
            ],
        }


@dataclass
class ThreatEngineResult:
    """Structured result of a full threat correlation pass."""

    timestamp: str
    threat_count: int
    threats: List[ThreatReport] = field(default_factory=list)
    overall_severity: str = "none"
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "threat_count": self.threat_count,
            "threats": [t.to_dict() for t in self.threats],
            "overall_severity": self.overall_severity,
            "errors": self.errors,
        }


def _normalize_severity(value: Optional[str]) -> str:
    if not value:
        return "low"
    value_lower = str(value).lower()
    return value_lower if value_lower in SEVERITY_WEIGHTS else "low"


class ThreatEngine:
    """
    Central threat correlation and classification engine.

    Usage:
        engine = ThreatEngine()
        result = engine.analyze(process_data, network_data, firewall_data)
        data = result.to_dict()
    """

    def __init__(self, min_confidence_to_report: float = 0.0) -> None:
        """
        Args:
            min_confidence_to_report: Minimum confidence score (0.0-1.0)
                a correlated threat must reach to be included in the
                final report. Set to 0.0 to include everything.
        """
        self.min_confidence_to_report = min_confidence_to_report

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    # ------------------------------------------------------------------
    # Normalization of upstream module outputs into ThreatIndicators
    # ------------------------------------------------------------------

    def _extract_process_indicators(
        self, process_data: Optional[Dict[str, Any]], errors: List[str]
    ) -> List[ThreatIndicator]:
        indicators: List[ThreatIndicator] = []
        if not process_data or not isinstance(process_data, dict):
            return indicators
        try:
            for finding in process_data.get("findings", []) or []:
                indicators.append(
                    ThreatIndicator(
                        source="process",
                        event_type=finding.get("finding_type", "unknown"),
                        severity=_normalize_severity(finding.get("severity")),
                        description=finding.get("description", ""),
                        pid=finding.get("pid"),
                        process_name=finding.get("process_name"),
                    )
                )
        except Exception as exc:
            msg = f"Failed to extract process security indicators: {exc}"
            logger.error(msg)
            errors.append(msg)
        return indicators

    def _extract_network_indicators(
        self, network_data: Optional[Dict[str, Any]], errors: List[str]
    ) -> List[ThreatIndicator]:
        indicators: List[ThreatIndicator] = []
        if not network_data or not isinstance(network_data, dict):
            return indicators
        try:
            for event in network_data.get("events", []) or []:
                indicators.append(
                    ThreatIndicator(
                        source="network",
                        event_type=event.get("event_type", "unknown"),
                        severity=_normalize_severity(event.get("severity")),
                        description=event.get("description", ""),
                        local_port=event.get("local_port"),
                        remote_address=event.get("remote_address"),
                        pid=event.get("pid"),
                    )
                )
        except Exception as exc:
            msg = f"Failed to extract network security indicators: {exc}"
            logger.error(msg)
            errors.append(msg)
        return indicators

    def _extract_firewall_indicators(
        self, firewall_data: Optional[Dict[str, Any]], errors: List[str]
    ) -> List[ThreatIndicator]:
        indicators: List[ThreatIndicator] = []
        if not firewall_data or not isinstance(firewall_data, dict):
            return indicators
        try:
            for event in firewall_data.get("events", []) or []:
                indicators.append(
                    ThreatIndicator(
                        source="firewall",
                        event_type=event.get("event_type", "unknown"),
                        severity=_normalize_severity(event.get("severity")),
                        description=event.get("description", ""),
                    )
                )
        except Exception as exc:
            msg = f"Failed to extract firewall security indicators: {exc}"
            logger.error(msg)
            errors.append(msg)
        return indicators

    # ------------------------------------------------------------------
    # Correlation / attack pattern detection
    # ------------------------------------------------------------------

    @staticmethod
    def _confidence_for(indicators: List[ThreatIndicator]) -> float:
        sources_present = {i.source for i in indicators}
        base = sum(SOURCE_CONFIDENCE_WEIGHTS.get(s, 0.1) for s in sources_present)
        severity_boost = max(
            (SEVERITY_WEIGHTS.get(i.severity, 1) for i in indicators), default=1
        ) * 0.1
        return min(1.0, base + severity_boost)

    @staticmethod
    def _priority_for(severity: str, confidence: float) -> int:
        """Lower number = higher priority. Combines severity + confidence."""
        severity_weight = SEVERITY_WEIGHTS.get(severity, 1)
        # Invert so higher severity/confidence yields a lower (more urgent) number.
        score = (5 - severity_weight) * 100 - int(confidence * 100)
        return max(1, score)

    @staticmethod
    def _dominant_severity(indicators: List[ThreatIndicator]) -> str:
        if not indicators:
            return "low"
        best = max(indicators, key=lambda i: SEVERITY_WEIGHTS.get(i.severity, 1))
        return best.severity

    def _detect_reconnaissance_or_intrusion(
        self,
        network_indicators: List[ThreatIndicator],
        firewall_indicators: List[ThreatIndicator],
        timestamp: str,
    ) -> List[ThreatReport]:
        """
        Pattern: firewall disabled/unknown + unexpected/high-risk open
        ports or high connection volume => potential exposed attack
        surface / active intrusion attempt.
        """
        threats: List[ThreatReport] = []

        firewall_weak = [
            i
            for i in firewall_indicators
            if i.event_type in ("firewall_disabled", "firewall_not_detected", "firewall_status_unknown")
        ]
        exposure_indicators = [
            i
            for i in network_indicators
            if i.event_type
            in (
                "high_risk_port_open",
                "unexpected_open_port",
                "excessive_connections_from_remote_ip",
                "high_connection_volume",
            )
        ]

        if firewall_weak and exposure_indicators:
            combined = firewall_weak + exposure_indicators
            confidence = self._confidence_for(combined)
            severity = self._dominant_severity(combined)
            threat_id = f"THREAT-RECON-{len(threats) + 1:03d}"
            threats.append(
                ThreatReport(
                    timestamp=timestamp,
                    threat_id=threat_id,
                    title="Exposed attack surface with weakened perimeter defense",
                    pattern="firewall_weakness_with_network_exposure",
                    severity=severity,
                    confidence_score=confidence,
                    priority=self._priority_for(severity, confidence),
                    description=(
                        "Firewall protection appears disabled, absent, or unverifiable "
                        "while unexpected or high-risk network exposure was detected. "
                        "This combination significantly increases the likelihood of "
                        "successful reconnaissance or intrusion."
                    ),
                    indicators=combined,
                )
            )

        return threats

    def _detect_malicious_process_with_network_activity(
        self,
        process_indicators: List[ThreatIndicator],
        network_indicators: List[ThreatIndicator],
        timestamp: str,
    ) -> List[ThreatReport]:
        """
        Pattern: suspicious process indicators correlated with matching
        PIDs on listening/high-risk network events => likely active
        malware or backdoor.
        """
        threats: List[ThreatReport] = []

        suspicious_processes = [
            i
            for i in process_indicators
            if i.event_type in ("known_suspicious_name", "suspicious_execution_path")
        ]
        if not suspicious_processes:
            return threats

        suspicious_pids = {i.pid for i in suspicious_processes if i.pid is not None}
        correlated_network = [
            i for i in network_indicators if i.pid is not None and i.pid in suspicious_pids
        ]

        combined = suspicious_processes + correlated_network
        confidence = self._confidence_for(combined)
        # Correlated PID match across sources is a strong signal; boost confidence.
        if correlated_network:
            confidence = min(1.0, confidence + 0.2)

        severity = self._dominant_severity(combined)
        threat_id = "THREAT-MALPROC-001"
        threats.append(
            ThreatReport(
                timestamp=timestamp,
                threat_id=threat_id,
                title="Suspicious process with associated network activity",
                pattern="malicious_process_network_correlation",
                severity=severity,
                confidence_score=confidence,
                priority=self._priority_for(severity, confidence),
                description=(
                    "One or more processes matched suspicious watchlist or execution "
                    "path heuristics"
                    + (
                        ", and were correlated with active network connections/listening "
                        "ports, indicating likely malware, backdoor, or unauthorized "
                        "remote access tooling."
                        if correlated_network
                        else ". No direct network correlation was found, but the "
                        "process itself warrants investigation."
                    )
                ),
                indicators=combined,
            )
        )

        return threats

    def _detect_brute_force_or_credential_attack(
        self,
        network_indicators: List[ThreatIndicator],
        timestamp: str,
    ) -> List[ThreatReport]:
        """
        Pattern: excessive connections from a single remote IP =>
        possible brute-force / credential-stuffing / port-scan attempt.
        """
        threats: List[ThreatReport] = []
        candidates = [
            i for i in network_indicators if i.event_type == "excessive_connections_from_remote_ip"
        ]

        for idx, indicator in enumerate(candidates, start=1):
            confidence = self._confidence_for([indicator]) + 0.15
            confidence = min(1.0, confidence)
            severity = indicator.severity
            threats.append(
                ThreatReport(
                    timestamp=timestamp,
                    threat_id=f"THREAT-BRUTEFORCE-{idx:03d}",
                    title=f"Possible brute-force or scanning activity from {indicator.remote_address}",
                    pattern="excessive_connections_single_source",
                    severity=severity,
                    confidence_score=confidence,
                    priority=self._priority_for(severity, confidence),
                    description=(
                        f"Remote address {indicator.remote_address} generated an "
                        f"abnormally high number of connections, consistent with "
                        f"brute-force login attempts, credential stuffing, or port "
                        f"scanning behavior."
                    ),
                    indicators=[indicator],
                )
            )

        return threats

    def _wrap_uncorrelated_indicators(
        self,
        all_indicators: List[ThreatIndicator],
        correlated_indicators: List[ThreatIndicator],
        timestamp: str,
    ) -> List[ThreatReport]:
        """
        Any medium+ severity indicator not already folded into a
        correlated threat is still surfaced as a standalone threat
        report, so nothing significant is silently dropped.
        """
        threats: List[ThreatReport] = []
        correlated_set = {id(i) for i in correlated_indicators}

        for indicator in all_indicators:
            if id(indicator) in correlated_set:
                continue
            if SEVERITY_WEIGHTS.get(indicator.severity, 1) < SEVERITY_WEIGHTS["medium"]:
                continue

            confidence = self._confidence_for([indicator])
            severity = indicator.severity
            threats.append(
                ThreatReport(
                    timestamp=timestamp,
                    threat_id=f"THREAT-{indicator.source.upper()}-{indicator.event_type.upper()}",
                    title=f"{indicator.source.title()} security event: {indicator.event_type.replace('_', ' ')}",
                    pattern="standalone_indicator",
                    severity=severity,
                    confidence_score=confidence,
                    priority=self._priority_for(severity, confidence),
                    description=indicator.description,
                    indicators=[indicator],
                )
            )

        return threats

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def analyze(
        self,
        process_data: Optional[Dict[str, Any]] = None,
        network_data: Optional[Dict[str, Any]] = None,
        firewall_data: Optional[Dict[str, Any]] = None,
    ) -> ThreatEngineResult:
        """
        Correlates outputs from process_security.py, network_security.py
        and firewall_security.py into classified, prioritized threat
        reports.

        Args:
            process_data: Output dict from ProcessSecurityMonitor.scan_dict().
            network_data: Output dict from NetworkSecurityMonitor.scan_dict().
            firewall_data: Output dict from FirewallSecurityMonitor.check_dict().

        Returns:
            ThreatEngineResult with structured threat reports. Never
            raises; failures are captured in `errors`.
        """
        errors: List[str] = []
        timestamp = self._now_iso()

        process_indicators = self._extract_process_indicators(process_data, errors)
        network_indicators = self._extract_network_indicators(network_data, errors)
        firewall_indicators = self._extract_firewall_indicators(firewall_data, errors)
        all_indicators = process_indicators + network_indicators + firewall_indicators

        threats: List[ThreatReport] = []
        correlated_indicators: List[ThreatIndicator] = []

        try:
            recon_threats = self._detect_reconnaissance_or_intrusion(
                network_indicators, firewall_indicators, timestamp
            )
            threats.extend(recon_threats)
            for t in recon_threats:
                correlated_indicators.extend(t.indicators)

            malproc_threats = self._detect_malicious_process_with_network_activity(
                process_indicators, network_indicators, timestamp
            )
            threats.extend(malproc_threats)
            for t in malproc_threats:
                correlated_indicators.extend(t.indicators)

            bruteforce_threats = self._detect_brute_force_or_credential_attack(
                network_indicators, timestamp
            )
            threats.extend(bruteforce_threats)
            for t in bruteforce_threats:
                correlated_indicators.extend(t.indicators)

            standalone_threats = self._wrap_uncorrelated_indicators(
                all_indicators, correlated_indicators, timestamp
            )
            threats.extend(standalone_threats)

        except Exception as exc:
            msg = f"Threat correlation failed: {exc}"
            logger.error(msg)
            errors.append(msg)

        if self.min_confidence_to_report > 0.0:
            threats = [
                t for t in threats if t.confidence_score >= self.min_confidence_to_report
            ]

        threats.sort(key=lambda t: t.priority)

        overall_severity = "none"
        if threats:
            overall_severity = max(
                (t.severity for t in threats), key=lambda s: SEVERITY_WEIGHTS.get(s, 0)
            )

        result = ThreatEngineResult(
            timestamp=timestamp,
            threat_count=len(threats),
            threats=threats,
            overall_severity=overall_severity,
            errors=errors,
        )

        if errors:
            logger.warning("Threat engine analysis completed with %d error(s).", len(errors))
        else:
            logger.debug("Threat engine analysis completed successfully at %s", timestamp)

        return result

    def analyze_dict(
        self,
        process_data: Optional[Dict[str, Any]] = None,
        network_data: Optional[Dict[str, Any]] = None,
        firewall_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Convenience method returning the analysis result as a plain dict."""
        return self.analyze(process_data, network_data, firewall_data).to_dict()


def run_threat_analysis(
    process_data: Optional[Dict[str, Any]] = None,
    network_data: Optional[Dict[str, Any]] = None,
    firewall_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Convenience function for callers (e.g. main.py) that just want a
    one-off threat correlation pass without managing a ThreatEngine
    instance.
    """
    engine = ThreatEngine()
    return engine.analyze_dict(process_data, network_data, firewall_data)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    _process_data = {
        "findings": [
            {
                "pid": 4321,
                "process_name": "suspicious.exe",
                "finding_type": "known_suspicious_name",
                "severity": "high",
                "description": "Process matched suspicious watchlist keyword.",
            }
        ]
    }
    _network_data = {
        "events": [
            {
                "event_type": "high_risk_port_open",
                "severity": "high",
                "description": "Port 4444 is listening.",
                "local_port": 4444,
                "pid": 4321,
            }
        ]
    }
    _firewall_data = {
        "events": [
            {
                "event_type": "firewall_disabled",
                "severity": "critical",
                "description": "Firewall is disabled.",
            }
        ]
    }
    _engine = ThreatEngine()
    _result = _engine.analyze(_process_data, _network_data, _firewall_data)
    print(_result.to_dict())