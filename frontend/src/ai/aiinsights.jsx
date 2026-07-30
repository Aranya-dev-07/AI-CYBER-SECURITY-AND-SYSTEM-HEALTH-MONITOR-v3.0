/**
 * aiinsights.jsx
 *
 * Displays AI analysis and system intelligence: AI Engine Status,
 * Health Score, Trend Analysis, System Behaviour Summary and Anomaly
 * Information. Data comes from SystemStatusContext (which itself is
 * the only layer that talks to api.jsx) — this component performs no
 * direct API communication of its own.
 */

import React, { useMemo } from "react";
import {
  FiCpu,
  FiActivity,
  FiTrendingUp,
  FiTrendingDown,
  FiMinus,
  FiAlertTriangle,
  FiFileText,
} from "react-icons/fi";

import { COLORS, StatusBadge, ProgressRing } from "../components/dashboardcomponents.jsx";
import { SectionHeader, EmptyState, LoadingSpinner } from "../components/dashboardwidgets.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";

function metricStatus(deficit, warnAt = 25, criticalAt = 40) {
  if (deficit === null || deficit === undefined) return "info";
  if (deficit >= criticalAt) return "critical";
  if (deficit >= warnAt) return "warning";
  return "healthy";
}

function trendIcon(direction) {
  if (direction === "increasing") return FiTrendingUp;
  if (direction === "decreasing") return FiTrendingDown;
  return FiMinus;
}

function trendColor(direction) {
  if (direction === "increasing") return COLORS.critical;
  if (direction === "decreasing") return COLORS.healthy;
  return COLORS.secondary;
}

function buildBehaviourSummary({ healthScore, anomalyCount, trendEntries }) {
  if (healthScore === null && anomalyCount === 0 && trendEntries.length === 0) {
    return "No AI analysis data is available yet.";
  }

  const scoreLabel =
    healthScore === null
      ? "Health score is currently unavailable."
      : healthScore >= 85
      ? `System health is strong at ${healthScore}%.`
      : healthScore >= 60
      ? `System health is moderate at ${healthScore}%.`
      : `System health is degraded at ${healthScore}%.`;

  const anomalyLabel =
    anomalyCount === 0
      ? "No anomalies have been detected in the current analysis window."
      : `${anomalyCount} anomal${anomalyCount === 1 ? "y has" : "ies have"} been detected.`;

  const increasing = trendEntries.filter((t) => t.direction === "increasing").length;
  const trendLabel =
    increasing > 0
      ? `${increasing} metric(s) are trending upward and may need attention.`
      : "All monitored metrics are stable or trending downward.";

  return `${scoreLabel} ${anomalyLabel} ${trendLabel}`;
}

export default function AIInsights({ data, loading }) {
  const context = useSystemStatus();

  const aiStatus = data ?? context.aiStatus;
  const isLoading = loading ?? (Boolean(context.loading?.ai) && !context.aiStatus);
  const aiEngineOnline = Boolean(context.apiStatus?.aiAvailable);

  const healthScore = aiStatus?.health_score ?? null;
  const anomalies = aiStatus?.anomalies ?? [];
  const trendAnalysis = aiStatus?.trend_analysis ?? {};

  const trendEntries = useMemo(
    () =>
      Object.entries(trendAnalysis).map(([metric, trend]) => ({
        metric,
        direction: trend?.direction ?? "stable",
        slope: trend?.slope ?? 0,
        currentValue: trend?.current_value ?? null,
      })),
    [trendAnalysis]
  );

  const behaviourSummary = useMemo(
    () => buildBehaviourSummary({ healthScore, anomalyCount: anomalies.length, trendEntries }),
    [healthScore, anomalies.length, trendEntries]
  );

  return (
    <div
      id="ai-insights"
      className="rounded-xl border p-4 sm:p-5 flex flex-col gap-5 scroll-mt-24"
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
    >
      <SectionHeader
        title="AI Insights"
        subtitle="AI engine status, health scoring and behavioural analysis."
        icon={FiActivity}
        actions={
          <StatusBadge
            status={aiEngineOnline ? "healthy" : "critical"}
            label={aiEngineOnline ? "AI Engine Online" : "AI Engine Offline"}
          />
        }
      />

      {isLoading ? (
        <LoadingSpinner label="Loading AI insights..." />
      ) : (
        <>
          {/* AI Engine Status + Health Score */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              className="flex items-center gap-3 rounded-lg border p-3"
              style={{ backgroundColor: COLORS.background, borderColor: COLORS.cardBorder }}
            >
              <span
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${COLORS.ai}1f` }}
              >
                <FiCpu className="h-4 w-4" style={{ color: COLORS.ai }} />
              </span>
              <div>
                <p className="text-xs" style={{ color: COLORS.secondary }}>
                  AI Engine Status
                </p>
                <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
                  {aiEngineOnline ? "Online" : "Offline"}
                </p>
              </div>
            </div>

            <div
              className="flex items-center gap-3 rounded-lg border p-3"
              style={{ backgroundColor: COLORS.background, borderColor: COLORS.cardBorder }}
            >
              <ProgressRing
                percentage={healthScore ?? 0}
                status={metricStatus(100 - (healthScore ?? 100))}
                loading={healthScore === null}
                size={56}
                strokeWidth={6}
              />
              <div>
                <p className="text-xs" style={{ color: COLORS.secondary }}>
                  Health Score
                </p>
                <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
                  {healthScore !== null ? `${healthScore}%` : "Unavailable"}
                </p>
              </div>
            </div>
          </div>

          {/* System Behaviour Summary */}
          <div
            className="flex items-start gap-2.5 rounded-lg border p-3"
            style={{ backgroundColor: `${COLORS.brand}0d`, borderColor: `${COLORS.brand}33` }}
          >
            <FiFileText className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: COLORS.brand }} />
            <div>
              <p className="text-xs font-medium" style={{ color: COLORS.brand }}>
                System Behaviour Summary
              </p>
              <p className="text-xs mt-0.5" style={{ color: COLORS.secondary }}>
                {behaviourSummary}
              </p>
            </div>
          </div>

          {/* Trend Analysis */}
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: COLORS.secondary }}>
              Trend Analysis
            </p>
            {trendEntries.length === 0 ? (
              <EmptyState
                title="No trend data yet"
                description="Trend analysis will appear once enough history has been collected."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {trendEntries.map((trend) => {
                  const Icon = trendIcon(trend.direction);
                  const color = trendColor(trend.direction);
                  return (
                    <li
                      key={trend.metric}
                      className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                      style={{ backgroundColor: COLORS.background }}
                    >
                      <span className="text-sm capitalize" style={{ color: COLORS.text }}>
                        {trend.metric.replace(/_/g, " ")}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color }}>
                        <Icon className="h-3.5 w-3.5" />
                        {trend.direction}
                        {trend.currentValue !== null ? ` (${trend.currentValue})` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Anomaly Information */}
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: COLORS.secondary }}>
              Anomaly Information
            </p>
            {anomalies.length === 0 ? (
              <EmptyState title="No anomalies detected" description="System behaviour is within normal parameters." />
            ) : (
              <ul className="flex flex-col gap-2">
                {anomalies.map((anomaly, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2.5 rounded-lg border p-2.5"
                    style={{
                      backgroundColor: `${COLORS.critical}0d`,
                      borderColor: `${COLORS.critical}33`,
                    }}
                  >
                    <FiAlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: COLORS.critical }} />
                    <div>
                      <p className="text-xs font-medium" style={{ color: COLORS.text }}>
                        {anomaly.metric ?? "Unknown metric"}{" "}
                        <span style={{ color: COLORS.secondary }}>({anomaly.severity ?? "medium"})</span>
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: COLORS.secondary }}>
                        {anomaly.description ?? "No further details available."}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}