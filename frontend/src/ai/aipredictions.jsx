/**
 * aipredictions.jsx
 *
 * Displays predictive intelligence: Predictive Alerts, Future
 * Resource Trends (charted with Recharts via BarChartWidget),
 * Anomalies, and Risk Probability. Data flows in exclusively from
 * SystemStatusContext (directly, or via props when composed inside
 * aiworkspace.jsx).
 */

import React, { useMemo } from "react";
import { FiZap, FiTrendingUp, FiAlertTriangle, FiPercent } from "react-icons/fi";

import { COLORS, StatusBadge } from "../components/dashboardcomponents.jsx";
import {
  SectionHeader,
  EmptyState,
  LoadingSpinner,
  BarChartWidget,
} from "../components/dashboardwidgets.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";

function confidenceToRisk(confidence) {
  const normalized = String(confidence || "").toLowerCase();
  if (normalized === "high") return 80;
  if (normalized === "medium") return 50;
  if (normalized === "low") return 25;
  return 40;
}

function riskStatus(riskPercent) {
  if (riskPercent >= 70) return "critical";
  if (riskPercent >= 40) return "warning";
  return "healthy";
}

export default function AIPredictions({ data, loading }) {
  const context = useSystemStatus();

  const aiStatus = data ?? context.aiStatus;
  const isLoading = loading ?? (Boolean(context.loading?.ai) && !context.aiStatus);

  const predictiveAlerts = aiStatus?.predictive_alerts ?? [];
  const anomalies = aiStatus?.anomalies ?? [];
  const trendAnalysis = aiStatus?.trend_analysis ?? {};

  const predictionsActive = predictiveAlerts.length > 0 || Object.keys(trendAnalysis).length > 0;

  const trendChartData = useMemo(() => {
    return Object.entries(trendAnalysis)
      .filter(([, trend]) => trend?.current_value !== null && trend?.current_value !== undefined)
      .map(([metric, trend]) => {
        const matchingAlert = predictiveAlerts.find((alert) => alert.metric === metric);
        return {
          name: metric.replace(/_/g, " "),
          current: Number(trend.current_value ?? 0),
          projected: Number(matchingAlert?.projected_value ?? trend.current_value ?? 0),
        };
      });
  }, [trendAnalysis, predictiveAlerts]);

  return (
    <div
      id="ai-predictions"
      className="rounded-xl border p-4 sm:p-5 flex flex-col gap-5 scroll-mt-24"
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
    >
      <SectionHeader
        title="AI Predictions"
        subtitle="Forward-looking alerts, resource trend projections and risk probability."
        icon={FiZap}
        actions={
          <StatusBadge
            status={predictionsActive ? "ai" : "info"}
            label={predictionsActive ? "Predictions Active" : "No Predictions"}
          />
        }
      />

      {isLoading ? (
        <LoadingSpinner label="Loading predictions..." />
      ) : (
        <>
          {/* Predictive Alerts + Risk Probability */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FiPercent className="h-4 w-4" style={{ color: COLORS.ai }} />
              <p className="text-xs font-medium" style={{ color: COLORS.secondary }}>
                Predictive Alerts &amp; Risk Probability
              </p>
            </div>
            {predictiveAlerts.length === 0 ? (
              <EmptyState
                title="No predictive alerts"
                description="Forward-looking alerts will appear here once trends indicate future risk."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {predictiveAlerts.map((alert, index) => {
                  const risk = confidenceToRisk(alert.confidence);
                  return (
                    <li
                      key={index}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 rounded-lg border p-3"
                      style={{ backgroundColor: `${COLORS.ai}0d`, borderColor: `${COLORS.ai}33` }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium capitalize" style={{ color: COLORS.text }}>
                          {alert.metric?.replace(/_/g, " ") ?? "Unknown metric"}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: COLORS.secondary }}>
                          {alert.message}
                        </p>
                        <p className="text-[11px] mt-1" style={{ color: COLORS.secondary }}>
                          Horizon: {alert.horizon ?? "unknown"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <StatusBadge status={riskStatus(risk)} label={`${risk}% risk`} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Future Resource Trends */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FiTrendingUp className="h-4 w-4" style={{ color: COLORS.brand }} />
              <p className="text-xs font-medium" style={{ color: COLORS.secondary }}>
                Future Resource Trends
              </p>
            </div>
            <BarChartWidget
              data={trendChartData}
              xKey="name"
              height={220}
              bars={[
                { key: "current", name: "Current", color: COLORS.brand },
                { key: "projected", name: "Projected", color: COLORS.ai },
              ]}
              emptyMessage="No resource trend projections available yet."
            />
          </div>

          {/* Anomalies */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FiAlertTriangle className="h-4 w-4" style={{ color: COLORS.critical }} />
              <p className="text-xs font-medium" style={{ color: COLORS.secondary }}>
                Anomalies
              </p>
            </div>
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