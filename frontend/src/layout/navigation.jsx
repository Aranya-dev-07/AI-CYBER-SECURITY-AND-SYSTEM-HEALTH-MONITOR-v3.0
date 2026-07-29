/**
 * navigation.jsx
 *
 * Complete dashboard navigation for the Lavender Trinetra frontend:
 * a collapsible sidebar (default export, drops directly into
 * AppShell's sidebar slot) plus a reusable Topbar (title, search,
 * live date/time) exported separately for composition.
 */

import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  FaHouse,
  FaChartLine,
  FaBrain,
  FaShieldHalved,
  FaFileLines,
  FaGear,
  FaMagnifyingGlass,
} from "react-icons/fa6";

import { COLORS } from "../components/dashboardcomponents.jsx";

// ========================================================================
// Nav items
// ========================================================================

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: FaHouse, end: true },
  { to: "/monitoring", label: "Monitoring", icon: FaChartLine },
  { to: "/trinetra-ai", label: "Trinetra AI", icon: FaBrain },
  { to: "/cybersecurity", label: "Cybersecurity", icon: FaShieldHalved },
  { to: "/reports", label: "Reports", icon: FaFileLines },
  { to: "/settings", label: "Settings", icon: FaGear },
];

// ========================================================================
// Sidebar (default export — used as AppShell's sidebar column)
// ========================================================================

/**
 * Collapsible sidebar navigation.
 *
 * @param {{ className?: string }} props
 */
export default function Navigation({ className = "" }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex h-screen flex-col border-r transition-all duration-300 ease-in-out ${
        collapsed ? "w-16" : "w-60"
      } ${className}`}
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-4"
        style={{ borderColor: COLORS.cardBorder }}
      >
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight" style={{ color: COLORS.text }}>
            <span style={{ color: COLORS.brand }}>∫</span> Trinetra
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-sm transition-colors duration-200 hover:bg-white/10"
          style={{ color: COLORS.secondary }}
        >
          {collapsed ? "\u203A" : "\u2039"}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                    collapsed ? "justify-center" : ""
                  }`
                }
                style={({ isActive }) => ({
                  color: isActive ? COLORS.text : COLORS.secondary,
                  backgroundColor: isActive ? `${COLORS.brand}26` : "transparent",
                  borderLeft: isActive ? `3px solid ${COLORS.brand}` : "3px solid transparent",
                })}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

// ========================================================================
// Topbar (named export — title, search, live date/time)
// ========================================================================

/**
 * Compact top navigation bar with project title, a search input, and
 * a live-updating current date/time display.
 *
 * @param {{ onSearch?: (query: string) => void, className?: string }} props
 */
export function Topbar({ onSearch, className = "" }) {
  const [now, setNow] = useState(new Date());
  const [query, setQuery] = useState("");

  useEffect(() => {
    const intervalId = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(intervalId);
  }, []);

  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timeLabel = now.toLocaleTimeString();

  const handleSubmit = (event) => {
    event.preventDefault();
    onSearch?.(query);
  };

  return (
    <header
      className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 sm:px-6 py-3 ${className}`}
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

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs w-full sm:w-auto sm:min-w-[220px] order-3 sm:order-2"
        style={{ borderColor: COLORS.cardBorder, backgroundColor: COLORS.background }}
      >
        <FaMagnifyingGlass className="h-3.5 w-3.5 flex-shrink-0" style={{ color: COLORS.secondary }} />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search..."
          className="w-full bg-transparent outline-none placeholder:text-slate-500"
          style={{ color: COLORS.text }}
        />
      </form>

      <div className="flex flex-col items-end text-right order-2 sm:order-3">
        <span className="text-xs sm:text-sm font-medium" style={{ color: COLORS.text }}>
          {dateLabel}
        </span>
        <span className="text-xs" style={{ color: COLORS.secondary }}>
          {timeLabel}
        </span>
      </div>
    </header>
  );
}