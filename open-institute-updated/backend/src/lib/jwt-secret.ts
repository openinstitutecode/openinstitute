// Batch 66 — resolve the signing secret in one place. Development uses an ephemeral
// process-local key; production must provide a strong secret at startup.
import crypto from "node:crypto";

const DEV_FALLBACK = crypto.randomBytes(32).toString("hex");
const PLACEHOLDERS = new Set([DEV_FALLBACK, "replace-with-a-long-random-string", "change-me"]);

export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET;
  if (env.NODE_ENV === "production" && (!secret || PLACEHOLDERS.has(secret) || secret.length < 16)) {
    throw new Error("JWT_SECRET must be set to a long random value (>= 16 chars, not a placeholder) when NODE_ENV=production.");
  }
  return secret ?? DEV_FALLBACK;
}
