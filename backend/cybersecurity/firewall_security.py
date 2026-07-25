"""
firewall_security.py

Firewall status and security configuration monitoring module for the
Lavender Trinetra system. Checks firewall availability, operational
status, and key configuration settings across Windows, Linux and
macOS, using subprocess calls to native firewall tooling.

This module does NOT implement threat classification, AI logic, or
database operations. It only inspects firewall state and returns
structured security events for cybersecurity/security_analysis.py
and main.py to consume.
"""

from __future__ import annotations

import logging
import platform
import shutil
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
logger.setLevel(logging.INFO)


DEFAULT_COMMAND_TIMEOUT_SECONDS: float = 5.0


class FirewallSecurityError(Exception):
    """Raised when firewall security monitoring cannot complete."""


@dataclass
class FirewallBackendInfo:
    """Structured information about a detected firewall backend/tool."""

    name: str
    available: bool
    enabled: Optional[bool] = None
    detail: Optional[str] = None
    error: Optional[str] = None


@dataclass
class SecurityEvent:
    """A single firewall security event/finding."""

    timestamp: str
    event_type: str
    severity: str
    description: str
    backend: Optional[str] = None


@dataclass
class FirewallSecurityReading:
    """Structured result of a full firewall security check."""

    timestamp: str
    platform_name: str
    firewall_detected: bool
    firewall_enabled: Optional[bool]
    backends: List[FirewallBackendInfo] = field(default_factory=list)
    events: List[SecurityEvent] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "platform": self.platform_name,
            "firewall_detected": self.firewall_detected,
            "firewall_enabled": self.firewall_enabled,
            "backends": [
                {
                    "name": b.name,
                    "available": b.available,
                    "enabled": b.enabled,
                    "detail": b.detail,
                    "error": b.error,
                }
                for b in self.backends
            ],
            "events": [
                {
                    "timestamp": e.timestamp,
                    "event_type": e.event_type,
                    "severity": e.severity,
                    "description": e.description,
                    "backend": e.backend,
                }
                for e in self.events
            ],
            "errors": self.errors,
        }


class FirewallSecurityMonitor:
    """
    Monitors firewall availability, operational status and key
    configuration settings, cross-platform.

    Usage:
        monitor = FirewallSecurityMonitor()
        reading = monitor.check()
        data = reading.to_dict()
    """

    def __init__(self, command_timeout_seconds: float = DEFAULT_COMMAND_TIMEOUT_SECONDS) -> None:
        """
        Args:
            command_timeout_seconds: Timeout applied to every
                subprocess call used to query firewall tooling.
        """
        self.command_timeout_seconds = command_timeout_seconds
        self.platform_name = platform.system()

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _run_command(self, command: List[str], errors: List[str]) -> Optional[str]:
        """
        Runs a subprocess command safely and returns stdout, or None
        on failure. Never raises.
        """
        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=self.command_timeout_seconds,
                check=False,
            )
            if result.returncode != 0 and not result.stdout:
                logger.info(
                    "Command %s exited with code %s: %s",
                    " ".join(command),
                    result.returncode,
                    result.stderr.strip() if result.stderr else "",
                )
            return result.stdout or ""
        except FileNotFoundError:
            return None
        except subprocess.TimeoutExpired:
            msg = f"Command timed out: {' '.join(command)}"
            logger.warning(msg)
            errors.append(msg)
            return None
        except Exception as exc:
            msg = f"Failed to run command {' '.join(command)}: {exc}"
            logger.error(msg)
            errors.append(msg)
            return None

    # ------------------------------------------------------------------
    # Windows
    # ------------------------------------------------------------------

    def _check_windows_firewall(self, errors: List[str]) -> FirewallBackendInfo:
        backend = FirewallBackendInfo(name="Windows Defender Firewall", available=False)
        output = self._run_command(
            ["netsh", "advfirewall", "show", "allprofiles", "state"], errors
        )
        if output is None:
            backend.error = "netsh command unavailable or failed."
            return backend

        backend.available = True
        output_lower = output.lower()
        if "state" in output_lower:
            backend.enabled = "on" in output_lower and "off" not in output_lower.split("state")[0]
            # Fallback heuristic: count occurrences of ON vs OFF per profile.
            on_count = output_lower.count("state                                 on")
            off_count = output_lower.count("state                                 off")
            if on_count or off_count:
                backend.enabled = off_count == 0
            backend.detail = output.strip()
        else:
            backend.detail = output.strip()

        return backend

    # ------------------------------------------------------------------
    # Linux
    # ------------------------------------------------------------------

    def _check_ufw(self, errors: List[str]) -> Optional[FirewallBackendInfo]:
        if shutil.which("ufw") is None:
            return None
        backend = FirewallBackendInfo(name="ufw", available=True)
        output = self._run_command(["ufw", "status"], errors)
        if output is None:
            backend.available = False
            backend.error = "Failed to query ufw status (may require elevated privileges)."
            return backend

        output_lower = output.lower()
        if "status: active" in output_lower:
            backend.enabled = True
        elif "status: inactive" in output_lower:
            backend.enabled = False
        backend.detail = output.strip()
        return backend

    def _check_firewalld(self, errors: List[str]) -> Optional[FirewallBackendInfo]:
        if shutil.which("firewall-cmd") is None:
            return None
        backend = FirewallBackendInfo(name="firewalld", available=True)
        output = self._run_command(["firewall-cmd", "--state"], errors)
        if output is None:
            backend.available = False
            backend.error = "Failed to query firewalld state."
            return backend

        output_lower = output.strip().lower()
        backend.enabled = output_lower == "running"
        backend.detail = output.strip()
        return backend

    def _check_iptables(self, errors: List[str]) -> Optional[FirewallBackendInfo]:
        if shutil.which("iptables") is None:
            return None
        backend = FirewallBackendInfo(name="iptables", available=True)
        output = self._run_command(["iptables", "-L", "-n"], errors)
        if output is None:
            backend.available = False
            backend.error = "Failed to query iptables rules (may require elevated privileges)."
            return backend

        # Heuristic: if there are rules beyond the default chain headers,
        # consider iptables "active" in some capacity.
        rule_lines = [
            line
            for line in output.splitlines()
            if line and not line.startswith("Chain") and not line.startswith("target")
        ]
        backend.enabled = len(rule_lines) > 0
        backend.detail = f"{len(rule_lines)} rule line(s) detected."
        return backend

    def _check_linux_firewall(self, errors: List[str]) -> List[FirewallBackendInfo]:
        backends: List[FirewallBackendInfo] = []
        for check in (self._check_ufw, self._check_firewalld, self._check_iptables):
            result = check(errors)
            if result is not None:
                backends.append(result)
        return backends

    # ------------------------------------------------------------------
    # macOS
    # ------------------------------------------------------------------

    def _check_macos_firewall(self, errors: List[str]) -> FirewallBackendInfo:
        backend = FirewallBackendInfo(name="Application Firewall (macOS)", available=False)
        socketfilterfw = "/usr/libexec/ApplicationFirewall/socketfilterfw"
        output = self._run_command([socketfilterfw, "--getglobalstate"], errors)
        if output is None:
            backend.error = "socketfilterfw command unavailable or failed."
            return backend

        backend.available = True
        output_lower = output.lower()
        if "enabled" in output_lower:
            backend.enabled = True
        elif "disabled" in output_lower:
            backend.enabled = False
        backend.detail = output.strip()
        return backend

    # ------------------------------------------------------------------
    # Event generation
    # ------------------------------------------------------------------

    @staticmethod
    def _generate_events(
        backends: List[FirewallBackendInfo], timestamp: str
    ) -> List[SecurityEvent]:
        events: List[SecurityEvent] = []

        available_backends = [b for b in backends if b.available]

        if not available_backends:
            events.append(
                SecurityEvent(
                    timestamp=timestamp,
                    event_type="firewall_not_detected",
                    severity="high",
                    description=(
                        "No supported firewall backend could be detected or queried "
                        "on this system. The host may be unprotected or firewall "
                        "tooling requires elevated privileges to inspect."
                    ),
                )
            )
            return events

        any_enabled = any(b.enabled is True for b in available_backends)
        all_known_disabled = all(
            b.enabled is False for b in available_backends if b.enabled is not None
        )

        if not any_enabled and all_known_disabled:
            for backend in available_backends:
                if backend.enabled is False:
                    events.append(
                        SecurityEvent(
                            timestamp=timestamp,
                            event_type="firewall_disabled",
                            severity="critical",
                            description=(
                                f"Firewall backend '{backend.name}' is installed but "
                                f"currently disabled. The system is exposed to "
                                f"unsolicited inbound network traffic."
                            ),
                            backend=backend.name,
                        )
                    )
        elif not any_enabled:
            events.append(
                SecurityEvent(
                    timestamp=timestamp,
                    event_type="firewall_status_unknown",
                    severity="medium",
                    description=(
                        "Firewall backend(s) detected but their enabled/disabled "
                        "state could not be conclusively determined; manual "
                        "verification is recommended."
                    ),
                )
            )

        for backend in available_backends:
            if backend.error:
                events.append(
                    SecurityEvent(
                        timestamp=timestamp,
                        event_type="firewall_check_error",
                        severity="low",
                        description=(
                            f"Could not fully verify '{backend.name}': {backend.error}"
                        ),
                        backend=backend.name,
                    )
                )

        return events

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def check(self) -> FirewallSecurityReading:
        """
        Performs a full firewall status and configuration check,
        cross-platform.

        Returns:
            FirewallSecurityReading with detected backends and events.
            Never raises; failures are captured in `errors`.
        """
        errors: List[str] = []
        timestamp = self._now_iso()
        backends: List[FirewallBackendInfo] = []

        try:
            system = self.platform_name.lower()
            if system == "windows":
                backends.append(self._check_windows_firewall(errors))
            elif system == "linux":
                backends.extend(self._check_linux_firewall(errors))
            elif system == "darwin":
                backends.append(self._check_macos_firewall(errors))
            else:
                msg = f"Unsupported platform for firewall checks: {self.platform_name}"
                logger.info(msg)
                errors.append(msg)
        except Exception as exc:
            msg = f"Firewall detection failed unexpectedly: {exc}"
            logger.error(msg)
            errors.append(msg)

        firewall_detected = any(b.available for b in backends)
        known_states = [b.enabled for b in backends if b.enabled is not None]
        firewall_enabled: Optional[bool]
        if not known_states:
            firewall_enabled = None
        else:
            firewall_enabled = any(known_states)

        events = self._generate_events(backends, timestamp)

        reading = FirewallSecurityReading(
            timestamp=timestamp,
            platform_name=self.platform_name,
            firewall_detected=firewall_detected,
            firewall_enabled=firewall_enabled,
            backends=backends,
            events=events,
            errors=errors,
        )

        if errors:
            logger.warning("Firewall security check completed with %d error(s).", len(errors))
        else:
            logger.debug("Firewall security check completed successfully at %s", timestamp)

        return reading

    def check_dict(self) -> Dict[str, Any]:
        """Convenience method returning the check result as a plain dict."""
        return self.check().to_dict()


def run_firewall_security_check() -> Dict[str, Any]:
    """
    Convenience function for callers (e.g. main.py) that just want a
    one-off firewall security check without managing a
    FirewallSecurityMonitor instance.
    """
    monitor = FirewallSecurityMonitor()
    return monitor.check_dict()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    _monitor = FirewallSecurityMonitor()
    _reading = _monitor.check()
    print(_reading.to_dict())