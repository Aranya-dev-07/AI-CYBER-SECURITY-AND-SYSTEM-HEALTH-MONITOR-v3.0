/**
 * securityreports.jsx
 *
 * Displays cybersecurity reports and history: Incident History,
 * live Security Events, a Threat Timeline, and CSV/PDF Export
 * Options. Historical report data is shared with reports/testruns.jsx
 * and reports/reporthistory.jsx through SystemStatusContext (`reports`)
 * — this component only calls api.jsx (reportsApi.getHistory) if that
 * shared data hasn't already been loaded by a sibling page, the same
 * lazy-fetch-once pattern used across the Reports section, so the
 * fetch itself is never duplicated in a given session. Live security
 * events come directly from the context's cybersecurityStatus, which
 * is populated by SystemStatusContext's own refresh cycle.
 *
 * Compatible with App.jsx / React Router: exposes id="security-reports"
 * and a "View Threat Center" link so it composes cleanly with
 * pages/cybersecurity.jsx.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiFileText, FiClock, FiActivity, FiDownload, FiAlertTriangle, FiShield } from "react-icons/fi";

import { reportsApi } from "../api/api.jsx";
import { COLORS, StatusBadge, useToast, ToastNotification } from "../components/dashboardcomponents.jsx";
import { SectionHeader, EmptyState, LoadingSpinner, ErrorState } from "../components/dashboardwidgets.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";
import { normalizeReport } from "../reports/testruns.jsx";

function severityToStatus(severity) {
  const normalized = String(severity || "").toLowerCase();
  if (normalized === "critical" || normalized === "high") return "critical";
  if (normalized === "medium") return "warning";
  if (normalized === "low") return "healthy";
  return "info";
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default function SecurityReports() {
  const { reports, setReports, cybersecurityStatus } = useSystemStatus();
  const { toast, showToast, hideToast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(reports.length === 0);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(null);

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await reportsApi.getHistory({ limit: 200 });
      const list = Array.isArray(result) ? result : result?.reports || [];
      setReports(list.map(normalizeReport));
    } catch (err) {
      setError(err?.message || "Failed to fetch security reports.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Reuse shared report data if testruns.jsx or reporthistory.jsx
    // already loaded it this session; otherwise fetch it once here.
    if (reports.length === 0) {
      fetchReports();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const incidentHistory = useMemo(
    () =>
      [...reports]
        .filter((report) => report.totalAlerts > 0)
        .sort((a, b) => new Date(b.startTime ?? 0).getTime() - new Date(a.startTime ?? 0).getTime()),
    [reports]
  );

  const liveThreats = cybersecurityStatus?.threats?.threats ?? [];
  const liveFirewallEvents = cybersecurityStatus?.firewall?.events ?? [];
  const liveNetworkEvents = cybersecurityStatus?.network?.events ?? [];
  const securityEvents = [...liveThreats, ...liveFirewallEvents, ...liveNetworkEvents];

  const handleExport = async (format) => {
    setExporting(format);
    try {
      const blob = await reportsApi.exportReport(format);
      downloadBlob(blob, `lavender_trinetra_security_report.${format}`);
      showToast(`Security report exported as ${format.toUpperCase()}.`, "healthy");
    } catch (err) {
      showToast(err?.message || `Failed to export ${format.toUpperCase()} report.`, "critical");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div id="security-reports" className="flex flex-col gap-6 scroll-mt-24">
      <SectionHeader
        title="Security Reports"
        subtitle="Incident history, live security events, threat timeline and exports."
        icon={FiFileText}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/cybersecurity#threat-center")}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-200 hover:bg-white/5"
              style={{ borderColor: COLORS.cardBorder, color: COLORS.text }}
            >
              <FiShield className="h-3.5 w-3.5" />
              View Threat Center
            </button>
            <button
              type="button"
              onClick={() => handleExport("csv")}
              disabled={exporting === "csv"}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-200 hover:bg-white/5 disabled:opacity-60"
              style={{ borderColor: COLORS.cardBorder, color: COLORS.text }}
            >
              <FiDownload className="h-3.5 w-3.5" />
              {exporting === "csv" ? "Exporting..." : "Export CSV"}
            </button>
            <button
              type="button"
              onClick={() => handleExport("pdf")}
              disabled={exporting === "pdf"}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity duration-200 hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: COLORS.brand, color: "#0f172a" }}
            >
              <FiDownload className="h-3.5 w-3.5" />
              {exporting === "pdf" ? "Exporting..." : "Export PDF"}
            </button>
          </div>
        }
      />

      {/* Incident History */}
      <div
        className="rounded-xl border p-4 sm:p-5"
        style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
      >
        <div className="flex items-center gap-2 mb-3">
          <FiAlertTriangle className="h-4 w-4" style={{ color: COLORS.critical }} />
          <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
            Incident History
          </p>
        </div>

        {loading ? (
          <LoadingSpinner label="Loading incident history..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchReports} />
        ) : incidentHistory.length === 0 ? (
          <EmptyState title="No incidents recorded" description="No runs with security alerts were found." />
        ) : (
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: COLORS.cardBorder }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: COLORS.cardBorder }}>
                  {["Run", "Start Time", "Alerts", "Security Summary"].map((heading) => (
                    <th
                      key={heading}
                      className="px-3 py-2 text-xs font-medium uppercase tracking-wide"
                      style={{ color: COLORS.secondary }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {incidentHistory.map((report) => (
                  <tr key={report.runId} className="border-b last:border-b-0" style={{ borderColor: COLORS.cardBorder }}>
                    <td className="px-3 py-2 font-medium" style={{ color: COLORS.text }}>
                      #{report.runId}
                    </td>
                    <td className="px-3 py-2" style={{ color: COLORS.secondary }}>
                      {formatDateTime(report.startTime)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status="critical" label={`${report.totalAlerts} alert(s)`} />
                    </td>
                    <td className="px-3 py-2 max-w-xs truncate" style={{ color: COLORS.secondary }}>
                      {report.securitySummary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Live Security Events */}
      <div
        className="rounded-xl border p-4 sm:p-5"
        style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
      >
        <div className="flex items-center gap-2 mb-3">
          <FiActivity className="h-4 w-4" style={{ color: COLORS.ai }} />
          <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
            Security Events
          </p>
        </div>
        {securityEvents.length === 0 ? (
          <EmptyState title="No active security events" description="No live security events to display." />
        ) : (
          <ul className="flex flex-col gap-2">
            {securityEvents.slice(0, 10).map((event, index) => (
              <li
                key={index}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                style={{ backgroundColor: COLORS.background }}
              >
                <span className="text-sm truncate" style={{ color: COLORS.text }}>
                  {event.title ?? event.description ?? event.event_type ?? "Security event"}
                </span>
                <StatusBadge status={severityToStatus(event.severity)} label={event.severity ?? "info"} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Threat Timeline */}
      <div
        className="rounded-xl border p-4 sm:p-5"
        style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
      >
        <div className="flex items-center gap-2 mb-3">
          <FiClock className="h-4 w-4" style={{ color: COLORS.brand }} />
          <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
            Threat Timeline
          </p>
        </div>
        {incidentHistory.length === 0 ? (
          <EmptyState title="No timeline data" description="Threat timeline will populate once incidents are recorded." />
        ) : (
          <div className="flex flex-col">
            {incidentHistory.slice(0, 8).map((report, index) => (
              <div key={report.runId} className="relative flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2"
                    style={{ backgroundColor: COLORS.card, borderColor: COLORS.critical }}
                  >
                    <FiAlertTriangle className="h-3 w-3" style={{ color: COLORS.critical }} />
                  </span>
                  {index !== Math.min(incidentHistory.length, 8) - 1 && (
                    <span className="w-px flex-1" style={{ backgroundColor: COLORS.cardBorder }} />
                  )}
                </div>
                <div className="mb-4 flex-1">
                  <p className="text-sm font-medium" style={{ color: COLORS.text }}>
                    Run #{report.runId} — {report.totalAlerts} alert(s)
                  </p>
                  <p className="text-xs" style={{ color: COLORS.secondary }}>
                    {formatDateTime(report.startTime)}
                  </p>
                  <p className="text-xs mt-1" style={{ color: COLORS.secondary }}>
                    {report.securitySummary}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ToastNotification type={toast.type} message={toast.message} visible={toast.visible} onClose={hideToast} />
    </div>
  );
}