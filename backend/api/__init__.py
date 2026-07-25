"""
api package

Initializes the API package for the Lavender Trinetra system and
exposes the public interfaces of api.py for convenient import by
main.py and other consumers.
"""

from .api import (
    app,
    get_app,
    API_HOST,
    API_PORT,
    CORS_ORIGINS,
)

__all__ = [
    "app",
    "get_app",
    "API_HOST",
    "API_PORT",
    "CORS_ORIGINS",
]