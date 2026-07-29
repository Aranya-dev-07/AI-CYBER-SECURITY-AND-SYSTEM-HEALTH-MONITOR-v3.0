/**
 * reports.jsx
 *
 * Reports dashboard page — composes TestRuns, ReportHistory and
 * Database, plus a CSV/PDF export toolbar wired directly to api.jsx.
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiFileText, FiDownload, FiHome } from "react-icons/fi";

import { reportsApi } from "../api/api.jsx";
import { COLORS, StatusBadge, useToast, ToastNotification } from "../components/dashboardcomponents.jsx";
import { SectionHeader } from "../components/dashboardwidgets.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";

import TestRuns from "../reports/testruns.jsx";
import ReportHistory from "../reports/reporthistory.jsx";
import Database from "../reports/database.jsx";

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

export default function Reports() {
  const { apiStatus } = useSystemStatus();
  const { toast, showToast, hideToast } = useToast();
  const [exporting, setExporting] = useState(null);
  const navigate = useNavigate();

  const handleExport = async (format) => {
    setExporting(format);
    try {
      const blob = await reportsApi.exportReport(format);
      const filename = `lavender_trinetra_report.${format}`;
      downloadBlob(blob, filename);
      showToast(`Report exported as ${format.toUpperCase()}.`, "healthy");
    } catch (err) {
      showToast(err?.message || `Failed to export ${format.toUpperCase()} report.`, "critical");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        title="Reports"
        subtitle="Test runs, historical reports, database statistics and exports."
        icon={FiFileText}
        actions={
          <div className="flex items-center gap-2">
            {!apiStatus?.online && <StatusBadge status="critical" label="API Offline" />}
            <button
              type="button"
              onClick={() => navigate("/")}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-200 hover:bg-white/5"
              style={{ borderColor: COLORS.cardBorder, color: COLORS.text }}
            >
              <FiHome className="h-3.5 w-3.5" />
              Dashboard
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

      <div id="test-runs">
        <TestRuns />
      </div>

      <ReportHistory />

      <div id="database-statistics">
        <Database />
      </div>

      <ToastNotification
        type={toast.type}
        message={toast.message}
        visible={toast.visible}
        onClose={hideToast}
      />
    </div>
  );
}