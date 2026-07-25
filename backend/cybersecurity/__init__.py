"""
cybersecurity package

Initializes the Cybersecurity package for the Lavender Trinetra
system and exposes the public interfaces of its submodules for
convenient import by main.py and other consumers.
"""

from .process_security import (
    ProcessSecurityMonitor,
    ProcessSecurityError,
    ProcessInfo,
    SecurityFinding as ProcessSecurityFinding,
    ProcessSecurityReading,
    run_process_security_scan,
)
from .network_security import (
    NetworkSecurityMonitor,
    NetworkSecurityError,
    ConnectionInfo,
    ListeningPortInfo,
    InterfaceStatusInfo,
    SecurityEvent as NetworkSecurityEvent,
    NetworkSecurityReading,
    run_network_security_scan,
)
from .firewall_security import (
    FirewallSecurityMonitor,
    FirewallSecurityError,
    FirewallBackendInfo,
    SecurityEvent as FirewallSecurityEvent,
    FirewallSecurityReading,
    run_firewall_security_check,
)
from .threat_engine import (
    ThreatEngine,
    ThreatEngineError,
    ThreatIndicator,
    ThreatReport,
    ThreatEngineResult,
    run_threat_analysis,
)
from .security_analysis import (
    SecurityAnalysisEngine,
    SecurityAnalysisError,
    UserSessionInfo,
    SeveritySummary,
    SecurityHistoryEntry,
    SecurityAnalysisResult,
    run_security_analysis,
)

__all__ = [
    # Process Security
    "ProcessSecurityMonitor",
    "ProcessSecurityError",
    "ProcessInfo",
    "ProcessSecurityFinding",
    "ProcessSecurityReading",
    "run_process_security_scan",
    # Network Security
    "NetworkSecurityMonitor",
    "NetworkSecurityError",
    "ConnectionInfo",
    "ListeningPortInfo",
    "InterfaceStatusInfo",
    "NetworkSecurityEvent",
    "NetworkSecurityReading",
    "run_network_security_scan",
    # Firewall Security
    "FirewallSecurityMonitor",
    "FirewallSecurityError",
    "FirewallBackendInfo",
    "FirewallSecurityEvent",
    "FirewallSecurityReading",
    "run_firewall_security_check",
    # Threat Engine
    "ThreatEngine",
    "ThreatEngineError",
    "ThreatIndicator",
    "ThreatReport",
    "ThreatEngineResult",
    "run_threat_analysis",
    # Security Analysis
    "SecurityAnalysisEngine",
    "SecurityAnalysisError",
    "UserSessionInfo",
    "SeveritySummary",
    "SecurityHistoryEntry",
    "SecurityAnalysisResult",
    "run_security_analysis",
]