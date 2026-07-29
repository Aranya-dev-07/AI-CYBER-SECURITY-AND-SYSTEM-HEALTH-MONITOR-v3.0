/**
 * monitoring.jsx
 *
 * Monitoring dashboard page — composes LiveMonitor, ProcessMonitor
 * and PerformanceGraphs into a single responsive layout. All system
 * data flows in through SystemStatusContext (populated via api.jsx);
 * this page makes no direct API calls itself.
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import { FiActivity, FiFileText } from "react-icons/fi";

import { COLORS, StatusBadge } from "../components/dashboardcomponents.jsx";
import { SectionHeader } from "../components/dashboardwidgets.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";

import LiveMonitor from "../monitoring/livemonitor.jsx";
import ProcessMonitor from "../monitoring/processmonitor.jsx";
import PerformanceGraphs from "../monitoring/performancegraphs.jsx";

export default function Monitoring() {
  const { apiStatus } = useSystemStatus();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Monitoring"
        subtitle="Live system metrics, running processes and historical performance."
        icon={FiActivity}
        actions={
          <div className="flex items-center gap-2">
            {!apiStatus?.monitoringAvailable && (
              <StatusBadge status="critical" label="Monitoring Offline" />
            )}
            <button
              type="button"
              onClick={() => navigate("/reports")}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-200 hover:bg-white/5"
              style={{ borderColor: COLORS.cardBorder, color: COLORS.text }}
            >
              <FiFileText className="h-3.5 w-3.5" />
              View Reports
            </button>
          </div>
        }
      />

      <LiveMonitor />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <PerformanceGraphs />
        <ProcessMonitor />
      </div>
    </div>
  );
}