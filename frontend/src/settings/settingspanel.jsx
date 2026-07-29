/**
 * settingspanel.jsx
 *
 * Complete Settings panel for the Lavender Trinetra dashboard:
 * Monitoring, Alert Thresholds, AI Configuration, Cybersecurity,
 * API Configuration, Appearance (read-only) and About System.
 */

import React, { useEffect, useState } from "react";
import {
  FaSliders,
  FaMicrochip,
  FaBrain,
  FaShieldHalved,
  FaDatabase,
  FaPalette,
  FaCircleInfo,
} from "react-icons/fa6";

import { settingsApi, API_BASE_URL } from "../api/api.jsx";
import { COLORS, ToastNotification, useToast } from "../components/dashboardcomponents.jsx";
import { SectionHeader, LoadingSpinner } from "../components/dashboardwidgets.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";

const APP_VERSION = "1.0.0";
const APP_BUILD = "2026.07";
const TECH_STACK = [
  "Python 3.13+ / FastAPI",
  "SQLite / SQLAlchemy",
  "scikit-learn / Pandas / NumPy",
  "React 19 / Vite / Tailwind CSS",
];

const DEFAULT_SETTINGS = {
  monitoring: {
    intervalSeconds: 10,
    startOnLaunch: false,
    autoRefresh: true,
  },
  thresholds: {
    cpuPercent: 85,
    memoryPercent: 85,
    diskPercent: 90,
    networkMb: 500,
  },
  ai: {
    enabled: true,
    predictionWindow: 10,
    trendWindow: 200,
  },
  cybersecurity: {
    enabled: true,
    threatSensitivity: 0.5,
    firewallMonitoring: true,
  },
  api: {
    backendUrl: API_BASE_URL,
  },
};

// ========================================================================
// Small form primitives
// ========================================================================

function FieldLabel({ children }) {
  return (
    <label className="block text-xs font-medium mb-1.5" style={{ color: COLORS.secondary }}>
      {children}
    </label>
  );
}

function NumberField({ label, value, onChange, min, max, step = 1, suffix }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors duration-200 focus:border-[--brand]"
          style={{ backgroundColor: COLORS.background, borderColor: COLORS.cardBorder, color: COLORS.text }}
        />
        {suffix && (
          <span className="text-xs whitespace-nowrap" style={{ color: COLORS.secondary }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function ToggleField({ label, checked, onChange, description }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium" style={{ color: COLORS.text }}>
          {label}
        </p>
        {description && (
          <p className="text-xs" style={{ color: COLORS.secondary }}>
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200"
        style={{ backgroundColor: checked ? COLORS.brand : COLORS.cardBorder }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200"
          style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }}
        />
      </button>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, readOnly = false }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors duration-200"
        style={{
          backgroundColor: readOnly ? "transparent" : COLORS.background,
          borderColor: COLORS.cardBorder,
          color: COLORS.text,
          cursor: readOnly ? "default" : "text",
        }}
      />
    </div>
  );
}

function SaveButton({ onClick, saving, label = "Save Changes" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-opacity duration-200 disabled:opacity-60"
      style={{ backgroundColor: COLORS.brand, color: "#0f172a" }}
    >
      {saving && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {saving ? "Saving..." : label}
    </button>
  );
}

function SettingsCard({ title, icon, children, footer }) {
  return (
    <div
      className="rounded-xl border p-4 sm:p-5 shadow-sm"
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.cardBorder }}
    >
      <SectionHeader title={title} icon={icon} />
      <div className="mt-4 flex flex-col gap-4">{children}</div>
      {footer && <div className="mt-5 flex justify-end">{footer}</div>}
    </div>
  );
}

// ========================================================================
// SettingsPanel
// ========================================================================

export default function SettingsPanel() {
  const { apiStatus } = useSystemStatus();
  const { toast, showToast, hideToast } = useToast();

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState(null);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const remote = await settingsApi.getSettings();
        if (isMounted && remote && typeof remote === "object") {
          setSettings((prev) => ({
            monitoring: { ...prev.monitoring, ...(remote.monitoring || {}) },
            thresholds: { ...prev.thresholds, ...(remote.thresholds || {}) },
            ai: { ...prev.ai, ...(remote.ai || {}) },
            cybersecurity: { ...prev.cybersecurity, ...(remote.cybersecurity || {}) },
            api: { ...prev.api, ...(remote.api || {}) },
          }));
        }
      } catch (err) {
        if (isMounted) {
          showToast(err?.message || "Using default settings (backend unreachable).", "warning");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSection = (section, patch) => {
    setSettings((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
  };

  const saveSection = async (section, apiCall) => {
    setSavingSection(section);
    try {
      await apiCall();
      showToast("Settings saved successfully.", "healthy");
    } catch (err) {
      showToast(err?.message || "Failed to save settings.", "critical");
    } finally {
      setSavingSection(null);
    }
  };

  const handleSaveMonitoring = () =>
    saveSection("monitoring", () =>
      settingsApi.updateMonitoringInterval(settings.monitoring.intervalSeconds).then(() =>
        settingsApi.updateSettings({ monitoring: settings.monitoring })
      )
    );

  const handleSaveThresholds = () =>
    saveSection("thresholds", () =>
      settingsApi.updateThresholds({
        cpu_percent: settings.thresholds.cpuPercent,
        memory_percent: settings.thresholds.memoryPercent,
        disk_percent: settings.thresholds.diskPercent,
        network_sent_mb: settings.thresholds.networkMb,
        network_received_mb: settings.thresholds.networkMb,
      })
    );

  const handleSaveAI = () =>
    saveSection("ai", () => settingsApi.updateSettings({ ai: settings.ai }));

  const handleSaveCybersecurity = () =>
    saveSection("cybersecurity", () =>
      settingsApi.updateSettings({ cybersecurity: settings.cybersecurity })
    );

  const handleSaveApi = () =>
    saveSection("api", () => settingsApi.updateSettings({ api: settings.api }));

  if (loading) {
    return <LoadingSpinner label="Loading settings..." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Settings"
        subtitle="Configure monitoring, thresholds, AI, security and API behavior."
        icon={FaSliders}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Monitoring Settings */}
        <SettingsCard
          title="Monitoring Settings"
          icon={FaSliders}
          footer={
            <SaveButton onClick={handleSaveMonitoring} saving={savingSection === "monitoring"} />
          }
        >
          <NumberField
            label="Monitoring Interval"
            value={settings.monitoring.intervalSeconds}
            min={1}
            max={3600}
            suffix="seconds"
            onChange={(v) => updateSection("monitoring", { intervalSeconds: v })}
          />
          <ToggleField
            label="Start on Launch"
            description="Begin monitoring automatically when the backend starts."
            checked={settings.monitoring.startOnLaunch}
            onChange={(v) => updateSection("monitoring", { startOnLaunch: v })}
          />
          <ToggleField
            label="Auto Refresh"
            description="Automatically refresh dashboard data in the background."
            checked={settings.monitoring.autoRefresh}
            onChange={(v) => updateSection("monitoring", { autoRefresh: v })}
          />
        </SettingsCard>

        {/* Alert Thresholds */}
        <SettingsCard
          title="Alert Thresholds"
          icon={FaMicrochip}
          footer={
            <SaveButton onClick={handleSaveThresholds} saving={savingSection === "thresholds"} />
          }
        >
          <NumberField
            label="CPU Threshold"
            value={settings.thresholds.cpuPercent}
            min={0}
            max={100}
            suffix="%"
            onChange={(v) => updateSection("thresholds", { cpuPercent: v })}
          />
          <NumberField
            label="Memory Threshold"
            value={settings.thresholds.memoryPercent}
            min={0}
            max={100}
            suffix="%"
            onChange={(v) => updateSection("thresholds", { memoryPercent: v })}
          />
          <NumberField
            label="Disk Threshold"
            value={settings.thresholds.diskPercent}
            min={0}
            max={100}
            suffix="%"
            onChange={(v) => updateSection("thresholds", { diskPercent: v })}
          />
          <NumberField
            label="Network Threshold"
            value={settings.thresholds.networkMb}
            min={0}
            suffix="MB"
            onChange={(v) => updateSection("thresholds", { networkMb: v })}
          />
        </SettingsCard>

        {/* AI Configuration */}
        <SettingsCard
          title="AI Configuration"
          icon={FaBrain}
          footer={<SaveButton onClick={handleSaveAI} saving={savingSection === "ai"} />}
        >
          <ToggleField
            label="Enable AI"
            description="Turn AI analysis, anomaly detection and recommendations on or off."
            checked={settings.ai.enabled}
            onChange={(v) => updateSection("ai", { enabled: v })}
          />
          <NumberField
            label="Prediction Window"
            value={settings.ai.predictionWindow}
            min={1}
            max={100}
            suffix="readings"
            onChange={(v) => updateSection("ai", { predictionWindow: v })}
          />
          <NumberField
            label="Trend Window"
            value={settings.ai.trendWindow}
            min={10}
            max={2000}
            suffix="readings"
            onChange={(v) => updateSection("ai", { trendWindow: v })}
          />
        </SettingsCard>

        {/* Cybersecurity Settings */}
        <SettingsCard
          title="Cybersecurity Settings"
          icon={FaShieldHalved}
          footer={
            <SaveButton onClick={handleSaveCybersecurity} saving={savingSection === "cybersecurity"} />
          }
        >
          <ToggleField
            label="Enable Security Engine"
            description="Turn process, network, firewall and threat analysis on or off."
            checked={settings.cybersecurity.enabled}
            onChange={(v) => updateSection("cybersecurity", { enabled: v })}
          />
          <NumberField
            label="Threat Sensitivity"
            value={settings.cybersecurity.threatSensitivity}
            min={0}
            max={1}
            step={0.05}
            suffix="0.0 – 1.0"
            onChange={(v) => updateSection("cybersecurity", { threatSensitivity: v })}
          />
          <ToggleField
            label="Firewall Monitoring"
            description="Continuously check firewall availability and configuration."
            checked={settings.cybersecurity.firewallMonitoring}
            onChange={(v) => updateSection("cybersecurity", { firewallMonitoring: v })}
          />
        </SettingsCard>

        {/* API Configuration */}
        <SettingsCard
          title="API Configuration"
          icon={FaDatabase}
          footer={<SaveButton onClick={handleSaveApi} saving={savingSection === "api"} />}
        >
          <TextField
            label="Backend URL"
            value={settings.api.backendUrl}
            onChange={(v) => updateSection("api", { backendUrl: v })}
            placeholder="http://localhost:8002"
          />
          <div>
            <FieldLabel>API Status</FieldLabel>
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: apiStatus?.online ? COLORS.healthy : COLORS.critical }}
              />
              <span className="text-sm" style={{ color: COLORS.text }}>
                {apiStatus?.online ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>
        </SettingsCard>

        {/* Appearance (read-only) */}
        <SettingsCard title="Appearance" icon={FaPalette}>
          <p className="text-sm" style={{ color: COLORS.secondary }}>
            Lavender Trinetra uses a fixed dark theme. Theme selection is currently read-only.
          </p>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Background", color: COLORS.background },
              { label: "Card", color: COLORS.card },
              { label: "Brand", color: COLORS.brand },
              { label: "AI", color: COLORS.ai },
              { label: "Healthy", color: COLORS.healthy },
              { label: "Critical", color: COLORS.critical },
              { label: "Text", color: COLORS.text },
              { label: "Secondary", color: COLORS.secondary },
            ].map((swatch) => (
              <div key={swatch.label} className="flex flex-col items-center gap-1.5">
                <span
                  className="h-8 w-8 rounded-md border"
                  style={{ backgroundColor: swatch.color, borderColor: COLORS.cardBorder }}
                />
                <span className="text-[10px] text-center" style={{ color: COLORS.secondary }}>
                  {swatch.label}
                </span>
              </div>
            ))}
          </div>
        </SettingsCard>

        {/* About System (read-only) */}
        <SettingsCard title="About System" icon={FaCircleInfo}>
          <div className="flex justify-between text-sm">
            <span style={{ color: COLORS.secondary }}>Version</span>
            <span style={{ color: COLORS.text }}>{APP_VERSION}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: COLORS.secondary }}>Build</span>
            <span style={{ color: COLORS.text }}>{APP_BUILD}</span>
          </div>
          <div>
            <FieldLabel>Technology Stack</FieldLabel>
            <ul className="flex flex-col gap-1">
              {TECH_STACK.map((item) => (
                <li key={item} className="text-sm" style={{ color: COLORS.text }}>
                  • {item}
                </li>
              ))}
            </ul>
          </div>
        </SettingsCard>
      </div>

      <ToastNotification
        type={toast.type}
        message={toast.message}
        visible={toast.visible}
        onClose={hideToast}
      />
    </div>
  );
}