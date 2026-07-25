"""
database.py

SQLite database layer for the Lavender Trinetra system, built on
SQLAlchemy ORM. Handles engine/session management, schema
initialization, and CRUD operations for monitoring, cybersecurity and
AI analysis data.

This module does NOT implement API logic, monitoring collection, or
AI analysis logic. It only persists and retrieves structured data
supplied by other layers (main.py, api/, monitor/, cybersecurity/, ai/).
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional, Type, TypeVar

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
logger.setLevel(logging.INFO)


DEFAULT_DB_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_DB_FILENAME = "lavender_trinetra.db"
DEFAULT_DB_PATH = DEFAULT_DB_DIR / DEFAULT_DB_FILENAME
DEFAULT_DATABASE_URL = f"sqlite:///{DEFAULT_DB_PATH}"


class DatabaseError(Exception):
    """Raised when a database operation cannot be completed."""


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ----------------------------------------------------------------------
# ORM Models
# ----------------------------------------------------------------------


class MonitoringRecord(Base):
    """Persisted system monitoring reading (CPU/memory/disk/network)."""

    __tablename__ = "monitoring_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)
    metric_type = Column(String(50), nullable=False, index=True)  # cpu, memory, disk, network
    cpu_percent = Column(Float, nullable=True)
    memory_percent = Column(Float, nullable=True)
    disk_percent = Column(Float, nullable=True)
    network_bytes_sent = Column(Float, nullable=True)
    network_bytes_recv = Column(Float, nullable=True)
    raw_data = Column(Text, nullable=True)  # JSON-serialized full reading

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "metric_type": self.metric_type,
            "cpu_percent": self.cpu_percent,
            "memory_percent": self.memory_percent,
            "disk_percent": self.disk_percent,
            "network_bytes_sent": self.network_bytes_sent,
            "network_bytes_recv": self.network_bytes_recv,
            "raw_data": self.raw_data,
        }


class SecurityRecord(Base):
    """Persisted cybersecurity reading (process/network/firewall/threats)."""

    __tablename__ = "security_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)
    event_type = Column(String(50), nullable=False, index=True)  # process, network, firewall, threat
    severity = Column(String(20), nullable=True, index=True)
    security_score = Column(Float, nullable=True)
    suspicious_process_count = Column(Integer, nullable=True)
    failed_login_count = Column(Integer, nullable=True)
    active_connections = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)
    raw_data = Column(Text, nullable=True)  # JSON-serialized full reading

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "event_type": self.event_type,
            "severity": self.severity,
            "security_score": self.security_score,
            "suspicious_process_count": self.suspicious_process_count,
            "failed_login_count": self.failed_login_count,
            "active_connections": self.active_connections,
            "description": self.description,
            "raw_data": self.raw_data,
        }


class AIAnalysisRecord(Base):
    """Persisted AI analysis result (health score, anomalies, recommendations)."""

    __tablename__ = "ai_analysis_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)
    health_score = Column(Float, nullable=True)
    anomaly_count = Column(Integer, nullable=True)
    predictive_alert_count = Column(Integer, nullable=True)
    recommendation_count = Column(Integer, nullable=True)
    raw_data = Column(Text, nullable=True)  # JSON-serialized full AI result

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "health_score": self.health_score,
            "anomaly_count": self.anomaly_count,
            "predictive_alert_count": self.predictive_alert_count,
            "recommendation_count": self.recommendation_count,
            "raw_data": self.raw_data,
        }


ModelType = TypeVar("ModelType", bound=Base)


# ----------------------------------------------------------------------
# Database manager
# ----------------------------------------------------------------------


class DatabaseManager:
    """
    Central database manager for the Lavender Trinetra system.

    Handles engine creation, schema initialization, session management,
    and generic + domain-specific CRUD operations.

    Usage:
        db = DatabaseManager()
        db.init_db()
        with db.session_scope() as session:
            ...

        # or via convenience CRUD methods:
        db.create_monitoring_record({...})
        db.get_monitoring_records(limit=10)
    """

    def __init__(self, database_url: Optional[str] = None, echo: bool = False) -> None:
        """
        Args:
            database_url: SQLAlchemy database URL. Defaults to a local
                SQLite file under data/lavender_trinetra.db, created
                automatically if it does not exist.
            echo: Whether SQLAlchemy should log all SQL statements.
        """
        self.database_url = database_url or DEFAULT_DATABASE_URL

        try:
            if self.database_url.startswith("sqlite:///"):
                db_path = Path(self.database_url.replace("sqlite:///", "", 1))
                db_path.parent.mkdir(parents=True, exist_ok=True)

            self.engine = create_engine(
                self.database_url,
                echo=echo,
                connect_args=(
                    {"check_same_thread": False}
                    if self.database_url.startswith("sqlite")
                    else {}
                ),
            )
            self.SessionLocal = sessionmaker(
                bind=self.engine, autoflush=False, autocommit=False, expire_on_commit=False
            )
            logger.info("Database engine created for %s", self.database_url)
        except SQLAlchemyError as exc:
            logger.error("Failed to create database engine: %s", exc)
            raise DatabaseError(f"Failed to create database engine: {exc}") from exc

    # ------------------------------------------------------------------
    # Schema / lifecycle
    # ------------------------------------------------------------------

    def init_db(self) -> None:
        """Creates the database file (if missing) and all tables."""
        try:
            Base.metadata.create_all(bind=self.engine)
            logger.info("Database schema initialized successfully.")
        except SQLAlchemyError as exc:
            logger.error("Failed to initialize database schema: %s", exc)
            raise DatabaseError(f"Failed to initialize database schema: {exc}") from exc

    def drop_all(self) -> None:
        """Drops all tables. Intended for testing/reset scenarios only."""
        try:
            Base.metadata.drop_all(bind=self.engine)
            logger.warning("All database tables dropped.")
        except SQLAlchemyError as exc:
            logger.error("Failed to drop database tables: %s", exc)
            raise DatabaseError(f"Failed to drop database tables: {exc}") from exc

    # ------------------------------------------------------------------
    # Session management
    # ------------------------------------------------------------------

    def get_session(self) -> Session:
        """Returns a new SQLAlchemy Session. Caller is responsible for closing it."""
        return self.SessionLocal()

    @contextmanager
    def session_scope(self) -> Generator[Session, None, None]:
        """
        Context manager providing a transactional session scope.
        Commits on success, rolls back on exception, always closes.

        Usage:
            with db.session_scope() as session:
                session.add(obj)
        """
        session = self.SessionLocal()
        try:
            yield session
            session.commit()
        except SQLAlchemyError as exc:
            session.rollback()
            logger.error("Transaction rolled back due to error: %s", exc)
            raise DatabaseError(f"Transaction failed: {exc}") from exc
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    # ------------------------------------------------------------------
    # Generic CRUD helpers
    # ------------------------------------------------------------------

    def _create(self, model_cls: Type[ModelType], data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            with self.session_scope() as session:
                instance = model_cls(**data)
                session.add(instance)
                session.flush()
                session.refresh(instance)
                return instance.to_dict()
        except DatabaseError:
            raise
        except Exception as exc:
            logger.error("Failed to create %s record: %s", model_cls.__name__, exc)
            raise DatabaseError(f"Failed to create {model_cls.__name__} record: {exc}") from exc

    def _get_by_id(self, model_cls: Type[ModelType], record_id: int) -> Optional[Dict[str, Any]]:
        try:
            with self.session_scope() as session:
                instance = session.get(model_cls, record_id)
                return instance.to_dict() if instance else None
        except DatabaseError:
            raise
        except Exception as exc:
            logger.error("Failed to fetch %s record %s: %s", model_cls.__name__, record_id, exc)
            raise DatabaseError(
                f"Failed to fetch {model_cls.__name__} record {record_id}: {exc}"
            ) from exc

    def _get_all(
        self,
        model_cls: Type[ModelType],
        limit: Optional[int] = 100,
        offset: int = 0,
        order_desc: bool = True,
    ) -> List[Dict[str, Any]]:
        try:
            with self.session_scope() as session:
                query = session.query(model_cls)
                if order_desc:
                    query = query.order_by(model_cls.timestamp.desc())
                else:
                    query = query.order_by(model_cls.timestamp.asc())
                if offset:
                    query = query.offset(offset)
                if limit is not None:
                    query = query.limit(limit)
                return [row.to_dict() for row in query.all()]
        except DatabaseError:
            raise
        except Exception as exc:
            logger.error("Failed to fetch %s records: %s", model_cls.__name__, exc)
            raise DatabaseError(f"Failed to fetch {model_cls.__name__} records: {exc}") from exc

    def _delete(self, model_cls: Type[ModelType], record_id: int) -> bool:
        try:
            with self.session_scope() as session:
                instance = session.get(model_cls, record_id)
                if instance is None:
                    return False
                session.delete(instance)
                return True
        except DatabaseError:
            raise
        except Exception as exc:
            logger.error("Failed to delete %s record %s: %s", model_cls.__name__, record_id, exc)
            raise DatabaseError(
                f"Failed to delete {model_cls.__name__} record {record_id}: {exc}"
            ) from exc

    # ------------------------------------------------------------------
    # Monitoring CRUD
    # ------------------------------------------------------------------

    def create_monitoring_record(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._create(MonitoringRecord, data)

    def get_monitoring_record(self, record_id: int) -> Optional[Dict[str, Any]]:
        return self._get_by_id(MonitoringRecord, record_id)

    def get_monitoring_records(
        self, limit: Optional[int] = 100, offset: int = 0
    ) -> List[Dict[str, Any]]:
        return self._get_all(MonitoringRecord, limit=limit, offset=offset)

    def delete_monitoring_record(self, record_id: int) -> bool:
        return self._delete(MonitoringRecord, record_id)

    # ------------------------------------------------------------------
    # Security CRUD
    # ------------------------------------------------------------------

    def create_security_record(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._create(SecurityRecord, data)

    def get_security_record(self, record_id: int) -> Optional[Dict[str, Any]]:
        return self._get_by_id(SecurityRecord, record_id)

    def get_security_records(
        self, limit: Optional[int] = 100, offset: int = 0
    ) -> List[Dict[str, Any]]:
        return self._get_all(SecurityRecord, limit=limit, offset=offset)

    def delete_security_record(self, record_id: int) -> bool:
        return self._delete(SecurityRecord, record_id)

    # ------------------------------------------------------------------
    # AI Analysis CRUD
    # ------------------------------------------------------------------

    def create_ai_analysis_record(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._create(AIAnalysisRecord, data)

    def get_ai_analysis_record(self, record_id: int) -> Optional[Dict[str, Any]]:
        return self._get_by_id(AIAnalysisRecord, record_id)

    def get_ai_analysis_records(
        self, limit: Optional[int] = 100, offset: int = 0
    ) -> List[Dict[str, Any]]:
        return self._get_all(AIAnalysisRecord, limit=limit, offset=offset)

    def delete_ai_analysis_record(self, record_id: int) -> bool:
        return self._delete(AIAnalysisRecord, record_id)


# ----------------------------------------------------------------------
# Module-level singleton + convenience accessors (for main.py)
# ----------------------------------------------------------------------

_db_manager: Optional[DatabaseManager] = None


def get_database(database_url: Optional[str] = None, echo: bool = False) -> DatabaseManager:
    """
    Returns a process-wide singleton DatabaseManager, creating it (and
    initializing the schema) on first call.
    """
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager(database_url=database_url, echo=echo)
        _db_manager.init_db()
    return _db_manager


def init_database(database_url: Optional[str] = None, echo: bool = False) -> DatabaseManager:
    """
    Convenience function for main.py to explicitly initialize the
    database at application startup.
    """
    db = get_database(database_url=database_url, echo=echo)
    logger.info("Database ready at %s", db.database_url)
    return db


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    _db = init_database()
    _record = _db.create_monitoring_record(
        {
            "metric_type": "cpu",
            "cpu_percent": 42.5,
            "raw_data": "{}",
        }
    )
    print(_record)
    print(_db.get_monitoring_records(limit=5))