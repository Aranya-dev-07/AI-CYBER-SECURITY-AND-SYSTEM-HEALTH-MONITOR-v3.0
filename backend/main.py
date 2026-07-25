"""
main.py

Main application orchestrator for the Lavender Trinetra system.

Responsible for starting, coordinating and gracefully shutting down
the entire backend: configuration, logging, CSV/database
initialization, the FastAPI server, and the monitoring / cybersecurity
/ AI engines. Each subsystem performs only its own responsibility —
main.py coordinates, it does not duplicate business logic.
"""

from __future__ import annotations

import csv
import logging
import platform
import statistics
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import config
from monitor import CPUMonitor, MemoryMonitor, DiskMonitor, NetworkMonitor
from cybersecurity import (
    ProcessSecurityMonitor,
    NetworkSecurityMonitor,
    FirewallSecurityMonitor,
    ThreatEngine,
    SecurityAnalysisEngine,
)
from ai import AIEngine
from database import init_database, DatabaseManager


# ========================================================================
# Logging setup
# ========================================================================

logger = logging.getLogger("lavender_trinetra")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
logger.setLevel(logging.INFO if config.app_config.LOGGING_ENABLED else logging.CRITICAL)


# ========================================================================
# User input control (S = Start Monitoring, Q = Quit)
# ========================================================================


class UserInputController:
    """
    Simple, cross-platform user control surface based on standard
    line input (no raw terminal / OS-level key hooks required):

        S  ->  Start Monitoring
        Q  ->  Quit

    Before monitoring starts, prompt_start_or_quit() blocks until a
    valid S/Q choice is entered. Once monitoring is running,
    start_quit_listener() watches a background thread for a
    subsequent 'Q' entry to request a graceful stop.
    """

    VALID_START_CHOICES = ("S", "Q")

    def __init__(self) -> None:
        self._stop_event = threading.Event()
        self._listener_thread: Optional[threading.Thread] = None

    def prompt_start_or_quit(self) -> str:
        """Blocks until the user enters a valid 'S' or 'Q' choice."""
        while True:
            try:
                choice = input("Select an option -> [S] Start Monitoring   [Q] Quit: ").strip().upper()
            except EOFError:
                return "Q"

            if choice in self.VALID_START_CHOICES:
                return choice

            print("Invalid option. Please enter 'S' to start monitoring or 'Q' to quit.")

    def start_quit_listener(self) -> None:
        """Starts a background thread watching for a 'Q' entry to stop monitoring."""

        def _listen() -> None:
            while not self._stop_event.is_set():
                try:
                    choice = input()
                except EOFError:
                    self._stop_event.set()
                    return
                if choice.strip().upper() == "Q":
                    logger.info("'Q' entered. Stopping data collection.")
                    self._stop_event.set()
                    return

        self._listener_thread = threading.Thread(target=_listen, daemon=True)
        self._listener_thread.start()

    def stop_requested(self) -> bool:
        return self._stop_event.is_set()


# ========================================================================
# Run counter persistence (increments across application executions)
# ========================================================================


class RunCounter:
    """Tracks and persists an incrementing run number across executions."""

    def __init__(self, counter_file: Path) -> None:
        self.counter_file = counter_file
        self.run_number = self._load_and_increment()

    def _load_and_increment(self) -> int:
        try:
            if self.counter_file.exists():
                raw = self.counter_file.read_text(encoding="utf-8").strip()
                current = int(raw) if raw.isdigit() else 0
            else:
                current = 0
        except Exception as exc:
            logger.warning("Failed to read run counter, defaulting to 0: %s", exc)
            current = 0

        new_run_number = current + 1
        try:
            self.counter_file.parent.mkdir(parents=True, exist_ok=True)
            self.counter_file.write_text(str(new_run_number), encoding="utf-8")
        except Exception as exc:
            logger.warning("Failed to persist run counter: %s", exc)

        return new_run_number


# ========================================================================
# Main application orchestrator
# ========================================================================


class LavenderTrinetraApp:
    """
    Central orchestrator for the Lavender Trinetra backend. Coordinates
    configuration, CSV/database initialization, the FastAPI server, and
    the monitoring, cybersecurity and AI engines through their full
    lifecycle.
    """

    def __init__(self) -> None:
        self.paths = config.paths
        self.run_counter = RunCounter(self.paths.data_dir / "run_counter.txt")
        self.run_number = self.run_counter.run_number

        self.user_input = UserInputController()

        # Engines / monitors (initialized in initialize())
        self.cpu_monitor: Optional[CPUMonitor] = None
        self.memory_monitor: Optional[MemoryMonitor] = None
        self.disk_monitor: Optional[DiskMonitor] = None
        self.network_monitor: Optional[NetworkMonitor] = None

        self.process_security: Optional[ProcessSecurityMonitor] = None
        self.network_security: Optional[NetworkSecurityMonitor] = None
        self.firewall_security: Optional[FirewallSecurityMonitor] = None
        self.threat_engine: Optional[ThreatEngine] = None
        self.security_analysis: Optional[SecurityAnalysisEngine] = None

        self.ai_engine: Optional[AIEngine] = None
        self.db: Optional[DatabaseManager] = None

        self._api_thread: Optional[threading.Thread] = None
        self._api_server = None

        # Run-time tracking
        self._start_time: Optional[datetime] = None
        self._end_time: Optional[datetime] = None
        self._alerts: List[Dict[str, Any]] = []
        self._metric_history: List[Dict[str, float]] = []
        self._last_process_scan: Optional[Dict[str, Any]] = None
        self._last_ai_result: Optional[Dict[str, Any]] = None
        self._last_security_result: Optional[Dict[str, Any]] = None

    # --------------------------------------------------------------
    # Startup banner
    # --------------------------------------------------------------

    @staticmethod
    def _boxed_line(text: str, width: int) -> str:
        """Formats a single line padded to fit inside the ASCII banner box."""
        inner_width = width - 4  # account for "║ " + " ║"
        truncated = text[:inner_width]
        return f"║ {truncated.ljust(inner_width)} ║"

    def print_banner(self) -> None:
        app = config.app_config
        interval = config.monitoring_config.UNIVERSAL_MONITORING_INTERVAL_SECONDS
        width = 74
        top = "╔" + "═" * (width - 2) + "╗"
        divider = "╠" + "═" * (width - 2) + "╣"
        bottom = "╚" + "═" * (width - 2) + "╝"

        lines = [
            top,
            self._boxed_line("", width),
            self._boxed_line("∫ Lavender Trinetra", width),
            self._boxed_line("observe.learn.protect.", width),
            self._boxed_line("", width),
            self._boxed_line("AI-Powered Cybersecurity & System Health Monitoring Platform", width),
            self._boxed_line("", width),
            divider,
            self._boxed_line(f"Version           : {app.APP_VERSION}", width),
            self._boxed_line(
                f"Backend           : FastAPI ({config.api_config.API_HOST}:{config.api_config.API_PORT})",
                width,
            ),
            self._boxed_line(
                f"Database          : SQLite ({config.database_config.DATABASE_FILENAME})", width
            ),
            self._boxed_line(
                f"Monitoring Engine : Ready (interval: {interval}s)", width
            ),
            self._boxed_line("AI Engine         : Ready", width),
            self._boxed_line("API Status        : Initializing...", width),
            bottom,
        ]

        print("\n" + "\n".join(lines))
        print(
            "\n Welcome to Lavender Trinetra — a unified platform that observes system"
            "\n health, learns behavioral patterns with AI, and protects your machine"
            "\n through real-time cybersecurity monitoring.\n"
        )
        print(f" This is Run #{self.run_number}\n")
        logger.info("Lavender Trinetra v%s starting (Run %d).", app.APP_VERSION, self.run_number)

    # --------------------------------------------------------------
    # Initialization
    # --------------------------------------------------------------

    def _init_directories(self) -> None:
        try:
            self.paths.data_dir.mkdir(parents=True, exist_ok=True)
            self.paths.logs_dir.mkdir(parents=True, exist_ok=True)
            self.paths.reports_dir.mkdir(parents=True, exist_ok=True)
            self.paths.ai_models_dir.mkdir(parents=True, exist_ok=True)
            logger.info("Application directories verified/created.")
        except Exception as exc:
            logger.error("Failed to create application directories: %s", exc)
            raise

    def _init_csv_files(self) -> None:
        try:
            if not self.paths.csv_metrics_file.exists():
                with open(self.paths.csv_metrics_file, "w", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f)
                    writer.writerow(
                        [
                            "timestamp",
                            "cpu_percent",
                            "memory_percent",
                            "disk_percent",
                            "network_sent_mb",
                            "network_received_mb",
                        ]
                    )
                logger.info("Created %s", self.paths.csv_metrics_file.name)

            if not self.paths.csv_processes_file.exists():
                with open(self.paths.csv_processes_file, "w", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f)
                    writer.writerow(
                        ["run_number", "category", "rank", "pid", "name", "cpu_percent", "memory_percent"]
                    )
                logger.info("Created %s", self.paths.csv_processes_file.name)

            if not self.paths.csv_report_file.exists():
                with open(self.paths.csv_report_file, "w", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f)
                    writer.writerow(
                        [
                            "run_number",
                            "start_time",
                            "end_time",
                            "duration_seconds",
                            "avg_cpu_percent",
                            "avg_memory_percent",
                            "avg_disk_percent",
                            "avg_network_sent_mb",
                            "avg_network_received_mb",
                            "total_alerts",
                            "ai_summary",
                            "cybersecurity_summary",
                        ]
                    )
                logger.info("Created %s", self.paths.csv_report_file.name)
        except Exception as exc:
            logger.error("Failed to initialize CSV files: %s", exc)
            raise

    def _init_database(self) -> None:
        try:
            self.db = init_database(database_url=config.DATABASE_URL)
            logger.info("Database initialized at %s", config.DATABASE_URL)
        except Exception as exc:
            logger.error("Failed to initialize database: %s", exc)
            raise

    def _init_monitoring_engine(self) -> None:
        try:
            self.cpu_monitor = CPUMonitor()
            self.memory_monitor = MemoryMonitor()
            self.disk_monitor = DiskMonitor()
            self.network_monitor = NetworkMonitor()
            logger.info("Monitoring engine initialized.")
        except Exception as exc:
            logger.error("Failed to initialize monitoring engine: %s", exc)
            raise

    def _init_cybersecurity_engine(self) -> None:
        try:
            sec_cfg = config.cybersecurity_config
            self.process_security = ProcessSecurityMonitor(
                cpu_threshold_percent=sec_cfg.SUSPICIOUS_PROCESS_CPU_THRESHOLD,
                memory_threshold_percent=sec_cfg.SUSPICIOUS_PROCESS_MEMORY_THRESHOLD,
            )
            self.network_security = NetworkSecurityMonitor(
                max_connections_threshold=sec_cfg.MAX_CONNECTIONS_THRESHOLD,
                max_connections_per_remote_ip=sec_cfg.MAX_CONNECTIONS_PER_REMOTE_IP,
            )
            self.firewall_security = FirewallSecurityMonitor()
            self.threat_engine = ThreatEngine(min_confidence_to_report=0.0)
            self.security_analysis = SecurityAnalysisEngine()
            logger.info("Cybersecurity engine initialized.")
        except Exception as exc:
            logger.error("Failed to initialize cybersecurity engine: %s", exc)
            raise

    def _init_ai_engine(self) -> None:
        try:
            self.ai_engine = AIEngine()
            logger.info("AI engine initialized.")
        except Exception as exc:
            logger.error("Failed to initialize AI engine: %s", exc)
            raise

    def _init_api_server(self) -> None:
        try:
            import uvicorn
            from api import app as fastapi_app

            uvicorn_config = uvicorn.Config(
                app=fastapi_app,
                host=config.API_HOST,
                port=config.API_PORT,
                log_level="warning",
                loop="asyncio",
            )
            self._api_server = uvicorn.Server(uvicorn_config)

            def _run_server() -> None:
                try:
                    self._api_server.run()
                except Exception as exc:
                    logger.error("FastAPI server terminated unexpectedly: %s", exc)

            self._api_thread = threading.Thread(target=_run_server, daemon=True)
            self._api_thread.start()
            logger.info(
                "FastAPI server starting on %s:%s", config.API_HOST, config.API_PORT
            )
        except Exception as exc:
            logger.error("Failed to start FastAPI server: %s", exc)

    @staticmethod
    def _print_init_step(step_number: int, total_steps: int, label: str) -> None:
        print(f" [{step_number}/{total_steps}] Initializing {label}...")

    def initialize(self) -> None:
        """Runs full application initialization in dependency order."""
        errors = config.validate_configuration()
        if errors:
            for err in errors:
                logger.warning("Configuration validation warning: %s", err)

        print(" Starting initialization sequence:\n")
        total_steps = 6

        self._print_init_step(1, total_steps, "Configuration")
        self._init_directories()
        self._init_csv_files()
        print("       ✓ Configuration loaded and validated.")

        self._print_init_step(2, total_steps, "SQLite Database")
        self._init_database()
        print("       ✓ SQLite database ready.")

        self._print_init_step(3, total_steps, "Monitoring Engine")
        self._init_monitoring_engine()
        print("       ✓ Monitoring engine ready.")

        self._print_init_step(4, total_steps, "Cybersecurity Engine")
        self._init_cybersecurity_engine()
        print("       ✓ Cybersecurity engine ready.")

        self._print_init_step(5, total_steps, "AI Engine")
        self._init_ai_engine()
        print("       ✓ AI engine ready.")

        self._print_init_step(6, total_steps, "FastAPI Server")
        self._init_api_server()
        print(f"       ✓ FastAPI server running on {config.API_HOST}:{config.API_PORT}.")

        print("\n All subsystems initialized successfully.\n")
        logger.info("All subsystems initialized successfully.")

    # --------------------------------------------------------------
    # Alerting
    # --------------------------------------------------------------

    def _check_thresholds(
        self,
        cpu_percent: Optional[float],
        memory_percent: Optional[float],
        disk_percent: Optional[float],
        network_sent_mb: Optional[float],
        network_received_mb: Optional[float],
    ) -> None:
        thresholds = config.system_thresholds
        checks = [
            ("CPU", cpu_percent, thresholds.CPU_USAGE_PERCENT, "%"),
            ("Memory", memory_percent, thresholds.MEMORY_USAGE_PERCENT, "%"),
            ("Disk", disk_percent, thresholds.DISK_USAGE_PERCENT, "%"),
            ("Network Sent", network_sent_mb, thresholds.NETWORK_SENT_MB, "MB"),
            ("Network Received", network_received_mb, thresholds.NETWORK_RECEIVED_MB, "MB"),
        ]

        for label, value, threshold, unit in checks:
            if value is None:
                continue
            if value >= threshold:
                alert = {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "metric": label,
                    "value": value,
                    "threshold": threshold,
                    "message": f"{label} usage ({value:.1f}{unit}) exceeded threshold ({threshold}{unit}).",
                }
                self._alerts.append(alert)
                print(f"ALERT: {alert['message']}")
                logger.warning(alert["message"])

    # --------------------------------------------------------------
    # CSV writing (continuous metrics)
    # --------------------------------------------------------------

    def _write_metrics_csv_row(
        self,
        timestamp: str,
        cpu_percent: Optional[float],
        memory_percent: Optional[float],
        disk_percent: Optional[float],
        network_sent_mb: Optional[float],
        network_received_mb: Optional[float],
    ) -> None:
        try:
            with open(self.paths.csv_metrics_file, "a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(
                    [
                        timestamp,
                        cpu_percent,
                        memory_percent,
                        disk_percent,
                        network_sent_mb,
                        network_received_mb,
                    ]
                )
        except Exception as exc:
            logger.error("Failed to write metrics CSV row: %s", exc)

    # --------------------------------------------------------------
    # Monitoring loop
    # --------------------------------------------------------------

    def _collect_monitoring_snapshot(self) -> Dict[str, Any]:
        cpu_reading = self.cpu_monitor.get_reading_dict() if self.cpu_monitor else {}
        memory_reading = self.memory_monitor.get_reading_dict() if self.memory_monitor else {}
        disk_reading = self.disk_monitor.get_reading_dict() if self.disk_monitor else {}
        network_reading = self.network_monitor.get_reading_dict() if self.network_monitor else {}
        return {
            "cpu": cpu_reading,
            "memory": memory_reading,
            "disk": disk_reading,
            "network": network_reading,
        }

    def _run_cybersecurity_pass(self, monitoring_snapshot: Dict[str, Any]) -> Dict[str, Any]:
        process_data = (
            self.process_security.scan_dict(monitoring_snapshot)
            if self.process_security
            else {}
        )
        network_data = self.network_security.scan_dict() if self.network_security else {}
        firewall_data = (
            self.firewall_security.check_dict() if self.firewall_security else {}
        )
        threat_result = (
            self.threat_engine.analyze_dict(process_data, network_data, firewall_data)
            if self.threat_engine
            else {}
        )
        security_result = (
            self.security_analysis.analyze_dict(threat_result)
            if self.security_analysis
            else {}
        )

        self._last_process_scan = process_data
        self._last_security_result = security_result

        return {
            "process": process_data,
            "network": network_data,
            "firewall": firewall_data,
            "threats": threat_result,
            "summary": security_result,
        }

    def _run_ai_pass(
        self, monitoring_snapshot: Dict[str, Any], security_pass: Dict[str, Any]
    ) -> Dict[str, Any]:
        if not self.ai_engine:
            return {}
        security_input = {
            "active_connections": len(
                security_pass.get("network", {}).get("listening_ports", [])
            ),
            "suspicious_process_count": len(
                [
                    f
                    for f in security_pass.get("process", {}).get("findings", [])
                    if f.get("finding_type") == "known_suspicious_name"
                ]
            ),
            "failed_login_count": 0,
        }
        result = self.ai_engine.analyze_dict(monitoring_snapshot, security_input)
        self._last_ai_result = result
        return result

    def _store_results(
        self,
        monitoring_snapshot: Dict[str, Any],
        security_pass: Dict[str, Any],
        ai_result: Dict[str, Any],
    ) -> None:
        if not self.db:
            return
        try:
            cpu_percent = monitoring_snapshot.get("cpu", {}).get("cpu_percent")
            memory_percent = (
                monitoring_snapshot.get("memory", {})
                .get("virtual_memory", {})
                .get("percent")
            )
            self.db.create_monitoring_record(
                {
                    "metric_type": "combined",
                    "cpu_percent": cpu_percent,
                    "memory_percent": memory_percent,
                    "raw_data": str(monitoring_snapshot),
                }
            )
            self.db.create_security_record(
                {
                    "event_type": "scan",
                    "severity": security_pass.get("threats", {}).get("overall_severity"),
                    "security_score": security_pass.get("summary", {}).get("security_score"),
                    "raw_data": str(security_pass),
                }
            )
            self.db.create_ai_analysis_record(
                {
                    "health_score": ai_result.get("health_score"),
                    "anomaly_count": len(ai_result.get("anomalies", [])),
                    "predictive_alert_count": len(ai_result.get("predictive_alerts", [])),
                    "recommendation_count": len(ai_result.get("recommendations", [])),
                    "raw_data": str(ai_result),
                }
            )
        except Exception as exc:
            logger.error("Failed to persist monitoring cycle results: %s", exc)

    def _monitoring_cycle(self) -> None:
        timestamp = datetime.now(timezone.utc).isoformat()

        monitoring_snapshot = self._collect_monitoring_snapshot()

        cpu_percent = monitoring_snapshot.get("cpu", {}).get("cpu_percent")
        memory_percent = (
            monitoring_snapshot.get("memory", {}).get("virtual_memory", {}).get("percent")
        )
        disk_partitions = monitoring_snapshot.get("disk", {}).get("partitions", [])
        disk_percent = None
        if disk_partitions:
            valid = [p.get("percent") for p in disk_partitions if p.get("percent") is not None]
            if valid:
                disk_percent = sum(valid) / len(valid)

        network_total_io = monitoring_snapshot.get("network", {}).get("total_io", {})
        network_sent_mb = (
            (network_total_io.get("bytes_sent") or 0) / (1024 * 1024)
            if network_total_io.get("bytes_sent") is not None
            else None
        )
        network_received_mb = (
            (network_total_io.get("bytes_recv") or 0) / (1024 * 1024)
            if network_total_io.get("bytes_recv") is not None
            else None
        )

        self._write_metrics_csv_row(
            timestamp, cpu_percent, memory_percent, disk_percent, network_sent_mb, network_received_mb
        )

        self._check_thresholds(
            cpu_percent, memory_percent, disk_percent, network_sent_mb, network_received_mb
        )

        self._metric_history.append(
            {
                "cpu_percent": cpu_percent or 0.0,
                "memory_percent": memory_percent or 0.0,
                "disk_percent": disk_percent or 0.0,
                "network_sent_mb": network_sent_mb or 0.0,
                "network_received_mb": network_received_mb or 0.0,
            }
        )

        security_pass = self._run_cybersecurity_pass(monitoring_snapshot)
        ai_result = self._run_ai_pass(monitoring_snapshot, security_pass)

        self._store_results(monitoring_snapshot, security_pass, ai_result)

        print(
            f"[{timestamp}] CPU: {cpu_percent}% | MEM: {memory_percent}% | "
            f"DISK: {disk_percent}% | Health Score: {ai_result.get('health_score')} | "
            f"Security Score: {security_pass.get('summary', {}).get('security_score')}"
        )

    def run_monitoring_loop(self) -> None:
        """Runs the continuous monitoring loop until 'Q' is entered."""
        self._start_time = datetime.now(timezone.utc)
        interval = config.monitoring_config.UNIVERSAL_MONITORING_INTERVAL_SECONDS

        logger.info("Monitoring loop started (interval: %ss).", interval)
        print(f" Monitoring started. Data is being stored in CSV and SQLite simultaneously.")
        print(" Enter 'Q' at any time and press Enter to stop.\n")

        while not self.user_input.stop_requested():
            cycle_start = time.monotonic()
            try:
                self._monitoring_cycle()
            except Exception as exc:
                logger.error("Monitoring cycle failed: %s", exc)

            elapsed = time.monotonic() - cycle_start
            sleep_time = max(0.0, interval - elapsed)

            slept = 0.0
            while slept < sleep_time and not self.user_input.stop_requested():
                time.sleep(min(0.2, sleep_time - slept))
                slept += 0.2

        self._end_time = datetime.now(timezone.utc)
        logger.info("Monitoring loop stopped.")

    # --------------------------------------------------------------
    # Final report generation
    # --------------------------------------------------------------

    def _generate_process_report(self) -> None:
        try:
            if not self._last_process_scan:
                return

            with open(self.paths.csv_processes_file, "a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)

                top_cpu = self._last_process_scan.get("top_cpu_processes", [])
                for rank, proc in enumerate(top_cpu[:5], start=1):
                    writer.writerow(
                        [
                            self.run_number,
                            "top_cpu",
                            rank,
                            proc.get("pid"),
                            proc.get("name"),
                            proc.get("cpu_percent"),
                            proc.get("memory_percent"),
                        ]
                    )

                top_memory = self._last_process_scan.get("top_memory_processes", [])
                for rank, proc in enumerate(top_memory[:5], start=1):
                    writer.writerow(
                        [
                            self.run_number,
                            "top_memory",
                            rank,
                            proc.get("pid"),
                            proc.get("name"),
                            proc.get("cpu_percent"),
                            proc.get("memory_percent"),
                        ]
                    )

            logger.info("Process report generated: %s", self.paths.csv_processes_file.name)
        except Exception as exc:
            logger.error("Failed to generate process report: %s", exc)

    def _generate_system_report(self) -> None:
        try:
            start_time = self._start_time or datetime.now(timezone.utc)
            end_time = self._end_time or datetime.now(timezone.utc)
            duration_seconds = (end_time - start_time).total_seconds()

            def _avg(key: str) -> float:
                values = [m[key] for m in self._metric_history if key in m]
                return round(statistics.mean(values), 2) if values else 0.0

            ai_summary = (
                f"Health Score: {self._last_ai_result.get('health_score')}, "
                f"Anomalies: {len(self._last_ai_result.get('anomalies', []))}"
                if self._last_ai_result
                else "No AI data collected."
            )
            security_summary = (
                f"Security Score: {self._last_security_result.get('security_score')}, "
                f"Threats: {self._last_security_result.get('threat_count')}"
                if self._last_security_result
                else "No security data collected."
            )

            with open(self.paths.csv_report_file, "a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(
                    [
                        self.run_number,
                        start_time.isoformat(),
                        end_time.isoformat(),
                        round(duration_seconds, 2),
                        _avg("cpu_percent"),
                        _avg("memory_percent"),
                        _avg("disk_percent"),
                        _avg("network_sent_mb"),
                        _avg("network_received_mb"),
                        len(self._alerts),
                        ai_summary,
                        security_summary,
                    ]
                )

            logger.info("System report generated: %s", self.paths.csv_report_file.name)
        except Exception as exc:
            logger.error("Failed to generate system report: %s", exc)

    def generate_final_reports(self) -> None:
        self._generate_process_report()
        self._generate_system_report()

    # --------------------------------------------------------------
    # Shutdown
    # --------------------------------------------------------------

    def shutdown(self) -> None:
        print("\nUser has stopped data collection.\n")
        print("Exiting...\n")
        print("Thank You for using Lavender Trinetra \U0001F600\n")
        print("observe.learn.protect.\n")

        logger.info("Shutting down all services gracefully...")

        try:
            if self._api_server is not None:
                self._api_server.should_exit = True
        except Exception as exc:
            logger.warning("Failed to signal FastAPI server shutdown: %s", exc)

        logger.info("Shutdown complete.")

    # --------------------------------------------------------------
    # Full lifecycle
    # --------------------------------------------------------------

    def run(self) -> None:
        self.print_banner()

        try:
            choice = self.user_input.prompt_start_or_quit()
        except KeyboardInterrupt:
            logger.info("Startup interrupted by user before a choice was made.")
            sys.exit(0)

        if choice == "Q":
            print("\nUser has stopped data collection.\n")
            print("Exiting...\n")
            print("Thank You for using Lavender Trinetra \U0001F600\n")
            print("observe.learn.protect.\n")
            logger.info("User quit before starting monitoring. No initialization performed.")
            sys.exit(0)

        try:
            self.initialize()
        except Exception as exc:
            logger.critical("Fatal error during initialization: %s", exc)
            sys.exit(1)

        self.user_input.start_quit_listener()

        try:
            self.run_monitoring_loop()
        except KeyboardInterrupt:
            logger.info("Monitoring interrupted via KeyboardInterrupt.")
            self._end_time = datetime.now(timezone.utc)
        except Exception as exc:
            logger.error("Monitoring loop terminated unexpectedly: %s", exc)
            self._end_time = datetime.now(timezone.utc)

        self.generate_final_reports()
        self.shutdown()


def main() -> None:
    app = LavenderTrinetraApp()
    app.run()


if __name__ == "__main__":
    main()