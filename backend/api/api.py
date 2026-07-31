"""
api.py

FastAPI server for the Lavender Trinetra system. Connects the React
dashboard to the backend by exposing REST endpoints for system
monitoring, cybersecurity, AI analysis, database status and overall
application status.

This module does NOT implement monitoring, security, AI or database
business logic itself — it only calls directly into the monitor/,
cybersecurity/, ai/ and database/ packages' public functions/classes,
and returns their results as JSON via Pydantic response models.

Host/port configuration is read from config.py (default port: 8002).
Do not hardcode ports anywhere else.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import config

# ----------------------------------------------------------------------
# Logging
# ----------------------------------------------------------------------

logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
logger.setLevel(logging.INFO)


# ----------------------------------------------------------------------
# Config-driven settings (host/port/CORS come from config.py)
# ----------------------------------------------------------------------

API_HOST: str = getattr(config, "API_HOST", "0.0.0.0")
API_PORT: int = getattr(config, "API_PORT", 8002)
CORS_ORIGINS: List[str] = getattr(
    config, "CORS_ORIGINS", ["http://localhost:5173", "http://127.0.0.1:5173"]
)
APP_NAME: str = getattr(config, "APP_NAME", "Lavender Trinetra")
APP_VERSION: str = getattr(config, "APP_VERSION", "1.0.0")


# ----------------------------------------------------------------------
# Layer integrations (imported defensively so the API can still start
# and report availability even if a given layer isn't fully wired up)
# ----------------------------------------------------------------------

_monitor_available = False
try:
    from monitor import (
        get_cpu_snapshot,
        get_memory_snapshot,
        get_disk_snapshot,
        get_network_snapshot,
    )

    _monitor_available = True
except Exception as exc:  # pragma: no cover
    logger.warning("Monitoring layer unavailable: %s", exc)

_security_available = False
try:
    from cybersecurity import (
        run_process_security_scan,
        run_network_security_scan,
        run_firewall_security_check,
        run_threat_analysis,
        run_security_analysis,
    )

    _security_available = True
except Exception as exc:  # pragma: no cover
    logger.warning("Cybersecurity layer unavailable: %s", exc)

_ai_engine = None
_ai_available = False
try:
    from ai import AIEngine

    _ai_engine = AIEngine()
    _ai_available = True
except Exception as exc:  # pragma: no cover
    logger.warning("AI engine unavailable: %s", exc)

_db = None
_db_available = False
try:
    from database import get_database

    _db = get_database()
    _db_available = True
except Exception as exc:  # pragma: no cover
    logger.warning("Database layer unavailable: %s", exc)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_monitoring_snapshot() -> Dict[str, Any]:
    """Builds a fresh monitoring snapshot directly from the monitor package."""
    return {
        "cpu": get_cpu_snapshot(),
        "memory": get_memory_snapshot(),
        "disk": get_disk_snapshot(),
        "network": get_network_snapshot(),
    }


def _build_security_snapshot(
    monitoring_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Builds a fresh cybersecurity snapshot by running each scan directly
    from the cybersecurity package's public API and combining the
    results into a single dictionary.
    """
    process_data = run_process_security_scan(monitoring_data)
    network_data = run_network_security_scan()
    firewall_data = run_firewall_security_check()
    threats = run_threat_analysis(process_data, network_data, firewall_data)
    summary = run_security_analysis(threats)

    return {
        "process": process_data,
        "network": network_data,
        "firewall": firewall_data,
        "threats": threats,
        "summary": summary,
    }


# ----------------------------------------------------------------------
# Pydantic response models
# ----------------------------------------------------------------------


class ErrorResponse(BaseModel):
    detail: str


class ApplicationStatusResponse(BaseModel):
    app_name: str
    version: str
    status: str
    timestamp: str
    monitoring_available: bool
    security_available: bool
    ai_available: bool
    database_available: bool


class DatabaseStatusResponse(BaseModel):
    connected: bool
    database_url: Optional[str] = None
    timestamp: str
    error: Optional[str] = None


class MonitoringSnapshotResponse(BaseModel):
    timestamp: str
    data: Dict[str, Any]


class SecuritySnapshotResponse(BaseModel):
    timestamp: str
    data: Dict[str, Any]


class AIAnalysisRequest(BaseModel):
    monitoring_data: Optional[Dict[str, Any]] = Field(default=None)
    security_data: Optional[Dict[str, Any]] = Field(default=None)


class AIAnalysisResponse(BaseModel):
    timestamp: str
    data: Dict[str, Any]


# ----------------------------------------------------------------------
# FastAPI application
# ----------------------------------------------------------------------

app = FastAPI(
    title=APP_NAME,
    description="Backend API for the Lavender Trinetra monitoring, "
    "cybersecurity and AI platform.",
    version=APP_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc: Exception):  # pragma: no cover
    logger.error("Unhandled exception on %s: %s", request.url.path, exc)
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="An unexpected error occurred.",
    )


# ----------------------------------------------------------------------
# Application status endpoints
# ----------------------------------------------------------------------


@app.get(
    "/api/status",
    response_model=ApplicationStatusResponse,
    tags=["Application Status"],
)
async def get_application_status() -> ApplicationStatusResponse:
    """Returns overall application/service availability status."""
    try:
        return ApplicationStatusResponse(
            app_name=APP_NAME,
            version=APP_VERSION,
            status="running",
            timestamp=_now_iso(),
            monitoring_available=_monitor_available,
            security_available=_security_available,
            ai_available=_ai_available,
            database_available=_db_available,
        )
    except Exception as exc:
        logger.error("Failed to build application status: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve application status.")


@app.get("/api/health", tags=["Application Status"])
async def health_check() -> Dict[str, str]:
    """Lightweight liveness probe."""
    return {"status": "ok", "timestamp": _now_iso()}


# ----------------------------------------------------------------------
# Database status endpoints
# ----------------------------------------------------------------------


@app.get(
    "/api/database/status",
    response_model=DatabaseStatusResponse,
    tags=["Database Status"],
)
async def get_database_status() -> DatabaseStatusResponse:
    """Returns database connectivity status."""
    if not _db_available or _db is None:
        return DatabaseStatusResponse(
            connected=False,
            timestamp=_now_iso(),
            error="Database layer is not available.",
        )
    try:
        _ = _db.get_monitoring_records(limit=1)
        return DatabaseStatusResponse(
            connected=True,
            database_url=getattr(_db, "database_url", None),
            timestamp=_now_iso(),
        )
    except Exception as exc:
        logger.error("Database status check failed: %s", exc)
        return DatabaseStatusResponse(
            connected=False,
            database_url=getattr(_db, "database_url", None),
            timestamp=_now_iso(),
            error=str(exc),
        )


@app.get("/api/database/monitoring", tags=["Database Status"])
async def get_stored_monitoring_records(
    limit: int = 100, offset: int = 0
) -> List[Dict[str, Any]]:
    """Returns persisted monitoring records from the database layer."""
    if not _db_available or _db is None:
        raise HTTPException(status_code=503, detail="Database layer is not available.")
    try:
        return _db.get_monitoring_records(limit=limit, offset=offset)
    except Exception as exc:
        logger.error("Failed to fetch monitoring records: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch monitoring records.")


@app.get("/api/database/security", tags=["Database Status"])
async def get_stored_security_records(
    limit: int = 100, offset: int = 0
) -> List[Dict[str, Any]]:
    """Returns persisted security records from the database layer."""
    if not _db_available or _db is None:
        raise HTTPException(status_code=503, detail="Database layer is not available.")
    try:
        return _db.get_security_records(limit=limit, offset=offset)
    except Exception as exc:
        logger.error("Failed to fetch security records: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch security records.")


@app.get("/api/database/ai", tags=["Database Status"])
async def get_stored_ai_records(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """Returns persisted AI analysis records from the database layer."""
    if not _db_available or _db is None:
        raise HTTPException(status_code=503, detail="Database layer is not available.")
    try:
        return _db.get_ai_analysis_records(limit=limit, offset=offset)
    except Exception as exc:
        logger.error("Failed to fetch AI analysis records: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch AI analysis records.")


# ----------------------------------------------------------------------
# System Monitoring endpoints
# ----------------------------------------------------------------------


@app.get(
    "/api/monitoring/snapshot",
    response_model=MonitoringSnapshotResponse,
    tags=["System Monitoring"],
)
async def get_monitoring_snapshot() -> MonitoringSnapshotResponse:
    """Returns a fresh system monitoring snapshot (CPU/memory/disk/network)."""
    if not _monitor_available:
        raise HTTPException(status_code=503, detail="Monitoring layer is not available.")
    try:
        data = _build_monitoring_snapshot()
        return MonitoringSnapshotResponse(timestamp=_now_iso(), data=data)
    except Exception as exc:
        logger.error("Failed to retrieve monitoring snapshot: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve monitoring snapshot.")


# ----------------------------------------------------------------------
# Cybersecurity endpoints
# ----------------------------------------------------------------------


@app.get(
    "/api/security/snapshot",
    response_model=SecuritySnapshotResponse,
    tags=["Cybersecurity"],
)
async def get_security_snapshot() -> SecuritySnapshotResponse:
    """Returns a fresh cybersecurity snapshot (processes/network/firewall/threats)."""
    if not _security_available:
        raise HTTPException(status_code=503, detail="Cybersecurity layer is not available.")
    try:
        monitoring_data = _build_monitoring_snapshot() if _monitor_available else None
        data = _build_security_snapshot(monitoring_data)
        return SecuritySnapshotResponse(timestamp=_now_iso(), data=data)
    except Exception as exc:
        logger.error("Failed to retrieve security snapshot: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve security snapshot.")


@app.get("/api/security/score", tags=["Cybersecurity"])
async def get_security_score() -> Dict[str, Any]:
    """Returns a freshly computed overall security score."""
    if not _security_available:
        raise HTTPException(status_code=503, detail="Cybersecurity layer is not available.")
    try:
        monitoring_data = _build_monitoring_snapshot() if _monitor_available else None
        data = _build_security_snapshot(monitoring_data)
        security_score = data.get("summary", {}).get("security_score")
        return {"timestamp": _now_iso(), "security_score": security_score}
    except Exception as exc:
        logger.error("Failed to retrieve security score: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve security score.")


# ----------------------------------------------------------------------
# AI Engine endpoints
# ----------------------------------------------------------------------


@app.post(
    "/api/ai/analyze",
    response_model=AIAnalysisResponse,
    tags=["AI Engine"],
)
async def run_ai_analysis(request: AIAnalysisRequest) -> AIAnalysisResponse:
    """
    Runs a full AI analysis pass. If monitoring/security data is not
    supplied in the request body, fresh snapshots are obtained
    directly from the monitor/ and cybersecurity/ packages first.
    """
    if not _ai_available or _ai_engine is None:
        raise HTTPException(status_code=503, detail="AI engine is not available.")

    monitoring_data = request.monitoring_data
    security_data = request.security_data

    try:
        if monitoring_data is None and _monitor_available:
            monitoring_data = _build_monitoring_snapshot()
        if security_data is None and _security_available:
            security_data = _build_security_snapshot(monitoring_data)

        result = _ai_engine.analyze_dict(monitoring_data, security_data)
        return AIAnalysisResponse(timestamp=_now_iso(), data=result)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("AI analysis request failed: %s", exc)
        raise HTTPException(status_code=500, detail="AI analysis failed.")


@app.get("/api/ai/health-score", tags=["AI Engine"])
async def get_ai_health_score() -> Dict[str, Any]:
    """Convenience endpoint returning only the latest AI health score."""
    if not _ai_available or _ai_engine is None:
        raise HTTPException(status_code=503, detail="AI engine is not available.")
    try:
        monitoring_data = _build_monitoring_snapshot() if _monitor_available else {}
        security_data = (
            _build_security_snapshot(monitoring_data) if _security_available else {}
        )
        result = _ai_engine.analyze_dict(monitoring_data, security_data)
        return {
            "timestamp": _now_iso(),
            "health_score": result.get("health_score"),
        }
    except Exception as exc:
        logger.error("Failed to retrieve AI health score: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve AI health score.")


# ----------------------------------------------------------------------
# Entry point (invoked by main.py / uvicorn)
# ----------------------------------------------------------------------


def get_app() -> FastAPI:
    """Returns the configured FastAPI application instance for main.py."""
    return app


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    logging.basicConfig(level=logging.INFO)
    uvicorn.run("api:app", host=API_HOST, port=API_PORT, reload=False)