// Batch 69 — batch 68 fell back to JWT_SECRET, so rotating the login secret silently re-keyed every pseudonym.
// Now: production REQUIRES its own secret; dev/test derives a separate key (domain-separated) so nothing is shared raw.
import { createHmac } from "node:crypto";

export function resolvePseudonymSecret(env: NodeJS.ProcessEnv, fallbackBase: string): { secret?: string; problem?: string } {
  const s = env.ANALYTICS_PSEUDONYM_SECRET;
  if (s && s.length >= 32) return { secret: s };
  if (env.NODE_ENV === "production") return { problem: "Set ANALYTICS_PSEUDONYM_SECRET (32+ characters, never rotate it casually) before using pseudonymised exports." };
  if (s) return { secret: s };
  return { secret: createHmac("sha256", fallbackBase).update("kvbdtc:analytics-pseudonym:v1").digest("hex") };
}
