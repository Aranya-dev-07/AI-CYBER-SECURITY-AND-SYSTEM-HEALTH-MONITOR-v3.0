/**
 * securityoverview.jsx
 *
 * Main cybersecurity dashboard overview: Security Score, Threat
 * Status, System Protection Status, Active Security Events and a
 * Security Summary. Data comes from SystemStatusContext, which is
 * itself the only layer that communicates with api.jsx — this
 * component makes no direct API calls of its own.
 */

import React from "react";
import { FiShield, FiAlertTriangle, FiActivity, FiLock, FiTrendingUp, FiTrendingDown, FiMinus } from "react-icons/fi";

import { COLORS, StatusBadge, ProgressRing } from "../components/dashboardcomponents.jsx";
import { SectionHeader, EmptyState, LoadingSpinner } from "../components/dashboardwidgets.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";

function scoreStatus(score) {
  if (score === null || score === undefined) return "info";
  if (score >= 85) return "healthy";
  if (score >= 60) return "warning";
  return "critical";
}

function severityToStatus(severity) {
  const normalized = String(severity || "").toLowerCase();
  if (normalized === "critical" || normalized === "high") return "critical";
  if (normalized === "medium") return "warning";
  if (normalized === "low") return "healthy";
  return "info";
}

function trendIcon(trend) {
  if (trend === "improving") return FiTrendingUp;
  if (trend === "declining") return FiTrendingDown;
  return FiMinus;
}

function trendColor(trend) {
  if (trend === "improving") return COLORS.healthy;
  if (trend === "declining") return COLORS.critical;
  return COLORS.secondary;
}

export default function SecurityOverview({ data, loading }) {
  const context = useSystemStatus();

  const cybersecurityStatus = data ?? context.cybersecurityStatus;
  const isLoading = loading ?? (Boolean(context.loading?.security) && !context.cybersecurityStatus);
  const securityEngineOnline = Boolean(context.apiStatus?.securityAvailable);

  const summary = cybersecurityStatus?.summary ?? {};
  const securityScore = summary.security_score ?? cybersecurityStatus?.security_score ?? null;
  const overallSeverity = cybersecurityStatus?.threats?.overall_severity ?? summary.overall_severity ?? "info";
  const threatCount = summary.threat_count ?? cybersecurityStatus?.threats?.threat_count ?? 0;
  const severitySummary = summary.severity_summary ?? {};
  const trend = summary.trend ?? "stable";

  const firewallEnabled = cybersecurityStatus?.firewall?.firewall_enabled ?? null;
  const firewallDetected = cybersecurityStatus?.firewall?.firewall_detected ?? null;

  const activeEvents = cybersecurityStatus?.threats?.threats ?? summary.top_threats ?? [];

  const TrendIcon = trendIcon(trend);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="Security Overview"
        subtitle="Real-time cybersecurity posture, threats and protection status."
        icon={FiShield}
        actions={
          <StatusBadge
            status={securityEngineOnline ? "healthy" : "critical"}
            label={securityEngineOnline ? "Security Engine Online" : "Security Engine Offline"}
          />
        }
      />

      {isLoading ? (
        <LoadingSpinner label="Loading security overview..." />
      ) : (
        <>
          {/* Security Score / Threat Status / Protection Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              className="flex items-center gap-4 rounded-xl border p-4"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
            >
              <ProgressRing
                percentage={securityScore ?? 0}
                status={scoreStatus(securityScore)}
                loading={securityScore === null}
                size={72}
                strokeWidth={7}
              />
              <div>
                <p className="text-xs" style={{ color: COLORS.secondary }}>
                  Security Score
                </p>
                <p className="text-lg font-semibold" style={{ color: COLORS.text }}>
                  {securityScore !== null ? `${securityScore}%` : "--"}
                </p>
              </div>
            </div>

            <div
              className="flex flex-col gap-2 rounded-xl border p-4"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
            >
              <div className="flex items-center gap-2">
                <FiAlertTriangle className="h-4 w-4" style={{ color: COLORS.critical }} />
                <p className="text-xs" style={{ color: COLORS.secondary }}>
                  Threat Status
                </p>
              </div>
              <StatusBadge status={severityToStatus(overallSeverity)} label={String(overallSeverity)} />
              <p className="text-xs" style={{ color: COLORS.secondary }}>
                {threatCount} active threat{threatCount === 1 ? "" : "s"} detected
              </p>
            </div>

            <div
              className="flex flex-col gap-2 rounded-xl border p-4"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
            >
              <div className="flex items-center gap-2">
                <FiLock className="h-4 w-4" style={{ color: COLORS.brand }} />
                <p className="text-xs" style={{ color: COLORS.secondary }}>
                  System Protection
                </p>
              </div>
              <StatusBadge
                status={firewallEnabled ? "healthy" : firewallDetected === false ? "critical" : "warning"}
                label={
                  firewallEnabled
                    ? "Firewall Active"
                    : firewallDetected === false
                    ? "Firewall Not Detected"
                    : "Firewall Status Unknown"
                }
              />
              <p className="text-xs" style={{ color: COLORS.secondary }}>
                {securityEngineOnline ? "Security engine actively monitoring." : "Security engine unavailable."}
              </p>
            </div>
          </div>

          {/* Active Security Events */}
          <div
            className="rounded-xl border p-4 sm:p-5"
            style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
          >
            <div className="flex items-center gap-2 mb-3">
              <FiActivity className="h-4 w-4" style={{ color: COLORS.critical }} />
              <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
                Active Security Events
              </p>
            </div>
            {activeEvents.length === 0 ? (
              <EmptyState title="No active security events" description="No threats currently require attention." />
            ) : (
              <ul className="flex flex-col gap-2">
                {activeEvents.map((event, index) => (
                  <li
                    key={event.threat_id ?? index}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3"
                    style={{ backgroundColor: COLORS.background, borderColor: COLORS.cardBorder }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: COLORS.text }}>
                        {event.title ?? event.threat_id ?? "Security event"}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: COLORS.secondary }}>
                        {event.description ?? "No further details available."}
                      </p>
                    </div>
                    <StatusBadge status={severityToStatus(event.severity)} label={event.severity ?? "info"} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Security Summary */}
          <div
            className="rounded-xl border p-4 sm:p-5"
            style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
                Security Summary
              </p>
              <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: trendColor(trend) }}>
                <TrendIcon className="h-3.5 w-3.5" />
                {trend}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {["low", "medium", "high", "critical"].map((level) => (
                <div
                  key={level}
                  className="flex flex-col items-center gap-1 rounded-lg border p-3"
                  style={{ backgroundColor: COLORS.background, borderColor: COLORS.cardBorder }}
                >
                  <span className="text-lg font-semibold" style={{ color: COLORS.text }}>
                    {severitySummary[level] ?? 0}
                  </span>
                  <span className="text-[11px] uppercase tracking-wide" style={{ color: COLORS.secondary }}>
                    {level}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}