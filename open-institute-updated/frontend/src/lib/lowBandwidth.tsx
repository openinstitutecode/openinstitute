import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "./api";

// LMS025 — a single place to read the student's low-bandwidth preference
// (see StudentAccessibility.tsx) without threading a prop through every
// media-rendering component. Cached at module level like whoAmICache in
// api.ts, since it rarely changes mid-session.
let cache: boolean | null = null;
let inFlight: Promise<boolean> | null = null;

async function fetchLowBandwidth(): Promise<boolean> {
  if (cache !== null) return cache;
  if (!inFlight) {
    inFlight = apiFetch<{ lowBandwidthMode?: boolean }>("/accessibility/preferences")
      .then((p) => {
        cache = Boolean(p.lowBandwidthMode);
        return cache;
      })
      .catch(() => false);
  }
  return inFlight;
}

const LowBandwidthContext = createContext(false);

export function LowBandwidthProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    fetchLowBandwidth().then(setEnabled);
  }, []);
  return <LowBandwidthContext.Provider value={enabled}>{children}</LowBandwidthContext.Provider>;
}

export function useLowBandwidth(): boolean {
  return useContext(LowBandwidthContext);
}
