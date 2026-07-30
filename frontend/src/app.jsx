/**
 * App.jsx
 *
 * Frontend orchestrator for the Lavender Trinetra dashboard. Wires
 * together React Router, AppShell, and SystemStatusContext (the only
 * data layer, itself backed by api.jsx) into a single application:
 *
 *   - SystemStatusProvider owns all communication with the FastAPI
 *     backend (http://localhost:8002) and auto-refreshes on an
 *     interval. App.jsx does not call api.jsx directly — all shared
 *     state flows through the context only.
 *   - A lightweight loading screen is shown until the first backend
 *     status check completes.
 *   - A graceful "backend unavailable" screen is shown if the API is
 *     unreachable, with a retry action.
 *   - AppShell (sidebar + topbar + footer status bar) wraps every
 *     routed page via <Outlet />, so navigation between pages never
 *     triggers a full reload.
 */

import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { FiLoader, FiWifiOff, FiRefreshCw } from "react-icons/fi";

import AppShell from "./layout/appshell.jsx";
import {
  SystemStatusProvider,
  useSystemStatus,
} from "./context/systemstatuscontext.jsx";
import { COLORS, ToastNotification } from "./components/dashboardcomponents.jsx";

import HomePage from "./pages/homepage.jsx";
import Monitoring from "./pages/monitoring.jsx";
import TrinetraAI from "./pages/trinetraai.jsx";
import Reports from "./pages/reports.jsx";
import Settings from "./pages/settings.jsx";

// ========================================================================
// Full-screen loading state (shown until the first backend status
// check completes)
// ========================================================================

function AppLoadingScreen() {
  return (
    <div
      className="flex h-screen w-full flex-col items-center justify-center gap-4"
      style={{ backgroundColor: COLORS.background }}
    >
      <FiLoader className="h-8 w-8 animate-spin" style={{ color: COLORS.brand }} />
      <div className="text-center">
        <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
          <span style={{ color: COLORS.brand }}>∫</span> Lavender Trinetra
        </p>
        <p className="mt-1 text-xs" style={{ color: COLORS.secondary }}>
          Connecting to the backend...
        </p>
      </div>
    </div>
  );
}

// ========================================================================
// Full-screen "backend unavailable" state
// ========================================================================

function BackendUnavailableScreen({ onRetry }) {
  return (
    <div
      className="flex h-screen w-full flex-col items-center justify-center gap-4 px-4 text-center"
      style={{ backgroundColor: COLORS.background }}
    >
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: `${COLORS.critical}1f` }}
      >
        <FiWifiOff className="h-6 w-6" style={{ color: COLORS.critical }} />
      </span>
      <div>
        <p className="text-base font-semibold" style={{ color: COLORS.text }}>
          Unable to reach the Lavender Trinetra backend
        </p>
        <p className="mt-1 max-w-sm text-sm" style={{ color: COLORS.secondary }}>
          The API server at localhost:8002 is not responding. Make sure the
          backend is running, then try again.
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity duration-200 hover:opacity-90"
        style={{ backgroundColor: COLORS.brand, color: "#0f172a" }}
      >
        <FiRefreshCw className="h-4 w-4" />
        Retry Connection
      </button>
    </div>
  );
}

// ========================================================================
// Routed application content
// ========================================================================

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="monitoring" element={<Monitoring />} />
        <Route path="trinetra-ai" element={<TrinetraAI />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

// ========================================================================
// App content: consumes SystemStatusContext to decide which
// full-screen state (loading / error / routed app) to render, and
// surfaces global errors via a single toast.
// ========================================================================

function AppContent() {
  const { apiStatus, error, clearError, refreshAll } = useSystemStatus();

  const hasCheckedOnce = Boolean(apiStatus?.lastChecked);

  if (!hasCheckedOnce) {
    return <AppLoadingScreen />;
  }

  if (!apiStatus?.online) {
    return <BackendUnavailableScreen onRetry={() => refreshAll?.()} />;
  }

  return (
    <>
      <AppRoutes />
      <ToastNotification
        type="critical"
        message={error ?? ""}
        visible={Boolean(error)}
        onClose={clearError}
      />
    </>
  );
}

// ========================================================================
// App (root export)
// ========================================================================

export default function App() {
  return (
    <SystemStatusProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </SystemStatusProvider>
  );
}