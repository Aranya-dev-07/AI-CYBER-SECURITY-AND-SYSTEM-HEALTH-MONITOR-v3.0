"""
cpu_monitor.py

CPU monitoring module for the Lavender Trinetra system.
Collects CPU utilization, per-core usage, frequency, and load averages
using psutil. Designed to be lightweight and reusable by main.py.

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
        "psutil is required for cpu_monitor.py. Install it via 'pip install psutil'."
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
class CPUFrequencyInfo:
    """Structured CPU frequency data (in MHz)."""

    current: Optional[float] = None
    min: Optional[float] = None
    max: Optional[float] = None


@dataclass
class CPUReading:
    """Structured CPU monitoring reading."""

    timestamp: str
    cpu_percent: Optional[float] = None
    per_core_percent: List[float] = field(default_factory=list)
    core_count_logical: Optional[int] = None
    core_count_physical: Optional[int] = None
    frequency: CPUFrequencyInfo = field(default_factory=CPUFrequencyInfo)
    load_average: Optional[Dict[str, float]] = None
    load_average_supported: bool = False
    platform_name: str = field(default_factory=platform.system)
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "cpu_percent": self.cpu_percent,
            "per_core_percent": self.per_core_percent,
            "core_count_logical": self.core_count_logical,
            "core_count_physical": self.core_count_physical,
            "frequency": {
                "current": self.frequency.current,
                "min": self.frequency.min,
                "max": self.frequency.max,
            },
            "load_average": self.load_average,
            "load_average_supported": self.load_average_supported,
            "platform": self.platform_name,
            "errors": self.errors,
        }


class CPUMonitor:
    """
    Lightweight, reusable CPU monitor.

    Usage:
        monitor = CPUMonitor()
        reading = monitor.get_reading()
        data = reading.to_dict()
    """

    def __init__(self, per_core: bool = True, cpu_percent_interval: float = 0.0) -> None:
        """
        Args:
            per_core: Whether to collect per-core utilization.
            cpu_percent_interval: Interval (seconds) passed to psutil.cpu_percent.
                Use 0.0 for a non-blocking call (relies on internal psutil state
                from prior calls); use a small positive value (e.g. 0.1) for a
                blocking but more accurate instantaneous reading.
        """
        self.per_core = per_core
        self.cpu_percent_interval = cpu_percent_interval
        self.platform_name = platform.system()

        # Prime psutil's internal CPU percent state so the first real
        # reading is not artificially zero/inaccurate.
        try:
            psutil.cpu_percent(interval=None)
            if self.per_core:
                psutil.cpu_percent(interval=None, percpu=True)
        except Exception as exc:  # pragma: no cover
            logger.warning("Failed to prime psutil CPU percent state: %s", exc)

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _get_cpu_percent(self, errors: List[str]) -> Optional[float]:
        try:
            return psutil.cpu_percent(interval=self.cpu_percent_interval)
        except Exception as exc:
            msg = f"Failed to collect overall CPU percent: {exc}"
            logger.error(msg)
            errors.append(msg)
            return None

    def _get_per_core_percent(self, errors: List[str]) -> List[float]:
        if not self.per_core:
            return []
        try:
            return psutil.cpu_percent(interval=self.cpu_percent_interval, percpu=True)
        except Exception as exc:
            msg = f"Failed to collect per-core CPU percent: {exc}"
            logger.error(msg)
            errors.append(msg)
            return []

    def _get_core_counts(self, errors: List[str]) -> tuple[Optional[int], Optional[int]]:
        logical = physical = None
        try:
            logical = psutil.cpu_count(logical=True)
        except Exception as exc:
            msg = f"Failed to collect logical core count: {exc}"
            logger.error(msg)
            errors.append(msg)
        try:
            physical = psutil.cpu_count(logical=False)
        except Exception as exc:
            msg = f"Failed to collect physical core count: {exc}"
            logger.error(msg)
            errors.append(msg)
        return logical, physical

    def _get_frequency(self, errors: List[str]) -> CPUFrequencyInfo:
        try:
            freq = psutil.cpu_freq()
            if freq is None:
                logger.info("CPU frequency data not available on this platform.")
                return CPUFrequencyInfo()
            return CPUFrequencyInfo(
                current=getattr(freq, "current", None),
                min=getattr(freq, "min", None),
                max=getattr(freq, "max", None),
            )
        except NotImplementedError:
            logger.info("CPU frequency collection not implemented on this platform.")
            return CPUFrequencyInfo()
        except Exception as exc:
            msg = f"Failed to collect CPU frequency: {exc}"
            logger.error(msg)
            errors.append(msg)
            return CPUFrequencyInfo()

    def _get_load_average(self, errors: List[str]) -> tuple[Optional[Dict[str, float]], bool]:
        """
        Load averages are supported on POSIX systems (Linux/macOS).
        Not natively supported on Windows.
        """
        getloadavg = getattr(psutil, "getloadavg", None)
        if getloadavg is None:
            logger.info("Load average collection not supported by this psutil build.")
            return None, False

        if self.platform_name.lower() == "windows":
            logger.info("Load average not supported on Windows.")
            return None, False

        try:
            load_1, load_5, load_15 = getloadavg()
            return (
                {"1min": load_1, "5min": load_5, "15min": load_15},
                True,
            )
        except (OSError, AttributeError, NotImplementedError) as exc:
            logger.info("Load average not supported on this platform: %s", exc)
            return None, False
        except Exception as exc:
            msg = f"Failed to collect load average: {exc}"
            logger.error(msg)
            errors.append(msg)
            return None, False

    def get_reading(self) -> CPUReading:
        """
        Collect a single structured CPU monitoring reading.
        Never raises; all failures are captured in `errors` and logged.
        """
        errors: List[str] = []
        timestamp = self._now_iso()

        cpu_percent = self._get_cpu_percent(errors)
        per_core_percent = self._get_per_core_percent(errors)
        core_logical, core_physical = self._get_core_counts(errors)
        frequency = self._get_frequency(errors)
        load_average, load_supported = self._get_load_average(errors)

        reading = CPUReading(
            timestamp=timestamp,
            cpu_percent=cpu_percent,
            per_core_percent=per_core_percent,
            core_count_logical=core_logical,
            core_count_physical=core_physical,
            frequency=frequency,
            load_average=load_average,
            load_average_supported=load_supported,
            platform_name=self.platform_name,
            errors=errors,
        )

        if errors:
            logger.warning("CPU reading completed with %d error(s).", len(errors))
        else:
            logger.debug("CPU reading collected successfully at %s", timestamp)

        return reading

    def get_reading_dict(self) -> Dict[str, Any]:
        """Convenience method returning the reading as a plain dict."""
        return self.get_reading().to_dict()


def get_cpu_snapshot(per_core: bool = True, cpu_percent_interval: float = 0.0) -> Dict[str, Any]:
    """
    Convenience function for callers (e.g. main.py) that just want a
    one-off CPU snapshot without managing a CPUMonitor instance.
    """
    monitor = CPUMonitor(per_core=per_core, cpu_percent_interval=cpu_percent_interval)
    return monitor.get_reading_dict()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    _monitor = CPUMonitor(cpu_percent_interval=0.5)
    _reading = _monitor.get_reading()
    print(_reading.to_dict())