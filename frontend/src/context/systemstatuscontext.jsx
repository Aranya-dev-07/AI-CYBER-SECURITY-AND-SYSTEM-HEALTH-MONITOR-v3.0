/**
 * systemstatuscontext.jsx
 *
 * Global React Context for the Lavender Trinetra frontend. Holds the
 * single source of truth for system metrics, AI status, cybersecurity
 * status, API status, database status, alerts, reports, loading and
 * error state — refreshed automatically on an interval via api.jsx.
 *
 * Every page/component reads from this context through the
 * `useSystemStatus` hook instead of calling api.jsx directly for
 * shared/global data.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

import api, {
  getApplicationStatus,
  getHealthCheck,
  databaseApi,
  monitoringApi,
  securityApi,
  aiApi,
} from "../api/api.jsx";

// ========================================================================
// Configuration
// ========================================================================

/** @type {number} Auto-refresh interval, in milliseconds. Mirrors the backend's default monitoring interval (10s). */
const REFRESH_INTERVAL_MS = 10000;

// ========================================================================
// Initial state
// ========================================================================

const initialState = {
  systemMetrics: null, // { cpu, memory, disk, network }
  aiStatus: null, // { health_score, anomalies, trend_analysis, predictive_alerts, recommendations, root_cause_analysis }
  cybersecurityStatus: null, // { security_score, overall_severity, ... }
  apiStatus: {
    online: false,
    monitoringAvailable: false,
    securityAvailable: false,
    aiAvailable: false,
    databaseAvailable: false,
    lastChecked: null,
  },
  databaseStatus: {
    connected: false,
    databaseUrl: null,
    lastChecked: null,
  },
  alerts: [],
  reports: [],
  loading: {
    metrics: false,
    ai: false,
    security: false,
    status: false,
  },
  error: null,
  lastUpdated: null,
};

// ========================================================================
// Action types
// ========================================================================

const ActionTypes = Object.freeze({
  SET_LOADING: "SET_LOADING",
  SET_ERROR: "SET_ERROR",
  CLEAR_ERROR: "CLEAR_ERROR",
  SET_SYSTEM_METRICS: "SET_SYSTEM_METRICS",
  SET_AI_STATUS: "SET_AI_STATUS",
  SET_CYBERSECURITY_STATUS: "SET_CYBERSECURITY_STATUS",
  SET_API_STATUS: "SET_API_STATUS",
  SET_DATABASE_STATUS: "SET_DATABASE_STATUS",
  SET_ALERTS: "SET_ALERTS",
  ADD_ALERT: "ADD_ALERT",
  SET_REPORTS: "SET_REPORTS",
});

// ========================================================================
// Reducer
// ========================================================================

/**
 * @param {typeof initialState} state
 * @param {{ type: string, payload?: any }} action
 * @returns {typeof initialState}
 */
function systemStatusReducer(state, action) {
  switch (action.type) {
    case ActionTypes.SET_LOADING:
      return {
        ...state,
        loading: { ...state.loading, ...action.payload },
      };

    case ActionTypes.SET_ERROR:
      return { ...state, error: action.payload };

    case ActionTypes.CLEAR_ERROR:
      return { ...state, error: null };

    case ActionTypes.SET_SYSTEM_METRICS:
      return {
        ...state,
        systemMetrics: action.payload,
        lastUpdated: new Date().toISOString(),
      };

    case ActionTypes.SET_AI_STATUS:
      return {
        ...state,
        aiStatus: action.payload,
        lastUpdated: new Date().toISOString(),
      };

    case ActionTypes.SET_CYBERSECURITY_STATUS:
      return {
        ...state,
        cybersecurityStatus: action.payload,
        lastUpdated: new Date().toISOString(),
      };

    case ActionTypes.SET_API_STATUS:
      return {
        ...state,
        apiStatus: { ...state.apiStatus, ...action.payload, lastChecked: new Date().toISOString() },
      };

    case ActionTypes.SET_DATABASE_STATUS:
      return {
        ...state,
        databaseStatus: {
          ...state.databaseStatus,
          ...action.payload,
          lastChecked: new Date().toISOString(),
        },
      };

    case ActionTypes.SET_ALERTS:
      return { ...state, alerts: action.payload };

    case ActionTypes.ADD_ALERT:
      return { ...state, alerts: [action.payload, ...state.alerts].slice(0, 100) };

    case ActionTypes.SET_REPORTS:
      return { ...state, reports: action.payload };

    default:
      return state;
  }
}

// ========================================================================
// Context
// ========================================================================

const SystemStatusContext = createContext(undefined);
SystemStatusContext.displayName = "SystemStatusContext";

// ========================================================================
// Provider
// ========================================================================

/**
 * Wraps the application and provides global system status state,
 * refreshed automatically on an interval.
 *
 * @param {{ children: React.ReactNode, refreshIntervalMs?: number }} props
 */
export function SystemStatusProvider({ children, refreshIntervalMs = REFRESH_INTERVAL_MS }) {
  const [state, dispatch] = useReducer(systemStatusReducer, initialState);
  const isMountedRef = useRef(true);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ------------------------------------------------------------------
  // Fetchers
  // ------------------------------------------------------------------

  const refreshApiStatus = useCallback(async () => {
    try {
      const [statusResult] = await Promise.all([getApplicationStatus(), getHealthCheck()]);
      if (!isMountedRef.current) return;
      dispatch({
        type: ActionTypes.SET_API_STATUS,
        payload: {
          online: true,
          monitoringAvailable: Boolean(statusResult?.monitoring_available),
          securityAvailable: Boolean(statusResult?.security_available),
          aiAvailable: Boolean(statusResult?.ai_available),
          databaseAvailable: Boolean(statusResult?.database_available),
        },
      });
    } catch (err) {
      if (!isMountedRef.current) return;
      dispatch({
        type: ActionTypes.SET_API_STATUS,
        payload: { online: false },
      });
      dispatch({ type: ActionTypes.SET_ERROR, payload: err?.message || "API status check failed." });
    }
  }, []);

  const refreshDatabaseStatus = useCallback(async () => {
    try {
      const result = await databaseApi.getStatus();
      if (!isMountedRef.current) return;
      dispatch({
        type: ActionTypes.SET_DATABASE_STATUS,
        payload: { connected: Boolean(result?.connected), databaseUrl: result?.database_url || null },
      });
    } catch (err) {
      if (!isMountedRef.current) return;
      dispatch({
        type: ActionTypes.SET_DATABASE_STATUS,
        payload: { connected: false },
      });
    }
  }, []);

  const refreshSystemMetrics = useCallback(async () => {
    dispatch({ type: ActionTypes.SET_LOADING, payload: { metrics: true } });
    try {
      const snapshot = await monitoringApi.getSnapshot();
      if (!isMountedRef.current) return;
      dispatch({ type: ActionTypes.SET_SYSTEM_METRICS, payload: snapshot?.data ?? null });
    } catch (err) {
      if (!isMountedRef.current) return;
      dispatch({ type: ActionTypes.SET_ERROR, payload: err?.message || "Failed to fetch system metrics." });
    } finally {
      if (isMountedRef.current) {
        dispatch({ type: ActionTypes.SET_LOADING, payload: { metrics: false } });
      }
    }
  }, []);

  const refreshCybersecurityStatus = useCallback(async () => {
    dispatch({ type: ActionTypes.SET_LOADING, payload: { security: true } });
    try {
      const [snapshot, scoreResult] = await Promise.all([
        securityApi.getSnapshot(),
        securityApi.getScore().catch(() => null),
      ]);
      if (!isMountedRef.current) return;
      const combined = {
        ...(snapshot?.data ?? {}),
        security_score: scoreResult?.security_score ?? snapshot?.data?.security_score ?? null,
      };
      dispatch({ type: ActionTypes.SET_CYBERSECURITY_STATUS, payload: combined });
    } catch (err) {
      if (!isMountedRef.current) return;
      dispatch({
        type: ActionTypes.SET_ERROR,
        payload: err?.message || "Failed to fetch cybersecurity status.",
      });
    } finally {
      if (isMountedRef.current) {
        dispatch({ type: ActionTypes.SET_LOADING, payload: { security: false } });
      }
    }
  }, []);

  const refreshAIStatus = useCallback(async () => {
    dispatch({ type: ActionTypes.SET_LOADING, payload: { ai: true } });
    try {
      const result = await aiApi.analyze();
      if (!isMountedRef.current) return;
      dispatch({ type: ActionTypes.SET_AI_STATUS, payload: result?.data ?? null });
    } catch (err) {
      if (!isMountedRef.current) return;
      dispatch({ type: ActionTypes.SET_ERROR, payload: err?.message || "Failed to fetch AI status." });
    } finally {
      if (isMountedRef.current) {
        dispatch({ type: ActionTypes.SET_LOADING, payload: { ai: false } });
      }
    }
  }, []);

  /** Adds a client-side alert (e.g. derived from a threshold breach) to the global alert feed. */
  const addAlert = useCallback((alert) => {
    dispatch({
      type: ActionTypes.ADD_ALERT,
      payload: {
        id: alert?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: alert?.timestamp ?? new Date().toISOString(),
        severity: alert?.severity ?? "medium",
        message: alert?.message ?? "Unknown alert.",
        ...alert,
      },
    });
  }, []);

  const setReports = useCallback((reports) => {
    dispatch({ type: ActionTypes.SET_REPORTS, payload: reports ?? [] });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: ActionTypes.CLEAR_ERROR });
  }, []);

  /** Refreshes every piece of global state in parallel. */
  const refreshAll = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    dispatch({ type: ActionTypes.SET_LOADING, payload: { status: true } });
    try {
      await Promise.all([
        refreshApiStatus(),
        refreshDatabaseStatus(),
        refreshSystemMetrics(),
        refreshCybersecurityStatus(),
        refreshAIStatus(),
      ]);
    } finally {
      if (isMountedRef.current) {
        dispatch({ type: ActionTypes.SET_LOADING, payload: { status: false } });
      }
      isFetchingRef.current = false;
    }
  }, [
    refreshApiStatus,
    refreshDatabaseStatus,
    refreshSystemMetrics,
    refreshCybersecurityStatus,
    refreshAIStatus,
  ]);

  // ------------------------------------------------------------------
  // Auto-refresh lifecycle
  // ------------------------------------------------------------------

  useEffect(() => {
    refreshAll();

    const intervalId = setInterval(() => {
      refreshAll();
    }, refreshIntervalMs);

    return () => clearInterval(intervalId);
  }, [refreshAll, refreshIntervalMs]);

  // ------------------------------------------------------------------
  // Context value (memoized to prevent unnecessary re-renders)
  // ------------------------------------------------------------------

  const actions = useMemo(
    () => ({
      refreshAll,
      refreshApiStatus,
      refreshDatabaseStatus,
      refreshSystemMetrics,
      refreshCybersecurityStatus,
      refreshAIStatus,
      addAlert,
      setReports,
      clearError,
    }),
    [
      refreshAll,
      refreshApiStatus,
      refreshDatabaseStatus,
      refreshSystemMetrics,
      refreshCybersecurityStatus,
      refreshAIStatus,
      addAlert,
      setReports,
      clearError,
    ]
  );

  const value = useMemo(
    () => ({
      ...state,
      ...actions,
    }),
    [state, actions]
  );

  return (
    <SystemStatusContext.Provider value={value}>{children}</SystemStatusContext.Provider>
  );
}

// ========================================================================
// Custom hook
// ========================================================================

/**
 * Access the global system status context.
 * Must be used within a <SystemStatusProvider>.
 *
 * @returns {typeof initialState & {
 *   refreshAll: () => Promise<void>,
 *   refreshApiStatus: () => Promise<void>,
 *   refreshDatabaseStatus: () => Promise<void>,
 *   refreshSystemMetrics: () => Promise<void>,
 *   refreshCybersecurityStatus: () => Promise<void>,
 *   refreshAIStatus: () => Promise<void>,
 *   addAlert: (alert: Object) => void,
 *   setReports: (reports: Array<Object>) => void,
 *   clearError: () => void,
 * }}
 */
export function useSystemStatus() {
  const context = useContext(SystemStatusContext);
  if (context === undefined) {
    throw new Error("useSystemStatus must be used within a <SystemStatusProvider>.");
  }
  return context;
}

export default SystemStatusContext;