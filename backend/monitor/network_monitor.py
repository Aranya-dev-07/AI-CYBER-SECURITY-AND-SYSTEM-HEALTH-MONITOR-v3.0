"""
network_monitor.py

Network monitoring module for the Lavender Trinetra system.
Collects network I/O statistics and interface information using
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
        "psutil is required for network_monitor.py. Install it via 'pip install psutil'."
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
class NetworkIOInfo:
    """Structured aggregate network I/O counters."""

    bytes_sent: Optional[int] = None
    bytes_recv: Optional[int] = None
    packets_sent: Optional[int] = None
    packets_recv: Optional[int] = None
    errin: Optional[int] = None
    errout: Optional[int] = None
    dropin: Optional[int] = None
    dropout: Optional[int] = None


@dataclass
class InterfaceAddress:
    """Structured address entry for a network interface."""

    family: str
    address: str
    netmask: Optional[str] = None
    broadcast: Optional[str] = None


@dataclass
class InterfaceInfo:
    """Structured per-interface information."""

    name: str
    addresses: List[InterfaceAddress] = field(default_factory=list)
    io: NetworkIOInfo = field(default_factory=NetworkIOInfo)
    is_up: Optional[bool] = None
    speed_mbps: Optional[int] = None
    mtu: Optional[int] = None
    duplex: Optional[str] = None
    status_supported: bool = False
    error: Optional[str] = None


@dataclass
class NetworkReading:
    """Structured network monitoring reading."""

    timestamp: str
    total_io: NetworkIOInfo = field(default_factory=NetworkIOInfo)
    interfaces: List[InterfaceInfo] = field(default_factory=list)
    platform_name: str = field(default_factory=platform.system)
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "total_io": {
                "bytes_sent": self.total_io.bytes_sent,
                "bytes_recv": self.total_io.bytes_recv,
                "packets_sent": self.total_io.packets_sent,
                "packets_recv": self.total_io.packets_recv,
                "errin": self.total_io.errin,
                "errout": self.total_io.errout,
                "dropin": self.total_io.dropin,
                "dropout": self.total_io.dropout,
            },
            "interfaces": [
                {
                    "name": iface.name,
                    "addresses": [
                        {
                            "family": addr.family,
                            "address": addr.address,
                            "netmask": addr.netmask,
                            "broadcast": addr.broadcast,
                        }
                        for addr in iface.addresses
                    ],
                    "io": {
                        "bytes_sent": iface.io.bytes_sent,
                        "bytes_recv": iface.io.bytes_recv,
                        "packets_sent": iface.io.packets_sent,
                        "packets_recv": iface.io.packets_recv,
                        "errin": iface.io.errin,
                        "errout": iface.io.errout,
                        "dropin": iface.io.dropin,
                        "dropout": iface.io.dropout,
                    },
                    "is_up": iface.is_up,
                    "speed_mbps": iface.speed_mbps,
                    "mtu": iface.mtu,
                    "duplex": iface.duplex,
                    "status_supported": iface.status_supported,
                    "error": iface.error,
                }
                for iface in self.interfaces
            ],
            "platform": self.platform_name,
            "errors": self.errors,
        }


# Mapping of socket address family values to human-readable names.
# Resolved lazily/defensively to avoid platform-specific import issues.
def _family_name(family: Any) -> str:
    try:
        return family.name  # AddressFamily enum
    except AttributeError:
        return str(family)


class NetworkMonitor:
    """
    Lightweight, reusable network monitor.

    Usage:
        monitor = NetworkMonitor()
        reading = monitor.get_reading()
        data = reading.to_dict()
    """

    def __init__(self, include_interfaces: bool = True) -> None:
        """
        Args:
            include_interfaces: Whether to collect per-interface details
                (addresses, I/O, status). Disable for a minimal, faster
                reading of only aggregate totals.
        """
        self.include_interfaces = include_interfaces
        self.platform_name = platform.system()

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _get_total_io(self, errors: List[str]) -> NetworkIOInfo:
        try:
            io = psutil.net_io_counters(pernic=False)
            if io is None:
                logger.info("Aggregate network I/O counters not available.")
                return NetworkIOInfo()
            return NetworkIOInfo(
                bytes_sent=getattr(io, "bytes_sent", None),
                bytes_recv=getattr(io, "bytes_recv", None),
                packets_sent=getattr(io, "packets_sent", None),
                packets_recv=getattr(io, "packets_recv", None),
                errin=getattr(io, "errin", None),
                errout=getattr(io, "errout", None),
                dropin=getattr(io, "dropin", None),
                dropout=getattr(io, "dropout", None),
            )
        except Exception as exc:
            msg = f"Failed to collect aggregate network I/O counters: {exc}"
            logger.error(msg)
            errors.append(msg)
            return NetworkIOInfo()

    def _get_interfaces(self, errors: List[str]) -> List[InterfaceInfo]:
        interfaces: List[InterfaceInfo] = []
        if not self.include_interfaces:
            return interfaces

        try:
            per_nic_io = psutil.net_io_counters(pernic=True) or {}
        except Exception as exc:
            msg = f"Failed to collect per-interface I/O counters: {exc}"
            logger.error(msg)
            errors.append(msg)
            per_nic_io = {}

        try:
            addrs_map = psutil.net_if_addrs()
        except Exception as exc:
            msg = f"Failed to collect network interface addresses: {exc}"
            logger.error(msg)
            errors.append(msg)
            addrs_map = {}

        try:
            stats_map = psutil.net_if_stats()
        except Exception as exc:
            msg = f"Failed to collect network interface stats: {exc}"
            logger.error(msg)
            errors.append(msg)
            stats_map = {}

        all_names = set(addrs_map.keys()) | set(stats_map.keys()) | set(per_nic_io.keys())

        for name in sorted(all_names):
            iface = InterfaceInfo(name=name)

            try:
                raw_addrs = addrs_map.get(name, [])
                iface.addresses = [
                    InterfaceAddress(
                        family=_family_name(a.family),
                        address=getattr(a, "address", ""),
                        netmask=getattr(a, "netmask", None),
                        broadcast=getattr(a, "broadcast", None),
                    )
                    for a in raw_addrs
                ]
            except Exception as exc:
                iface.error = f"Failed to parse addresses: {exc}"
                logger.error("Failed to parse addresses for %s: %s", name, exc)

            io = per_nic_io.get(name)
            if io is not None:
                iface.io = NetworkIOInfo(
                    bytes_sent=getattr(io, "bytes_sent", None),
                    bytes_recv=getattr(io, "bytes_recv", None),
                    packets_sent=getattr(io, "packets_sent", None),
                    packets_recv=getattr(io, "packets_recv", None),
                    errin=getattr(io, "errin", None),
                    errout=getattr(io, "errout", None),
                    dropin=getattr(io, "dropin", None),
                    dropout=getattr(io, "dropout", None),
                )

            stats = stats_map.get(name)
            if stats is not None:
                iface.status_supported = True
                try:
                    iface.is_up = getattr(stats, "isup", None)
                    iface.speed_mbps = getattr(stats, "speed", None)
                    iface.mtu = getattr(stats, "mtu", None)
                    duplex = getattr(stats, "duplex", None)
                    iface.duplex = _family_name(duplex) if duplex is not None else None
                except Exception as exc:
                    iface.error = f"Failed to parse interface stats: {exc}"
                    logger.error("Failed to parse stats for %s: %s", name, exc)
            else:
                logger.info("Interface status not available for %s.", name)

            interfaces.append(iface)

        return interfaces

    def get_reading(self) -> NetworkReading:
        """
        Collect a single structured network monitoring reading.
        Never raises; all failures are captured in `errors` and logged.
        """
        errors: List[str] = []
        timestamp = self._now_iso()

        total_io = self._get_total_io(errors)
        interfaces = self._get_interfaces(errors)

        reading = NetworkReading(
            timestamp=timestamp,
            total_io=total_io,
            interfaces=interfaces,
            platform_name=self.platform_name,
            errors=errors,
        )

        if errors:
            logger.warning("Network reading completed with %d error(s).", len(errors))
        else:
            logger.debug("Network reading collected successfully at %s", timestamp)

        return reading

    def get_reading_dict(self) -> Dict[str, Any]:
        """Convenience method returning the reading as a plain dict."""
        return self.get_reading().to_dict()


def get_network_snapshot(include_interfaces: bool = True) -> Dict[str, Any]:
    """
    Convenience function for callers (e.g. main.py) that just want a
    one-off network snapshot without managing a NetworkMonitor instance.
    """
    monitor = NetworkMonitor(include_interfaces=include_interfaces)
    return monitor.get_reading_dict()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    _monitor = NetworkMonitor()
    _reading = _monitor.get_reading()
    print(_reading.to_dict())