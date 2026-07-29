/**
 * homepage.jsx
 *
 * Main welcome dashboard for the Lavender Trinetra frontend: system
 * metric cards, live performance graph, AI health score, root cause
 * analysis, AI recommendations, recent alerts, security status and
 * activity timeline — all driven by SystemStatusContext. Metric
 * history reuses the shared `useMetricsHistory` hook from
 * monitoring/livemonitor.jsx instead of duplicating that logic.
 */

import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiCpu,
  FiServer,
  FiHardDrive,
  FiWifi,
  FiActivity,
  FiAlertTriangle,
  FiShield,
  FiClock,
} from "react-icons/fi";

import {
  COLORS,
  MetricCard,
  ProgressRing,
  InfoCard,
  AlertBadge,
  StatusBadge,
} from "../components/dashboardcomponents.jsx";
import { LivePerformanceGraph, SectionHeader, EmptyState } from "../components/dashboardwidgets.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";
import { useMetricsHistory, metricStatus } from "../monitoring/livemonitor.jsx";

// ========================================================================
// HomePage
// ========================================================================

export default function HomePage() {
  const { systemMetrics, aiStatus, cybersecurityStatus, alerts, apiStatus, lastUpdated } =
    useSystemStatus();
  const navigate = useNavigate();

  // Shared with performancegraphs.jsx — single source of the metric
  // history derivation logic, both driven by the same context data.
  const history = useMetricsHistory();

  const cpuPercent = systemMetrics?.cpu?.cpu_percent ?? null;
  const memoryPercent = systemMetrics?.memory?.virtual_memory?.percent ?? null;
  const diskPartitions = systemMetrics?.disk?.partitions ?? [];
  const diskPercent = diskPartitions.length
    ? Number(
        (diskPartitions.reduce((sum, p) => sum + (p.percent ?? 0), 0) / diskPartitions.length).toFixed(1)
      )
    : null;
  const networkHealthy = Boolean(apiStatus?.monitoringAvailable);

  const healthScore = aiStatus?.health_score ?? null;
  const rootCauseFindings = aiStatus?.root_cause_analysis?.findings ?? [];
  const recommendations = aiStatus?.recommendations ?? [];

  const recentAlerts = useMemo(() => alerts.slice(0, 5), [alerts]);

  const activityTimeline = useMemo(() => {
    const items = [];
    alerts.slice(0, 6).forEach((alert) =>
      items.push({
        id: `alert-${alert.id}`,
        timestamp: alert.timestamp,
        severity: alert.severity,
        message: alert.message,
      })
    );
    (aiStatus?.anomalies ?? []).slice(0, 4).forEach((anomaly, index) =>
      items.push({
        id: `anomaly-${index}`,
        timestamp: aiStatus?.timestamp ?? new Date().toISOString(),
        severity: anomaly.severity ?? "medium",
        message: anomaly.description ?? `Anomaly detected on ${anomaly.metric}`,
      })
    );
    return items
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 6);
  }, [alerts, aiStatus]);

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const lastSyncLabel = lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "--:--:--";

  return (
    <div className="flex flex-col gap-6">
      {/* Welcome section */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold" style={{ color: COLORS.text }}>
            Welcome Back 👋
          </h1>
          <p className="text-sm" style={{ color: COLORS.secondary }}>
            AI-Powered Cybersecurity &amp; System Health Monitoring Platform
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium" style={{ color: COLORS.text }}>
            {todayLabel}
          </p>
          <p className="text-xs" style={{ color: COLORS.secondary }}>
            Last Sync: {lastSyncLabel}
          </p>
        </div>
      </div>

      {/* Metric cards — click through to the full Monitoring page */}
      <button
        type="button"
        onClick={() => navigate("/monitoring")}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-left"
      >
        <MetricCard
          label="CPU"
          value={cpuPercent ?? "--"}
          unit={cpuPercent !== null ? "%" : ""}
          icon={FiCpu}
          status={metricStatus(cpuPercent)}
          loading={!systemMetrics}
        />
        <MetricCard
          label="Memory"
          value={memoryPercent ?? "--"}
          unit={memoryPercent !== null ? "%" : ""}
          icon={FiServer}
          status={metricStatus(memoryPercent)}
          loading={!systemMetrics}
        />
        <MetricCard
          label="Disk"
          value={diskPercent ?? "--"}
          unit={diskPercent !== null ? "%" : ""}
          icon={FiHardDrive}
          status={metricStatus(diskPercent)}
          loading={!systemMetrics}
        />
        <MetricCard
          label="Network"
          value={networkHealthy ? "Healthy" : "Unknown"}
          icon={FiWifi}
          status={networkHealthy ? "healthy" : "info"}
          loading={!systemMetrics}
        />
      </button>

      {/* Live Performance Graph */}
      <div
        className="rounded-xl border p-4 sm:p-5"
        style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
      >
        <SectionHeader title="Live Performance Graph" icon={FiActivity} />
        <div className="mt-4">
          <LivePerformanceGraph data={history} loading={!systemMetrics && history.length === 0} />
        </div>
      </div>

      {/* AI Health Score + Root Cause Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <button
          type="button"
          onClick={() => navigate("/trinetra-ai")}
          className="rounded-xl border p-4 sm:p-5 flex flex-col items-center justify-center text-left"
          style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
        >
          <SectionHeader title="AI Health Score" icon={FiActivity} className="self-start mb-3" />
          <ProgressRing
            percentage={healthScore ?? 0}
            status={metricStatus(100 - (healthScore ?? 100), 25, 40)}
            loading={healthScore === null}
            label="Overall System Health"
          />
        </button>

        <button
          type="button"
          onClick={() => navigate("/trinetra-ai")}
          className="lg:col-span-2 text-left"
        >
          <InfoCard
            title="Root Cause Analysis"
            icon={FiShield}
            accent="ai"
            loading={!aiStatus}
            description={
              rootCauseFindings.length === 0
                ? "AI explains abnormal behaviour, identifies bottlenecks, resource spikes, and security posture with confidence scores."
                : undefined
            }
          >
            {rootCauseFindings.length > 0 && (
              <ul className="flex flex-col gap-2">
                {rootCauseFindings.map((finding, index) => (
                  <li key={index} className="text-sm" style={{ color: COLORS.secondary }}>
                    <span className="font-medium" style={{ color: COLORS.text }}>
                      {finding.category}:
                    </span>{" "}
                    {finding.cause}{" "}
                    <span className="text-xs" style={{ color: COLORS.ai }}>
                      ({finding.confidence} confidence)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </InfoCard>
        </button>
      </div>

      {/* AI Recommendations */}
      <div
        className="rounded-xl border p-4 sm:p-5"
        style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
      >
        <SectionHeader title="AI Recommendations" icon={FiActivity} />
        <div className="mt-3">
          {recommendations.length === 0 ? (
            <EmptyState
              title="No recommendations yet"
              description="AI recommendations will appear here once monitoring data has been analyzed."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {recommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-2 text-sm" style={{ color: COLORS.text }}>
                  <span style={{ color: COLORS.brand }}>•</span>
                  <span>
                    {rec.title ? `${rec.title} — ` : ""}
                    {rec.description ?? String(rec)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recent Alerts / Security Status / Activity Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div
          className="rounded-xl border p-4 sm:p-5"
          style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
        >
          <SectionHeader title="Recent Alerts" icon={FiAlertTriangle} />
          <div className="mt-3 flex flex-col gap-2">
            {recentAlerts.length === 0 ? (
              <EmptyState title="No recent alerts" description="Everything looks normal." />
            ) : (
              recentAlerts.map((alert) => (
                <AlertBadge
                  key={alert.id}
                  severity={alert.severity}
                  message={alert.message}
                  timestamp={new Date(alert.timestamp).toLocaleString()}
                />
              ))
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate("/cybersecurity")}
          className="rounded-xl border p-4 sm:p-5 text-left"
          style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
        >
          <SectionHeader title="Security Status" icon={FiShield} />
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: COLORS.secondary }}>
                Overall Severity
              </span>
              <StatusBadge
                status={cybersecurityStatus?.overall_severity || "info"}
                label={cybersecurityStatus?.overall_severity || "Unknown"}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: COLORS.secondary }}>
                Security Score
              </span>
              <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
                {cybersecurityStatus?.security_score ?? "--"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: COLORS.secondary }}>
                Active Threats
              </span>
              <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
                {cybersecurityStatus?.threat_count ?? 0}
              </span>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate("/reports")}
          className="rounded-xl border p-4 sm:p-5 text-left"
          style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
        >
          <SectionHeader title="Activity Timeline" icon={FiClock} />
          <div className="mt-3 flex flex-col gap-3">
            {activityTimeline.length === 0 ? (
              <EmptyState title="No recent activity" description="Activity will appear here as it happens." />
            ) : (
              activityTimeline.map((item) => (
                <div key={item.id} className="flex items-start gap-2.5">
                  <span
                    className="mt-1 h-2 w-2 flex-shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        item.severity === "critical" || item.severity === "high"
                          ? COLORS.critical
                          : item.severity === "medium"
                          ? COLORS.brand
                          : COLORS.healthy,
                    }}
                  />
                  <div>
                    <p className="text-xs" style={{ color: COLORS.text }}>
                      {item.message}
                    </p>
                    <p className="text-[11px]" style={{ color: COLORS.secondary }}>
                      {new Date(item.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </button>
      </div>
    </div>
  );
}