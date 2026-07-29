/**
 * settings.jsx
 *
 * Settings dashboard page — renders SettingsPanel, which loads and
 * saves configuration through api.jsx. This wrapper adds only
 * cross-page router navigation and a Context-driven API status
 * indicator; it does not duplicate SettingsPanel's own header or
 * fetch/save logic.
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import { FiHome } from "react-icons/fi";

import { COLORS, StatusBadge } from "../components/dashboardcomponents.jsx";
import { useSystemStatus } from "../context/systemstatuscontext.jsx";

import SettingsPanel from "../settings/settingspanel.jsx";

export default function Settings() {
  const { apiStatus } = useSystemStatus();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-200 hover:bg-white/5"
          style={{ borderColor: COLORS.cardBorder, color: COLORS.text }}
        >
          <FiHome className="h-3.5 w-3.5" />
          Back to Dashboard
        </button>
        {!apiStatus?.online && <StatusBadge status="critical" label="API Offline" />}
      </div>

      <SettingsPanel />
    </div>
  );
}