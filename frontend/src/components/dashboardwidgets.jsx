/**
 * dashboardwidgets.jsx
 *
 * Reusable, dark-themed dashboard widgets shared across Monitoring,
 * AI, Cybersecurity and Reports pages: LineChartWidget,
 * AreaChartWidget, BarChartWidget, LivePerformanceGraph,
 * LoadingSpinner, Modal, EmptyState, ErrorState, SectionHeader.
 *
 * Reuses the exact palette tokens from dashboardcomponents.jsx so
 * colors stay pixel-consistent across the whole app.
 */

import React, { useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { FiInbox, FiAlertCircle, FiX, FiRefreshCw, FiLoader } from "react-icons/fi";
import { COLORS } from "./dashboardcomponents.jsx";

// ========================================================================
// Shared chart theming helpers
// ========================================================================

const CHART_PALETTE = [COLORS.brand, COLORS.ai, COLORS.healthy, COLORS.critical];

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div
      className="rounded-lg border px-3 py-2 shadow-lg text-xs"
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
    >
      {label && (
        <p className="mb-1 font-medium" style={{ color: COLORS.text }}>
          {label}
        </p>
      )}
      {payload.map((entry, index) => (
        <p key={`${entry.dataKey}-${index}`} style={{ color: entry.color }}>
          {entry.name}: <span style={{ color: COLORS.text }}>{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

// ========================================================================
// LoadingSpinner (used as a chart-area fallback + standalone)
// ========================================================================

/**
 * @param {{ size?: number, label?: string, className?: string }} props
 */
export function LoadingSpinner({ size = 28, label, className = "" }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-8 ${className}`}>
      <FiLoader className="animate-spin" style={{ width: size, height: size, color: COLORS.brand }} />
      {label && (
        <span className="text-xs" style={{ color: COLORS.secondary }}>
          {label}
        </span>
      )}
    </div>
  );
}

// ========================================================================
// EmptyState
// ========================================================================

/**
 * @param {{
 *   icon?: React.ComponentType<{ className?: string }>,
 *   title?: string,
 *   description?: string,
 *   action?: React.ReactNode,
 *   className?: string,
 * }} props
 */
export function EmptyState({
  icon: Icon = FiInbox,
  title = "No data available",
  description = "There is nothing to display yet.",
  action,
  className = "",
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-10 text-center ${className}`}>
      <Icon className="h-8 w-8" style={{ color: COLORS.secondary }} />
      <p className="text-sm font-medium" style={{ color: COLORS.text }}>
        {title}
      </p>
      {description && (
        <p className="max-w-xs text-xs" style={{ color: COLORS.secondary }}>
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ========================================================================
// ErrorState
// ========================================================================

/**
 * @param {{
 *   message?: string,
 *   onRetry?: () => void,
 *   className?: string,
 * }} props
 */
export function ErrorState({
  message = "Something went wrong while loading this data.",
  onRetry,
  className = "",
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-10 text-center ${className}`}>
      <FiAlertCircle className="h-8 w-8" style={{ color: COLORS.critical }} />
      <p className="max-w-xs text-sm" style={{ color: COLORS.text }}>
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-200 hover:bg-white/5"
          style={{ borderColor: COLORS.cardBorder, color: COLORS.text }}
        >
          <FiRefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}

// ========================================================================
// SectionHeader
// ========================================================================

/**
 * @param {{
 *   title: string,
 *   subtitle?: string,
 *   icon?: React.ComponentType<{ className?: string }>,
 *   actions?: React.ReactNode,
 *   className?: string,
 * }} props
 */
export function SectionHeader({ title, subtitle, icon: Icon, actions, className = "" }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${COLORS.brand}1f` }}
          >
            <Icon className="h-4 w-4" style={{ color: COLORS.brand }} />
          </span>
        )}
        <div>
          <h2 className="text-base sm:text-lg font-semibold" style={{ color: COLORS.text }}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs sm:text-sm" style={{ color: COLORS.secondary }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ========================================================================
// Modal
// ========================================================================

/**
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   title?: string,
 *   children?: React.ReactNode,
 *   footer?: React.ReactNode,
 *   className?: string,
 * }} props
 */
export function Modal({ isOpen, onClose, title, children, footer, className = "" }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative w-full max-w-lg rounded-xl border p-5 shadow-xl transition-all duration-200 ${className}`}
        style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
      >
        <div className="flex items-center justify-between">
          {title && (
            <h3 className="text-base font-semibold" style={{ color: COLORS.text }}>
              {title}
            </h3>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="ml-auto rounded-md p-1 transition-colors duration-200 hover:bg-white/10"
          >
            <FiX className="h-4 w-4" style={{ color: COLORS.secondary }} />
          </button>
        </div>

        <div className="mt-4">{children}</div>

        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// ========================================================================
// LineChartWidget
// ========================================================================

/**
 * @param {{
 *   data: Array<Object>,
 *   xKey?: string,
 *   lines?: Array<{ key: string, name?: string, color?: string }>,
 *   height?: number,
 *   loading?: boolean,
 *   emptyMessage?: string,
 *   className?: string,
 * }} props
 */
export function LineChartWidget({
  data = [],
  xKey = "timestamp",
  lines = [],
  height = 260,
  loading = false,
  emptyMessage = "No chart data available.",
  className = "",
}) {
  if (loading) return <LoadingSpinner className={className} />;
  if (!data.length) return <EmptyState description={emptyMessage} className={className} />;

  return (
    <div className={className} style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} />
          <XAxis dataKey={xKey} stroke={COLORS.secondary} tick={{ fontSize: 11, fill: COLORS.secondary }} />
          <YAxis stroke={COLORS.secondary} tick={{ fontSize: 11, fill: COLORS.secondary }} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12, color: COLORS.secondary }} />
          {lines.map((line, index) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              name={line.name || line.key}
              stroke={line.color || CHART_PALETTE[index % CHART_PALETTE.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ========================================================================
// AreaChartWidget
// ========================================================================

/**
 * @param {{
 *   data: Array<Object>,
 *   xKey?: string,
 *   areas?: Array<{ key: string, name?: string, color?: string }>,
 *   height?: number,
 *   loading?: boolean,
 *   emptyMessage?: string,
 *   className?: string,
 * }} props
 */
export function AreaChartWidget({
  data = [],
  xKey = "timestamp",
  areas = [],
  height = 260,
  loading = false,
  emptyMessage = "No chart data available.",
  className = "",
}) {
  if (loading) return <LoadingSpinner className={className} />;
  if (!data.length) return <EmptyState description={emptyMessage} className={className} />;

  return (
    <div className={className} style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
          <defs>
            {areas.map((area, index) => {
              const color = area.color || CHART_PALETTE[index % CHART_PALETTE.length];
              return (
                <linearGradient key={area.key} id={`fill-${area.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} />
          <XAxis dataKey={xKey} stroke={COLORS.secondary} tick={{ fontSize: 11, fill: COLORS.secondary }} />
          <YAxis stroke={COLORS.secondary} tick={{ fontSize: 11, fill: COLORS.secondary }} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12, color: COLORS.secondary }} />
          {areas.map((area, index) => {
            const color = area.color || CHART_PALETTE[index % CHART_PALETTE.length];
            return (
              <Area
                key={area.key}
                type="monotone"
                dataKey={area.key}
                name={area.name || area.key}
                stroke={color}
                strokeWidth={2}
                fill={`url(#fill-${area.key})`}
                isAnimationActive
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ========================================================================
// BarChartWidget
// ========================================================================

/**
 * @param {{
 *   data: Array<Object>,
 *   xKey?: string,
 *   bars?: Array<{ key: string, name?: string, color?: string }>,
 *   height?: number,
 *   loading?: boolean,
 *   emptyMessage?: string,
 *   className?: string,
 * }} props
 */
export function BarChartWidget({
  data = [],
  xKey = "name",
  bars = [],
  height = 260,
  loading = false,
  emptyMessage = "No chart data available.",
  className = "",
}) {
  if (loading) return <LoadingSpinner className={className} />;
  if (!data.length) return <EmptyState description={emptyMessage} className={className} />;

  return (
    <div className={className} style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} />
          <XAxis dataKey={xKey} stroke={COLORS.secondary} tick={{ fontSize: 11, fill: COLORS.secondary }} />
          <YAxis stroke={COLORS.secondary} tick={{ fontSize: 11, fill: COLORS.secondary }} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: `${COLORS.brand}14` }} />
          <Legend wrapperStyle={{ fontSize: 12, color: COLORS.secondary }} />
          {bars.map((bar, index) => (
            <Bar
              key={bar.key}
              dataKey={bar.key}
              name={bar.name || bar.key}
              fill={bar.color || CHART_PALETTE[index % CHART_PALETTE.length]}
              radius={[4, 4, 0, 0]}
              isAnimationActive
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ========================================================================
// LivePerformanceGraph
// ========================================================================

/**
 * Combined, continuously-updating CPU / Memory / Disk / Network area
 * chart used on the Home and Monitoring pages.
 *
 * @param {{
 *   data: Array<{ timestamp: string, cpu?: number, memory?: number, disk?: number, network?: number }>,
 *   height?: number,
 *   loading?: boolean,
 *   emptyMessage?: string,
 *   className?: string,
 * }} props
 */
export function LivePerformanceGraph({
  data = [],
  height = 300,
  loading = false,
  emptyMessage = "Waiting for live monitoring data...",
  className = "",
}) {
  if (loading) return <LoadingSpinner label="Loading live metrics..." className={className} />;
  if (!data.length) return <EmptyState description={emptyMessage} className={className} />;

  return (
    <div className={className} style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="fill-cpu" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.brand} stopOpacity={0.35} />
              <stop offset="95%" stopColor={COLORS.brand} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fill-memory" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.ai} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS.ai} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fill-disk" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.healthy} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS.healthy} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fill-network" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.critical} stopOpacity={0.25} />
              <stop offset="95%" stopColor={COLORS.critical} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} />
          <XAxis
            dataKey="timestamp"
            stroke={COLORS.secondary}
            tick={{ fontSize: 11, fill: COLORS.secondary }}
          />
          <YAxis stroke={COLORS.secondary} tick={{ fontSize: 11, fill: COLORS.secondary }} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12, color: COLORS.secondary }} />
          <Area
            type="monotone"
            dataKey="cpu"
            name="CPU %"
            stroke={COLORS.brand}
            strokeWidth={2}
            fill="url(#fill-cpu)"
            isAnimationActive
          />
          <Area
            type="monotone"
            dataKey="memory"
            name="Memory %"
            stroke={COLORS.ai}
            strokeWidth={2}
            fill="url(#fill-memory)"
            isAnimationActive
          />
          <Area
            type="monotone"
            dataKey="disk"
            name="Disk %"
            stroke={COLORS.healthy}
            strokeWidth={2}
            fill="url(#fill-disk)"
            isAnimationActive
          />
          <Area
            type="monotone"
            dataKey="network"
            name="Network"
            stroke={COLORS.critical}
            strokeWidth={2}
            fill="url(#fill-network)"
            isAnimationActive
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default {
  LineChartWidget,
  AreaChartWidget,
  BarChartWidget,
  LivePerformanceGraph,
  LoadingSpinner,
  Modal,
  EmptyState,
  ErrorState,
  SectionHeader,
};