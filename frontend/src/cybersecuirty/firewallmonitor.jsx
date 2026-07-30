/**
 * firewallmonitor.jsx
 *
 * Displays firewall and network protection status: Firewall Status,
 * Open Ports, Network Rules and Security Configuration. All data
 * (including the security score) comes exclusively from
 * SystemStatusContext's `cybersecurityStatus` — this component makes
 * no direct api.jsx calls of its own. "Refresh" simply invokes the
 * context's existing `refreshCybersecurityStatus` action, which is
 * the single place api.jsx is called for this data.
 *
 * Compatible with App.jsx / React Router: exposes id="firewall-monitor"
 * so it can be deep-linked/scrolled to from other pages (e.g.
 * securityoverview.jsx, pages/cybersecurity.jsx) via useNavigate.
 */

import React from "react";
import { FiShield, FiWifi, FiLock, FiAlertTriangle, FiRefreshCw, FiSettings } from "react-icons/fi";

import { COLORS, StatusBadge, AlertBadge } from "../components/dashboardcomponents.jsx";
import { SectionHeader, EmptyState, LoadingSpinner } from "../components/dashboardwidgets.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";

function severityToStatus(severity) {
  const normalized = String(severity || "").toLowerCase();
  if (normalized === "critical" || normalized === "high") return "critical";
  if (normalized === "medium") return "warning";
  if (normalized === "low") return "healthy";
  return "info";
}

export default function FirewallMonitor({ data, loading }) {
  const context = useSystemStatus();

  const cybersecurityStatus = data ?? context.cybersecurityStatus;
  const isLoading = loading ?? (Boolean(context.loading?.security) && !context.cybersecurityStatus);
  const isRefreshing = Boolean(context.loading?.security);

  const securityScore =
    cybersecurityStatus?.security_score ?? cybersecurityStatus?.summary?.security_score ?? null;

  const firewall = cybersecurityStatus?.firewall ?? {};
  const network = cybersecurityStatus?.network ?? {};

  const backends = firewall.backends ?? [];
  const firewallEvents = firewall.events ?? [];
  const listeningPorts = network.listening_ports ?? [];
  const networkEvents = network.events ?? [];

  const portEvents = networkEvents.filter((event) => event.local_port !== null && event.local_port !== undefined);
  const ruleEvents = networkEvents.filter((event) => event.local_port === null || event.local_port === undefined);

  const flaggedPorts = new Set(portEvents.map((event) => event.local_port));

  return (
    <div
      id="firewall-monitor"
      className="rounded-xl border p-4 sm:p-5 flex flex-col gap-5 scroll-mt-24"
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
    >
      <SectionHeader
        title="Firewall Monitor"
        subtitle="Firewall status, open ports, network rules and security configuration."
        icon={FiShield}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge
              status={firewall.firewall_enabled ? "healthy" : "critical"}
              label={firewall.firewall_enabled ? "Firewall Active" : "Firewall Inactive"}
            />
            <button
              type="button"
              onClick={() => context.refreshCybersecurityStatus?.()}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-200 hover:bg-white/5"
              style={{ borderColor: COLORS.cardBorder, color: COLORS.text }}
            >
              <FiRefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        }
      />

      {isLoading ? (
        <LoadingSpinner label="Loading firewall status..." />
      ) : (
        <>
          {securityScore !== null && (
            <div
              className="flex items-center justify-between rounded-lg border p-3"
              style={{ backgroundColor: COLORS.background, borderColor: COLORS.cardBorder }}
            >
              <span className="text-xs" style={{ color: COLORS.secondary }}>
                Security Score
              </span>
              <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
                {securityScore}%
              </span>
            </div>
          )}

          {/* Firewall Status */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FiLock className="h-4 w-4" style={{ color: COLORS.brand }} />
              <p className="text-xs font-medium" style={{ color: COLORS.secondary }}>
                Firewall Status
              </p>
            </div>
            {backends.length === 0 ? (
              <EmptyState title="No firewall backend detected" description="No supported firewall tooling was found on this system." />
            ) : (
              <ul className="flex flex-col gap-2">
                {backends.map((backend, index) => (
                  <li
                    key={index}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                    style={{ backgroundColor: COLORS.background }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm truncate" style={{ color: COLORS.text }}>
                        {backend.name}
                      </p>
                      {backend.detail && (
                        <p className="text-xs truncate" style={{ color: COLORS.secondary }}>
                          {backend.detail}
                        </p>
                      )}
                    </div>
                    <StatusBadge
                      status={backend.enabled ? "healthy" : backend.available ? "warning" : "critical"}
                      label={backend.enabled ? "Enabled" : backend.available ? "Disabled" : "Unavailable"}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Open Ports */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FiWifi className="h-4 w-4" style={{ color: COLORS.ai }} />
              <p className="text-xs font-medium" style={{ color: COLORS.secondary }}>
                Open Ports
              </p>
            </div>
            {listeningPorts.length === 0 ? (
              <EmptyState title="No open ports detected" description="No listening ports were found." />
            ) : (
              <div className="overflow-x-auto rounded-lg border" style={{ borderColor: COLORS.cardBorder }}>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: COLORS.cardBorder }}>
                      {["Port", "Address", "Process", "Status"].map((heading) => (
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
                    {listeningPorts.map((port, index) => {
                      const flagged = flaggedPorts.has(port.port);
                      return (
                        <tr key={index} className="border-b last:border-b-0" style={{ borderColor: COLORS.cardBorder }}>
                          <td className="px-3 py-2 font-medium" style={{ color: COLORS.text }}>
                            {port.port}
                          </td>
                          <td className="px-3 py-2" style={{ color: COLORS.secondary }}>
                            {port.address}
                          </td>
                          <td className="px-3 py-2" style={{ color: COLORS.secondary }}>
                            {port.process_name ?? "--"}
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge
                              status={flagged ? "critical" : "healthy"}
                              label={flagged ? "Flagged" : "Normal"}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Network Rules */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FiAlertTriangle className="h-4 w-4" style={{ color: COLORS.critical }} />
              <p className="text-xs font-medium" style={{ color: COLORS.secondary }}>
                Network Rules &amp; Alerts
              </p>
            </div>
            {ruleEvents.length === 0 && portEvents.length === 0 ? (
              <EmptyState title="No network alerts" description="No unusual network activity detected." />
            ) : (
              <div className="flex flex-col gap-2">
                {[...portEvents, ...ruleEvents].map((event, index) => (
                  <AlertBadge
                    key={index}
                    severity={severityToStatus(event.severity)}
                    message={event.description}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Security Configuration */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FiSettings className="h-4 w-4" style={{ color: COLORS.healthy }} />
              <p className="text-xs font-medium" style={{ color: COLORS.secondary }}>
                Security Configuration
              </p>
            </div>
            {firewallEvents.length === 0 ? (
              <EmptyState
                title="No configuration issues"
                description="Firewall configuration appears healthy."
              />
            ) : (
              <div className="flex flex-col gap-2">
                {firewallEvents.map((event, index) => (
                  <AlertBadge
                    key={index}
                    severity={severityToStatus(event.severity)}
                    message={event.description}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}