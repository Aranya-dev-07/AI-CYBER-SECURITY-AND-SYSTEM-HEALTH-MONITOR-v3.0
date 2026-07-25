"""
config.py

Centralized configuration module for the Lavender Trinetra backend.

This module stores ALL application settings, thresholds, file paths,
monitoring intervals, API configuration, database configuration and
reusable constants for the entire backend.

Architecture:
    main.py         -> Application orchestrator
    monitor/        -> Collects monitoring data
    cybersecurity/  -> Performs cybersecurity analysis
    ai/             -> Performs AI analysis
    database/       -> SQLite persistence
    api/            -> FastAPI communication
    config.py       -> Configuration ONLY (no business logic)

IMPORTANT: This module MUST NOT write CSV files, create folders,
create databases, execute monitoring, start FastAPI, start AI, start
cybersecurity analysis, generate reports, perform database
operations, or contain any monitoring/business logic. It only stores
and provides configuration.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Final, List


# ========================================================================
# APPLICATION PATHS (centralized, pathlib-based)
# ========================================================================


@dataclass(frozen=True)
class ApplicationPaths:
    """Centralized filesystem paths used across the backend."""

    project_root: Path = Path(__file__).resolve().parent
    data_dir: Path = field(init=False)
    logs_dir: Path = field(init=False)
    reports_dir: Path = field(init=False)
    ai_models_dir: Path = field(init=False)
    database_file: Path = field(init=False)
    csv_metrics_file: Path = field(init=False)
    csv_processes_file: Path = field(init=False)
    csv_report_file: Path = field(init=False)

    def __post_init__(self) -> None:
        # object.__setattr__ required because the dataclass is frozen.
        object.__setattr__(self, "data_dir", self.project_root / "data")
        object.__setattr__(self, "logs_dir", self.project_root / "logs")
        object.__setattr__(self, "reports_dir", self.project_root / "reports")
        object.__setattr__(self, "ai_models_dir", self.project_root / "ai" / "models")
        object.__setattr__(
            self, "database_file", self.data_dir / DatabaseConfig.DATABASE_FILENAME
        )
        object.__setattr__(
            self, "csv_metrics_file", self.data_dir / CSVConfig.SYSTEM_METRICS_FILENAME
        )
        object.__setattr__(
            self, "csv_processes_file", self.data_dir / CSVConfig.SYSTEM_PROCESSES_FILENAME
        )
        object.__setattr__(
            self, "csv_report_file", self.data_dir / CSVConfig.SYSTEM_REPORT_FILENAME
        )


# ========================================================================
# GENERAL APPLICATION CONFIGURATION
# ========================================================================


@dataclass(frozen=True)
class AppConfig:
    """General application-level configuration."""

    APP_NAME: str = "Lavender Trinetra"
    APP_VERSION: str = "1.0.0"
    APP_DESCRIPTION: str = (
        "AI-powered system monitoring, cybersecurity and analytics platform."
    )
    DEBUG_MODE: bool = False
    LOGGING_ENABLED: bool = True
    LOG_LEVEL: str = "INFO"
    DEFAULT_TIMEZONE: str = "UTC"
    TIMESTAMP_FORMAT: str = "%Y-%m-%dT%H:%M:%S%z"


# ========================================================================
# MONITORING CONFIGURATION
# ========================================================================


@dataclass(frozen=True)
class MonitoringConfig:
    """
    Monitoring interval configuration.

    UNIVERSAL_MONITORING_INTERVAL_SECONDS is the single source of
    truth for monitoring frequency. Changing this value automatically
    changes the monitoring frequency used throughout the entire
    application (CPU, memory, disk, network, cybersecurity scans).
    """

    UNIVERSAL_MONITORING_INTERVAL_SECONDS: int = 10

    # Derived/alias intervals — all default to the universal interval
    # so every subsystem stays in sync unless explicitly overridden.
    CPU_MONITOR_INTERVAL_SECONDS: int = UNIVERSAL_MONITORING_INTERVAL_SECONDS
    MEMORY_MONITOR_INTERVAL_SECONDS: int = UNIVERSAL_MONITORING_INTERVAL_SECONDS
    DISK_MONITOR_INTERVAL_SECONDS: int = UNIVERSAL_MONITORING_INTERVAL_SECONDS
    NETWORK_MONITOR_INTERVAL_SECONDS: int = UNIVERSAL_MONITORING_INTERVAL_SECONDS


# ========================================================================
# SYSTEM THRESHOLDS (used by main.py to generate alerts)
# ========================================================================


@dataclass(frozen=True)
class SystemThresholds:
    """Configurable system resource thresholds used for alerting."""

    CPU_USAGE_PERCENT: float = 85.0
    MEMORY_USAGE_PERCENT: float = 85.0
    DISK_USAGE_PERCENT: float = 90.0
    NETWORK_SENT_MB: float = 500.0
    NETWORK_RECEIVED_MB: float = 500.0

    def validate(self) -> List[str]:
        """Returns a list of validation error messages, empty if valid."""
        errors: List[str] = []
        for field_name in (
            "CPU_USAGE_PERCENT",
            "MEMORY_USAGE_PERCENT",
            "DISK_USAGE_PERCENT",
        ):
            value = getattr(self, field_name)
            if not (0.0 <= value <= 100.0):
                errors.append(f"{field_name} must be between 0 and 100, got {value}.")

        for field_name in ("NETWORK_SENT_MB", "NETWORK_RECEIVED_MB"):
            value = getattr(self, field_name)
            if value < 0.0:
                errors.append(f"{field_name} must be non-negative, got {value}.")

        return errors


# ========================================================================
# DATABASE CONFIGURATION (SQLite)
# ========================================================================


@dataclass(frozen=True)
class DatabaseConfig:
    """SQLite database configuration."""

    DATABASE_FILENAME: str = "lavender_trinetra.db"
    DATABASE_DIALECT: str = "sqlite"

    @property
    def DATABASE_PATH(self) -> Path:
        return ApplicationPaths().data_dir / self.DATABASE_FILENAME

    @property
    def CONNECTION_STRING(self) -> str:
        return f"sqlite:///{self.DATABASE_PATH}"


# ========================================================================
# CSV CONFIGURATION (paths/filenames only — no CSV I/O performed here)
# ========================================================================


@dataclass(frozen=True)
class CSVConfig:
    """Centralized CSV file configuration (paths/filenames only)."""

    SYSTEM_METRICS_FILENAME: str = "system_metrics.csv"
    SYSTEM_PROCESSES_FILENAME: str = "system_processes.csv"
    SYSTEM_REPORT_FILENAME: str = "system_report.csv"


# ========================================================================
# API CONFIGURATION (FastAPI / CORS)
# ========================================================================


@dataclass(frozen=True)
class APIConfig:
    """FastAPI server and CORS configuration."""

    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8002
    FRONTEND_ORIGIN: str = "http://localhost:5175"
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: List[str] = field(default_factory=lambda: ["*"])
    CORS_ALLOW_HEADERS: List[str] = field(default_factory=lambda: ["*"])

    @property
    def CORS_ORIGINS(self) -> List[str]:
        return [
            self.FRONTEND_ORIGIN,
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5175",
        ]

    def validate(self) -> List[str]:
        errors: List[str] = []
        if not (1 <= self.API_PORT <= 65535):
            errors.append(f"API_PORT must be between 1 and 65535, got {self.API_PORT}.")
        return errors


# ========================================================================
# AI CONFIGURATION
# ========================================================================


@dataclass(frozen=True)
class AIConfig:
    """AI engine configuration (thresholds, windows, model paths)."""

    AI_ENABLED: bool = True
    MODEL_DIRECTORY_NAME: str = "models"
    ANOMALY_MODEL_FILENAME: str = "anomaly_isolation_forest.joblib"
    SCALER_FILENAME: str = "anomaly_scaler.joblib"

    PREDICTION_WINDOW_SIZE: int = 10  # number of future readings to project
    TREND_WINDOW_SIZE: int = 200  # number of historical readings retained for trend analysis

    MIN_TRAINING_SAMPLES: int = 30
    ANOMALY_CONTAMINATION: float = 0.05

    HEALTH_SCORE_MIN: float = 0.0
    HEALTH_SCORE_MAX: float = 100.0
    HEALTH_SCORE_BASE: float = 100.0

    @property
    def MODEL_DIRECTORY(self) -> Path:
        return ApplicationPaths().ai_models_dir

    def validate(self) -> List[str]:
        errors: List[str] = []
        if self.HEALTH_SCORE_MIN >= self.HEALTH_SCORE_MAX:
            errors.append("HEALTH_SCORE_MIN must be less than HEALTH_SCORE_MAX.")
        if not (0.0 < self.ANOMALY_CONTAMINATION < 0.5):
            errors.append("ANOMALY_CONTAMINATION must be between 0 and 0.5.")
        if self.MIN_TRAINING_SAMPLES < 1:
            errors.append("MIN_TRAINING_SAMPLES must be at least 1.")
        return errors


# ========================================================================
# CYBERSECURITY CONFIGURATION
# ========================================================================


@dataclass(frozen=True)
class CybersecurityConfig:
    """Cybersecurity engine configuration (thresholds and intervals)."""

    SECURITY_ENABLED: bool = True

    THREAT_CONFIDENCE_THRESHOLD: float = 0.5
    SUSPICIOUS_PROCESS_CPU_THRESHOLD: float = 80.0
    SUSPICIOUS_PROCESS_MEMORY_THRESHOLD: float = 50.0

    FIREWALL_CHECK_INTERVAL_SECONDS: int = MonitoringConfig.UNIVERSAL_MONITORING_INTERVAL_SECONDS * 6
    NETWORK_CHECK_INTERVAL_SECONDS: int = MonitoringConfig.UNIVERSAL_MONITORING_INTERVAL_SECONDS

    MAX_CONNECTIONS_THRESHOLD: int = 500
    MAX_CONNECTIONS_PER_REMOTE_IP: int = 50

    def validate(self) -> List[str]:
        errors: List[str] = []
        if not (0.0 <= self.THREAT_CONFIDENCE_THRESHOLD <= 1.0):
            errors.append("THREAT_CONFIDENCE_THRESHOLD must be between 0 and 1.")
        if self.FIREWALL_CHECK_INTERVAL_SECONDS <= 0:
            errors.append("FIREWALL_CHECK_INTERVAL_SECONDS must be positive.")
        if self.NETWORK_CHECK_INTERVAL_SECONDS <= 0:
            errors.append("NETWORK_CHECK_INTERVAL_SECONDS must be positive.")
        return errors


# ========================================================================
# REPORT CONFIGURATION
# ========================================================================


@dataclass(frozen=True)
class ReportConfig:
    """CSV/PDF report configuration."""

    CSV_REPORTS_ENABLED: bool = True
    PDF_REPORTS_ENABLED: bool = True
    REPORT_DATE_FORMAT: str = "%Y-%m-%d %H:%M:%S"
    PDF_REPORT_FILENAME_PREFIX: str = "lavender_trinetra_report"

    @property
    def REPORT_DIRECTORY(self) -> Path:
        return ApplicationPaths().reports_dir


# ========================================================================
# SHARED CONSTANTS
# ========================================================================

SEVERITY_LEVELS: Final[List[str]] = ["low", "medium", "high", "critical"]
METRIC_TYPES: Final[List[str]] = ["cpu", "memory", "disk", "network"]
SECURITY_EVENT_SOURCES: Final[List[str]] = ["process", "network", "firewall"]
SUPPORTED_PLATFORMS: Final[List[str]] = ["Windows", "Linux", "Darwin"]


# ========================================================================
# CONFIGURATION SINGLETON INSTANCES
# (import these directly wherever configuration is needed)
# ========================================================================

paths = ApplicationPaths()
app_config = AppConfig()
monitoring_config = MonitoringConfig()
system_thresholds = SystemThresholds()
database_config = DatabaseConfig()
csv_config = CSVConfig()
api_config = APIConfig()
ai_config = AIConfig()
cybersecurity_config = CybersecurityConfig()
report_config = ReportConfig()

# ------------------------------------------------------------------
# Flat convenience aliases (frequently imported directly by other
# modules, e.g. `from config import API_HOST, API_PORT`)
# ------------------------------------------------------------------

APP_NAME: str = app_config.APP_NAME
APP_VERSION: str = app_config.APP_VERSION
APP_DESCRIPTION: str = app_config.APP_DESCRIPTION
DEBUG_MODE: bool = app_config.DEBUG_MODE

API_HOST: str = api_config.API_HOST
API_PORT: int = api_config.API_PORT
FRONTEND_ORIGIN: str = api_config.FRONTEND_ORIGIN
CORS_ORIGINS: List[str] = api_config.CORS_ORIGINS

DATABASE_URL: str = database_config.CONNECTION_STRING
DATABASE_PATH: Path = database_config.DATABASE_PATH

UNIVERSAL_MONITORING_INTERVAL_SECONDS: int = (
    monitoring_config.UNIVERSAL_MONITORING_INTERVAL_SECONDS
)

PROJECT_ROOT: Path = paths.project_root
DATA_DIR: Path = paths.data_dir
LOGS_DIR: Path = paths.logs_dir
REPORTS_DIR: Path = paths.reports_dir


# ========================================================================
# VALIDATION HELPER
# ========================================================================


def validate_configuration() -> List[str]:
    """
    Validates all configuration sections and returns a combined list
    of human-readable error messages (empty list if everything is
    valid). Does not raise, create files/folders, or perform any
    business logic — validation only.
    """
    errors: List[str] = []
    errors.extend(system_thresholds.validate())
    errors.extend(api_config.validate())
    errors.extend(ai_config.validate())
    errors.extend(cybersecurity_config.validate())
    return errors


if __name__ == "__main__":
    _errors = validate_configuration()
    if _errors:
        print("Configuration validation errors:")
        for _err in _errors:
            print(f"  - {_err}")
    else:
        print("Configuration is valid.")
    print(f"App: {APP_NAME} v{APP_VERSION}")
    print(f"API: {API_HOST}:{API_PORT}")
    print(f"Database URL: {DATABASE_URL}")
    print(f"Monitoring interval: {UNIVERSAL_MONITORING_INTERVAL_SECONDS}s")