/**
 * dashboardcomponents.jsx
 *
 * Reusable, dark-themed dashboard UI primitives for the Lavender
 * Trinetra frontend: MetricCard, StatusBadge, ProgressRing,
 * AlertBadge, ToastNotification, InfoCard.
 *
 * Fixed color palette (do not introduce other colors):
 *   Background : Dark Slate
 *   Cards      : Slightly lighter Slate
 *   Brand      : Lavender
 *   AI         : Magenta
 *   Healthy    : Olive Green
 *   Critical   : Red
 *   Text       : White
 *   Secondary  : Light Gray
 */

import React, { useEffect, useState } from "react";
import {
  FiCheckCircle,
  FiAlertTriangle,
  FiAlertOctagon,
  FiXCircle,
  FiInfo,
  FiX,
  FiLoader,
} from "react-icons/fi";

// ========================================================================
// Shared color tokens (single source of truth for the fixed palette)
// ========================================================================

export const COLORS = Object.freeze({
  background: "#0f172a", // Dark Slate
  card: "#1b2536", // Slightly lighter Slate
  cardBorder: "#2a3448",
  brand: "#b497d6", // Lavender
  ai: "#d946ef", // Magenta
  healthy: "#8a9a5b", // Olive Green
  critical: "#ef4444", // Red
  text: "#ffffff", // White
  secondary: "#a1a8b5", // Light Gray
});

/** Maps a semantic status/severity keyword to a palette color + icon. */
const STATUS_MAP = Object.freeze({
  healthy: { color: COLORS.healthy, icon: FiCheckCircle, label: "Healthy" },
  ok: { color: COLORS.healthy, icon: FiCheckCircle, label: "OK" },
  online: { color: COLORS.healthy, icon: FiCheckCircle, label: "Online" },
  low: { color: COLORS.healthy, icon: FiCheckCircle, label: "Low" },
  info: { color: COLORS.brand, icon: FiInfo, label: "Info" },
  ai: { color: COLORS.ai, icon: FiInfo, label: "AI" },
  medium: { color: COLORS.brand, icon: FiAlertTriangle, label: "Medium" },
  warning: { color: COLORS.brand, icon: FiAlertTriangle, label: "Warning" },
  high: { color: COLORS.critical, icon: FiAlertOctagon, label: "High" },
  critical: { color: COLORS.critical, icon: FiAlertOctagon, label: "Critical" },
  offline: { color: COLORS.critical, icon: FiXCircle, label: "Offline" },
  error: { color: COLORS.critical, icon: FiXCircle, label: "Error" },
});

function resolveStatus(status) {
  const key = String(status || "").toLowerCase();
  return STATUS_MAP[key] || STATUS_MAP.info;
}

// ========================================================================
// MetricCard
// ========================================================================

/**
 * Displays a single system metric (e.g. CPU, Memory, Disk, Network).
 *
 * @param {{
 *   label: string,
 *   value: string|number|null|undefined,
 *   unit?: string,
 *   icon?: React.ComponentType<{ className?: string }>,
 *   status?: "healthy"|"warning"|"critical"|"offline"|"info"|"ai",
 *   loading?: boolean,
 *   subtitle?: string,
 *   className?: string,
 * }} props
 */
export function MetricCard({
  label,
  value,
  unit = "",
  icon: Icon,
  status = "info",
  loading = false,
  subtitle,
  className = "",
}) {
  const { color } = resolveStatus(status);

  return (
    <div
      className={`rounded-xl border border-slate-700/50 bg-[#1b2536] p-4 sm:p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:border-slate-600/60 ${className}`}
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs sm:text-sm font-medium text-slate-300" style={{ color: COLORS.secondary }}>
          {label}
        </span>
        {Icon ? (
          <Icon className="h-5 w-5 flex-shrink-0" style={{ color }} />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-1">
        {loading ? (
          <FiLoader className="h-6 w-6 animate-spin text-slate-500" />
        ) : (
          <>
            <span className="text-2xl sm:text-3xl font-semibold" style={{ color: COLORS.text }}>
              {value ?? "--"}
            </span>
            {unit && (
              <span className="text-sm font-medium" style={{ color: COLORS.secondary }}>
                {unit}
              </span>
            )}
          </>
        )}
      </div>

      {subtitle && !loading && (
        <p className="mt-1 text-xs" style={{ color: COLORS.secondary }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

// ========================================================================
// StatusBadge
// ========================================================================

/**
 * Small pill badge representing a status/severity state.
 *
 * @param {{
 *   status: "healthy"|"warning"|"critical"|"offline"|"info"|"ai"|"medium"|"high"|"low",
 *   label?: string,
 *   pulse?: boolean,
 *   className?: string,
 * }} props
 */
export function StatusBadge({ status = "info", label, pulse = false, className = "" }) {
  const resolved = resolveStatus(status);
  const displayLabel = label ?? resolved.label;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors duration-300 ${className}`}
      style={{
        color: resolved.color,
        borderColor: `${resolved.color}40`,
        backgroundColor: `${resolved.color}1a`,
      }}
    >
      <span className="relative flex h-2 w-2">
        {pulse && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
            style={{ backgroundColor: resolved.color }}
          />
        )}
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{ backgroundColor: resolved.color }}
        />
      </span>
      {displayLabel}
    </span>
  );
}

// ========================================================================
// ProgressRing
// ========================================================================

/**
 * Circular progress indicator, typically used for percentage-based
 * metrics like AI Health Score or Security Score.
 *
 * @param {{
 *   percentage: number,
 *   size?: number,
 *   strokeWidth?: number,
 *   status?: "healthy"|"warning"|"critical"|"info"|"ai",
 *   label?: string,
 *   loading?: boolean,
 *   className?: string,
 * }} props
 */
export function ProgressRing({
  percentage = 0,
  size = 120,
  strokeWidth = 10,
  status = "healthy",
  label,
  loading = false,
  className = "",
}) {
  const clamped = Math.max(0, Math.min(100, Number(percentage) || 0));
  const { color } = resolveStatus(status);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={COLORS.cardBorder}
            strokeWidth={strokeWidth}
          />
          {!loading && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-700 ease-out"
            />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {loading ? (
            <FiLoader className="h-6 w-6 animate-spin text-slate-500" />
          ) : (
            <span className="text-xl font-semibold" style={{ color: COLORS.text }}>
              {clamped}%
            </span>
          )}
        </div>
      </div>

      {label && (
        <span className="mt-2 text-xs font-medium text-center" style={{ color: COLORS.secondary }}>
          {label}
        </span>
      )}
    </div>
  );
}

// ========================================================================
// AlertBadge
// ========================================================================

/**
 * Single alert/notification row for lists such as "Recent Alerts".
 *
 * @param {{
 *   severity?: "low"|"medium"|"high"|"critical",
 *   message: string,
 *   timestamp?: string,
 *   className?: string,
 * }} props
 */
export function AlertBadge({ severity = "medium", message, timestamp, className = "" }) {
  const resolved = resolveStatus(severity);
  const Icon = resolved.icon;

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 transition-colors duration-300 ${className}`}
      style={{
        backgroundColor: `${resolved.color}0d`,
        borderColor: `${resolved.color}33`,
      }}
    >
      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: resolved.color }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm break-words" style={{ color: COLORS.text }}>
          {message}
        </p>
        {timestamp && (
          <p className="mt-0.5 text-xs" style={{ color: COLORS.secondary }}>
            {timestamp}
          </p>
        )}
      </div>
    </div>
  );
}

// ========================================================================
// ToastNotification
// ========================================================================

/**
 * Dismissible toast notification, fixed to the corner of the screen.
 *
 * @param {{
 *   type?: "healthy"|"warning"|"critical"|"info"|"ai",
 *   message: string,
 *   visible: boolean,
 *   onClose?: () => void,
 *   autoDismissMs?: number,
 *   className?: string,
 * }} props
 */
export function ToastNotification({
  type = "info",
  message,
  visible,
  onClose,
  autoDismissMs = 5000,
  className = "",
}) {
  const resolved = resolveStatus(type);
  const Icon = resolved.icon;

  useEffect(() => {
    if (!visible || !autoDismissMs || !onClose) return undefined;
    const timer = setTimeout(() => onClose(), autoDismissMs);
    return () => clearTimeout(timer);
  }, [visible, autoDismissMs, onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 right-5 z-50 flex items-start gap-3 rounded-lg border p-4 shadow-lg transition-all duration-300 ease-out ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      } ${className}`}
      style={{
        backgroundColor: COLORS.card,
        borderColor: `${resolved.color}55`,
        minWidth: "280px",
        maxWidth: "360px",
      }}
    >
      <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: resolved.color }} />
      <p className="flex-1 text-sm" style={{ color: COLORS.text }}>
        {message}
      </p>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss notification"
          className="flex-shrink-0 rounded-md p-1 transition-colors duration-200 hover:bg-white/10"
        >
          <FiX className="h-4 w-4" style={{ color: COLORS.secondary }} />
        </button>
      )}
    </div>
  );
}

/**
 * Lightweight hook for imperatively driving <ToastNotification />.
 * @returns {{ toast: { type: string, message: string, visible: boolean }, showToast: (message: string, type?: string) => void, hideToast: () => void }}
 */
export function useToast() {
  const [toast, setToast] = useState({ type: "info", message: "", visible: false });

  const showToast = (message, type = "info") => {
    setToast({ type, message, visible: true });
  };

  const hideToast = () => {
    setToast((prev) => ({ ...prev, visible: false }));
  };

  return { toast, showToast, hideToast };
}

// ========================================================================
// InfoCard
// ========================================================================

/**
 * Generic titled card with an icon and descriptive text — used for
 * panels like "Root Cause Analysis" or "AI Recommendations" headers.
 *
 * @param {{
 *   title: string,
 *   description?: string,
 *   icon?: React.ComponentType<{ className?: string }>,
 *   accent?: "brand"|"ai"|"healthy"|"critical",
 *   loading?: boolean,
 *   children?: React.ReactNode,
 *   className?: string,
 * }} props
 */
export function InfoCard({
  title,
  description,
  icon: Icon,
  accent = "brand",
  loading = false,
  children,
  className = "",
}) {
  const accentColor = COLORS[accent] || COLORS.brand;

  return (
    <div
      className={`rounded-xl border p-4 sm:p-5 shadow-sm transition-all duration-300 hover:shadow-md ${className}`}
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
    >
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${accentColor}1f` }}
          >
            <Icon className="h-4 w-4" style={{ color: accentColor }} />
          </span>
        )}
        <h3 className="text-sm sm:text-base font-semibold" style={{ color: COLORS.text }}>
          {title}
        </h3>
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2">
          <FiLoader className="h-4 w-4 animate-spin text-slate-500" />
          <span className="text-xs" style={{ color: COLORS.secondary }}>
            Loading...
          </span>
        </div>
      ) : (
        <>
          {description && (
            <p className="mt-2 text-sm leading-relaxed" style={{ color: COLORS.secondary }}>
              {description}
            </p>
          )}
          {children && <div className="mt-3">{children}</div>}
        </>
      )}
    </div>
  );
}

export default {
  COLORS,
  MetricCard,
  StatusBadge,
  ProgressRing,
  AlertBadge,
  ToastNotification,
  useToast,
  InfoCard,
};