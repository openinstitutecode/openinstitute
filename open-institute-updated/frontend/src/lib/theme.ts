// Batch 69 — KUX-012: light/dark preference. Stored per browser; falls back to the OS setting. Storage may be blocked, so guard it.
export type Theme = "light" | "dark";
const KEY = "kvbdtc_theme";
export function currentTheme(): Theme {
  try { const t = localStorage.getItem(KEY); if (t === "light" || t === "dark") return t; } catch { /* ignore */ }
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
export function applyTheme(t: Theme = currentTheme()) { document.documentElement.classList.toggle("dark", t === "dark"); }
export function setTheme(t: Theme) { try { localStorage.setItem(KEY, t); } catch { /* ignore */ } applyTheme(t); }
