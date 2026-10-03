import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/index.css";
import { applyTheme } from "./lib/theme";

applyTheme(); // before first paint of the app, so there is no light flash for dark-mode users

// LMS026 — PWA: register the runtime-caching service worker (public/sw.js).
// Best-effort — an unsupported browser or a blocked registration just means
// no offline app-shell caching, not a broken app.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
