import crypto from "node:crypto";

// VBI010/045 — encryption at rest for IntegrationCredential.secret (Batch 66).
//
// Batch 65 stored webhook secrets as plaintext in Postgres and told operators to "use KMS". This
// is the in-app half of that: AES-256-GCM (authenticated) with a key that lives OUTSIDE the
// database, in INTEGRATION_SECRET_ENCRYPTION_KEY (32 bytes, hex or base64). A database dump or a
// read-only SQL injection therefore no longer yields usable signing secrets.
//
// Stored format: "enc:v1:<iv b64url>:<tag b64url>:<ciphertext b64url>". Anything NOT starting with
// "enc:v1:" is treated as a legacy plaintext secret so already-issued credentials keep working
// until scripts/encrypt-integration-secrets.ts rewrites them.
//
// Not a substitute for a real KMS (the key still sits in the process environment) — but it is real
// encryption with tamper detection, dependency-free, and the key can come FROM a KMS at deploy time.

const PREFIX = "enc:v1:";

export function loadKey(raw = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY): Buffer | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed) ? Buffer.from(trimmed, "hex") : Buffer.from(trimmed, "base64");
  if (key.length !== 32) {
    throw new Error("INTEGRATION_SECRET_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex chars, or base64 of 32 bytes).");
  }
  return key;
}

export const isEncrypted = (stored: string): boolean => stored.startsWith(PREFIX);

export function encryptSecret(plain: string, key: Buffer | null = loadKey()): string {
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("INTEGRATION_SECRET_ENCRYPTION_KEY is required in production to store integration credentials.");
    }
    return plain; // development convenience only — see decryptSecret's legacy branch
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ct.toString("base64url")}`;
}

export function decryptSecret(stored: string, key: Buffer | null = loadKey()): string {
  if (!isEncrypted(stored)) return stored; // legacy plaintext row
  if (!key) throw new Error("Credential is encrypted but INTEGRATION_SECRET_ENCRYPTION_KEY is not set.");
  const [iv, tag, ct] = stored.slice(PREFIX.length).split(":");
  if (!iv || !tag || !ct) throw new Error("Malformed encrypted credential.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
