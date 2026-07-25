"""
security_analysis.py

Overall cybersecurity analysis and reporting module for the Lavender
Trinetra system. Consumes structured threat reports from
threat_engine.py, calculates an overall Security Score, monitors
active user sessions, maintains an in-memory security history during
application runtime, and produces summarized security analytics.

This module does NOT perform threat detection itself, implement AI
logic, or access the database. It only aggregates and summarizes
already-correlated threat data for api/ and main.py to consume.
"""

from __future__ import annotations

import logging
from collections import Counter, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Deque, Dict, List, Optional

try:
    import psutil
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "psutil is required for security_analysis.py. Install it via 'pip install psutil'."
    ) from exc


logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
logger.setLevel(logging.INFO)


class SecurityAnalysisError(Exception):
    """Raised when security analysis cannot complete."""


# Base security score before deductions.
BASE_SECURITY_SCORE: float = 100.0

# Points deducted per threat, by severity.
SEVERITY_SCORE_PENALTIES: Dict[str, float] = {
    "low": 2.0,
    "medium": 6.0,
    "high": 15.0,
    "critical": 25.0,
}

DEFAULT_HISTORY_SIZE: int = 500


@dataclass
class UserSessionInfo:
    """Structured information about an active user session."""

    username: str
    terminal: Optional[str]
    host: Optional[str]
    login_time: Optional[str]
    pid: Optional[int]


@dataclass
class SeveritySummary:
    """Counts of threats by severity level."""

    low: int = 0
    medium: int = 0
    high: int = 0
    critical: int = 0

    def to_dict(self) -> Dict[str, int]:
        return {
            "low": self.low,
            "medium": self.medium,
            "high": self.high,
            "critical": self.critical,
        }

    def total(self) -> int:
        return self.low + self.medium + self.high + self.critical


@dataclass
class SecurityHistoryEntry:
    """A single historical snapshot retained in-memory during runtime."""

    timestamp: str
    security_score: float
    threat_count: int
    overall_severity: str


@dataclass
class SecurityAnalysisResult:
    """Structured result of a full security analysis pass."""

    timestamp: str
    security_score: float
    overall_severity: str
    severity_summary: SeveritySummary
    threat_count: int
    top_threats: List[Dict[str, Any]] = field(default_factory=list)
    active_sessions: List[UserSessionInfo] = field(default_factory=list)
    active_session_count: int = 0
    history_length: int = 0
    trend: str = "stable"
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "security_score": round(self.security_score, 2),
            "overall_severity": self.overall_severity,
            "severity_summary": self.severity_summary.to_dict(),
            "threat_count": self.threat_count,
            "top_threats": self.top_threats,
            "active_sessions": [
                {
                    "username": s.username,
                    "terminal": s.terminal,
                    "host": s.host,
                    "login_time": s.login_time,
                    "pid": s.pid,
                }
                for s in self.active_sessions
            ],
            "active_session_count": self.active_session_count,
            "history_length": self.history_length,
            "trend": self.trend,
            "errors": self.errors,
        }


class SecurityAnalysisEngine:
    """
    Overall cybersecurity analysis and reporting engine.

    Maintains an in-memory history of security scores across the
    application's runtime (not persisted; database.py owns durable
    storage) and produces summarized, explainable security analytics.

    Usage:
        engine = SecurityAnalysisEngine()
        result = engine.analyze(threat_engine_result)
        data = result.to_dict()
    """

    def __init__(
        self,
        history_size: int = DEFAULT_HISTORY_SIZE,
        top_threats_limit: int = 5,
    ) -> None:
        """
        Args:
            history_size: Maximum number of historical security score
                snapshots retained in memory.
            top_threats_limit: Number of highest-priority threats to
                include in each analysis result.
        """
        self.history_size = history_size
        self.top_threats_limit = top_threats_limit
        self._history: Deque[SecurityHistoryEntry] = deque(maxlen=history_size)

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    # ------------------------------------------------------------------
    # Security score
    # ------------------------------------------------------------------

    @staticmethod
    def _calculate_security_score(
        threats: List[Dict[str, Any]], errors: List[str]
    ) -> float:
        score = BASE_SECURITY_SCORE
        try:
            for threat in threats:
                severity = str(threat.get("severity", "low")).lower()
                confidence = threat.get("confidence_score", 1.0)
                try:
                    confidence = float(confidence)
                except (TypeError, ValueError):
                    confidence = 1.0
                confidence = max(0.0, min(1.0, confidence))

                penalty = SEVERITY_SCORE_PENALTIES.get(severity, SEVERITY_SCORE_PENALTIES["low"])
                score -= penalty * confidence
        except Exception as exc:
            msg = f"Security score calculation encountered an error: {exc}"
            logger.error(msg)
            errors.append(msg)

        return max(0.0, min(BASE_SECURITY_SCORE, score))

    @staticmethod
    def _summarize_severities(threats: List[Dict[str, Any]]) -> SeveritySummary:
        counts = Counter(str(t.get("severity", "low")).lower() for t in threats)
        return SeveritySummary(
            low=counts.get("low", 0),
            medium=counts.get("medium", 0),
            high=counts.get("high", 0),
            critical=counts.get("critical", 0),
        )

    def _select_top_threats(self, threats: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        try:
            sorted_threats = sorted(
                threats, key=lambda t: t.get("priority", 999999)
            )
            return sorted_threats[: self.top_threats_limit]
        except Exception as exc:
            logger.error("Failed to select top threats: %s", exc)
            return threats[: self.top_threats_limit]

    # ------------------------------------------------------------------
    # Session monitoring
    # ------------------------------------------------------------------

    def _get_active_sessions(self, errors: List[str]) -> List[UserSessionInfo]:
        sessions: List[UserSessionInfo] = []
        try:
            for user in psutil.users():
                login_time_iso = None
                try:
                    login_time_iso = datetime.fromtimestamp(
                        user.started, tz=timezone.utc
                    ).isoformat()
                except (OSError, OverflowError, ValueError, AttributeError):
                    login_time_iso = None

                sessions.append(
                    UserSessionInfo(
                        username=getattr(user, "name", "unknown"),
                        terminal=getattr(user, "terminal", None),
                        host=getattr(user, "host", None) or None,
                        login_time=login_time_iso,
                        pid=getattr(user, "pid", None),
                    )
                )
        except Exception as exc:
            msg = f"Failed to collect active user sessions: {exc}"
            logger.error(msg)
            errors.append(msg)

        return sessions

    # ------------------------------------------------------------------
    # History / trend
    # ------------------------------------------------------------------

    def _record_history(
        self, timestamp: str, security_score: float, threat_count: int, overall_severity: str
    ) -> None:
        self._history.append(
            SecurityHistoryEntry(
                timestamp=timestamp,
                security_score=security_score,
                threat_count=threat_count,
                overall_severity=overall_severity,
            )
        )

    def _calculate_trend(self) -> str:
        if len(self._history) < 2:
            return "stable"

        recent = list(self._history)[-5:]
        if len(recent) < 2:
            return "stable"

        first_score = recent[0].security_score
        last_score = recent[-1].security_score
        delta = last_score - first_score

        if delta > 3.0:
            return "improving"
        if delta < -3.0:
            return "declining"
        return "stable"

    def get_history(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Returns the in-memory security score history (most recent last)."""
        entries = list(self._history)
        if limit is not None:
            entries = entries[-limit:]
        return [
            {
                "timestamp": e.timestamp,
                "security_score": round(e.security_score, 2),
                "threat_count": e.threat_count,
                "overall_severity": e.overall_severity,
            }
            for e in entries
        ]

    def reset_history(self) -> None:
        """Clears the in-memory security history."""
        self._history.clear()
        logger.info("Security analysis history cleared.")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def analyze(
        self, threat_engine_result: Optional[Dict[str, Any]]
    ) -> SecurityAnalysisResult:
        """
        Produces a full security analysis pass from threat_engine.py
        output.

        Args:
            threat_engine_result: Dict as returned by
                ThreatEngine.analyze_dict() (threats, threat_count,
                overall_severity).

        Returns:
            SecurityAnalysisResult with score, summaries, sessions and
            trend. Never raises; failures are captured in `errors`.
        """
        errors: List[str] = []
        timestamp = self._now_iso()

        if threat_engine_result is None or not isinstance(threat_engine_result, dict):
            errors.append("threat_engine_result missing or invalid; using empty payload.")
            threat_engine_result = {}

        threats = threat_engine_result.get("threats", []) or []
        overall_severity = threat_engine_result.get("overall_severity", "none")

        security_score = self._calculate_security_score(threats, errors)
        severity_summary = self._summarize_severities(threats)
        top_threats = self._select_top_threats(threats)
        active_sessions = self._get_active_sessions(errors)

        self._record_history(timestamp, security_score, len(threats), overall_severity)
        trend = self._calculate_trend()

        result = SecurityAnalysisResult(
            timestamp=timestamp,
            security_score=security_score,
            overall_severity=overall_severity,
            severity_summary=severity_summary,
            threat_count=len(threats),
            top_threats=top_threats,
            active_sessions=active_sessions,
            active_session_count=len(active_sessions),
            history_length=len(self._history),
            trend=trend,
            errors=errors,
        )

        if errors:
            logger.warning("Security analysis completed with %d error(s).", len(errors))
        else:
            logger.debug("Security analysis completed successfully at %s", timestamp)

        return result

    def analyze_dict(
        self, threat_engine_result: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Convenience method returning the analysis result as a plain dict."""
        return self.analyze(threat_engine_result).to_dict()


def run_security_analysis(
    threat_engine_result: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Convenience function for callers that just want a one-off security
    analysis without managing a SecurityAnalysisEngine instance.

    Note: creates a fresh engine with no history, so trend output will
    always be "stable". Prefer holding a single SecurityAnalysisEngine
    instance (as main.py should) across analysis passes for meaningful
    trend/history tracking.
    """
    engine = SecurityAnalysisEngine()
    return engine.analyze_dict(threat_engine_result)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    _threat_result = {
        "threat_count": 2,
        "overall_severity": "high",
        "threats": [
            {
                "threat_id": "THREAT-BRUTEFORCE-001",
                "severity": "high",
                "confidence_score": 0.8,
                "priority": 220,
                "title": "Possible brute-force activity",
            },
            {
                "threat_id": "THREAT-FIREWALL-001",
                "severity": "critical",
                "confidence_score": 0.6,
                "priority": 40,
                "title": "Firewall disabled",
            },
        ],
    }
    _engine = SecurityAnalysisEngine()
    print(_engine.analyze(_threat_result).to_dict())