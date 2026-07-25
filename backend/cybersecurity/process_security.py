"""
process_security.py

Process monitoring and suspicious process detection module for the
Lavender Trinetra system. Uses psutil to enumerate running processes,
applies configurable rule-based checks, and flags abnormal resource
consumption or potentially malicious processes.

This module does NOT implement firewall logic, AI logic, or database
operations. It only collects process data and returns structured
security findings for cybersecurity/security_analysis.py and
main.py to consume.
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
        "psutil is required for process_security.py. Install it via 'pip install psutil'."
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

DEFAULT_CPU_THRESHOLD_PERCENT: float = 80.0
DEFAULT_MEMORY_THRESHOLD_PERCENT: float = 50.0

# Well-known, commonly abused process names worth flagging for review.
# This is a heuristic watchlist, not a definitive malware signature.
DEFAULT_SUSPICIOUS_NAME_KEYWORDS: Set[str] = {
    "mimikatz",
    "netcat",
    "ncat",
    "psexec",
    "meterpreter",
    "cobaltstrike",
    "keylogger",
    "cryptominer",
    "xmrig",
    "rat.exe",
    "backdoor",
}

# Process names that commonly run with no visible executable path or
# from unusual/world-writable locations; used as secondary signals.
SUSPICIOUS_PATH_KEYWORDS: Set[str] = {
    "/tmp/",
    "/var/tmp/",
    "\\temp\\",
    "\\appdata\\local\\temp\\",
}


class ProcessSecurityError(Exception):
    """Raised when process security monitoring cannot complete."""


@dataclass
class ProcessInfo:
    """Structured information about a single running process."""

    pid: int
    name: str
    status: str
    cpu_percent: Optional[float] = None
    memory_percent: Optional[float] = None
    username: Optional[str] = None
    exe_path: Optional[str] = None
    create_time: Optional[str] = None
    error: Optional[str] = None


@dataclass
class SecurityFinding:
    """A single suspicious-process security finding."""

    timestamp: str
    pid: int
    process_name: str
    finding_type: str
    severity: str
    description: str


@dataclass
class ProcessSecurityReading:
    """Structured result of a full process security scan."""

    timestamp: str
    process_count: int
    findings: List[SecurityFinding] = field(default_factory=list)
    top_cpu_processes: List[ProcessInfo] = field(default_factory=list)
    top_memory_processes: List[ProcessInfo] = field(default_factory=list)
    platform_name: str = field(default_factory=platform.system)
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "process_count": self.process_count,
            "findings": [
                {
                    "timestamp": f.timestamp,
                    "pid": f.pid,
                    "process_name": f.process_name,
                    "finding_type": f.finding_type,
                    "severity": f.severity,
                    "description": f.description,
                }
                for f in self.findings
            ],
            "top_cpu_processes": [_process_info_to_dict(p) for p in self.top_cpu_processes],
            "top_memory_processes": [_process_info_to_dict(p) for p in self.top_memory_processes],
            "platform": self.platform_name,
            "errors": self.errors,
        }


def _process_info_to_dict(p: ProcessInfo) -> Dict[str, Any]:
    return {
        "pid": p.pid,
        "name": p.name,
        "status": p.status,
        "cpu_percent": p.cpu_percent,
        "memory_percent": p.memory_percent,
        "username": p.username,
        "exe_path": p.exe_path,
        "create_time": p.create_time,
        "error": p.error,
    }


class ProcessSecurityMonitor:
    """
    Monitors running processes and detects suspicious activity using
    configurable rule-based checks.

    Usage:
        monitor = ProcessSecurityMonitor()
        reading = monitor.scan()
        data = reading.to_dict()
    """

    def __init__(
        self,
        cpu_threshold_percent: float = DEFAULT_CPU_THRESHOLD_PERCENT,
        memory_threshold_percent: float = DEFAULT_MEMORY_THRESHOLD_PERCENT,
        suspicious_name_keywords: Optional[Set[str]] = None,
        top_n: int = 5,
    ) -> None:
        """
        Args:
            cpu_threshold_percent: CPU usage percentage above which a
                process is flagged as abnormal.
            memory_threshold_percent: Memory usage percentage above
                which a process is flagged as abnormal.
            suspicious_name_keywords: Set of lowercase substrings
                checked against process names/executable paths to flag
                potentially malicious processes. Defaults to a built-in
                watchlist.
            top_n: Number of top CPU/memory consuming processes to
                include in each reading.
        """
        self.cpu_threshold_percent = cpu_threshold_percent
        self.memory_threshold_percent = memory_threshold_percent
        self.suspicious_name_keywords = (
            suspicious_name_keywords
            if suspicious_name_keywords is not None
            else set(DEFAULT_SUSPICIOUS_NAME_KEYWORDS)
        )
        self.top_n = top_n
        self.platform_name = platform.system()

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _collect_processes(self, errors: List[str]) -> List[ProcessInfo]:
        processes: List[ProcessInfo] = []
        try:
            attrs = ["pid", "name", "status", "username", "exe", "create_time"]
            for proc in psutil.process_iter(attrs=attrs):
                try:
                    info = proc.info
                    cpu_percent = None
                    memory_percent = None
                    try:
                        cpu_percent = proc.cpu_percent(interval=None)
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
                    try:
                        memory_percent = proc.memory_percent()
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass

                    create_time_iso = None
                    create_time = info.get("create_time")
                    if create_time:
                        try:
                            create_time_iso = datetime.fromtimestamp(
                                create_time, tz=timezone.utc
                            ).isoformat()
                        except (OSError, OverflowError, ValueError):
                            create_time_iso = None

                    processes.append(
                        ProcessInfo(
                            pid=info.get("pid", proc.pid),
                            name=info.get("name") or "unknown",
                            status=info.get("status") or "unknown",
                            cpu_percent=cpu_percent,
                            memory_percent=memory_percent,
                            username=info.get("username"),
                            exe_path=info.get("exe"),
                            create_time=create_time_iso,
                        )
                    )
                except (psutil.NoSuchProcess, psutil.ZombieProcess):
                    continue
                except psutil.AccessDenied:
                    try:
                        processes.append(
                            ProcessInfo(
                                pid=proc.pid,
                                name="access_denied",
                                status="unknown",
                                error="Access denied while reading process info.",
                            )
                        )
                    except Exception:
                        continue
                except Exception as exc:
                    msg = f"Failed to read a process entry: {exc}"
                    logger.warning(msg)
                    errors.append(msg)
        except Exception as exc:
            msg = f"Failed to enumerate processes: {exc}"
            logger.error(msg)
            errors.append(msg)

        return processes

    def _detect_resource_abuse(
        self, processes: List[ProcessInfo], timestamp: str
    ) -> List[SecurityFinding]:
        findings: List[SecurityFinding] = []
        for proc in processes:
            if proc.cpu_percent is not None and proc.cpu_percent >= self.cpu_threshold_percent:
                findings.append(
                    SecurityFinding(
                        timestamp=timestamp,
                        pid=proc.pid,
                        process_name=proc.name,
                        finding_type="abnormal_cpu_usage",
                        severity="medium" if proc.cpu_percent < 95 else "high",
                        description=(
                            f"Process '{proc.name}' (PID {proc.pid}) is consuming "
                            f"{proc.cpu_percent:.1f}% CPU, exceeding threshold "
                            f"({self.cpu_threshold_percent}%)."
                        ),
                    )
                )
            if (
                proc.memory_percent is not None
                and proc.memory_percent >= self.memory_threshold_percent
            ):
                findings.append(
                    SecurityFinding(
                        timestamp=timestamp,
                        pid=proc.pid,
                        process_name=proc.name,
                        finding_type="abnormal_memory_usage",
                        severity="medium" if proc.memory_percent < 80 else "high",
                        description=(
                            f"Process '{proc.name}' (PID {proc.pid}) is consuming "
                            f"{proc.memory_percent:.1f}% memory, exceeding threshold "
                            f"({self.memory_threshold_percent}%)."
                        ),
                    )
                )
        return findings

    def _detect_suspicious_processes(
        self, processes: List[ProcessInfo], timestamp: str
    ) -> List[SecurityFinding]:
        findings: List[SecurityFinding] = []
        for proc in processes:
            name_lower = (proc.name or "").lower()
            path_lower = (proc.exe_path or "").lower()

            matched_keyword = next(
                (kw for kw in self.suspicious_name_keywords if kw in name_lower or kw in path_lower),
                None,
            )
            if matched_keyword:
                findings.append(
                    SecurityFinding(
                        timestamp=timestamp,
                        pid=proc.pid,
                        process_name=proc.name,
                        finding_type="known_suspicious_name",
                        severity="high",
                        description=(
                            f"Process '{proc.name}' (PID {proc.pid}) matched suspicious "
                            f"watchlist keyword '{matched_keyword}'."
                        ),
                    )
                )
                continue

            matched_path = next(
                (kw for kw in SUSPICIOUS_PATH_KEYWORDS if kw in path_lower), None
            )
            if matched_path:
                findings.append(
                    SecurityFinding(
                        timestamp=timestamp,
                        pid=proc.pid,
                        process_name=proc.name,
                        finding_type="suspicious_execution_path",
                        severity="medium",
                        description=(
                            f"Process '{proc.name}' (PID {proc.pid}) is executing from "
                            f"a commonly abused temporary location: {proc.exe_path}."
                        ),
                    )
                )
                continue

            if not proc.exe_path and proc.name not in ("access_denied", "unknown"):
                findings.append(
                    SecurityFinding(
                        timestamp=timestamp,
                        pid=proc.pid,
                        process_name=proc.name,
                        finding_type="unknown_executable_path",
                        severity="low",
                        description=(
                            f"Process '{proc.name}' (PID {proc.pid}) has no resolvable "
                            f"executable path; origin could not be verified."
                        ),
                    )
                )

        return findings

    @staticmethod
    def _top_n_by(
        processes: List[ProcessInfo], attr: str, n: int
    ) -> List[ProcessInfo]:
        eligible = [p for p in processes if getattr(p, attr) is not None]
        return sorted(eligible, key=lambda p: getattr(p, attr), reverse=True)[:n]

    def scan(
        self, monitoring_data: Optional[Dict[str, Any]] = None
    ) -> ProcessSecurityReading:
        """
        Performs a full process security scan.

        Args:
            monitoring_data: Optional system monitoring snapshot (e.g.
                from monitor/cpu_monitor.py, monitor/memory_monitor.py)
                used only for contextual correlation in descriptions;
                this module does not collect its own system-level
                metrics beyond process data.

        Returns:
            ProcessSecurityReading with findings and top resource
            consumers. Never raises; failures are captured in `errors`.
        """
        errors: List[str] = []
        timestamp = self._now_iso()

        processes = self._collect_processes(errors)

        findings: List[SecurityFinding] = []
        findings.extend(self._detect_resource_abuse(processes, timestamp))
        findings.extend(self._detect_suspicious_processes(processes, timestamp))

        if monitoring_data and isinstance(monitoring_data, dict):
            system_cpu = (
                monitoring_data.get("cpu", {}).get("cpu_percent")
                if isinstance(monitoring_data.get("cpu"), dict)
                else None
            )
            if isinstance(system_cpu, (int, float)) and system_cpu >= 90:
                logger.info(
                    "System-wide CPU usage is high (%.1f%%); correlating with process findings.",
                    system_cpu,
                )

        reading = ProcessSecurityReading(
            timestamp=timestamp,
            process_count=len(processes),
            findings=findings,
            top_cpu_processes=self._top_n_by(processes, "cpu_percent", self.top_n),
            top_memory_processes=self._top_n_by(processes, "memory_percent", self.top_n),
            platform_name=self.platform_name,
            errors=errors,
        )

        if errors:
            logger.warning("Process security scan completed with %d error(s).", len(errors))
        else:
            logger.debug("Process security scan completed successfully at %s", timestamp)

        return reading

    def scan_dict(self, monitoring_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Convenience method returning the scan result as a plain dict."""
        return self.scan(monitoring_data).to_dict()


def run_process_security_scan(
    monitoring_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Convenience function for callers (e.g. main.py) that just want a
    one-off process security scan without managing a
    ProcessSecurityMonitor instance.
    """
    monitor = ProcessSecurityMonitor()
    return monitor.scan_dict(monitoring_data)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    _monitor = ProcessSecurityMonitor()
    _reading = _monitor.scan()
    print(_reading.to_dict())