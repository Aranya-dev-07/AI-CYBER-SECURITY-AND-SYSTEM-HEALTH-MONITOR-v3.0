/**
 * api.jsx
 *
 * Centralized API service for the Lavender Trinetra frontend.
 * This is the ONLY file responsible for HTTP communication with the
 * FastAPI backend. Every page/component/context that needs backend
 * data goes through the reusable methods exported here.
 *
 * Base URL: http://localhost:8002
 */

import axios from "axios";

// ========================================================================
// Configuration
// ========================================================================

/** @type {string} Base URL of the Lavender Trinetra FastAPI backend. */
export const API_BASE_URL = "/api";

/** @type {number} Default request timeout, in milliseconds. */
const DEFAULT_TIMEOUT_MS = 60000;

// ========================================================================
// Axios instance
// ========================================================================

/**
 * Shared Axios instance used for every request made by this module.
 * @type {import("axios").AxiosInstance}
 */
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: DEFAULT_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// ========================================================================
// Interceptors
// ========================================================================

apiClient.interceptors.request.use(
  (requestConfig) => {
    requestConfig.metadata = { startTime: Date.now() };
    return requestConfig;
  },
  (error) => Promise.reject(normalizeError(error))
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(normalizeError(error))
);

/**
 * Normalizes any Axios error into a clean, predictable shape so every
 * caller can handle failures the same way regardless of cause
 * (network failure, timeout, 4xx/5xx response, etc).
 *
 * @param {import("axios").AxiosError} error
 * @returns {{ message: string, status: number|null, data: any, isTimeout: boolean, isNetworkError: boolean }}
 */
function normalizeError(error) {
  const isTimeout = error.code === "ECONNABORTED";
  const isNetworkError = !error.response && !isTimeout;

  const status = error.response ? error.response.status : null;
  const data = error.response ? error.response.data : null;

  let message = "An unexpected error occurred while contacting the backend.";
  if (isTimeout) {
    message = "The request timed out. Please check if the backend is running.";
  } else if (isNetworkError) {
    message = "Unable to reach the backend. Please verify the API server is running.";
  } else if (data && typeof data === "object" && "detail" in data) {
    message = String(data.detail);
  } else if (error.message) {
    message = error.message;
  }

  return {
    message,
    status,
    data,
    isTimeout,
    isNetworkError,
  };
}

// ========================================================================
// Generic request helper
// ========================================================================

/**
 * Executes a request through the shared Axios instance and returns
 * clean JSON data. Never throws a raw Axios error — always throws the
 * normalized error shape produced by `normalizeError`.
 *
 * @template T
 * @param {import("axios").AxiosRequestConfig} requestConfig
 * @returns {Promise<T>}
 */
async function request(requestConfig) {
  try {
    const response = await apiClient.request(requestConfig);
    return response.data;
  } catch (error) {
    if (error && typeof error === "object" && "message" in error && "status" in error) {
      throw error; // already normalized by the interceptor
    }
    throw normalizeError(error);
  }
}

// ========================================================================
// Application Status
// ========================================================================

/**
 * Fetches overall application/service availability status.
 * @returns {Promise<Object>}
 */
export async function getApplicationStatus() {
  return request({ method: "GET", url: "/api/status" });
}

/**
 * Lightweight liveness probe.
 * @returns {Promise<{ status: string, timestamp: string }>}
 */
export async function getHealthCheck() {
  return request({ method: "GET", url: "/api/health" });
}

// ========================================================================
// Database Status
// ========================================================================

export const databaseApi = {
  /**
   * Fetches database connectivity status.
   * @returns {Promise<Object>}
   */
  getStatus: async () => request({ method: "GET", url: "/api/database/status" }),

  /**
   * Fetches persisted monitoring records.
   * @param {{ limit?: number, offset?: number }} [params]
   * @returns {Promise<Array<Object>>}
   */
  getMonitoringRecords: async (params = {}) =>
    request({ method: "GET", url: "/api/database/monitoring", params }),

  /**
   * Fetches persisted security records.
   * @param {{ limit?: number, offset?: number }} [params]
   * @returns {Promise<Array<Object>>}
   */
  getSecurityRecords: async (params = {}) =>
    request({ method: "GET", url: "/api/database/security", params }),

  /**
   * Fetches persisted AI analysis records.
   * @param {{ limit?: number, offset?: number }} [params]
   * @returns {Promise<Array<Object>>}
   */
  getAIRecords: async (params = {}) =>
    request({ method: "GET", url: "/api/database/ai", params }),
};

// ========================================================================
// System Metrics / Monitoring
// ========================================================================

export const monitoringApi = {
  /**
   * Fetches the latest system monitoring snapshot (CPU/memory/disk/network).
   * @returns {Promise<{ timestamp: string, data: Object }>}
   */
  getSnapshot: async () => request({ method: "GET", url: "/api/monitoring/snapshot" }),

  /**
   * Fetches recent monitoring history.
   * @param {{ limit?: number }} [params]
   * @returns {Promise<Array<Object>>}
   */
  getHistory: async (params = { limit: 100 }) =>
    request({ method: "GET", url: "/api/monitoring/history", params }),
};

// ========================================================================
// Cybersecurity
// ========================================================================

export const securityApi = {
  /**
   * Fetches the latest cybersecurity snapshot (processes/network/firewall/threats).
   * @returns {Promise<{ timestamp: string, data: Object }>}
   */
  getSnapshot: async () => request({ method: "GET", url: "/api/security/snapshot" }),

  /**
   * Fetches the current security score.
   * @returns {Promise<{ timestamp: string, security_score: number }>}
   */
  getScore: async () => request({ method: "GET", url: "/api/security/score" }),
};

// ========================================================================
// AI Engine
// ========================================================================

export const aiApi = {
  /**
   * Runs a full AI analysis pass. If monitoring/security data is
   * omitted, the backend falls back to the latest available snapshots.
   * @param {{ monitoring_data?: Object|null, security_data?: Object|null }} [payload]
   * @returns {Promise<{ timestamp: string, data: Object }>}
   */
  analyze: async (payload = {}) =>
    request({ method: "POST", url: "/api/ai/analyze", data: payload }),

  /**
   * Fetches only the latest AI health score.
   * @returns {Promise<{ timestamp: string, health_score: number|null }>}
   */
  getHealthScore: async () => request({ method: "GET", url: "/api/ai/health-score" }),
};

// ========================================================================
// Reports
// ========================================================================

export const reportsApi = {
  /**
   * Fetches the list of past test runs / monitoring sessions.
   * @param {{ limit?: number, offset?: number }} [params]
   * @returns {Promise<Array<Object>>}
   */
  getTestRuns: async (params = {}) =>
    request({ method: "GET", url: "/api/reports/test-runs", params }),

  /**
   * Fetches historical generated reports.
   * @param {{ limit?: number, offset?: number }} [params]
   * @returns {Promise<Array<Object>>}
   */
  getHistory: async (params = {}) =>
    request({ method: "GET", url: "/api/reports/history", params }),

  /**
   * Fetches database statistics used on the Reports page.
   * @returns {Promise<Object>}
   */
  getDatabaseStatistics: async () =>
    request({ method: "GET", url: "/api/reports/database-statistics" }),

  /**
   * Requests export of a report in the given format.
   * @param {"csv"|"pdf"} format
   * @param {{ runId?: string|number }} [params]
   * @returns {Promise<Blob>}
   */
  exportReport: async (format, params = {}) =>
    request({
      method: "GET",
      url: `/api/reports/export/${format}`,
      params,
      responseType: "blob",
    }),
};

// ========================================================================
// Settings
// ========================================================================

export const settingsApi = {
  /**
   * Fetches current backend configuration/settings.
   * @returns {Promise<Object>}
   */
  getSettings: async () => request({ method: "GET", url: "/api/settings" }),

  /**
   * Updates backend configuration/settings.
   * @param {Object} settingsPayload
   * @returns {Promise<Object>}
   */
  updateSettings: async (settingsPayload) =>
    request({ method: "PUT", url: "/api/settings", data: settingsPayload }),

  /**
   * Updates only the monitoring interval.
   * @param {number} intervalSeconds
   * @returns {Promise<Object>}
   */
  updateMonitoringInterval: async (intervalSeconds) =>
    request({
      method: "PATCH",
      url: "/api/settings/monitoring-interval",
      data: { interval_seconds: intervalSeconds },
    }),

  /**
   * Updates system resource alert thresholds.
   * @param {{ cpu_percent?: number, memory_percent?: number, disk_percent?: number, network_sent_mb?: number, network_received_mb?: number }} thresholds
   * @returns {Promise<Object>}
   */
  updateThresholds: async (thresholds) =>
    request({ method: "PATCH", url: "/api/settings/thresholds", data: thresholds }),
};

// ========================================================================
// Default export (grouped API surface)
// ========================================================================

const api = {
  getApplicationStatus,
  getHealthCheck,
  database: databaseApi,
  monitoring: monitoringApi,
  security: securityApi,
  ai: aiApi,
  reports: reportsApi,
  settings: settingsApi,
};

export default api;