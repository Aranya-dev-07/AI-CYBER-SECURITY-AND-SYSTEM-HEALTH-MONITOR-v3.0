"""
disk_monitor.py

Disk monitoring module for the Lavender Trinetra system.
Collects disk usage, partition information, and I/O counters using
psutil. Designed to be lightweight and reusable by main.py.

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
        "psutil is required for disk_monitor.py. Install it via 'pip install psutil'."
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
class PartitionInfo:
    """Structured partition information and usage, in bytes unless noted."""

    device: str
    mountpoint: str
    fstype: str
    opts: str
    total: Optional[int] = None
    used: Optional[int] = None
    free: Optional[int] = None
    percent: Optional[float] = None
    error: Optional[str] = None


@dataclass
class DiskIOInfo:
    """Structured disk I/O counters (aggregate, across all disks)."""

    read_count: Optional[int] = None
    write_count: Optional[int] = None
    read_bytes: Optional[int] = None
    write_bytes: Optional[int] = None
    read_time: Optional[int] = None
    write_time: Optional[int] = None


@dataclass
class DiskReading:
    """Structured disk monitoring reading."""

    timestamp: str
    partitions: List[PartitionInfo] = field(default_factory=list)
    io_counters: DiskIOInfo = field(default_factory=DiskIOInfo)
    per_disk_io_counters: Dict[str, DiskIOInfo] = field(default_factory=dict)
    io_supported: bool = False
    platform_name: str = field(default_factory=platform.system)
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "partitions": [
                {
                    "device": p.device,
                    "mountpoint": p.mountpoint,
                    "fstype": p.fstype,
                    "opts": p.opts,
                    "total": p.total,
                    "used": p.used,
                    "free": p.free,
                    "percent": p.percent,
                    "error": p.error,
                }
                for p in self.partitions
            ],
            "io_counters": {
                "read_count": self.io_counters.read_count,
                "write_count": self.io_counters.write_count,
                "read_bytes": self.io_counters.read_bytes,
                "write_bytes": self.io_counters.write_bytes,
                "read_time": self.io_counters.read_time,
                "write_time": self.io_counters.write_time,
            },
            "per_disk_io_counters": {
                name: {
                    "read_count": io.read_count,
                    "write_count": io.write_count,
                    "read_bytes": io.read_bytes,
                    "write_bytes": io.write_bytes,
                    "read_time": io.read_time,
                    "write_time": io.write_time,
                }
                for name, io in self.per_disk_io_counters.items()
            },
            "io_supported": self.io_supported,
            "platform": self.platform_name,
            "errors": self.errors,
        }


class DiskMonitor:
    """
    Lightweight, reusable disk monitor.

    Usage:
        monitor = DiskMonitor()
        reading = monitor.get_reading()
        data = reading.to_dict()
    """

    def __init__(self, include_per_disk_io: bool = False, physical_only: bool = True) -> None:
        """
        Args:
            include_per_disk_io: Whether to also collect per-disk I/O counters
                (in addition to the aggregate counters). Disabled by default
                to keep monitoring lightweight.
            physical_only: Whether to list only physical partitions
                (passed to psutil.disk_partitions(all=not physical_only)).
        """
        self.include_per_disk_io = include_per_disk_io
        self.physical_only = physical_only
        self.platform_name = platform.system()

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _get_partitions(self, errors: List[str]) -> List[PartitionInfo]:
        partitions: List[PartitionInfo] = []
        try:
            raw_partitions = psutil.disk_partitions(all=not self.physical_only)
        except Exception as exc:
            msg = f"Failed to enumerate disk partitions: {exc}"
            logger.error(msg)
            errors.append(msg)
            return partitions

        for part in raw_partitions:
            info = PartitionInfo(
                device=getattr(part, "device", ""),
                mountpoint=getattr(part, "mountpoint", ""),
                fstype=getattr(part, "fstype", ""),
                opts=getattr(part, "opts", ""),
            )
            try:
                usage = psutil.disk_usage(part.mountpoint)
                info.total = usage.total
                info.used = usage.used
                info.free = usage.free
                info.percent = usage.percent
            except PermissionError as exc:
                info.error = f"Permission denied: {exc}"
                logger.warning(
                    "Permission denied reading usage for %s: %s",
                    part.mountpoint,
                    exc,
                )
            except FileNotFoundError as exc:
                info.error = f"Mountpoint not accessible: {exc}"
                logger.warning(
                    "Mountpoint not accessible %s: %s", part.mountpoint, exc
                )
            except Exception as exc:
                info.error = str(exc)
                msg = f"Failed to collect usage for {part.mountpoint}: {exc}"
                logger.error(msg)
                errors.append(msg)

            partitions.append(info)

        return partitions

    def _get_io_counters(self, errors: List[str]) -> tuple[DiskIOInfo, bool]:
        try:
            io = psutil.disk_io_counters(perdisk=False)
            if io is None:
                logger.info("Disk I/O counters not available on this platform.")
                return DiskIOInfo(), False
            return (
                DiskIOInfo(
                    read_count=getattr(io, "read_count", None),
                    write_count=getattr(io, "write_count", None),
                    read_bytes=getattr(io, "read_bytes", None),
                    write_bytes=getattr(io, "write_bytes", None),
                    read_time=getattr(io, "read_time", None),
                    write_time=getattr(io, "write_time", None),
                ),
                True,
            )
        except NotImplementedError:
            logger.info("Disk I/O counter collection not implemented on this platform.")
            return DiskIOInfo(), False
        except Exception as exc:
            msg = f"Failed to collect disk I/O counters: {exc}"
            logger.error(msg)
            errors.append(msg)
            return DiskIOInfo(), False

    def _get_per_disk_io_counters(self, errors: List[str]) -> Dict[str, DiskIOInfo]:
        if not self.include_per_disk_io:
            return {}
        result: Dict[str, DiskIOInfo] = {}
        try:
            per_disk = psutil.disk_io_counters(perdisk=True)
            if not per_disk:
                return result
            for name, io in per_disk.items():
                result[name] = DiskIOInfo(
                    read_count=getattr(io, "read_count", None),
                    write_count=getattr(io, "write_count", None),
                    read_bytes=getattr(io, "read_bytes", None),
                    write_bytes=getattr(io, "write_bytes", None),
                    read_time=getattr(io, "read_time", None),
                    write_time=getattr(io, "write_time", None),
                )
        except NotImplementedError:
            logger.info("Per-disk I/O counter collection not implemented on this platform.")
        except Exception as exc:
            msg = f"Failed to collect per-disk I/O counters: {exc}"
            logger.error(msg)
            errors.append(msg)
        return result

    def get_reading(self) -> DiskReading:
        """
        Collect a single structured disk monitoring reading.
        Never raises; all failures are captured in `errors` and logged.
        """
        errors: List[str] = []
        timestamp = self._now_iso()

        partitions = self._get_partitions(errors)
        io_counters, io_supported = self._get_io_counters(errors)
        per_disk_io_counters = self._get_per_disk_io_counters(errors)

        reading = DiskReading(
            timestamp=timestamp,
            partitions=partitions,
            io_counters=io_counters,
            per_disk_io_counters=per_disk_io_counters,
            io_supported=io_supported,
            platform_name=self.platform_name,
            errors=errors,
        )

        if errors:
            logger.warning("Disk reading completed with %d error(s).", len(errors))
        else:
            logger.debug("Disk reading collected successfully at %s", timestamp)

        return reading

    def get_reading_dict(self) -> Dict[str, Any]:
        """Convenience method returning the reading as a plain dict."""
        return self.get_reading().to_dict()


def get_disk_snapshot(include_per_disk_io: bool = False, physical_only: bool = True) -> Dict[str, Any]:
    """
    Convenience function for callers (e.g. main.py) that just want a
    one-off disk snapshot without managing a DiskMonitor instance.
    """
    monitor = DiskMonitor(include_per_disk_io=include_per_disk_io, physical_only=physical_only)
    return monitor.get_reading_dict()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    _monitor = DiskMonitor()
    _reading = _monitor.get_reading()
    print(_reading.to_dict())