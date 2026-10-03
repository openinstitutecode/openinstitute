import crypto from "node:crypto";

// VBI013 — Event signing, and VBI009 — SSO assertion signing/verification.
// Kept dependency-free (only node:crypto) so it can be unit-tested on its
// own, same discipline as lib/card-gateway.ts's verifyStripeSignature and
// lib/credentials.ts's signDocument/verifyDocument. Two distinct secrets so
// a leak of one direction's key never grants the other:
//   PORTAL_WEBHOOK_SECRET — signs events the portal sends to VBL, and is
//     the secret VBL webhook deliveries to the portal are checked against
//     in the *other* direction only if VBL and the portal are configured
//     to share it (see docs/VBL_MAIN_PORTAL_SSO.md); by default the two
//     directions use PORTAL_WEBHOOK_SECRET (portal -> VBL) and
//     VBL_WEBHOOK_SECRET (VBL -> portal) as two separate values.
//   PORTAL_SSO_SECRET — signs short-lived SSO assertions handed to a
//     student/trainer's browser to bootstrap a VBL session.

export function signPayload(secret: string, timestamp: number, rawBody: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifySignedPayload(secret: string, timestamp: number, rawBody: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = signPayload(secret, timestamp, rawBody);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function hashPayload(payload: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

interface AssertionClaims {
  iss: string;
  aud: string;
  sub: string; // portal User.id
  portalUserId: string;
  portalStudentId?: string;
  portalTrainerId?: string;
  registrationNumber?: string;
  roles: string[];
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

const ASSERTION_ISS = "kvbdtc-portal";
const ASSERTION_AUD = "virtual-business-lab";

// VBI008/009 — issue a short-lived signed SSO assertion. Never contains a
// password; the Lab validates the signature and expiry, never our secret.
export function issueSsoAssertion(
  secret: string,
  claims: Omit<AssertionClaims, "iss" | "aud" | "issuedAt" | "expiresAt" | "nonce">,
  ttlSeconds = 60
): { assertion: string; nonce: string; expiresAt: number } {
  const nonce = crypto.randomBytes(16).toString("hex");
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + ttlSeconds;
  const body: AssertionClaims = { iss: ASSERTION_ISS, aud: ASSERTION_AUD, nonce, issuedAt, expiresAt, ...claims };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(encoded).digest("hex");
  return { assertion: `${encoded}.${sig}`, nonce, expiresAt };
}

export function verifySsoAssertion(secret: string, assertion: string, now = Math.floor(Date.now() / 1000)): AssertionClaims {
  const [encoded, sig] = assertion.split(".");
  if (!encoded || !sig) throw new Error("malformed assertion");
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("hex");
  const ok = expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  if (!ok) throw new Error("invalid assertion signature");
  const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AssertionClaims;
  if (claims.iss !== ASSERTION_ISS || claims.aud !== ASSERTION_AUD) throw new Error("wrong issuer/audience");
  if (claims.expiresAt < now) throw new Error("assertion expired");
  return claims;
}
