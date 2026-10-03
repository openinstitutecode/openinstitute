// LMS022 — SCORM package storage. A trainer uploads a SCORM 1.2 zip; it is
// streamed to disk like any other upload (see media-storage.ts) and then
// extracted into its own directory so its internal relative references
// (the package's own html/css/js/images) resolve when launched in an
// iframe. Requires the "adm-zip" dependency (added to package.json) — this
// sandbox can't `npm install` it, so extraction has not been exercised
// against a real zip here; the extraction logic itself follows adm-zip's
// documented synchronous API exactly as used elsewhere in the Node
// ecosystem for this exact purpose.
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import { uploadRoot } from "./media-storage.js";
import { resolveJwtSecret } from "./jwt-secret.js";

const EXTRACT_KEY_PATTERN = /^[a-f0-9]{32}$/;

export function scormRoot(): string {
  return path.join(uploadRoot(), "scorm");
}

export function newExtractKey(): string {
  return randomBytes(16).toString("hex");
}

/** Only keys this module generates are ever resolved to a path (blocks path traversal). */
export function resolveExtractDir(extractKey: string): string | null {
  if (!EXTRACT_KEY_PATTERN.test(extractKey)) return null;
  return path.join(scormRoot(), extractKey);
}

/**
 * Resolve a file *within* an already-extracted package directory, rejecting
 * any relative path that would escape it (../, absolute paths, etc.).
 */
export function resolveContentFile(extractKey: string, relativePath: string): string | null {
  const dir = resolveExtractDir(extractKey);
  if (!dir) return null;
  const cleaned = relativePath.replace(/^\/+/, "");
  const full = path.normalize(path.join(dir, cleaned));
  if (!full.startsWith(dir + path.sep) && full !== dir) return null;
  return full;
}

export type ManifestInfo = { launchUrl: string; title: string | null };

/**
 * Parses imsmanifest.xml (the SCORM-mandated manifest at the zip root) and
 * returns the default organization's first item's resource href — the file
 * a SCORM 1.2 player is supposed to launch. Falls back to a top-level
 * index.html if the manifest is missing or malformed, so a loosely-packaged
 * "SCORM-ish" zip still launches rather than hard-failing.
 */
export function parseManifest(manifestXml: string): ManifestInfo {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const doc = parser.parse(manifestXml);
  const manifest = doc?.manifest;
  if (!manifest) return { launchUrl: "index.html", title: null };

  const organizations = manifest.organizations;
  const defaultOrgId = organizations?.["@_default"];
  let orgs = organizations?.organization;
  if (!orgs) return { launchUrl: "index.html", title: null };
  if (!Array.isArray(orgs)) orgs = [orgs];
  const org = (defaultOrgId ? orgs.find((o: any) => o["@_identifier"] === defaultOrgId) : undefined) ?? orgs[0];

  let items = org?.item;
  if (!items) return { launchUrl: "index.html", title: org?.title ?? null };
  if (!Array.isArray(items)) items = [items];
  const firstItem = items[0];
  const identifierref = firstItem?.["@_identifierref"];
  const title = firstItem?.title ?? org?.title ?? null;

  let resources = manifest.resources?.resource;
  if (!resources) return { launchUrl: "index.html", title };
  if (!Array.isArray(resources)) resources = [resources];
  const resource = (identifierref ? resources.find((r: any) => r["@_identifier"] === identifierref) : undefined) ?? resources[0];
  const href = resource?.["@_href"];

  return { launchUrl: typeof href === "string" && href.length > 0 ? href : "index.html", title };
}

/** Extracts a zip already on disk (at zipAbsolutePath) into a fresh extractKey directory. */
export async function extractScormZip(zipAbsolutePath: string): Promise<{ extractKey: string; manifest: ManifestInfo }> {
  const extractKey = newExtractKey();
  const dir = resolveExtractDir(extractKey);
  if (!dir) throw new Error("Failed to allocate an extraction directory.");
  await fs.mkdir(dir, { recursive: true });

  const zip = new AdmZip(zipAbsolutePath);
  zip.extractAllTo(dir, true);

  let manifestXml: string;
  try {
    manifestXml = await fs.readFile(path.join(dir, "imsmanifest.xml"), "utf8");
  } catch {
    return { extractKey, manifest: { launchUrl: "index.html", title: null } };
  }
  return { extractKey, manifest: parseManifest(manifestXml) };
}

export async function removeExtractedPackage(extractKey: string): Promise<void> {
  const dir = resolveExtractDir(extractKey);
  if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

// Signed launch tokens — same HMAC pattern as lib/signed-url.ts, scoped to
// "scorm-content" so a media token can't be replayed here or vice versa.
const SECRET = () => resolveJwtSecret();
const DEFAULT_TTL_SECONDS = 3 * 60 * 60;

function mac(packageId: string, expiresAt: number): string {
  return createHmac("sha256", `scorm-content:${SECRET()}`).update(`${packageId}.${expiresAt}`).digest("base64url");
}

export function signScormToken(packageId: string, ttlSeconds = DEFAULT_TTL_SECONDS, now = Date.now()): string {
  const expiresAt = Math.floor(now / 1000) + ttlSeconds;
  return `${expiresAt}.${mac(packageId, expiresAt)}`;
}

export function verifyScormToken(packageId: string, token: unknown, now = Date.now()): boolean {
  if (typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const expiresAt = Number(token.slice(0, dot));
  const given = token.slice(dot + 1);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(now / 1000)) return false;
  const expected = mac(packageId, expiresAt);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
