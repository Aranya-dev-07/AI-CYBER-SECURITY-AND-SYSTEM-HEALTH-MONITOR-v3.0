"""
database package

Initializes the Database package for the Lavender Trinetra system and
exposes the public interfaces of database.py for convenient import by
main.py and other consumers.
"""

from .database import (
    Base,
    DatabaseManager,
    DatabaseError,
    MonitoringRecord,
    SecurityRecord,
    AIAnalysisRecord,
    get_database,
    init_database,
)

__all__ = [
    "Base",
    "DatabaseManager",
    "DatabaseError",
    "MonitoringRecord",
    "SecurityRecord",
    "AIAnalysisRecord",
    "get_database",
    "init_database",
]