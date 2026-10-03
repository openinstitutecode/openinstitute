// Batch 70 — KFEAT-066/070: public settings (flags, branding, privacy notice) fetched once per page load.
import { useEffect, useState } from "react";

export type PublicSettings = {
  "feature.flags": Record<string, boolean>;
  branding: { institutionName: string; tagline?: string; primaryColor: string; supportEmail?: string; footerText?: string };
  "privacy.notice": { version: string; url?: string; summary: string };
};
const DEFAULTS: PublicSettings = { "feature.flags": {}, branding: { institutionName: "Measur Business College", primaryColor: "#1B3A4B" }, "privacy.notice": { version: "0", summary: "" } };

/** "#RRGGBB" → "r g b" for the CSS variable, or null when the colour is too light to carry the light text used on navy buttons. */
export function brandTriplet(hex: string): string | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const lin = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return lum <= 0.18 ? `${r} ${g} ${b}` : null; // roughly 4.5:1 or better against the off-white used for text on navy
}

let cached: Promise<PublicSettings> | null = null;
export function loadPublicSettings(): Promise<PublicSettings> {
  cached ??= fetch(`/api/settings/public`).then((r) => (r.ok ? r.json() : DEFAULTS)).then((d) => ({ ...DEFAULTS, ...d, branding: { ...DEFAULTS.branding, ...d.branding } })).catch(() => DEFAULTS);
  return cached;
}
export function usePublicSettings(): PublicSettings {
  const [s, setS] = useState<PublicSettings>(DEFAULTS);
  useEffect(() => {
    let live = true;
    loadPublicSettings().then((d) => {
      if (!live) return;
      setS(d);
      const t = brandTriplet(d.branding.primaryColor);
      if (t && d.branding.primaryColor.toLowerCase() !== "#1b3a4b") document.documentElement.style.setProperty("--brand-navy", t);
      else document.documentElement.style.removeProperty("--brand-navy");
    });
    return () => { live = false; };
  }, []);
  return s;
}
export const useFlag = (name: string, dflt = false) => usePublicSettings()["feature.flags"][name] ?? dflt;
