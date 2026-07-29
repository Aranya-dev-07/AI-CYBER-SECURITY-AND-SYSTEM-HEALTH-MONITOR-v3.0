/**
 * database.jsx
 *
 * Displays SQLite database information: connection status, total
 * runs, reports, alerts and storage usage — refreshed automatically.
 * Total runs / reports / alerts are derived from the same shared
 * report dataset used by testruns.jsx and reporthistory.jsx via
 * SystemStatusContext, so this page does not duplicate that fetch.
 * Only storage usage (not derivable from report data) is fetched
 * directly from the database endpoint.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiDatabase,
  FiCheckCircle,
  FiXCircle,
  FiHardDrive,
  FiActivity,
  FiFileText,
  FiAlertTriangle,
  FiRefreshCw,
} from "react-icons/fi";

import { reportsApi } from "../api/api.jsx";
import { COLORS, MetricCard, StatusBadge } from "../components/dashboardcomponents.jsx";
import { SectionHeader, ErrorState } from "../components/dashboardwidgets.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";
import { normalizeReport } from "./testruns.jsx";

const AUTO_REFRESH_MS = 15000;

function formatStorage(value, unitHint) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  const numeric = Number(value);
  if (unitHint === "mb") {
    return numeric >= 1024 ? `${(numeric / 1024).toFixed(2)} GB` : `${numeric.toFixed(2)} MB`;
  }
  const mb = numeric / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(2)} MB`;
}

export default function DatabasePage() {
  const { databaseStatus, refreshDatabaseStatus, reports, setReports } = useSystemStatus();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(reports.length === 0);
  const [error, setError] = useState(null);
  const [storageUsage, setStorageUsage] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const fetchReports = useCallback(async () => {
    try {
      const result = await reportsApi.getHistory({ limit: 200 });
      const list = Array.isArray(result) ? result : result?.reports || [];
      setReports(list.map(normalizeReport));
    } catch (err) {
      setError(err?.message || "Failed to fetch database report data.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStorageUsage = useCallback(async () => {
    try {
      const statsResult = await reportsApi.getDatabaseStatistics();
      if (statsResult?.storage_usage_mb !== undefined) {
        setStorageUsage(formatStorage(statsResult.storage_usage_mb, "mb"));
      } else if (statsResult?.storage_usage_bytes !== undefined) {
        setStorageUsage(formatStorage(statsResult.storage_usage_bytes));
      } else {
        setStorageUsage(null);
      }
    } catch {
      setStorageUsage(null);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([refreshDatabaseStatus?.(), fetchReports(), fetchStorageUsage()]);
    setLastRefreshed(new Date());
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchReports, fetchStorageUsage]);

  useEffect(() => {
    // Reuse shared report data if it was already loaded by testruns.jsx
    // or reporthistory.jsx; otherwise fetch it once here.
    if (reports.length === 0) {
      refreshAll();
    } else {
      fetchStorageUsage();
      setLastRefreshed(new Date());
      setLoading(false);
    }

    const intervalId = setInterval(refreshAll, AUTO_REFRESH_MS);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statistics = useMemo(() => {
    const totalRuns = reports.length;
    const totalReports = reports.length;
    const totalAlerts = reports.reduce((sum, report) => sum + (report.totalAlerts || 0), 0);
    return { totalRuns, totalReports, totalAlerts };
  }, [reports]);

  const isConnected = Boolean(databaseStatus?.connected);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="Database Statistics"
        subtitle="Live SQLite database connection status and storage overview."
        icon={FiDatabase}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/reports#test-runs")}
              className="hidden sm:inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-200 hover:bg-white/5"
              style={{ borderColor: COLORS.cardBorder, color: COLORS.text }}
            >
              View Test Runs
            </button>
            <button
              type="button"
              onClick={refreshAll}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-200 hover:bg-white/5"
              style={{ borderColor: COLORS.cardBorder, color: COLORS.text }}
            >
              <FiRefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        }
      />

      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
        style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: isConnected ? `${COLORS.healthy}1f` : `${COLORS.critical}1f` }}
          >
            {isConnected ? (
              <FiCheckCircle className="h-5 w-5" style={{ color: COLORS.healthy }} />
            ) : (
              <FiXCircle className="h-5 w-5" style={{ color: COLORS.critical }} />
            )}
          </span>
          <div>
            <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
              SQLite Database
            </p>
            <p className="text-xs" style={{ color: COLORS.secondary }}>
              {databaseStatus?.databaseUrl || "Connection string unavailable"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge
            status={isConnected ? "healthy" : "critical"}
            label={isConnected ? "Connected" : "Disconnected"}
            pulse
          />
          {lastRefreshed && (
            <span className="text-xs" style={{ color: COLORS.secondary }}>
              Last refreshed: {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={refreshAll} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total Runs"
            value={statistics.totalRuns}
            icon={FiActivity}
            status="info"
            loading={loading && reports.length === 0}
          />
          <MetricCard
            label="Total Reports"
            value={statistics.totalReports}
            icon={FiFileText}
            status="info"
            loading={loading && reports.length === 0}
          />
          <MetricCard
            label="Total Alerts"
            value={statistics.totalAlerts}
            icon={FiAlertTriangle}
            status={statistics.totalAlerts ? "warning" : "healthy"}
            loading={loading && reports.length === 0}
          />
          <MetricCard
            label="Storage Usage"
            value={storageUsage ?? "--"}
            icon={FiHardDrive}
            status="ai"
            loading={loading && storageUsage === null}
          />
        </div>
      )}
    </div>
  );
}