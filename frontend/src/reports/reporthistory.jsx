/**
 * reporthistory.jsx
 *
 * Displays a searchable, filterable timeline of historical monitoring
 * reports — alerts, AI summary and security summary per run. Shares
 * its dataset with testruns.jsx / database.jsx through
 * SystemStatusContext and only fetches from the API if that shared
 * data hasn't been loaded yet by a sibling page.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiSearch, FiFilter, FiClock, FiAlertTriangle, FiCpu, FiShield } from "react-icons/fi";

import { reportsApi } from "../api/api.jsx";
import { COLORS, StatusBadge } from "../components/dashboardcomponents.jsx";
import {
  SectionHeader,
  LoadingSpinner,
  EmptyState,
  ErrorState,
} from "../components/dashboardwidgets.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";
import { normalizeReport } from "./testruns.jsx";

const ALERT_FILTERS = [
  { value: "all", label: "All Reports" },
  { value: "with_alerts", label: "With Alerts" },
  { value: "no_alerts", label: "No Alerts" },
];

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) return "--";
  const total = Math.max(0, Math.floor(Number(seconds)));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const parts = [];
  if (hrs) parts.push(`${hrs}h`);
  if (mins) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  return parts.join(" ");
}

function alertSeverity(totalAlerts) {
  if (totalAlerts <= 0) return { key: "healthy", label: "No Alerts" };
  if (totalAlerts <= 3) return { key: "warning", label: `${totalAlerts} Alert(s)` };
  return { key: "critical", label: `${totalAlerts} Alert(s)` };
}

// ========================================================================
// Timeline entry
// ========================================================================

function TimelineEntry({ report, isLast, isHighlighted, entryRef, onViewInTestRuns }) {
  const severity = alertSeverity(report.totalAlerts);

  return (
    <div id={`run-${report.runId}`} ref={entryRef} className="relative flex gap-4 scroll-mt-24">
      <div className="flex flex-col items-center">
        <span
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2"
          style={{
            backgroundColor: COLORS.card,
            borderColor:
              severity.key === "critical"
                ? COLORS.critical
                : severity.key === "warning"
                ? COLORS.brand
                : COLORS.healthy,
          }}
        >
          <FiClock className="h-3.5 w-3.5" style={{ color: COLORS.text }} />
        </span>
        {!isLast && <span className="w-px flex-1" style={{ backgroundColor: COLORS.cardBorder }} />}
      </div>

      <div
        className="mb-5 flex-1 rounded-xl border p-4 shadow-sm transition-all duration-500"
        style={{
          backgroundColor: COLORS.card,
          borderColor: isHighlighted ? COLORS.brand : COLORS.cardBorder,
          boxShadow: isHighlighted ? `0 0 0 2px ${COLORS.brand}55` : "none",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onViewInTestRuns(report.runId)}
            className="text-sm font-semibold underline-offset-2 hover:underline"
            style={{ color: COLORS.text }}
          >
            Run #{report.runId}
          </button>
          <StatusBadge status={severity.key} label={severity.label} />
        </div>

        <p className="mt-1 text-xs" style={{ color: COLORS.secondary }}>
          {formatDateTime(report.startTime)} → {formatDateTime(report.endTime)} (
          {formatDuration(report.durationSeconds)})
        </p>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-start gap-2 rounded-lg p-2.5" style={{ backgroundColor: `${COLORS.ai}0d` }}>
            <FiCpu className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: COLORS.ai }} />
            <div>
              <p className="text-xs font-medium" style={{ color: COLORS.ai }}>
                AI Summary
              </p>
              <p className="text-xs mt-0.5" style={{ color: COLORS.secondary }}>
                {report.aiSummary}
              </p>
            </div>
          </div>

          <div
            className="flex items-start gap-2 rounded-lg p-2.5"
            style={{ backgroundColor: `${COLORS.brand}0d` }}
          >
            <FiShield className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: COLORS.brand }} />
            <div>
              <p className="text-xs font-medium" style={{ color: COLORS.brand }}>
                Security Summary
              </p>
              <p className="text-xs mt-0.5" style={{ color: COLORS.secondary }}>
                {report.securitySummary}
              </p>
            </div>
          </div>
        </div>

        {report.totalAlerts > 0 && (
          <div className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: COLORS.critical }}>
            <FiAlertTriangle className="h-3.5 w-3.5" />
            {report.totalAlerts} alert(s) generated during this run.
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================================================
// ReportHistory
// ========================================================================

export default function ReportHistory() {
  const { apiStatus, reports, setReports } = useSystemStatus();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(reports.length === 0);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [alertFilter, setAlertFilter] = useState("all");
  const [highlightedRunId, setHighlightedRunId] = useState(null);

  const entryRefs = useRef({});

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await reportsApi.getHistory({ limit: 200 });
      const list = Array.isArray(result) ? result : result?.reports || [];
      setReports(list.map(normalizeReport));
    } catch (err) {
      setError(err?.message || "Failed to fetch report history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch if the shared context doesn't already have report data
    // (e.g. loaded earlier by testruns.jsx or database.jsx).
    if (reports.length === 0) {
      fetchHistory();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => {
      const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
      const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
      return timeB - timeA;
    });
  }, [reports]);

  const filteredReports = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return sortedReports.filter((report) => {
      const matchesAlertFilter =
        alertFilter === "all" ||
        (alertFilter === "with_alerts" && report.totalAlerts > 0) ||
        (alertFilter === "no_alerts" && report.totalAlerts === 0);

      const matchesSearch =
        !query ||
        String(report.runId).toLowerCase().includes(query) ||
        report.aiSummary.toLowerCase().includes(query) ||
        report.securitySummary.toLowerCase().includes(query);

      return matchesAlertFilter && matchesSearch;
    });
  }, [sortedReports, searchQuery, alertFilter]);

  // Deep-link support: highlight + scroll to a run passed via
  // ?run=<id> (e.g. navigated here from testruns.jsx or database.jsx).
  useEffect(() => {
    const runParam = searchParams.get("run");
    if (!runParam || loading) return undefined;

    setHighlightedRunId(runParam);
    const target = entryRefs.current[runParam];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    const timeoutId = setTimeout(() => setHighlightedRunId(null), 4000);
    return () => clearTimeout(timeoutId);
  }, [searchParams, loading, filteredReports]);

  const goToTestRuns = (runId) => {
    navigate(`/reports?run=${runId}#test-runs`);
  };

  return (
    <div id="report-history" className="flex flex-col gap-5">
      <SectionHeader
        title="Report History"
        subtitle="Timeline of previous monitoring runs, AI insights and security summaries."
        icon={FiClock}
        actions={!apiStatus?.online && <StatusBadge status="critical" label="API Offline" />}
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div
          className="flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
        >
          <FiSearch className="h-4 w-4 flex-shrink-0" style={{ color: COLORS.secondary }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by run ID, AI summary or security summary..."
            className="w-full bg-transparent outline-none placeholder:text-slate-500"
            style={{ color: COLORS.text }}
          />
        </div>

        <div
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
        >
          <FiFilter className="h-4 w-4 flex-shrink-0" style={{ color: COLORS.secondary }} />
          <select
            value={alertFilter}
            onChange={(e) => setAlertFilter(e.target.value)}
            className="bg-transparent outline-none"
            style={{ color: COLORS.text, colorScheme: "dark" }}
          >
            {ALERT_FILTERS.map((option) => (
              <option key={option.value} value={option.value} style={{ backgroundColor: COLORS.card }}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        {loading ? (
          <LoadingSpinner label="Loading report history..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchHistory} />
        ) : filteredReports.length === 0 ? (
          <EmptyState
            title="No reports found"
            description="No historical reports match your current search/filter."
          />
        ) : (
          <div className="flex flex-col">
            {filteredReports.map((report, index) => (
              <TimelineEntry
                key={report.runId}
                report={report}
                isLast={index === filteredReports.length - 1}
                isHighlighted={String(report.runId) === String(highlightedRunId)}
                entryRef={(el) => {
                  entryRefs.current[report.runId] = el;
                }}
                onViewInTestRuns={goToTestRuns}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}