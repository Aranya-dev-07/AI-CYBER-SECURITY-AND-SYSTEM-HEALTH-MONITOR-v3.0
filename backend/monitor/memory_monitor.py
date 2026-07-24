"""
memory_monitor.py

Memory monitoring module for the Lavender Trinetra system.
Collects RAM and swap usage statistics using psutil. Designed to be
lightweight and reusable by main.py.

This module does NOT write CSV files, access the database, or perform
any AI/security logic. It only collects and returns structured data.
"""

from __future__ import annotations

import logging
import platform
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

try:
    import psutil
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "psutil is required for memory_monitor.py. Install it via 'pip install psutil'."
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


@dataclass
class VirtualMemoryInfo:
    """Structured RAM (virtual memory) data, in bytes unless noted."""

    total: Optional[int] = None
    available: Optional[int] = None
    used: Optional[int] = None
    free: Optional[int] = None
    percent: Optional[float] = None


@dataclass
class SwapMemoryInfo:
    """Structured swap memory data, in bytes unless noted."""

    total: Optional[int] = None
    used: Optional[int] = None
    free: Optional[int] = None
    percent: Optional[float] = None
    sin: Optional[int] = None
    sout: Optional[int] = None


@dataclass
class MemoryReading:
    """Structured memory monitoring reading."""

    timestamp: str
    virtual_memory: VirtualMemoryInfo = field(default_factory=VirtualMemoryInfo)
    swap_memory: SwapMemoryInfo = field(default_factory=SwapMemoryInfo)
    swap_supported: bool = False
    platform_name: str = field(default_factory=platform.system)
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "virtual_memory": {
                "total": self.virtual_memory.total,
                "available": self.virtual_memory.available,
                "used": self.virtual_memory.used,
                "free": self.virtual_memory.free,
                "percent": self.virtual_memory.percent,
            },
            "swap_memory": {
                "total": self.swap_memory.total,
                "used": self.swap_memory.used,
                "free": self.swap_memory.free,
                "percent": self.swap_memory.percent,
                "sin": self.swap_memory.sin,
                "sout": self.swap_memory.sout,
            },
            "swap_supported": self.swap_supported,
            "platform": self.platform_name,
            "errors": self.errors,
        }


class MemoryMonitor:
    """
    Lightweight, reusable memory monitor.

    Usage:
        monitor = MemoryMonitor()
        reading = monitor.get_reading()
        data = reading.to_dict()
    """

    def __init__(self) -> None:
        self.platform_name = platform.system()

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _get_virtual_memory(self, errors: List[str]) -> VirtualMemoryInfo:
        try:
            vm = psutil.virtual_memory()
            return VirtualMemoryInfo(
                total=getattr(vm, "total", None),
                available=getattr(vm, "available", None),
                used=getattr(vm, "used", None),
                free=getattr(vm, "free", None),
                percent=getattr(vm, "percent", None),
            )
        except Exception as exc:
            msg = f"Failed to collect virtual memory stats: {exc}"
            logger.error(msg)
            errors.append(msg)
            return VirtualMemoryInfo()

    def _get_swap_memory(self, errors: List[str]) -> tuple[SwapMemoryInfo, bool]:
        try:
            sm = psutil.swap_memory()
            return (
                SwapMemoryInfo(
                    total=getattr(sm, "total", None),
                    used=getattr(sm, "used", None),
                    free=getattr(sm, "free", None),
                    percent=getattr(sm, "percent", None),
                    sin=getattr(sm, "sin", None),
                    sout=getattr(sm, "sout", None),
                ),
                True,
            )
        except NotImplementedError:
            logger.info("Swap memory collection not implemented on this platform.")
            return SwapMemoryInfo(), False
        except Exception as exc:
            msg = f"Failed to collect swap memory stats: {exc}"
            logger.error(msg)
            errors.append(msg)
            return SwapMemoryInfo(), False

    def get_reading(self) -> MemoryReading:
        """
        Collect a single structured memory monitoring reading.
        Never raises; all failures are captured in `errors` and logged.
        """
        errors: List[str] = []
        timestamp = self._now_iso()

        virtual_memory = self._get_virtual_memory(errors)
        swap_memory, swap_supported = self._get_swap_memory(errors)

        reading = MemoryReading(
            timestamp=timestamp,
            virtual_memory=virtual_memory,
            swap_memory=swap_memory,
            swap_supported=swap_supported,
            platform_name=self.platform_name,
            errors=errors,
        )

        if errors:
            logger.warning("Memory reading completed with %d error(s).", len(errors))
        else:
            logger.debug("Memory reading collected successfully at %s", timestamp)

        return reading

    def get_reading_dict(self) -> Dict[str, Any]:
        """Convenience method returning the reading as a plain dict."""
        return self.get_reading().to_dict()


def get_memory_snapshot() -> Dict[str, Any]:
    """
    Convenience function for callers (e.g. main.py) that just want a
    one-off memory snapshot without managing a MemoryMonitor instance.
    """
    monitor = MemoryMonitor()
    return monitor.get_reading_dict()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    _monitor = MemoryMonitor()
    _reading = _monitor.get_reading()
    print(_reading.to_dict())