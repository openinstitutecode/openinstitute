import crypto from "node:crypto";

// FN006 — Stripe webhook signature verification, batch 64. Kept
// dependency-free (only node:crypto, a builtin) so the actual
// cryptographic logic can be unit-tested on its own, same discipline as
// lib/credentials.ts's signDocument/verifyDocument. Stripe signs
// "<timestamp>.<raw body>" with HMAC-SHA256 using the webhook secret;
// verifying it correctly requires the raw request bytes, which is why
// index.ts registers express.raw() ahead of the app-wide express.json()
// for this one route path.
export function verifyStripeSignature(rawBody: Buffer, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(signatureHeader.split(",").map((p) => p.split("=") as [string, string]));
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
