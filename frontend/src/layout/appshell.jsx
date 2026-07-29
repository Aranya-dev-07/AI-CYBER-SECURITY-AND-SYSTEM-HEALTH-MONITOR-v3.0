/**
 * appshell.jsx
 *
 * Main application shell wrapping the entire Lavender Trinetra
 * dashboard: sidebar navigation, top brand bar, routed page content,
 * and a persistent footer status bar driven by SystemStatusContext.
 */

import React from "react";
import { Outlet } from "react-router-dom";
import { FiSearch } from "react-icons/fi";

import Navigation from "./navigation.jsx";
import { COLORS, StatusBadge } from "../components/dashboardcomponents.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";

const APP_VERSION = "1.0.0";

// ========================================================================
// Footer status item
// ========================================================================

/**
 * @param {{ label: string, online: boolean }} props
 */
function FooterStatusItem({ label, online }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
      <span
        className="h-2 w-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: online ? COLORS.healthy : COLORS.critical }}
      />
      <span style={{ color: COLORS.secondary }}>{label}</span>
    </span>
  );
}

// ========================================================================
// Top brand bar
// ========================================================================

function TopBrandBar() {
  return (
    <header
      className="flex flex-wrap items-center justify-between gap-3 border-b px-4 sm:px-6 py-3"
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
    >
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg sm:text-xl font-semibold tracking-tight" style={{ color: COLORS.text }}>
          <span style={{ color: COLORS.brand }}>∫</span> Lavender Trinetra
        </h1>
        <span className="hidden sm:inline text-xs italic" style={{ color: COLORS.secondary }}>
          observe.learn.protect.
        </span>
      </div>

      <div
        className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs w-full sm:w-auto sm:min-w-[220px]"
        style={{ borderColor: COLORS.cardBorder, backgroundColor: COLORS.background }}
      >
        <FiSearch className="h-3.5 w-3.5 flex-shrink-0" style={{ color: COLORS.secondary }} />
        <input
          type="text"
          placeholder="Search..."
          className="w-full bg-transparent outline-none placeholder:text-slate-500"
          style={{ color: COLORS.text }}
        />
      </div>
    </header>
  );
}

// ========================================================================
// Footer status bar
// ========================================================================

function FooterStatusBar() {
  const { apiStatus, databaseStatus, lastUpdated } = useSystemStatus();

  const formattedTime = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString()
    : "--:--:--";

  return (
    <footer
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t px-4 sm:px-6 py-2.5"
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <span className="text-xs" style={{ color: COLORS.secondary }}>
          Version {APP_VERSION}
        </span>
        <FooterStatusItem label="AI Engine" online={Boolean(apiStatus?.aiAvailable)} />
        <FooterStatusItem label="Database" online={Boolean(databaseStatus?.connected)} />
        <FooterStatusItem label="API" online={Boolean(apiStatus?.online)} />
        <FooterStatusItem label="Monitoring" online={Boolean(apiStatus?.monitoringAvailable)} />
      </div>

      <span className="text-xs whitespace-nowrap" style={{ color: COLORS.secondary }}>
        Last Updated: {formattedTime}
      </span>
    </footer>
  );
}

// ========================================================================
// AppShell
// ========================================================================

/**
 * Wraps the routed application with sidebar navigation, a top brand
 * bar, the main scrollable content area (rendering child routes via
 * <Outlet />), and a persistent footer status bar.
 */
export default function AppShell() {
  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ backgroundColor: COLORS.background }}>
      <Navigation />

      <div className="flex flex-1 flex-col min-w-0">
        <TopBrandBar />

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
          <Outlet />
        </main>

        <FooterStatusBar />
      </div>
    </div>
  );
}