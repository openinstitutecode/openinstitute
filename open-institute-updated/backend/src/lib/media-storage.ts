// TP007 — streams an upload straight to disk (never buffered whole in memory,
// so a 500 MB lecture video doesn't need 500 MB of RAM), counting bytes,
// hashing, and keeping the first bytes for the magic-number check.

import { createHash } from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export class UploadTooLargeError extends Error {
  constructor(public limitBytes: number) {
    super("Upload exceeds the size limit.");
    this.name = "UploadTooLargeError";
  }
}

export function uploadRoot(): string {
  return path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads"));
}

const KEY_PATTERN = /^[a-f0-9]{32}\.[a-z0-9]{1,8}$/;

/** Only keys this module generates are ever resolved to a path (blocks path traversal). */
export function resolveStoragePath(storageKey: string): string | null {
  if (!KEY_PATTERN.test(storageKey)) return null;
  return path.join(uploadRoot(), storageKey);
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
