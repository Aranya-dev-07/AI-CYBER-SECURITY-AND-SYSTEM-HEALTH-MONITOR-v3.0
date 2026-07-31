/**
 * main.jsx
 *
 * Frontend entry point for the Lavender Trinetra dashboard. Mounts
 * the React application, providing routing (BrowserRouter) and the
 * global system status data layer (SystemStatusProvider) around
 * App.jsx, with global and dashboard styling loaded in dependency
 * order.
 */

import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./app.jsx";
import { SystemStatusProvider } from "./context/systemstatuscontext.jsx";

import "./styles/global.css";
import "./styles/dashboard.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <SystemStatusProvider>
        <App />
      </SystemStatusProvider>
    </BrowserRouter>
  </StrictMode>
);