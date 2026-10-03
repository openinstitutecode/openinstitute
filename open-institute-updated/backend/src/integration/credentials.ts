import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { signPayload } from "./signing.js";
import { encryptSecret, decryptSecret } from "./secret-box.js";

// VBI010/045 — Integration API Authentication + Credential Rotation.
// Historically (batch 65's first pass) both directions used a single
// static secret from an env var. This replaces that with DB-backed,
// keyed, rotatable credentials — while keeping the env var as a bootstrap
// fallback so a fresh deployment with no credentials issued yet still
// works (same "additive, never breaks what worked before" discipline as
// everything else in this integration).

type Direction = "PORTAL_TO_VBL" | "VBL_TO_PORTAL";

// Read lazily (not at import time) so a rotated/updated env var is honoured and tests can set it.
const envFallback = (direction: Direction): string | undefined =>
  direction === "PORTAL_TO_VBL" ? process.env.PORTAL_WEBHOOK_SECRET : process.env.VBL_WEBHOOK_SECRET;

// Optional client override (e.g. a $transaction client); callers normally omit it and get Prisma.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
const FALLBACK_KEY_ID = "env-fallback";

export async function issueCredential(direction: Direction, createdById: string, notes?: string, db: Db = prisma) {
  const keyId = `key_${crypto.randomBytes(8).toString("hex")}`;
  const secret = crypto.randomBytes(32).toString("base64url");
  const credential = await db.integrationCredential.create({
    // Batch 66 — encrypted at rest (AES-256-GCM); see secret-box.ts. The plaintext is still
    // returned to the caller below, once, and never persisted.
    data: { keyId, secret: encryptSecret(secret), direction, createdById, notes },
  });
  // The secret is returned ONLY here, at creation — same UX as a cloud
  // provider's API key, and the same reason: it is never retrievable again.
  return { id: credential.id, keyId: credential.keyId, secret, direction, createdAt: credential.createdAt };
}

export async function revokeCredential(id: string, revokedById: string, db: Db = prisma) {
  return db.integrationCredential.update({
    where: { id },
    data: { status: "REVOKED", revokedById, revokedAt: new Date() },
  });
}

export async function listCredentials(direction?: Direction, db: Db = prisma) {
  return db.integrationCredential.findMany({
    where: direction ? { direction } : undefined,
    select: { id: true, keyId: true, direction: true, status: true, createdAt: true, revokedAt: true, notes: true }, // never selects `secret`
    orderBy: { createdAt: "desc" },
  });
}

// Picks the credential to SIGN a new outbound delivery with — the most
// recently issued ACTIVE one, so a rotation's new secret takes over for new
// traffic immediately while old deliveries already in flight still verify
// fine against whichever credential the recipient still has active.
export async function activeSigningCredential(direction: Direction, db: Db = prisma): Promise<{ keyId: string; secret: string }> {
  const cred = await db.integrationCredential.findFirst({
    where: { direction, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (cred) return { keyId: cred.keyId, secret: decryptSecret(cred.secret) };
  const fallback = envFallback(direction);
  if (!fallback) throw new Error(`No ${direction} credential issued and no env-var fallback configured.`);
  return { keyId: FALLBACK_KEY_ID, secret: fallback };
}

// Verifies against EVERY currently-ACTIVE credential for the direction (plus
// the env fallback, if set) — this is what makes rotation non-disruptive: an
// admin can issue a new credential, roll it out to the other side, and only
// revoke the old one once delivery with the new one is confirmed working,
// with zero window where a still-in-flight signed-with-the-old-secret
// delivery would be rejected.
export async function verifyAgainstAnyActiveCredential(
  direction: Direction,
  timestamp: number,
  rawBody: string,
  signature: string | undefined,
  keyIdHint?: string,
  db: Db = prisma
): Promise<boolean> {
  if (!signature) return false;
  const credentials = await db.integrationCredential.findMany({ where: { direction, status: "ACTIVE" } });
  const candidates = keyIdHint ? credentials.filter((c: { keyId: string }) => c.keyId === keyIdHint) : credentials;
  for (const cred of candidates.length ? candidates : credentials) {
    let secret: string;
    try {
      secret = decryptSecret(cred.secret);
    } catch (err) {
      // A credential we cannot decrypt (wrong/missing key) can never verify anything — skip it,
      // loudly, rather than crash the whole webhook or silently accept.
      // eslint-disable-next-line no-console
      console.error(`Cannot decrypt integration credential ${cred.keyId}`, err);
      continue;
    }
    const expected = signPayload(secret, timestamp, rawBody);
    if (expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      return true;
    }
  }
  const fallback = envFallback(direction);
  if (fallback && (!keyIdHint || keyIdHint === FALLBACK_KEY_ID)) {
    const expected = signPayload(fallback, timestamp, rawBody);
    if (expected.length === signature.length) {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    }
  }
  return false;
}
