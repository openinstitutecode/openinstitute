// TP007 — streams an upload straight to disk (never buffered whole in memory,
// so a 500 MB lecture video doesn't need 500 MB of RAM), counting bytes,
// hashing, and keeping the first bytes for the magic-number check.

import { createHash } from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const SUPABASE_KEY_PREFIX = "sb_";
const KEY_PATTERN = /^(?:sb_)?[a-f0-9]{32}\.[a-z0-9]{1,8}$/;

export class UploadTooLargeError extends Error {
  constructor(public limitBytes: number) {
    super("Upload exceeds the size limit.");
    this.name = "UploadTooLargeError";
  }
}

export class SupabaseStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseStorageError";
  }
}

export function uploadRoot(): string {
  return path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads"));
}

function supabaseStorageConfig() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
  const configured = [url, serviceRoleKey, bucket].filter(Boolean).length;
  if (configured === 0) return null;
  if (configured !== 3) {
    throw new SupabaseStorageError(
      "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET must all be configured."
    );
  }
  return { url: url!, serviceRoleKey: serviceRoleKey!, bucket: bucket! };
}

/** Only keys this module generates are ever resolved to a path (blocks path traversal). */
export function resolveStoragePath(storageKey: string): string | null {
  if (storageKey.startsWith(SUPABASE_KEY_PREFIX)) return null;
  if (!KEY_PATTERN.test(storageKey)) return null;
  return path.join(uploadRoot(), storageKey);
}

export async function storeAdmissionUpload(storageKey: string, mimeType: string): Promise<string> {
  const config = supabaseStorageConfig();
  if (!config) return storageKey;
  const localPath = resolveStoragePath(storageKey);
  if (!localPath) throw new Error("Invalid storage key.");
  const bytes = await fs.readFile(localPath);
  const objectPath = `admissions/${storageKey}`;
  const response = await fetch(
    `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${objectPath}`,
    {
      method: "POST",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": mimeType,
        "x-upsert": "false",
      },
      body: bytes,
    }
  );
  if (!response.ok) {
    throw new SupabaseStorageError(`Supabase Storage upload failed (HTTP ${response.status}).`);
  }
  await fs.unlink(localPath);
  return `${SUPABASE_KEY_PREFIX}${storageKey}`;
}

export async function readAdmissionUpload(storageKey: string): Promise<Buffer | null> {
  if (!KEY_PATTERN.test(storageKey)) return null;
  if (!storageKey.startsWith(SUPABASE_KEY_PREFIX)) {
    const localPath = resolveStoragePath(storageKey);
    if (!localPath) return null;
    try {
      return await fs.readFile(localPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  const config = supabaseStorageConfig();
  if (!config) throw new SupabaseStorageError("Supabase Storage is not configured for this stored document.");
  const objectName = storageKey.slice(SUPABASE_KEY_PREFIX.length);
  const response = await fetch(
    `${config.url}/storage/v1/object/authenticated/${encodeURIComponent(config.bucket)}/admissions/${objectName}`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
    }
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new SupabaseStorageError(`Supabase Storage download failed (HTTP ${response.status}).`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function removeAdmissionUpload(storageKey: string): Promise<void> {
  if (!KEY_PATTERN.test(storageKey)) return;
  if (!storageKey.startsWith(SUPABASE_KEY_PREFIX)) {
    await removeFromDisk(storageKey);
    return;
  }
  const config = supabaseStorageConfig();
  if (!config) throw new SupabaseStorageError("Supabase Storage is not configured for this stored document.");
  const objectName = storageKey.slice(SUPABASE_KEY_PREFIX.length);
  const response = await fetch(
    `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/admissions/${objectName}`,
    {
      method: "DELETE",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
    }
  );
  if (!response.ok && response.status !== 404) {
    throw new SupabaseStorageError(`Supabase Storage cleanup failed (HTTP ${response.status}).`);
  }
}

export async function streamToDisk(
  source: Readable,
  storageKey: string,
  maxBytes: number
): Promise<{ bytes: number; sha256: string; head: Buffer; absolutePath: string }> {
  const absolutePath = resolveStoragePath(storageKey);
  if (!absolutePath) throw new Error("Invalid storage key.");
  await fs.mkdir(uploadRoot(), { recursive: true });

  const hash = createHash("sha256");
  let bytes = 0;
  let head = Buffer.alloc(0);

  const meter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytes += chunk.length;
      if (bytes > maxBytes) return cb(new UploadTooLargeError(maxBytes));
      if (head.length < 32) head = Buffer.concat([head, chunk.subarray(0, 32 - head.length)]);
      hash.update(chunk);
      cb(null, chunk);
    },
  });

  try {
    await pipeline(source, meter, createWriteStream(absolutePath, { flags: "wx" }));
  } catch (err) {
    await fs.unlink(absolutePath).catch(() => undefined);
    throw err;
  }
  return { bytes, sha256: hash.digest("hex"), head, absolutePath };
}

export async function removeFromDisk(storageKey: string): Promise<void> {
  const p = resolveStoragePath(storageKey);
  if (p) await fs.unlink(p).catch(() => undefined);
}
