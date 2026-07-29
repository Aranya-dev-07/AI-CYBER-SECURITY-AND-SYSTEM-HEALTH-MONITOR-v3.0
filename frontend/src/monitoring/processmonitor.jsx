/**
 * processmonitor.jsx
 *
 * Displays the top 5 CPU-consuming and top 5 memory-consuming
 * processes, with Start/Stop controls for live polling. Process data
 * comes exclusively from SystemStatusContext's `cybersecurityStatus`
 * (which is populated by api.jsx's securityApi.getSnapshot() at the
 * context level) — this component makes no direct api.jsx calls of
 * its own, avoiding duplicate fetch logic. Start/Stop and Refresh
 * simply invoke the context's existing `refreshCybersecurityStatus`
 * action.
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiCpu, FiServer, FiPlay, FiPause, FiRefreshCw, FiShield } from "react-icons/fi";

import { COLORS } from "../components/dashboardcomponents.jsx";
import { SectionHeader, LoadingSpinner, EmptyState } from "../components/dashboardwidgets.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";

const POLL_INTERVAL_MS = 5000;

function normalizeProcess(raw, index) {
  return {
    rank: index + 1,
    pid: raw.pid ?? "--",
    name: raw.name ?? "unknown",
    cpuPercent: raw.cpu_percent ?? raw.cpuPercent ?? null,
    memoryPercent: raw.memory_percent ?? raw.memoryPercent ?? null,
  };
}

function ProcessList({ title, icon: Icon, accent, processes, valueKey, unit }) {
  return (
    <div
      className="rounded-xl border p-4 sm:p-5"
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}1f` }}
        >
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </span>
        <h3 className="text-sm sm:text-base font-semibold" style={{ color: COLORS.text }}>
          {title}
        </h3>
      </div>

      <div className="mt-3">
        {processes.length === 0 ? (
          <EmptyState title="No process data" description="No process metrics available yet." />
        ) : (
          <ul className="flex flex-col gap-2">
            {processes.map((proc) => (
              <li
                key={`${proc.pid}-${proc.rank}`}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                style={{ backgroundColor: COLORS.background }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    style={{ backgroundColor: `${accent}26`, color: accent }}
                  >
                    {proc.rank}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm truncate" style={{ color: COLORS.text }}>
                      {proc.name}
                    </p>
                    <p className="text-xs" style={{ color: COLORS.secondary }}>
                      PID {proc.pid}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-semibold flex-shrink-0" style={{ color: accent }}>
                  {proc[valueKey] !== null && proc[valueKey] !== undefined ? proc[valueKey] : "--"}
                  {unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function ProcessMonitor() {
  const { cybersecurityStatus, loading, refreshCybersecurityStatus } = useSystemStatus();
  const navigate = useNavigate();
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    if (!isMonitoring) return undefined;
    const intervalId = setInterval(() => {
      refreshCybersecurityStatus?.();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isMonitoring, refreshCybersecurityStatus]);

  const topCpu = (cybersecurityStatus?.process?.top_cpu_processes ?? [])
    .slice(0, 5)
    .map(normalizeProcess);
  const topMemory = (cybersecurityStatus?.process?.top_memory_processes ?? [])
    .slice(0, 5)
    .map(normalizeProcess);

  const isLoading = Boolean(loading?.security) && !cybersecurityStatus;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Process Monitor"
        subtitle={isMonitoring ? "Live polling every 5 seconds" : "Live polling paused"}
        icon={FiCpu}
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
              onClick={() => refreshCybersecurityStatus?.()}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-200 hover:bg-white/5"
              style={{ borderColor: COLORS.cardBorder, color: COLORS.text }}
            >
              <FiRefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            {isMonitoring ? (
              <button
                type="button"
                onClick={() => setIsMonitoring(false)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity duration-200 hover:opacity-90"
                style={{ backgroundColor: COLORS.critical, color: "#0f172a" }}
              >
                <FiPause className="h-3.5 w-3.5" />
                Stop Monitoring
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsMonitoring(true)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity duration-200 hover:opacity-90"
                style={{ backgroundColor: COLORS.brand, color: "#0f172a" }}
              >
                <FiPlay className="h-3.5 w-3.5" />
                Start Monitoring
              </button>
            )}
          </div>
        }
      />

      {isLoading ? (
        <LoadingSpinner label="Loading process data..." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ProcessList
            title="Top 5 CPU Processes"
            icon={FiCpu}
            accent={COLORS.brand}
            processes={topCpu}
            valueKey="cpuPercent"
            unit="%"
          />
          <ProcessList
            title="Top 5 Memory Processes"
            icon={FiServer}
            accent={COLORS.ai}
            processes={topMemory}
            valueKey="memoryPercent"
            unit="%"
          />
        </div>
      )}
    </div>
  );
}