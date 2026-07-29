/**
 * performancegraphs.jsx
 *
 * Displays live CPU, Memory, Disk and Network history as individual
 * Recharts line graphs (via the shared LineChartWidget). History data
 * comes exclusively from SystemStatusContext through the shared
 * `useMetricsHistory` hook (exported by livemonitor.jsx) — no direct
 * api.jsx calls and no duplicate history-tracking logic.
 */

import React from "react";
import { FiCpu, FiServer, FiHardDrive, FiWifi } from "react-icons/fi";

import { COLORS } from "../components/dashboardcomponents.jsx";
import { LineChartWidget, SectionHeader } from "../components/dashboardwidgets.jsx";
import { useMetricsHistory } from "./livemonitor.jsx";

function GraphCard({ title, icon: Icon, accent, data, dataKey, unit }) {
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
        <LineChartWidget
          data={data}
          xKey="timestamp"
          height={200}
          lines={[{ key: dataKey, name: `${title}${unit ? ` (${unit})` : ""}`, color: accent }]}
          emptyMessage="Waiting for history data..."
        />
      </div>
    </div>
  );
}

export default function PerformanceGraphs() {
  const history = useMetricsHistory();

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="Performance Graphs" subtitle="Historical trends for key system metrics." />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <GraphCard
          title="CPU History"
          icon={FiCpu}
          accent={COLORS.brand}
          data={history}
          dataKey="cpu"
          unit="%"
        />
        <GraphCard
          title="Memory History"
          icon={FiServer}
          accent={COLORS.ai}
          data={history}
          dataKey="memory"
          unit="%"
        />
        <GraphCard
          title="Disk History"
          icon={FiHardDrive}
          accent={COLORS.healthy}
          data={history}
          dataKey="disk"
          unit="%"
        />
        <GraphCard
          title="Network History"
          icon={FiWifi}
          accent={COLORS.critical}
          data={history}
          dataKey="network"
          unit="MB"
        />
      </div>
    </div>
  );
}