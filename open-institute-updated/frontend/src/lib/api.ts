import { useEffect, useState } from "react";

const API_BASE = "/api";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("kvbdtc_token");
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.message ?? `Request failed (${res.status})`, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// EX039 — a couple of report endpoints return a raw CSV/HTML file rather
// than JSON (Content-Disposition: attachment for the CSV, an inline HTML
// page for the results slip). apiFetch() always parses JSON, so it can't be
// reused here — this is the equivalent for a file response, still sending
// the same Bearer token apiFetch does (this app has no cookie session, so a
// plain <a href> to an authenticated route would 401).
export async function apiFetchBlob(path: string): Promise<{ blob: Blob; filename: string | null }> {
  const token = localStorage.getItem("kvbdtc_token");
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.message ?? `Request failed (${res.status})`, res.status);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  return { blob: await res.blob(), filename: match?.[1] ?? null };
}

// Triggers a browser download/open for a blob fetched via apiFetchBlob — a
// CSV downloads, anything else (the results-slip HTML) opens in a new tab.
export function openOrDownloadBlob(blob: Blob, filename: string | null) {
  const url = URL.createObjectURL(blob);
  if (filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  } else {
    window.open(url, "_blank");
  }
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// SP002 — real personalized name for the PortalShell header, shared across
// every portal instead of each page hardcoding a placeholder. Cached at
// module level (one fetch per page load, not one per page component) with a
// single in-flight promise so mounting several portal pages in quick
// succession doesn't fire duplicate requests.
type WhoAmI = { name: string; role: string };
let whoAmICache: WhoAmI | null = null;
let whoAmIInFlight: Promise<WhoAmI> | null = null;

export function useCurrentUserName(): string {
  const [name, setName] = useState<string>(whoAmICache?.name ?? "");

  useEffect(() => {
    if (whoAmICache) {
      setName(whoAmICache.name);
      return;
    }
    if (!whoAmIInFlight) {
      whoAmIInFlight = apiFetch<WhoAmI>("/me/whoami").catch(() => ({ name: "User", role: "" }));
    }
    let cancelled = false;
    whoAmIInFlight.then((result) => {
      whoAmICache = result;
      if (!cancelled) setName(result.name);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return name;
}

export function getRole(): string | null {
  const token = localStorage.getItem("kvbdtc_token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

// TP007 — upload a lesson media file (video/audio/image/document) with progress.
// The file is sent as the raw request body (see backend routes/media.ts).
export type UploadedMedia = { id: string; kind: string; mimeType: string; name: string; sizeBytes: number; url: string; courseId: string | null };

const MIME_BY_EXT: Record<string, string> = {
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", ogv: "video/ogg",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", oga: "audio/ogg", opus: "audio/ogg",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  pdf: "application/pdf", zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword", ppt: "application/vnd.ms-powerpoint", xls: "application/vnd.ms-excel",
};

export function uploadMedia(file: File, courseId: string, onProgress?: (percent: number) => void): Promise<UploadedMedia> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const mime = file.type || MIME_BY_EXT[ext] || "application/octet-stream";
    const token = localStorage.getItem("kvbdtc_token");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/media/upload?courseId=${encodeURIComponent(courseId)}`);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (ev) => {
      if (onProgress && ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onerror = () => reject(new ApiError("Network error while uploading. Check your connection and try again.", 0));
    xhr.onload = () => {
      let body: { message?: string } & Partial<UploadedMedia> = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error body (e.g. a proxy limit page) */
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as UploadedMedia);
      const fallback = xhr.status === 413 ? "That file is too large." : `Upload failed (${xhr.status}).`;
      reject(new ApiError(body.message ?? fallback, xhr.status));
    };
    xhr.send(file);
  });
}

// LMS022 — same raw-body XHR upload pattern as uploadMedia, pointed at the
// SCORM route instead. Zips can be large, so this reports progress too.
export function uploadScormPackage(file: File, lessonId: string, onProgress?: (percent: number) => void): Promise<{ id: string; launchUrl: string; manifestTitle: string | null }> {
  return new Promise((resolve, reject) => {
    const token = localStorage.getItem("kvbdtc_token");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/scorm/upload?lessonId=${encodeURIComponent(lessonId)}`);
    xhr.setRequestHeader("Content-Type", "application/zip");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (ev) => {
      if (onProgress && ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onerror = () => reject(new ApiError("Network error while uploading. Check your connection and try again.", 0));
    xhr.onload = () => {
      let body: any = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON error body */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body);
      reject(new ApiError(body.message ?? `Upload failed (${xhr.status}).`, xhr.status));
    };
    xhr.send(file);
  });
}

// Batch 70 — KFX-048: send one of these per user action (not per retry) so a double click or retry cannot create two records.
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  return c?.randomUUID ? c.randomUUID() : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}


// Batch 77 — ASG009-016: upload one file of student work for an assignment (raw body, same convention as uploadMedia).
export type AssignmentFile = { id: string; name: string; sizeBytes: number; kind: string; mimeType: string };
export function uploadAssignmentFile(assignmentId: string, file: File, onProgress?: (percent: number) => void): Promise<AssignmentFile> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const mime = file.type || MIME_BY_EXT[ext] || "application/octet-stream";
    const token = localStorage.getItem("kvbdtc_token");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/assignments/${encodeURIComponent(assignmentId)}/files`);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (ev) => { if (onProgress && ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100)); };
    xhr.onerror = () => reject(new ApiError("Network error while uploading. Check your connection and try again.", 0));
    xhr.onload = () => {
      let body: { message?: string } & Partial<AssignmentFile> = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* proxy page */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as AssignmentFile);
      reject(new ApiError(body.message ?? `Upload failed (${xhr.status}).`, xhr.status));
    };
    xhr.send(file);
  });
}

// Batch 77 — open a short-lived link to a stored file (submission, feedback, attachment) in a new tab.
export async function openStoredFile(assetId: string) {
  const f = await apiFetch<{ url: string }>(`/assignments/files/${assetId}/url`);
  window.open(f.url, "_blank", "noopener");
}

export async function downloadFrom(path: string, fallbackName: string) {
  const { blob, filename } = await apiFetchBlob(path);
  openOrDownloadBlob(blob, filename ?? fallbackName);
}

export const dateTimeLocalToIso = (v: string) => (v ? new Date(v).toISOString() : null);
export const isoToDateTimeLocal = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
