/**
 * threatcenter.jsx
 *
 * Central threat monitoring interface: Detected Threats, Intrusion
 * Events, Vulnerabilities and Suspicious Activities, with severity
 * filtering, category filtering, search, and a card/timeline view
 * toggle. All threat data comes exclusively from
 * SystemStatusContext's `cybersecurityStatus.threats` — this
 * component makes no direct api.jsx calls of its own. "Refresh"
 * simply invokes the context's existing `refreshCybersecurityStatus`
 * action, which is the single place api.jsx is called for this data.
 *
 * Compatible with App.jsx / React Router: exposes id="threat-center"
 * so it can be deep-linked/scrolled to from other pages (e.g.
 * securityoverview.jsx, pages/cybersecurity.jsx) via useNavigate.
 */

import React, { useMemo, useState } from "react";
import {
  FiShield,
  FiAlertOctagon,
  FiAlertTriangle,
  FiEye,
  FiClock,
  FiFilter,
  FiSearch,
  FiRefreshCw,
  FiList,
} from "react-icons/fi";

import { COLORS, StatusBadge } from "../components/dashboardcomponents.jsx";
import { SectionHeader, EmptyState, LoadingSpinner } from "../components/dashboardwidgets.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";

const SEVERITY_FILTERS = ["all", "low", "medium", "high", "critical"];
const CATEGORY_FILTERS = [
  { value: "all", label: "All Categories" },
  { value: "intrusion", label: "Intrusion Events" },
  { value: "vulnerability", label: "Vulnerabilities" },
  { value: "suspicious", label: "Suspicious Activities" },
  { value: "general", label: "General Threats" },
];

function categorize(threat) {
  const pattern = String(threat.pattern || "").toLowerCase();
  if (pattern.includes("recon") || pattern.includes("intrusion") || pattern.includes("firewall_weakness")) {
    return "intrusion";
  }
  if (pattern.includes("firewall") || pattern.includes("unexpected_open_port") || pattern.includes("high_risk_port")) {
    return "vulnerability";
  }
  if (pattern.includes("malicious_process") || pattern.includes("suspicious") || pattern.includes("bruteforce")) {
    return "suspicious";
  }
  return "general";
}

function severityToStatus(severity) {
  const normalized = String(severity || "").toLowerCase();
  if (normalized === "critical" || normalized === "high") return "critical";
  if (normalized === "medium") return "warning";
  if (normalized === "low") return "healthy";
  return "info";
}

function categoryIcon(category) {
  if (category === "intrusion") return FiAlertOctagon;
  if (category === "vulnerability") return FiShield;
  if (category === "suspicious") return FiEye;
  return FiAlertTriangle;
}

function ThreatCard({ threat }) {
  const category = categorize(threat);
  const Icon = categoryIcon(category);
  const status = severityToStatus(threat.severity);

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border p-3"
      style={{ backgroundColor: COLORS.background, borderColor: COLORS.cardBorder }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: COLORS.critical }} />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: COLORS.text }}>
              {threat.title ?? threat.threat_id}
            </p>
            <p className="text-[11px] uppercase tracking-wide" style={{ color: COLORS.secondary }}>
              {category}
            </p>
          </div>
        </div>
        <StatusBadge status={status} label={threat.severity ?? "info"} />
      </div>
      <p className="text-xs" style={{ color: COLORS.secondary }}>
        {threat.description}
      </p>
      {threat.confidence_score !== undefined && (
        <p className="text-[11px]" style={{ color: COLORS.secondary }}>
          Confidence: {Math.round((threat.confidence_score ?? 0) * 100)}%
        </p>
      )}
    </div>
  );
}

export default function ThreatCenter({ data, loading }) {
  const context = useSystemStatus();

  const cybersecurityStatus = data ?? context.cybersecurityStatus;
  const isLoading = loading ?? (Boolean(context.loading?.security) && !context.cybersecurityStatus);
  const isRefreshing = Boolean(context.loading?.security);

  const [severityFilter, setSeverityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("cards");

  const threats = cybersecurityStatus?.threats?.threats ?? [];

  const filteredThreats = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return threats.filter((threat) => {
      const matchesSeverity =
        severityFilter === "all" || String(threat.severity).toLowerCase() === severityFilter;
      const matchesCategory = categoryFilter === "all" || categorize(threat) === categoryFilter;
      const matchesSearch =
        !query ||
        (threat.title ?? "").toLowerCase().includes(query) ||
        (threat.description ?? "").toLowerCase().includes(query);
      return matchesSeverity && matchesCategory && matchesSearch;
    });
  }, [threats, severityFilter, categoryFilter, searchQuery]);

  const sortedForTimeline = useMemo(
    () =>
      [...filteredThreats].sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      }),
    [filteredThreats]
  );

  return (
    <div
      id="threat-center"
      className="rounded-xl border p-4 sm:p-5 flex flex-col gap-5 scroll-mt-24"
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
    >
      <SectionHeader
        title="Threat Center"
        subtitle="Detected threats, intrusion events, vulnerabilities and suspicious activity."
        icon={FiShield}
        actions={
          <button
            type="button"
            onClick={() => context.refreshCybersecurityStatus?.()}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity duration-200 hover:opacity-90"
            style={{ backgroundColor: COLORS.brand, color: "#0f172a" }}
          >
            <FiRefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3">
        <div
          className="flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm min-w-[200px]"
          style={{ backgroundColor: COLORS.background, borderColor: COLORS.cardBorder }}
        >
          <FiSearch className="h-4 w-4 flex-shrink-0" style={{ color: COLORS.secondary }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search threats..."
            className="w-full bg-transparent outline-none placeholder:text-slate-500"
            style={{ color: COLORS.text }}
          />
        </div>

        <div
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          style={{ backgroundColor: COLORS.background, borderColor: COLORS.cardBorder }}
        >
          <FiFilter className="h-4 w-4 flex-shrink-0" style={{ color: COLORS.secondary }} />
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-transparent outline-none"
            style={{ color: COLORS.text, colorScheme: "dark" }}
          >
            {SEVERITY_FILTERS.map((level) => (
              <option key={level} value={level} style={{ backgroundColor: COLORS.card }}>
                {level === "all" ? "All Severities" : level.charAt(0).toUpperCase() + level.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          style={{ backgroundColor: COLORS.background, borderColor: COLORS.cardBorder }}
        >
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-transparent outline-none"
            style={{ color: COLORS.text, colorScheme: "dark" }}
          >
            {CATEGORY_FILTERS.map((option) => (
              <option key={option.value} value={option.value} style={{ backgroundColor: COLORS.card }}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: COLORS.cardBorder }}>
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-200"
            style={{
              backgroundColor: viewMode === "cards" ? `${COLORS.brand}26` : "transparent",
              color: viewMode === "cards" ? COLORS.text : COLORS.secondary,
            }}
          >
            <FiList className="h-3.5 w-3.5" />
            Cards
          </button>
          <button
            type="button"
            onClick={() => setViewMode("timeline")}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-200"
            style={{
              backgroundColor: viewMode === "timeline" ? `${COLORS.brand}26` : "transparent",
              color: viewMode === "timeline" ? COLORS.text : COLORS.secondary,
            }}
          >
            <FiClock className="h-3.5 w-3.5" />
            Timeline
          </button>
        </div>
      </div>

      {/* Threat list */}
      {isLoading ? (
        <LoadingSpinner label="Loading threat data..." />
      ) : filteredThreats.length === 0 ? (
        <EmptyState title="No threats found" description="No threats match your current filters." />
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredThreats.map((threat, index) => (
            <ThreatCard key={threat.threat_id ?? index} threat={threat} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col">
          {sortedForTimeline.map((threat, index) => (
            <div key={threat.threat_id ?? index} className="relative flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2"
                  style={{ backgroundColor: COLORS.card, borderColor: COLORS.critical }}
                >
                  <FiAlertTriangle className="h-3 w-3" style={{ color: COLORS.critical }} />
                </span>
                {index !== sortedForTimeline.length - 1 && (
                  <span className="w-px flex-1" style={{ backgroundColor: COLORS.cardBorder }} />
                )}
              </div>
              <div className="mb-4 flex-1">
                <ThreatCard threat={threat} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}