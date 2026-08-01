/**
 * testruns.jsx
 *
 * Displays all monitoring test runs: Run ID, Start Time, End Time,
 * Duration and Status — sorted newest first, with search/filter and
 * a click-through detail view. Report data is fetched once and
 * shared with reporthistory.jsx / database.jsx through
 * SystemStatusContext — this file does not duplicate that fetch if
 * the data has already been loaded by a sibling page.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiSearch, FiFilter, FiClock, FiCheckCircle, FiXCircle, FiPlay } from "react-icons/fi";

import { databaseApi } from "../api/api.jsx";
import { COLORS, StatusBadge } from "../components/dashboardcomponents.jsx";
import {
  SectionHeader,
  LoadingSpinner,
  EmptyState,
  ErrorState,
  Modal,
} from "../components/dashboardwidgets.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";

const STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  { value: "completed", label: "Completed" },
  { value: "running", label: "Running" },
  { value: "failed", label: "Failed" },
];

function mapRunStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "completed" || normalized === "success") {
    return { key: "healthy", label: "Completed", icon: FiCheckCircle };
  }
  if (normalized === "running" || normalized === "active" || normalized === "in_progress") {
    return { key: "info", label: "Running", icon: FiPlay };
  }
  if (normalized === "failed" || normalized === "error") {
    return { key: "critical", label: "Failed", icon: FiXCircle };
  }
  return { key: "info", label: status || "Unknown", icon: FiClock };
}

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

/**
 * Normalizes a raw report record (as returned by reportsApi.getHistory)
 * into the shape shared across testruns.jsx, reporthistory.jsx and
 * database.jsx via SystemStatusContext.
 */
export function normalizeReport(raw, index) {
  return {
    runId: raw.run_number ?? raw.run_id ?? raw.id ?? index + 1,
    startTime: raw.start_time ?? raw.startTime ?? null,
    endTime: raw.end_time ?? raw.endTime ?? null,
    durationSeconds: raw.duration_seconds ?? raw.durationSeconds ?? null,
    status: raw.status ?? (raw.end_time ? "completed" : "running"),
    totalAlerts: Number(raw.total_alerts ?? raw.totalAlerts ?? 0),
    aiSummary: raw.ai_summary ?? raw.aiSummary ?? "No AI summary available.",
    securitySummary:
      raw.cybersecurity_summary ?? raw.securitySummary ?? "No security summary available.",
    raw,
  };
}

export default function TestRuns() {
  const { apiStatus, reports, setReports } = useSystemStatus();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(reports.length === 0);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRun, setSelectedRun] = useState(null);

  const fetchRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await reportsApi.getHistory({ limit: 200 });
      const list = Array.isArray(result) ? result : result?.reports || [];
      setReports(list.map(normalizeReport));
    } catch (err) {
      setError(err?.message || "Failed to fetch test runs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch if the shared context doesn't already have report data
    // (e.g. loaded earlier by reporthistory.jsx or database.jsx).
    if (reports.length === 0) {
      fetchRuns();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedRuns = useMemo(() => {
    return [...reports].sort((a, b) => {
      const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
      const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
      return timeB - timeA;
    });
  }, [reports]);

  const filteredRuns = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return sortedRuns.filter((run) => {
      const matchesStatus =
        statusFilter === "all" || mapRunStatus(run.status).label.toLowerCase() === statusFilter;
      const matchesSearch =
        !query ||
        String(run.runId).toLowerCase().includes(query) ||
        String(run.status).toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [sortedRuns, searchQuery, statusFilter]);

  const goToReportHistory = (runId) => {
    setSelectedRun(null);
    navigate(`/reports?run=${runId}#report-history`);
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="Test Runs"
        subtitle="All recorded monitoring runs, sorted newest first."
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
            placeholder="Search by run ID or status..."
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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent outline-none"
            style={{ color: COLORS.text, colorScheme: "dark" }}
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value} style={{ backgroundColor: COLORS.card }}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
      >
        {loading ? (
          <LoadingSpinner label="Loading test runs..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchRuns} />
        ) : filteredRuns.length === 0 ? (
          <EmptyState
            title="No test runs found"
            description="No monitoring runs match your current search/filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: COLORS.cardBorder }}>
                  {["Run ID", "Start Time", "End Time", "Duration", "Status"].map((heading) => (
                    <th
                      key={heading}
                      className="px-4 py-3 text-xs font-medium uppercase tracking-wide"
                      style={{ color: COLORS.secondary }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRuns.map((run) => {
                  const statusInfo = mapRunStatus(run.status);
                  return (
                    <tr
                      key={run.runId}
                      onClick={() => setSelectedRun(run)}
                      className="cursor-pointer border-b transition-colors duration-150 hover:bg-white/5"
                      style={{ borderColor: COLORS.cardBorder }}
                    >
                      <td className="px-4 py-3 font-medium" style={{ color: COLORS.text }}>
                        #{run.runId}
                      </td>
                      <td className="px-4 py-3" style={{ color: COLORS.secondary }}>
                        {formatDateTime(run.startTime)}
                      </td>
                      <td className="px-4 py-3" style={{ color: COLORS.secondary }}>
                        {formatDateTime(run.endTime)}
                      </td>
                      <td className="px-4 py-3" style={{ color: COLORS.secondary }}>
                        {formatDuration(run.durationSeconds)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={statusInfo.key} label={statusInfo.label} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={Boolean(selectedRun)}
        onClose={() => setSelectedRun(null)}
        title={selectedRun ? `Run #${selectedRun.runId} Details` : ""}
        footer={
          selectedRun && (
            <button
              type="button"
              onClick={() => goToReportHistory(selectedRun.runId)}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-opacity duration-200 hover:opacity-90"
              style={{ backgroundColor: COLORS.brand, color: "#0f172a" }}
            >
              View in Report History
            </button>
          )
        }
      >
        {selectedRun && (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between">
              <span style={{ color: COLORS.secondary }}>Status</span>
              <StatusBadge
                status={mapRunStatus(selectedRun.status).key}
                label={mapRunStatus(selectedRun.status).label}
              />
            </div>
            <div className="flex justify-between">
              <span style={{ color: COLORS.secondary }}>Start Time</span>
              <span style={{ color: COLORS.text }}>{formatDateTime(selectedRun.startTime)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: COLORS.secondary }}>End Time</span>
              <span style={{ color: COLORS.text }}>{formatDateTime(selectedRun.endTime)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: COLORS.secondary }}>Duration</span>
              <span style={{ color: COLORS.text }}>{formatDuration(selectedRun.durationSeconds)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: COLORS.secondary }}>Total Alerts</span>
              <span style={{ color: COLORS.text }}>{selectedRun.totalAlerts}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}