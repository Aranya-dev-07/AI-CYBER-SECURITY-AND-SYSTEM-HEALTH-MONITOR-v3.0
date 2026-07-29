/**
 * livemonitor.jsx
 *
 * Displays live CPU, Memory, Disk and Network usage as responsive
 * metric cards, auto-refreshing via SystemStatusContext (which polls
 * the backend on an interval and re-renders consumers reactively).
 *
 * Also exports `useMetricsHistory`, a small shared hook that turns
 * the context's latest metric snapshot into a rolling history array.
 * homepage.jsx and performancegraphs.jsx both import this hook
 * instead of each maintaining their own duplicate history logic.
 */

import React, { useEffect, useState } from "react";
import { FiCpu, FiServer, FiHardDrive, FiWifi } from "react-icons/fi";

import { COLORS, MetricCard } from "../components/dashboardcomponents.jsx";
import { SectionHeader } from "../components/dashboardwidgets.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";

const DEFAULT_MAX_HISTORY_POINTS = 30;

function bytesToMb(bytes) {
  if (bytes === null || bytes === undefined) return null;
  return Number((bytes / (1024 * 1024)).toFixed(2));
}

export function metricStatus(percent, warnAt = 75, criticalAt = 90) {
  if (percent === null || percent === undefined) return "info";
  if (percent >= criticalAt) return "critical";
  if (percent >= warnAt) return "warning";
  return "healthy";
}

/**
 * Shared hook: derives a rolling in-memory history of CPU/Memory/Disk/
 * Network readings from SystemStatusContext's latest `systemMetrics`
 * snapshot. The context itself is the only data source (no direct
 * api.jsx calls here) — this hook just reshapes what the context
 * already polls into a chart-friendly array.
 *
 * @param {number} maxPoints
 * @returns {Array<{ timestamp: string, cpu: number|null, memory: number|null, disk: number|null, network: number|null }>}
 */
export function useMetricsHistory(maxPoints = DEFAULT_MAX_HISTORY_POINTS) {
  const { systemMetrics } = useSystemStatus();
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!systemMetrics) return;

    const cpuPercent = systemMetrics.cpu?.cpu_percent ?? null;
    const memoryPercent = systemMetrics.memory?.virtual_memory?.percent ?? null;

    const partitions = systemMetrics.disk?.partitions ?? [];
    const diskPercent = partitions.length
      ? Number(
          (partitions.reduce((sum, p) => sum + (p.percent ?? 0), 0) / partitions.length).toFixed(1)
        )
      : null;

    const networkSentMb = bytesToMb(systemMetrics.network?.total_io?.bytes_sent);

    const point = {
      timestamp: new Date().toLocaleTimeString(),
      cpu: cpuPercent,
      memory: memoryPercent,
      disk: diskPercent,
      network: networkSentMb,
    };

    setHistory((prev) => [...prev, point].slice(-maxPoints));
  }, [systemMetrics, maxPoints]);

  return history;
}

export default function LiveMonitor() {
  const { systemMetrics, loading, lastUpdated } = useSystemStatus();

  const cpuPercent = systemMetrics?.cpu?.cpu_percent ?? null;
  const memoryPercent = systemMetrics?.memory?.virtual_memory?.percent ?? null;

  const diskPartitions = systemMetrics?.disk?.partitions ?? [];
  const diskPercent = diskPartitions.length
    ? Number(
        (
          diskPartitions.reduce((sum, p) => sum + (p.percent ?? 0), 0) / diskPartitions.length
        ).toFixed(1)
      )
    : null;

  const networkIo = systemMetrics?.network?.total_io ?? null;
  const networkHealthy = Boolean(networkIo);

  const isLoading = Boolean(loading?.metrics) && !systemMetrics;
  const lastUpdatedLabel = lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "--:--:--";

  return (
    <div
      className="rounded-xl border p-4 sm:p-5"
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
    >
      <SectionHeader
        title="Live Metrics"
        subtitle={`Last updated: ${lastUpdatedLabel}`}
        icon={FiCpu}
      />

      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="CPU"
          value={cpuPercent ?? "--"}
          unit={cpuPercent !== null ? "%" : ""}
          icon={FiCpu}
          status={metricStatus(cpuPercent)}
          loading={isLoading}
        />
        <MetricCard
          label="Memory"
          value={memoryPercent ?? "--"}
          unit={memoryPercent !== null ? "%" : ""}
          icon={FiServer}
          status={metricStatus(memoryPercent)}
          loading={isLoading}
        />
        <MetricCard
          label="Disk"
          value={diskPercent ?? "--"}
          unit={diskPercent !== null ? "%" : ""}
          icon={FiHardDrive}
          status={metricStatus(diskPercent)}
          loading={isLoading}
        />
        <MetricCard
          label="Network"
          value={networkHealthy ? "Healthy" : "Unknown"}
          icon={FiWifi}
          status={networkHealthy ? "healthy" : "info"}
          loading={isLoading}
        />
      </div>
    </div>
  );
}