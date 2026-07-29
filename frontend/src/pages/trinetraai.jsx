/**
 * trinetraai.jsx
 *
 * Trinetra AI dashboard page — composes AIWorkspace, AIInsights,
 * AIRecommendations and AIPredictions. AI analysis data comes
 * exclusively from SystemStatusContext (which already calls
 * aiApi.analyze() via api.jsx on its own refresh cycle) — this page
 * makes no direct api.jsx calls of its own, avoiding the duplicate
 * fetch pipeline it previously had. The "Refresh" action simply
 * invokes the context's existing `refreshAIStatus` action.
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import { FaBrain } from "react-icons/fa6";
import { FiShield, FiRefreshCw } from "react-icons/fi";

import { COLORS, StatusBadge } from "../components/dashboardcomponents.jsx";
import { SectionHeader, ErrorState } from "../components/dashboardwidgets.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";

import AIWorkspace from "../ai/aiworkspace.jsx";
import AIInsights from "../ai/aiinsights.jsx";
import AIRecommendations from "../ai/airecommendations.jsx";
import AIPredictions from "../ai/aipredictions.jsx";

export default function TrinetraAI() {
  const { aiStatus, apiStatus, error, loading, refreshAIStatus } = useSystemStatus();
  const navigate = useNavigate();

  const isLoading = Boolean(loading?.ai) && !aiStatus;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Trinetra AI"
        subtitle="AI-driven health scoring, insights, predictions and recommendations."
        icon={FaBrain}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!apiStatus?.aiAvailable && <StatusBadge status="critical" label="AI Engine Offline" />}
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
              onClick={() => refreshAIStatus?.()}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity duration-200 hover:opacity-90"
              style={{ backgroundColor: COLORS.brand, color: "#0f172a" }}
            >
              <FiRefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        }
      />

      {!aiStatus && error ? (
        <ErrorState message={error} onRetry={() => refreshAIStatus?.()} />
      ) : (
        <>
          <AIWorkspace data={aiStatus} loading={isLoading} onRefresh={() => refreshAIStatus?.()} />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <AIInsights data={aiStatus} loading={isLoading} />
            <AIPredictions data={aiStatus} loading={isLoading} />
          </div>

          <AIRecommendations data={aiStatus} loading={isLoading} />
        </>
      )}
    </div>
  );
}