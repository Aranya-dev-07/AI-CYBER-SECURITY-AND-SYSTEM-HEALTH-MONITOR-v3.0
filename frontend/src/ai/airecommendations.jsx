/**
 * airecommendations.jsx
 *
 * Displays AI-generated recommendations: Root Cause Analysis,
 * Recommended Actions with priority/severity badges, and their
 * explanations. Data flows in exclusively from SystemStatusContext
 * (directly, or via props when composed inside aiworkspace.jsx).
 */

import React from "react";
import { FiTarget, FiCheckSquare, FiAlertCircle, FiInfo } from "react-icons/fi";

import { COLORS, StatusBadge } from "../components/dashboardcomponents.jsx";
import { SectionHeader, EmptyState, LoadingSpinner } from "../components/dashboardwidgets.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";

function priorityToStatus(priority) {
  const normalized = String(priority || "").toLowerCase();
  if (normalized === "critical" || normalized === "high") return "critical";
  if (normalized === "warning" || normalized === "medium") return "warning";
  if (normalized === "low") return "healthy";
  return "info";
}

function RootCauseCard({ finding }) {
  return (
    <li
      className="flex items-start gap-2.5 rounded-lg border p-3"
      style={{ backgroundColor: `${COLORS.ai}0d`, borderColor: `${COLORS.ai}33` }}
    >
      <FiAlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: COLORS.ai }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium capitalize" style={{ color: COLORS.ai }}>
            {finding.category ?? "General"}
          </span>
          <StatusBadge
            status={priorityToStatus(finding.confidence)}
            label={`${finding.confidence ?? "unknown"} confidence`}
          />
        </div>
        <p className="text-sm mt-1" style={{ color: COLORS.text }}>
          {finding.cause}
        </p>
        {Array.isArray(finding.evidence) && finding.evidence.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {finding.evidence.map((item, index) => (
              <li key={index} className="text-xs" style={{ color: COLORS.secondary }}>
                • {item}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function ActionCard({ recommendation }) {
  const status = priorityToStatus(recommendation.priority);

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border p-3"
      style={{ backgroundColor: COLORS.background, borderColor: COLORS.cardBorder }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FiCheckSquare className="h-4 w-4 flex-shrink-0" style={{ color: COLORS.brand }} />
          <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
            {recommendation.title ?? "Recommendation"}
          </span>
        </div>
        <StatusBadge status={status} label={recommendation.priority ?? "info"} />
      </div>

      {recommendation.description && (
        <div className="flex items-start gap-2 pl-6">
          <FiInfo className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" style={{ color: COLORS.secondary }} />
          <p className="text-xs" style={{ color: COLORS.secondary }}>
            {recommendation.description}
          </p>
        </div>
      )}

      {recommendation.category && (
        <span className="pl-6 text-[11px] uppercase tracking-wide" style={{ color: COLORS.secondary }}>
          {recommendation.category}
          {recommendation.related_metric ? ` • ${recommendation.related_metric}` : ""}
        </span>
      )}
    </div>
  );
}

export default function AIRecommendations({ data, loading }) {
  const context = useSystemStatus();

  const aiStatus = data ?? context.aiStatus;
  const isLoading = loading ?? (Boolean(context.loading?.ai) && !context.aiStatus);

  const findings = aiStatus?.root_cause_analysis?.findings ?? [];
  const recommendations = aiStatus?.recommendations ?? [];

  return (
    <div
      className="rounded-xl border p-4 sm:p-5 flex flex-col gap-5"
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
    >
      <SectionHeader
        title="AI Recommendations"
        subtitle="Root cause analysis and actionable recommendations, ranked by priority."
        icon={FiCheckSquare}
      />

      {isLoading ? (
        <LoadingSpinner label="Loading recommendations..." />
      ) : (
        <>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FiTarget className="h-4 w-4" style={{ color: COLORS.ai }} />
              <p className="text-xs font-medium" style={{ color: COLORS.secondary }}>
                Root Cause Analysis
              </p>
            </div>
            {findings.length === 0 ? (
              <EmptyState
                title="No root cause findings"
                description="AI will surface root cause explanations here once anomalies are detected."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {findings.map((finding, index) => (
                  <RootCauseCard key={index} finding={finding} />
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <FiCheckSquare className="h-4 w-4" style={{ color: COLORS.brand }} />
              <p className="text-xs font-medium" style={{ color: COLORS.secondary }}>
                Recommended Actions
              </p>
            </div>
            {recommendations.length === 0 ? (
              <EmptyState
                title="No recommendations yet"
                description="AI recommendations will appear here once monitoring data has been analyzed."
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {recommendations.map((recommendation, index) => (
                  <ActionCard key={index} recommendation={recommendation} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}