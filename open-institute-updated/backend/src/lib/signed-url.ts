// TP007 — short-lived signed URLs for uploaded media. A <video>/<audio>/<img>
// element can't send an Authorization header, so instead of a public static
// directory the API mints `/api/media/file/<id>?t=<expiry>.<hmac>` URLs, but
// only to callers who are allowed to see that lesson's content.

import { createHmac, timingSafeEqual } from "node:crypto";
import { resolveJwtSecret } from "./jwt-secret.js";

const SECRET = () => resolveJwtSecret();
export const DEFAULT_MEDIA_URL_TTL_SECONDS = 6 * 60 * 60;

function mac(assetId: string, expiresAt: number): string {
  return createHmac("sha256", `media-url:${SECRET()}`).update(`${assetId}.${expiresAt}`).digest("base64url");
}

export function signMediaToken(assetId: string, ttlSeconds = DEFAULT_MEDIA_URL_TTL_SECONDS, now = Date.now()): string {
  const expiresAt = Math.floor(now / 1000) + ttlSeconds;
  return `${expiresAt}.${mac(assetId, expiresAt)}`;
}

export function verifyMediaToken(assetId: string, token: unknown, now = Date.now()): boolean {
  if (typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const expiresAt = Number(token.slice(0, dot));
  const given = token.slice(dot + 1);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(now / 1000)) return false;
  const expected = mac(assetId, expiresAt);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function mediaUrl(assetId: string, ttlSeconds = DEFAULT_MEDIA_URL_TTL_SECONDS): string {
  return `/api/media/file/${assetId}?t=${signMediaToken(assetId, ttlSeconds)}`;
}
