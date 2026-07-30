/**
 * aiworkspace.jsx
 *
 * Main Trinetra AI workspace layout: AI Health Score, AI Insights,
 * Recommendations and Predictions, composed together in a single
 * responsive container. Reads AI analysis data from
 * SystemStatusContext by default (falling back to props when
 * supplied by a parent page, e.g. pages/trinetraai.jsx), so it stays
 * usable both standalone and as a controlled child.
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import { FaBrain } from "react-icons/fa6";
import { FiActivity, FiRefreshCw, FiShield } from "react-icons/fi";

import { COLORS, ProgressRing } from "../components/dashboardcomponents.jsx";
import { SectionHeader } from "../components/dashboardwidgets.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";

import AIInsights from "./aiinsights.jsx";
import AIRecommendations from "./airecommendations.jsx";
import AIPredictions from "./aipredictions.jsx";

function metricStatus(deficit, warnAt = 25, criticalAt = 40) {
  if (deficit === null || deficit === undefined) return "info";
  if (deficit >= criticalAt) return "critical";
  if (deficit >= warnAt) return "warning";
  return "healthy";
}

export default function AIWorkspace({ data, loading, onRefresh }) {
  const context = useSystemStatus();
  const navigate = useNavigate();

  // Prefer explicitly supplied props (controlled usage from a parent
  // page); otherwise fall back to SystemStatusContext directly.
  const aiStatus = data ?? context.aiStatus;
  const isLoading = loading ?? (Boolean(context.loading?.ai) && !context.aiStatus);
  const handleRefresh = onRefresh ?? context.refreshAIStatus;

  const healthScore = aiStatus?.health_score ?? null;
  const anomalyCount = aiStatus?.anomalies?.length ?? 0;
  const recommendationCount = aiStatus?.recommendations?.length ?? 0;
  const predictionCount = aiStatus?.predictive_alerts?.length ?? 0;

  return (
    <div id="ai-workspace" className="flex flex-col gap-5 scroll-mt-24">
      <div
        className="rounded-xl border p-4 sm:p-5"
        style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
      >
        <SectionHeader
          title="Trinetra AI Workspace"
          subtitle="Unified view of system health scoring, insights, predictions and recommendations."
          icon={FaBrain}
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate("/cybersecurity")}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-200 hover:bg-white/5"
                style={{ borderColor: COLORS.cardBorder, color: COLORS.text }}
              >
                <FiShield className="h-3.5 w-3.5" />
                View Cybersecurity
              </button>
              <button
                type="button"
                onClick={() => handleRefresh?.()}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-200 hover:bg-white/5"
                style={{ borderColor: COLORS.cardBorder, color: COLORS.text }}
              >
                <FiRefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          }
        />

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-1 flex flex-col items-center justify-center gap-2 rounded-xl border p-4"
            style={{ backgroundColor: COLORS.background, borderColor: COLORS.cardBorder }}
          >
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: COLORS.secondary }}>
              AI Health Score
            </span>
            <ProgressRing
              percentage={healthScore ?? 0}
              status={metricStatus(100 - (healthScore ?? 100))}
              loading={healthScore === null}
              size={110}
            />
          </div>

          <div className="lg:col-span-3 grid grid-cols-3 gap-3">
            <div
              className="flex flex-col items-center justify-center gap-1 rounded-xl border p-4"
              style={{ backgroundColor: COLORS.background, borderColor: COLORS.cardBorder }}
            >
              <FiActivity className="h-4 w-4" style={{ color: COLORS.ai }} />
              <span className="text-xl font-semibold" style={{ color: COLORS.text }}>
                {anomalyCount}
              </span>
              <span className="text-xs text-center" style={{ color: COLORS.secondary }}>
                Anomalies Detected
              </span>
            </div>
            <div
              className="flex flex-col items-center justify-center gap-1 rounded-xl border p-4"
              style={{ backgroundColor: COLORS.background, borderColor: COLORS.cardBorder }}
            >
              <FiActivity className="h-4 w-4" style={{ color: COLORS.brand }} />
              <span className="text-xl font-semibold" style={{ color: COLORS.text }}>
                {predictionCount}
              </span>
              <span className="text-xs text-center" style={{ color: COLORS.secondary }}>
                Predictive Alerts
              </span>
            </div>
            <div
              className="flex flex-col items-center justify-center gap-1 rounded-xl border p-4"
              style={{ backgroundColor: COLORS.background, borderColor: COLORS.cardBorder }}
            >
              <FiActivity className="h-4 w-4" style={{ color: COLORS.healthy }} />
              <span className="text-xl font-semibold" style={{ color: COLORS.text }}>
                {recommendationCount}
              </span>
              <span className="text-xs text-center" style={{ color: COLORS.secondary }}>
                Recommendations
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <AIInsights data={aiStatus} loading={isLoading} />
        <AIPredictions data={aiStatus} loading={isLoading} />
      </div>

      <AIRecommendations data={aiStatus} loading={isLoading} />
    </div>
  );
}