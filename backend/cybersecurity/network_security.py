"""
network_security.py

Network security monitoring module for the Lavender Trinetra system.
Uses psutil to monitor active connections, listening ports, and
interface status, applying rule-based checks to detect unexpected
open ports and suspicious network activity.

This module does NOT implement AI analysis or database operations.
It only collects network security data and returns structured
security events for cybersecurity/security_analysis.py and main.py
to consume.
"""

from __future__ import annotations

import logging
import platform
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

try:
    import psutil
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "psutil is required for network_security.py. Install it via 'pip install psutil'."
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


# ----------------------------------------------------------------------
# Configurable detection rules
# ----------------------------------------------------------------------

# Well-known "expected" ports commonly used by legitimate services.
# Listening ports outside this set are flagged for review (heuristic,
# not a definitive threat signal).
DEFAULT_EXPECTED_PORTS: Set[int] = {
    20, 21, 22, 23, 25, 53, 67, 68, 80, 110, 123, 143,
    443, 445, 465, 587, 993, 995, 3306, 3389, 5432, 8000,
    8080, 8443,
}

# Ports commonly associated with malicious tooling, backdoors, or
# remote-access trojans. Presence in LISTEN state is a strong signal.
DEFAULT_HIGH_RISK_PORTS: Set[int] = {
    1337, 1524, 2323, 3127, 31337, 4444, 5555, 6666, 6667, 12345,
}

DEFAULT_MAX_CONNECTIONS_THRESHOLD: int = 500
DEFAULT_MAX_CONNECTIONS_PER_REMOTE_IP: int = 50


class NetworkSecurityError(Exception):
    """Raised when network security monitoring cannot complete."""


@dataclass
class ConnectionInfo:
    """Structured information about a single network connection."""

    fd: Optional[int]
    family: str
    type: str
    local_address: Optional[str]
    local_port: Optional[int]
    remote_address: Optional[str]
    remote_port: Optional[int]
    status: str
    pid: Optional[int]


@dataclass
class ListeningPortInfo:
    """Structured information about a listening port."""

    port: int
    address: str
    pid: Optional[int]
    process_name: Optional[str] = None


@dataclass
class InterfaceStatusInfo:
    """Structured network interface status."""

    name: str
    is_up: Optional[bool]
    speed_mbps: Optional[int]
    mtu: Optional[int]


@dataclass
class SecurityEvent:
    """A single network security event/finding."""

    timestamp: str
    event_type: str
    severity: str
    description: str
    local_port: Optional[int] = None
    remote_address: Optional[str] = None
    pid: Optional[int] = None


@dataclass
class NetworkSecurityReading:
    """Structured result of a full network security scan."""

    timestamp: str
    connection_count: int
    listening_ports: List[ListeningPortInfo] = field(default_factory=list)
    interfaces: List[InterfaceStatusInfo] = field(default_factory=list)
    events: List[SecurityEvent] = field(default_factory=list)
    platform_name: str = field(default_factory=platform.system)
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "connection_count": self.connection_count,
            "listening_ports": [
                {
                    "port": lp.port,
                    "address": lp.address,
                    "pid": lp.pid,
                    "process_name": lp.process_name,
                }
                for lp in self.listening_ports
            ],
            "interfaces": [
                {
                    "name": i.name,
                    "is_up": i.is_up,
                    "speed_mbps": i.speed_mbps,
                    "mtu": i.mtu,
                }
                for i in self.interfaces
            ],
            "events": [
                {
                    "timestamp": e.timestamp,
                    "event_type": e.event_type,
                    "severity": e.severity,
                    "description": e.description,
                    "local_port": e.local_port,
                    "remote_address": e.remote_address,
                    "pid": e.pid,
                }
                for e in self.events
            ],
            "platform": self.platform_name,
            "errors": self.errors,
        }


class NetworkSecurityMonitor:
    """
    Monitors active network connections, listening ports and interface
    status, applying rule-based checks to detect suspicious activity.

    Usage:
        monitor = NetworkSecurityMonitor()
        reading = monitor.scan()
        data = reading.to_dict()
    """

    def __init__(
        self,
        expected_ports: Optional[Set[int]] = None,
        high_risk_ports: Optional[Set[int]] = None,
        max_connections_threshold: int = DEFAULT_MAX_CONNECTIONS_THRESHOLD,
        max_connections_per_remote_ip: int = DEFAULT_MAX_CONNECTIONS_PER_REMOTE_IP,
    ) -> None:
        """
        Args:
            expected_ports: Set of ports considered "normal" for
                listening services. Defaults to a built-in common list.
            high_risk_ports: Set of ports strongly associated with
                malicious tooling. Defaults to a built-in watchlist.
            max_connections_threshold: Total active connection count
                above which a system-wide event is raised.
            max_connections_per_remote_ip: Number of connections from
                a single remote IP above which a possible flood/scan
                event is raised.
        """
        self.expected_ports = (
            expected_ports if expected_ports is not None else set(DEFAULT_EXPECTED_PORTS)
        )
        self.high_risk_ports = (
            high_risk_ports if high_risk_ports is not None else set(DEFAULT_HIGH_RISK_PORTS)
        )
        self.max_connections_threshold = max_connections_threshold
        self.max_connections_per_remote_ip = max_connections_per_remote_ip
        self.platform_name = platform.system()

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _family_name(family: Any) -> str:
        try:
            return family.name
        except AttributeError:
            return str(family)

    def _collect_connections(self, errors: List[str]) -> List[ConnectionInfo]:
        connections: List[ConnectionInfo] = []
        try:
            raw_connections = psutil.net_connections(kind="inet")
        except psutil.AccessDenied as exc:
            msg = f"Access denied while reading network connections: {exc}"
            logger.warning(msg)
            errors.append(msg)
            return connections
        except Exception as exc:
            msg = f"Failed to enumerate network connections: {exc}"
            logger.error(msg)
            errors.append(msg)
            return connections

        for conn in raw_connections:
            try:
                laddr = getattr(conn, "laddr", None)
                raddr = getattr(conn, "raddr", None)
                connections.append(
                    ConnectionInfo(
                        fd=getattr(conn, "fd", None),
                        family=self._family_name(getattr(conn, "family", None)),
                        type=self._family_name(getattr(conn, "type", None)),
                        local_address=getattr(laddr, "ip", None) if laddr else None,
                        local_port=getattr(laddr, "port", None) if laddr else None,
                        remote_address=getattr(raddr, "ip", None) if raddr else None,
                        remote_port=getattr(raddr, "port", None) if raddr else None,
                        status=getattr(conn, "status", "UNKNOWN"),
                        pid=getattr(conn, "pid", None),
                    )
                )
            except Exception as exc:
                msg = f"Failed to parse a connection entry: {exc}"
                logger.warning(msg)
                errors.append(msg)

        return connections

    def _extract_listening_ports(
        self, connections: List[ConnectionInfo], errors: List[str]
    ) -> List[ListeningPortInfo]:
        listening: List[ListeningPortInfo] = []
        for conn in connections:
            if conn.status != "LISTEN" or conn.local_port is None:
                continue

            process_name = None
            if conn.pid is not None:
                try:
                    process_name = psutil.Process(conn.pid).name()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    process_name = None
                except Exception as exc:
                    msg = f"Failed to resolve process name for PID {conn.pid}: {exc}"
                    logger.warning(msg)
                    errors.append(msg)

            listening.append(
                ListeningPortInfo(
                    port=conn.local_port,
                    address=conn.local_address or "0.0.0.0",
                    pid=conn.pid,
                    process_name=process_name,
                )
            )
        return listening

    def _collect_interfaces(self, errors: List[str]) -> List[InterfaceStatusInfo]:
        interfaces: List[InterfaceStatusInfo] = []
        try:
            stats_map = psutil.net_if_stats()
        except Exception as exc:
            msg = f"Failed to collect interface status: {exc}"
            logger.error(msg)
            errors.append(msg)
            return interfaces

        for name, stats in stats_map.items():
            try:
                interfaces.append(
                    InterfaceStatusInfo(
                        name=name,
                        is_up=getattr(stats, "isup", None),
                        speed_mbps=getattr(stats, "speed", None),
                        mtu=getattr(stats, "mtu", None),
                    )
                )
            except Exception as exc:
                msg = f"Failed to parse interface status for {name}: {exc}"
                logger.warning(msg)
                errors.append(msg)

        return interfaces

    def _detect_port_events(
        self, listening_ports: List[ListeningPortInfo], timestamp: str
    ) -> List[SecurityEvent]:
        events: List[SecurityEvent] = []
        for lp in listening_ports:
            if lp.port in self.high_risk_ports:
                events.append(
                    SecurityEvent(
                        timestamp=timestamp,
                        event_type="high_risk_port_open",
                        severity="high",
                        description=(
                            f"Port {lp.port} is listening on {lp.address}"
                            f"{f' (process: {lp.process_name})' if lp.process_name else ''} "
                            f"and is on the high-risk watchlist."
                        ),
                        local_port=lp.port,
                        pid=lp.pid,
                    )
                )
            elif lp.port not in self.expected_ports:
                events.append(
                    SecurityEvent(
                        timestamp=timestamp,
                        event_type="unexpected_open_port",
                        severity="medium",
                        description=(
                            f"Port {lp.port} is listening on {lp.address}"
                            f"{f' (process: {lp.process_name})' if lp.process_name else ''} "
                            f"and is outside the expected port list."
                        ),
                        local_port=lp.port,
                        pid=lp.pid,
                    )
                )
        return events

    def _detect_connection_events(
        self, connections: List[ConnectionInfo], timestamp: str
    ) -> List[SecurityEvent]:
        events: List[SecurityEvent] = []

        established = [c for c in connections if c.status == "ESTABLISHED"]

        if len(connections) >= self.max_connections_threshold:
            events.append(
                SecurityEvent(
                    timestamp=timestamp,
                    event_type="high_connection_volume",
                    severity="medium",
                    description=(
                        f"Total active connections ({len(connections)}) exceeds "
                        f"threshold ({self.max_connections_threshold}); possible "
                        f"scan, flood, or resource exhaustion attempt."
                    ),
                )
            )

        remote_ip_counts: Dict[str, int] = {}
        for conn in established:
            if conn.remote_address:
                remote_ip_counts[conn.remote_address] = (
                    remote_ip_counts.get(conn.remote_address, 0) + 1
                )

        for remote_ip, count in remote_ip_counts.items():
            if count >= self.max_connections_per_remote_ip:
                events.append(
                    SecurityEvent(
                        timestamp=timestamp,
                        event_type="excessive_connections_from_remote_ip",
                        severity="high",
                        description=(
                            f"Remote address {remote_ip} has {count} established "
                            f"connections, exceeding threshold "
                            f"({self.max_connections_per_remote_ip}); possible "
                            f"scan or brute-force attempt."
                        ),
                        remote_address=remote_ip,
                    )
                )

        return events

    def _detect_interface_events(
        self, interfaces: List[InterfaceStatusInfo], timestamp: str
    ) -> List[SecurityEvent]:
        events: List[SecurityEvent] = []
        for iface in interfaces:
            if iface.is_up is False:
                events.append(
                    SecurityEvent(
                        timestamp=timestamp,
                        event_type="interface_down",
                        severity="low",
                        description=(
                            f"Network interface '{iface.name}' is currently down."
                        ),
                    )
                )
        return events

    def scan(self) -> NetworkSecurityReading:
        """
        Performs a full network security scan: connections, listening
        ports, interface status, and rule-based event detection.

        Returns:
            NetworkSecurityReading with structured events. Never raises;
            failures are captured in `errors`.
        """
        errors: List[str] = []
        timestamp = self._now_iso()

        connections = self._collect_connections(errors)
        listening_ports = self._extract_listening_ports(connections, errors)
        interfaces = self._collect_interfaces(errors)

        events: List[SecurityEvent] = []
        events.extend(self._detect_port_events(listening_ports, timestamp))
        events.extend(self._detect_connection_events(connections, timestamp))
        events.extend(self._detect_interface_events(interfaces, timestamp))

        reading = NetworkSecurityReading(
            timestamp=timestamp,
            connection_count=len(connections),
            listening_ports=listening_ports,
            interfaces=interfaces,
            events=events,
            platform_name=self.platform_name,
            errors=errors,
        )

        if errors:
            logger.warning("Network security scan completed with %d error(s).", len(errors))
        else:
            logger.debug("Network security scan completed successfully at %s", timestamp)

        return reading

    def scan_dict(self) -> Dict[str, Any]:
        """Convenience method returning the scan result as a plain dict."""
        return self.scan().to_dict()


def run_network_security_scan() -> Dict[str, Any]:
    """
    Convenience function for callers (e.g. main.py) that just want a
    one-off network security scan without managing a
    NetworkSecurityMonitor instance.
    """
    monitor = NetworkSecurityMonitor()
    return monitor.scan_dict()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    _monitor = NetworkSecurityMonitor()
    _reading = _monitor.scan()
    print(_reading.to_dict())