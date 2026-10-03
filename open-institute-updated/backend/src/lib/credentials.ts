import crypto from "node:crypto";

// KSEC-001 — no publicly-known fallback in production. With CREDENTIAL_SIGNING_SECRET unset, production
// derives a domain-separated key from JWT_SECRET (validated strong at boot by lib/env.ts + jwt-secret.ts).
// Development gets a process-local key so a public fallback cannot be used to forge documents.
export function resolveSigningSecret(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CREDENTIAL_SIGNING_SECRET) return env.CREDENTIAL_SIGNING_SECRET;
  if (env.NODE_ENV === "production") {
    if (!env.JWT_SECRET) throw new Error("CREDENTIAL_SIGNING_SECRET (or JWT_SECRET) must be set in production");
    return crypto.createHmac("sha256", env.JWT_SECRET).update("kvbdtc:credential-signing:v1").digest("hex");
  }
  return crypto.randomBytes(32).toString("hex");
}
const SIGNING_SECRET = resolveSigningSecret();

// A real deployment should sign with an asymmetric key (e.g. Ed25519) held in
// a secrets manager, not an HMAC secret in an env var — this HMAC approach is
// a working placeholder that demonstrates the tamper-evidence property.
export function signDocument(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  return crypto.createHmac("sha256", SIGNING_SECRET).update(json).digest("hex");
}

export function verifyDocument(payload: Record<string, unknown>, signature: string): boolean {
  const expected = Buffer.from(signDocument(payload));
  const given = Buffer.from(String(signature));
  // KFX-054 — timingSafeEqual THROWS on unequal lengths, so a malformed signature on the public
  // verification endpoint produced a 500 instead of "invalid".
  return given.length === expected.length && crypto.timingSafeEqual(expected, given);
}

export function generateDocumentId(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}
