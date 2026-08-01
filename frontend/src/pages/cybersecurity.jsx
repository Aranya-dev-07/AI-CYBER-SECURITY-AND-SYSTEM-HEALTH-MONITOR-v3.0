/**
 * cybersecurity.jsx
 *
 * The complete Cybersecurity Center page for Lavender Trinetra.
 *
 * Loads its own data independently via `securityApi.getSnapshot()`
 * and `securityApi.getScore()` on mount, auto-refreshes every 10
 * seconds, and cleans up its interval on unmount. Handles loading,
 * backend-error and retry states explicitly, and defensively renders
 * every section even when the backend returns partial or null data.
 *
 * Styling is TailwindCSS only (no inline `style` props). Dynamic,
 * data-driven colors (severity, status) are applied via Tailwind
 * arbitrary-value classes referencing the CSS custom properties
 * defined in global.css (--color-brand, --color-critical, etc.),
 * matching the Lavender Trinetra palette used across the rest of the
 * dashboard.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FiShield,
  FiActivity,
  FiAlertTriangle,
  FiCpu,
  FiWifi,
  FiLock,
  FiSettings,
  FiRefreshCw,
  FiClock,
  FiCheckCircle,
  FiEye,
  FiTarget,
  FiInfo,
} from "react-icons/fi";

import { securityApi } from "../api/api.jsx";

/** Auto-refresh interval, in milliseconds. */
const REFRESH_INTERVAL_MS = 10000;

// ==========================================================================
// Defensive data helpers
// ==========================================================================

/**
 * Safely reads a value, returning a fallback if it is missing/NaN.
 * Never throws on unexpected backend shapes.
 *
 * @param {any} value
 * @param {any} fallback
 * @returns {any}
 */
function orFallback(value, fallback = "--") {
  return value === null || value === undefined || Number.isNaN(value) ? fallback : value;
}

/**
 * Maps a severity string (any casing, possibly missing) to a display
 * label and a Tailwind color token (CSS variable name) drawn from the
 * Lavender Trinetra palette.
 *
 * @param {string|undefined|null} severity
 * @returns {{ label: string, colorVar: string }}
 */
function severityMeta(severity) {
  const normalized = String(severity || "unknown").toLowerCase();
  switch (normalized) {
    case "critical":
      return { label: "Critical", colorVar: "--color-critical" };
    case "high":
      return { label: "High", colorVar: "--color-critical" };
    case "medium":
      return { label: "Medium", colorVar: "--color-brand" };
    case "low":
      return { label: "Low", colorVar: "--color-healthy" };
    default:
      return { label: "Unknown", colorVar: "--color-text-secondary" };
  }
}

/** Human-readable label for a threat's detection pattern. */
function threatTypeLabel(pattern) {
  const map = {
    firewall_weakness_with_network_exposure: "Exposed Attack Surface",
    malicious_process_network_correlation: "Malicious Process Activity",
    excessive_connections_single_source: "Brute-Force / Scan Attempt",
    standalone_indicator: "Security Indicator",
  };
  return map[pattern] || (pattern ? pattern.replace(/_/g, " ") : "General Threat");
}

/** Client-derived recommended action based on the threat's pattern/category. */
function recommendedAction(threat) {
  const pattern = String(threat?.pattern || "");
  const indicators = Array.isArray(threat?.indicators) ? threat.indicators : [];
  const sources = new Set(indicators.map((i) => i?.source));

  if (pattern.includes("firewall")) {
    return "Enable and properly configure the system firewall immediately.";
  }
  if (pattern.includes("malicious_process")) {
    return "Investigate and terminate the flagged process, then run a full security scan.";
  }
  if (pattern.includes("excessive_connections") || pattern.includes("bruteforce")) {
    return "Block the offending remote address and review authentication/firewall rules.";
  }
  if (sources.has("network")) {
    return "Review the associated network activity and close unused ports.";
  }
  if (sources.has("process")) {
    return "Verify the origin of the flagged process before taking action.";
  }
  return "Investigate this event further and monitor for recurrence.";
}

// ==========================================================================
// Small presentational primitives (Tailwind only, no inline style)
// ==========================================================================

/**
 * @param {{ title: string, icon?: React.ComponentType<{ className?: string }>, children: React.ReactNode }} props
 */
function SectionCard({ title, icon: Icon, children }) {
  return (
    <div className="rounded-2xl border border-[color:var(--color-card-border)] bg-[color:var(--color-card)] p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2.5">
        {Icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--color-brand)]/15">
            <Icon className="h-4 w-4 text-[color:var(--color-brand)]" />
          </span>
        )}
        <h2 className="text-sm font-semibold text-[color:var(--color-text)] sm:text-base">{title}</h2>
      </div>
      {children}
    </div>
  );
}

/**
 * A single metric tile. `colorVar` is a CSS custom property name
 * (e.g. "--color-critical") applied via a Tailwind arbitrary-value
 * class, never via an inline style.
 *
 * @param {{ label: string, value: React.ReactNode, colorVar?: string }} props
 */
function StatTile({ label, value, colorVar = "--color-text" }) {
  return (
    <div className="rounded-xl border border-[color:var(--color-card-border)] bg-[color:var(--color-background)] p-3.5">
      <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-secondary)]">
        {label}
      </span>
      <p className={`mt-1.5 text-xl font-semibold text-[color:var(${colorVar})]`}>{value}</p>
    </div>
  );
}

/**
 * @param {{ label: string, active: boolean|null, activeLabel?: string, inactiveLabel?: string }} props
 */
function StatusPill({ label, active, activeLabel = "Enabled", inactiveLabel = "Disabled" }) {
  const isKnown = active === true || active === false;
  const colorVar = active ? "--color-healthy" : isKnown ? "--color-critical" : "--color-text-secondary";
  const text = active ? activeLabel : isKnown ? inactiveLabel : "Unknown";

  return (
    <div className="flex items-center justify-between rounded-xl border border-[color:var(--color-card-border)] bg-[color:var(--color-background)] p-3.5">
      <span className="text-xs font-medium text-[color:var(--color-text-secondary)]">{label}</span>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-[color:var(${colorVar})]/40 px-2.5 py-1 text-xs font-medium text-[color:var(${colorVar})]`}
      >
        <span className={`h-1.5 w-1.5 rounded-full bg-[color:var(${colorVar})]`} />
        {text}
      </span>
    </div>
  );
}

// ==========================================================================
// Loading / Error states
// ==========================================================================

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24">
      <FiRefreshCw className="h-7 w-7 animate-spin text-[color:var(--color-brand)]" />
      <p className="text-sm text-[color:var(--color-text-secondary)]">Loading cybersecurity data...</p>
    </div>
  );
}

/**
 * @param {{ message: string, onRetry: () => void }} props
 */
function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[color:var(--color-card-border)] bg-[color:var(--color-card)] py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--color-critical)]/15">
        <FiAlertTriangle className="h-5 w-5 text-[color:var(--color-critical)]" />
      </span>
      <p className="text-sm font-semibold text-[color:var(--color-text)]">
        Unable to load cybersecurity data
      </p>
      <p className="max-w-sm px-4 text-xs text-[color:var(--color-text-secondary)]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--color-brand)] px-4 py-2 text-xs font-medium text-[#0f172a] transition-opacity duration-200 hover:opacity-90"
      >
        <FiRefreshCw className="h-3.5 w-3.5" />
        Retry
      </button>
    </div>
  );
}

// ==========================================================================
// Cybersecurity page
// ==========================================================================

/**
 * Cybersecurity Center page. Exports default `Cybersecurity`.
 */
export default function Cybersecurity() {
  const [snapshot, setSnapshot] = useState(null);
  const [scoreData, setScoreData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  const isMountedRef = useRef(true);
  const isFetchingRef = useRef(false);

  /** Fetches both the security snapshot and the security score, defensively. */
  const fetchSecurityData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const [snapshotResult, scoreResult] = await Promise.all([
        securityApi.getSnapshot(),
        securityApi.getScore().catch(() => null),
      ]);

      if (!isMountedRef.current) return;

      setSnapshot(snapshotResult?.data ?? null);
      setScoreData(scoreResult ?? null);
      setError(null);
      setLastFetched(new Date());
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err?.message || "Failed to reach the cybersecurity API.");
    } finally {
      if (isMountedRef.current) setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchSecurityData();

    const intervalId = setInterval(() => {
      fetchSecurityData();
    }, REFRESH_INTERVAL_MS);

    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [fetchSecurityData]);

  const handleRetry = () => {
    setLoading(true);
    fetchSecurityData();
  };

  // ------------------------------------------------------------------
  // Defensive derived data (never assumes a field exists)
  // ------------------------------------------------------------------

  const process = snapshot?.process ?? null;
  const network = snapshot?.network ?? null;
  const firewall = snapshot?.firewall ?? null;
  const threatsResult = snapshot?.threats ?? null;
  const summary = snapshot?.summary ?? null;

  const securityScore = orFallback(scoreData?.security_score ?? summary?.security_score, null);
  const overallSeverity = threatsResult?.overall_severity ?? summary?.overall_severity ?? "unknown";
  const threatCount = orFallback(threatsResult?.threat_count ?? summary?.threat_count, 0);
  const lastScanTime = snapshot?.timestamp
    ? new Date(snapshot.timestamp).toLocaleString()
    : lastFetched
    ? lastFetched.toLocaleString()
    : "--";

  const totalProcesses = orFallback(process?.process_count, 0);
  const suspiciousProcessCount = Array.isArray(process?.findings)
    ? process.findings.filter((f) => f?.finding_type === "known_suspicious_name").length
    : 0;
  const safeProcessCount = Math.max(0, Number(totalProcesses || 0) - suspiciousProcessCount);

  const activeConnections = orFallback(network?.connection_count, 0);
  const listeningPortsCount = Array.isArray(network?.listening_ports) ? network.listening_ports.length : 0;
  const suspiciousConnections = Array.isArray(network?.events)
    ? network.events.filter(
        (e) =>
          e?.event_type === "excessive_connections_from_remote_ip" ||
          e?.event_type === "high_connection_volume"
      ).length
    : 0;
  const networkStatus = Array.isArray(network?.events) && network.events.length > 0 ? "At Risk" : "Secure";

  const firewallEnabled = firewall?.firewall_enabled ?? null;
  const rulesLoaded =
    Array.isArray(firewall?.backends) && firewall.backends.length > 0 ? firewall.backends.length : null;

  const threatsList = Array.isArray(threatsResult?.threats) ? threatsResult.threats : [];

  const severitySummary = summary?.severity_summary ?? {};
  const trend = summary?.trend ?? "stable";
  const activeSessionCount = orFallback(summary?.active_session_count, 0);

  const scoreMeta = severityMeta(overallSeverity);

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--color-brand)]/15">
            <FiShield className="h-4 w-4 text-[color:var(--color-brand)]" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-[color:var(--color-text)] sm:text-xl">
              Cybersecurity Center
            </h1>
            <p className="text-xs text-[color:var(--color-text-secondary)] sm:text-sm">
              Real-time threat detection, network protection and system security posture.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRetry}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--color-card-border)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-text)] transition-colors duration-200 hover:bg-white/5"
        >
          <FiRefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading && !snapshot ? (
        <LoadingState />
      ) : error && !snapshot ? (
        <ErrorState message={error} onRetry={handleRetry} />
      ) : (
        <>
          {/* 1. Security Overview */}
          <SectionCard title="Security Overview" icon={FiShield}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile
                label="Security Score"
                value={securityScore !== null ? `${securityScore}%` : "--"}
                colorVar="--color-brand"
              />
              <StatTile label="Risk Level" value={scoreMeta.label} colorVar={scoreMeta.colorVar} />
              <StatTile label="Threat Count" value={threatCount} colorVar="--color-critical" />
              <StatTile label="Last Scan Time" value={lastScanTime} colorVar="--color-text" />
            </div>
          </SectionCard>

          {/* 2. Process Security */}
          <SectionCard title="Process Security" icon={FiCpu}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile
                label="Suspicious Processes"
                value={suspiciousProcessCount}
                colorVar={suspiciousProcessCount > 0 ? "--color-critical" : "--color-healthy"}
              />
              <StatTile label="Safe Processes" value={safeProcessCount} colorVar="--color-healthy" />
              <StatTile label="Total Processes" value={totalProcesses} colorVar="--color-text" />
              <StatTile label="Running Processes" value={totalProcesses} colorVar="--color-text" />
            </div>
          </SectionCard>

          {/* 3. Network Security */}
          <SectionCard title="Network Security" icon={FiWifi}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Active Connections" value={activeConnections} colorVar="--color-ai" />
              <StatTile label="Listening Ports" value={listeningPortsCount} colorVar="--color-text" />
              <StatTile
                label="Suspicious Connections"
                value={suspiciousConnections}
                colorVar={suspiciousConnections > 0 ? "--color-critical" : "--color-healthy"}
              />
              <StatTile
                label="Network Status"
                value={networkStatus}
                colorVar={networkStatus === "Secure" ? "--color-healthy" : "--color-critical"}
              />
            </div>
          </SectionCard>

          {/* 4. Firewall Status */}
          <SectionCard title="Firewall Status" icon={FiLock}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatusPill label="Firewall" active={firewallEnabled} />
              <StatTile label="Rules Loaded" value={rulesLoaded ?? "--"} colorVar="--color-text" />
              <StatusPill
                label="Incoming Protection"
                active={firewallEnabled}
                activeLabel="Protected"
                inactiveLabel="Unprotected"
              />
              <StatusPill
                label="Outgoing Protection"
                active={firewallEnabled}
                activeLabel="Protected"
                inactiveLabel="Unprotected"
              />
            </div>
          </SectionCard>

          {/* 5. Threat Intelligence */}
          <SectionCard title="Threat Intelligence" icon={FiAlertTriangle}>
            {threatsList.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <FiCheckCircle className="h-6 w-6 text-[color:var(--color-healthy)]" />
                <p className="text-sm text-[color:var(--color-text)]">No active threats detected</p>
                <p className="text-xs text-[color:var(--color-text-secondary)]">
                  System behaviour is currently within normal parameters.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {threatsList.map((threat, index) => {
                  const meta = severityMeta(threat?.severity);
                  return (
                    <div
                      key={threat?.threat_id ?? index}
                      className="flex flex-col gap-2 rounded-xl border border-[color:var(--color-card-border)] bg-[color:var(--color-background)] p-3.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-start gap-2">
                          <FiTarget
                            className={`mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(${meta.colorVar})]`}
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[color:var(--color-text)]">
                              {threat?.title ?? threat?.threat_id ?? "Unnamed threat"}
                            </p>
                            <p className="text-[11px] uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                              {threatTypeLabel(threat?.pattern)}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`flex-shrink-0 rounded-full border border-[color:var(${meta.colorVar})]/40 px-2 py-0.5 text-[11px] font-medium text-[color:var(${meta.colorVar})]`}
                        >
                          {meta.label}
                        </span>
                      </div>

                      <p className="text-xs text-[color:var(--color-text-secondary)]">
                        {threat?.description ?? "No further details available."}
                      </p>

                      <div className="mt-1 flex items-start gap-1.5 border-t border-[color:var(--color-card-border)] pt-2">
                        <FiInfo className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[color:var(--color-brand)]" />
                        <p className="text-[11px] text-[color:var(--color-text-secondary)]">
                          <span className="font-medium text-[color:var(--color-brand)]">Recommended: </span>
                          {recommendedAction(threat)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* 6. Security Summary */}
          <SectionCard title="Security Summary" icon={FiActivity}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Low Severity" value={orFallback(severitySummary.low, 0)} colorVar="--color-healthy" />
              <StatTile
                label="Medium Severity"
                value={orFallback(severitySummary.medium, 0)}
                colorVar="--color-brand"
              />
              <StatTile
                label="High Severity"
                value={orFallback(severitySummary.high, 0)}
                colorVar="--color-critical"
              />
              <StatTile
                label="Critical Severity"
                value={orFallback(severitySummary.critical, 0)}
                colorVar="--color-critical"
              />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex items-center justify-between rounded-xl border border-[color:var(--color-card-border)] bg-[color:var(--color-background)] p-3.5">
                <span className="flex items-center gap-1.5 text-xs text-[color:var(--color-text-secondary)]">
                  <FiEye className="h-3.5 w-3.5" />
                  Active Sessions
                </span>
                <span className="text-sm font-semibold text-[color:var(--color-text)]">
                  {activeSessionCount}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[color:var(--color-card-border)] bg-[color:var(--color-background)] p-3.5">
                <span className="flex items-center gap-1.5 text-xs text-[color:var(--color-text-secondary)]">
                  <FiSettings className="h-3.5 w-3.5" />
                  Trend
                </span>
                <span className="text-sm font-semibold capitalize text-[color:var(--color-text)]">
                  {trend}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[color:var(--color-card-border)] bg-[color:var(--color-background)] p-3.5">
                <span className="flex items-center gap-1.5 text-xs text-[color:var(--color-text-secondary)]">
                  <FiClock className="h-3.5 w-3.5" />
                  Auto-Refresh
                </span>
                <span className="text-sm font-semibold text-[color:var(--color-text)]">10s</span>
              </div>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}