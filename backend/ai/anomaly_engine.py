"""
anomaly_engine.py

AI anomaly detection, trend analysis and predictive alerting engine
for the Lavender Trinetra system.

Consumes structured monitoring and cybersecurity data (as combined by
ai_engine.py), performs anomaly detection with Scikit-Learn, tracks
trends across historical readings, and generates predictive alerts.

This module does NOT collect monitoring data, access the database, or
implement recommendations/health scoring. It only produces anomaly,
trend and prediction results for ai_engine.py to aggregate.
"""

from __future__ import annotations

import logging
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

try:
    import joblib
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "joblib is required for anomaly_engine.py. Install it via 'pip install joblib'."
    ) from exc

try:
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "scikit-learn is required for anomaly_engine.py. "
        "Install it via 'pip install scikit-learn'."
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


DEFAULT_MODEL_DIR = Path(__file__).resolve().parent / "models"
DEFAULT_MODEL_FILENAME = "anomaly_isolation_forest.joblib"
DEFAULT_SCALER_FILENAME = "anomaly_scaler.joblib"

# Feature keys expected within the combined monitoring/security payload.
# Missing values are treated as 0.0 so the engine remains resilient to
# partial data.
FEATURE_KEYS: Tuple[str, ...] = (
    "cpu_percent",
    "memory_percent",
    "disk_percent",
    "network_bytes_sent",
    "network_bytes_recv",
    "active_connections",
    "suspicious_process_count",
    "failed_login_count",
)


class AnomalyEngineError(Exception):
    """Raised when the anomaly engine cannot complete its analysis."""


@dataclass
class AnomalyResult:
    """A single detected anomaly."""

    metric: str
    value: float
    severity: str
    score: float
    description: str


@dataclass
class TrendResult:
    """Trend summary for a single metric."""

    metric: str
    direction: str
    slope: float
    current_value: Optional[float]
    average_value: Optional[float]
    sample_size: int


@dataclass
class PredictiveAlert:
    """A forward-looking alert derived from trend analysis."""

    metric: str
    message: str
    projected_value: Optional[float]
    horizon: str
    confidence: str


def _extract_features(data: Dict[str, Any]) -> Dict[str, float]:
    """
    Flattens the combined monitoring/security payload into a fixed set
    of numeric features. Missing or malformed values default to 0.0.
    """
    monitoring = data.get("monitoring", {}) or {}
    security = data.get("security", {}) or {}

    def _safe_float(value: Any, default: float = 0.0) -> float:
        try:
            if value is None:
                return default
            return float(value)
        except (TypeError, ValueError):
            return default

    cpu = monitoring.get("cpu", {}) or {}
    memory = monitoring.get("memory", {}) or {}
    disk = monitoring.get("disk", {}) or {}
    network = monitoring.get("network", {}) or {}

    memory_vm = memory.get("virtual_memory", {}) or {}
    network_io = network.get("total_io", {}) or {}

    disk_percent = 0.0
    partitions = disk.get("partitions") or []
    if partitions:
        percentages = [
            _safe_float(p.get("percent")) for p in partitions if p.get("percent") is not None
        ]
        if percentages:
            disk_percent = sum(percentages) / len(percentages)

    features = {
        "cpu_percent": _safe_float(cpu.get("cpu_percent")),
        "memory_percent": _safe_float(memory_vm.get("percent")),
        "disk_percent": disk_percent,
        "network_bytes_sent": _safe_float(network_io.get("bytes_sent")),
        "network_bytes_recv": _safe_float(network_io.get("bytes_recv")),
        "active_connections": _safe_float(security.get("active_connections")),
        "suspicious_process_count": _safe_float(security.get("suspicious_process_count")),
        "failed_login_count": _safe_float(security.get("failed_login_count")),
    }
    return features


class AnomalyEngine:
    """
    AI anomaly detection, trend analysis and prediction engine.

    Usage:
        engine = AnomalyEngine()
        result = engine.analyze(combined_data)
    """

    def __init__(
        self,
        model_dir: Optional[Path] = None,
        history_size: int = 200,
        contamination: float = 0.05,
        min_training_samples: int = 5,
    ) -> None:
        """
        Args:
            model_dir: Directory used to load/save trained models.
                Defaults to ai/models/.
            history_size: Maximum number of historical readings kept
                in-memory for trend analysis.
            contamination: Expected proportion of anomalies, passed to
                IsolationForest.
            min_training_samples: Minimum number of accumulated samples
                required before an IsolationForest model is (re)trained.
        """
        self.model_dir = model_dir or DEFAULT_MODEL_DIR
        self.history_size = history_size
        self.contamination = contamination
        self.min_training_samples = min_training_samples

        self.model_path = self.model_dir / DEFAULT_MODEL_FILENAME
        self.scaler_path = self.model_dir / DEFAULT_SCALER_FILENAME

        self._history: Deque[Dict[str, float]] = deque(maxlen=history_size)
        self._model: Optional[IsolationForest] = None
        self._scaler: Optional[StandardScaler] = None

        self._load_model()

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    # ------------------------------------------------------------------
    # Model persistence
    # ------------------------------------------------------------------

    def _load_model(self) -> None:
        try:
            if self.model_path.exists() and self.scaler_path.exists():
                self._model = joblib.load(self.model_path)
                self._scaler = joblib.load(self.scaler_path)
                logger.info("Loaded existing anomaly model from %s", self.model_dir)
            else:
                logger.info("No existing anomaly model found; will train on demand.")
        except Exception as exc:
            logger.error("Failed to load anomaly model: %s", exc)
            self._model = None
            self._scaler = None

    def _save_model(self) -> None:
        try:
            self.model_dir.mkdir(parents=True, exist_ok=True)
            joblib.dump(self._model, self.model_path)
            joblib.dump(self._scaler, self.scaler_path)
            logger.debug("Saved anomaly model to %s", self.model_dir)
        except Exception as exc:
            logger.error("Failed to save anomaly model: %s", exc)

    # ------------------------------------------------------------------
    # Training / inference
    # ------------------------------------------------------------------

    def _history_dataframe(self) -> pd.DataFrame:
        if not self._history:
            return pd.DataFrame(columns=FEATURE_KEYS)
        return pd.DataFrame(list(self._history), columns=FEATURE_KEYS)

    def _train_model(self, errors: List[str]) -> None:
        df = self._history_dataframe()
        if len(df) < self.min_training_samples:
            logger.info(
                "Not enough samples to train anomaly model (%d/%d).",
                len(df),
                self.min_training_samples,
            )
            return

        try:
            scaler = StandardScaler()
            X = scaler.fit_transform(df.to_numpy(dtype=float))

            model = IsolationForest(
                contamination=self.contamination,
                random_state=42,
                n_estimators=100,
            )
            model.fit(X)

            self._scaler = scaler
            self._model = model
            self._save_model()
            logger.info("Trained anomaly model on %d samples.", len(df))
        except Exception as exc:
            msg = f"Failed to train anomaly model: {exc}"
            logger.error(msg)
            errors.append(msg)

    def _detect_anomalies(
        self, features: Dict[str, float], errors: List[str]
    ) -> List[AnomalyResult]:
        anomalies: List[AnomalyResult] = []

        if self._model is None or self._scaler is None:
            logger.info("Anomaly model not yet trained; skipping ML-based detection.")
            return self._detect_anomalies_heuristic(features)

        try:
            row = np.array([[features[key] for key in FEATURE_KEYS]], dtype=float)
            X = self._scaler.transform(row)
            prediction = self._model.predict(X)[0]  # -1 = anomaly, 1 = normal
            score = float(self._model.decision_function(X)[0])

            if prediction == -1:
                worst_metric, worst_value = max(
                    features.items(), key=lambda kv: abs(kv[1])
                )
                severity = "high" if score < -0.1 else "medium"
                anomalies.append(
                    AnomalyResult(
                        metric=worst_metric,
                        value=worst_value,
                        severity=severity,
                        score=score,
                        description=(
                            f"Isolation Forest flagged an anomalous system state "
                            f"(dominant metric: {worst_metric}={worst_value})."
                        ),
                    )
                )
            return anomalies
        except Exception as exc:
            msg = f"Anomaly detection inference failed: {exc}"
            logger.error(msg)
            errors.append(msg)
            return self._detect_anomalies_heuristic(features)

    @staticmethod
    def _detect_anomalies_heuristic(features: Dict[str, float]) -> List[AnomalyResult]:
        """
        Simple threshold-based fallback used when no trained model is
        available yet (e.g. cold start with insufficient history).
        """
        thresholds = {
            "cpu_percent": 90.0,
            "memory_percent": 90.0,
            "disk_percent": 90.0,
            "suspicious_process_count": 1.0,
            "failed_login_count": 5.0,
        }
        anomalies: List[AnomalyResult] = []
        for metric, threshold in thresholds.items():
            value = features.get(metric, 0.0)
            if value >= threshold:
                anomalies.append(
                    AnomalyResult(
                        metric=metric,
                        value=value,
                        severity="medium",
                        score=0.0,
                        description=(
                            f"{metric} ({value}) exceeded heuristic threshold "
                            f"({threshold}) during cold-start (model not yet trained)."
                        ),
                    )
                )
        return anomalies

    # ------------------------------------------------------------------
    # Trend analysis & prediction
    # ------------------------------------------------------------------

    def _analyze_trends(self, errors: List[str]) -> List[TrendResult]:
        df = self._history_dataframe()
        trends: List[TrendResult] = []

        if df.empty:
            return trends

        for metric in FEATURE_KEYS:
            try:
                series = df[metric].to_numpy(dtype=float)
                sample_size = len(series)
                if sample_size < 2:
                    continue

                x = np.arange(sample_size, dtype=float)
                slope, _intercept = np.polyfit(x, series, 1)

                if slope > 0.5:
                    direction = "increasing"
                elif slope < -0.5:
                    direction = "decreasing"
                else:
                    direction = "stable"

                trends.append(
                    TrendResult(
                        metric=metric,
                        direction=direction,
                        slope=float(slope),
                        current_value=float(series[-1]),
                        average_value=float(np.mean(series)),
                        sample_size=sample_size,
                    )
                )
            except Exception as exc:
                msg = f"Trend analysis failed for metric '{metric}': {exc}"
                logger.error(msg)
                errors.append(msg)

        return trends

    @staticmethod
    def _generate_predictive_alerts(
        trends: List[TrendResult],
    ) -> List[PredictiveAlert]:
        alerts: List[PredictiveAlert] = []
        critical_metrics = {"cpu_percent", "memory_percent", "disk_percent"}

        for trend in trends:
            if trend.metric not in critical_metrics:
                continue
            if trend.direction != "increasing" or trend.current_value is None:
                continue

            projected = trend.current_value + trend.slope * 10  # ~10 readings ahead
            if projected >= 85.0:
                confidence = "high" if trend.sample_size >= 30 else "medium"
                alerts.append(
                    PredictiveAlert(
                        metric=trend.metric,
                        message=(
                            f"{trend.metric} is trending upward and may reach "
                            f"critical levels (~{projected:.1f}) if the trend continues."
                        ),
                        projected_value=float(projected),
                        horizon="next ~10 readings",
                        confidence=confidence,
                    )
                )

        return alerts

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def analyze(self, combined_data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Runs anomaly detection, trend analysis and predictive alerting
        on the supplied combined monitoring/security data.

        Args:
            combined_data: Dict with "monitoring" and "security" keys,
                as produced by ai_engine.py's input validation.

        Returns:
            Dict with keys: anomalies, trend_analysis, predictive_alerts,
            errors. Never raises.
        """
        errors: List[str] = []

        if combined_data is None or not isinstance(combined_data, dict):
            errors.append("combined_data missing or invalid; using empty payload.")
            combined_data = {}

        try:
            features = _extract_features(combined_data)
        except Exception as exc:
            msg = f"Feature extraction failed: {exc}"
            logger.error(msg)
            errors.append(msg)
            features = {key: 0.0 for key in FEATURE_KEYS}

        self._history.append(features)

        if self._model is None and len(self._history) >= self.min_training_samples:
            self._train_model(errors)
        elif self._model is not None and len(self._history) % self.history_size == 0:
            # Periodically retrain as more data accumulates.
            self._train_model(errors)

        anomalies = self._detect_anomalies(features, errors)
        trends = self._analyze_trends(errors)
        predictive_alerts = self._generate_predictive_alerts(trends)

        result = {
            "anomalies": [
                {
                    "metric": a.metric,
                    "value": a.value,
                    "severity": a.severity,
                    "score": a.score,
                    "description": a.description,
                }
                for a in anomalies
            ],
            "trend_analysis": {
                t.metric: {
                    "direction": t.direction,
                    "slope": t.slope,
                    "current_value": t.current_value,
                    "average_value": t.average_value,
                    "sample_size": t.sample_size,
                }
                for t in trends
            },
            "predictive_alerts": [
                {
                    "metric": p.metric,
                    "message": p.message,
                    "projected_value": p.projected_value,
                    "horizon": p.horizon,
                    "confidence": p.confidence,
                }
                for p in predictive_alerts
            ],
            "errors": errors,
        }

        if errors:
            logger.warning("Anomaly engine completed with %d error(s).", len(errors))
        else:
            logger.debug("Anomaly engine completed successfully at %s", self._now_iso())

        return result

    def reset_history(self) -> None:
        """Clears in-memory historical readings (does not affect saved model)."""
        self._history.clear()
        logger.info("Anomaly engine history cleared.")


def run_anomaly_analysis(combined_data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Convenience function for callers that just want a one-off anomaly
    analysis without managing an AnomalyEngine instance.

    Note: creates a fresh engine with no history, so trend/prediction
    output will be minimal. Prefer holding a single AnomalyEngine
    instance (as ai_engine.py does) across readings for meaningful
    trend analysis.
    """
    engine = AnomalyEngine()
    return engine.analyze(combined_data)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    _engine = AnomalyEngine(min_training_samples=5)
    for _i in range(10):
        _sample = {
            "monitoring": {
                "cpu": {"cpu_percent": 40.0 + _i},
                "memory": {"virtual_memory": {"percent": 50.0}},
                "disk": {"partitions": [{"percent": 60.0}]},
                "network": {"total_io": {"bytes_sent": 1000, "bytes_recv": 2000}},
            },
            "security": {
                "active_connections": 5,
                "suspicious_process_count": 0,
                "failed_login_count": 0,
            },
        }
        print(_engine.analyze(_sample))