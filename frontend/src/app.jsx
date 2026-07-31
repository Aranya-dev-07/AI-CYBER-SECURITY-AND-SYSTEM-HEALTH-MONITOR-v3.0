/**
 * App.jsx
 *
 * Frontend orchestrator for the Lavender Trinetra dashboard.
 *
 * On mount, fetches directly from api/Api.jsx:
 *   - GET /api/status              (getApplicationStatus)
 *   - GET /api/monitoring/snapshot (monitoringApi.getSnapshot)
 *   - GET /api/security/snapshot   (securityApi.getSnapshot)
 *   - GET /api/ai/health-score     (aiApi.getHealthScore)
 *
 * to gate an initial loading screen / friendly error screen before
 * rendering the real dashboard. Once initialized, SystemStatusContext
 * (SystemStatusProvider) takes over as the ongoing, auto-refreshing
 * data layer for every page — App.jsx does not duplicate that polling,
 * it only performs the one-time startup check described above.
 *
 * Layout: AppShell (sidebar + topbar + footer status bar) wraps every
 * routed page via <Outlet />, so navigation between pages never
 * triggers a full reload.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { FiLoader, FiWifiOff, FiRefreshCw } from "react-icons/fi";

import AppShell from "./layout/appshell.jsx";

import { COLORS } from "./components/dashboardcomponents.jsx";
import { getApplicationStatus, monitoringApi, securityApi, aiApi } from "./api/api.jsx";

import HomePage from "./pages/homepage.jsx";
import Monitoring from "./pages/monitoring.jsx";
import TrinetraAI from "./pages/trinetraai.jsx";
import Reports from "./pages/reports.jsx";
import Settings from "./pages/settings.jsx";

// ========================================================================
// Full-screen loading state (shown while the initial backend check runs)
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

function BackendUnavailableScreen({ message, onRetry }) {
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
          {message ||
            "The API server at localhost:8002 is not responding. Make sure the backend is running, then try again."}
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
// Routed application content (rendered once startup succeeds)
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
// App content: performs the initial backend check (status, monitoring,
// security, AI health score) and decides which full-screen state to
// render (loading / error / routed app).
// ========================================================================

function AppContent() {
  const [initState, setInitState] = useState("loading"); // "loading" | "ready" | "error"
  const [errorMessage, setErrorMessage] = useState(null);

  const initialize = useCallback(async () => {
    setInitState("loading");
    setErrorMessage(null);

    try {
      // Core liveness check — if this fails, the backend is considered
      // unreachable and the app cannot proceed.
      await getApplicationStatus();

      // Best-effort warm-up of the other three data sources. Any one
      // of these being unavailable (e.g. monitoring/security/AI not
      // yet initialized on the backend) should not block the whole
      // dashboard from loading — SystemStatusContext will keep
      // retrying them on its own refresh interval once mounted.
      const results = await Promise.allSettled([
        monitoringApi.getSnapshot(),
        securityApi.getSnapshot(),
        aiApi.getHealthScore(),
      ]);

      results.forEach((result, index) => {
        if (result.status === "rejected") {
          const label = ["monitoring snapshot", "security snapshot", "AI health score"][index];
          // eslint-disable-next-line no-console
          console.warn(`Initial ${label} check failed:`, result.reason?.message || result.reason);
        }
      });

      setInitState("ready");
    } catch (err) {
      setErrorMessage(err?.message || "Unable to reach the backend.");
      setInitState("error");
    }
  }, []);

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (initState === "loading") {
    return <AppLoadingScreen />;
  }

  if (initState === "error") {
    return <BackendUnavailableScreen message={errorMessage} onRetry={initialize} />;
  }

  return <AppRoutes />;
}

// ========================================================================
// App (root export)
// ========================================================================

export default function App() {
    return <AppContent />;
}