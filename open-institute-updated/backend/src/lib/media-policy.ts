// TP007 — what may be uploaded. Allow-list only: a file must have a known
// MIME type, a matching extension, AND its first bytes must look like that
// format. HTML, SVG and scripts are refused outright (they'd execute in the
// app's origin if ever opened inline).

export type MediaKind = "video" | "audio" | "image" | "document" | "archive";

type Rule = { kind: MediaKind; exts: string[]; magic: (head: Buffer) => boolean };

const startsWith = (head: Buffer, bytes: number[], offset = 0) => bytes.every((b, i) => head[offset + i] === b);
const ascii = (head: Buffer, text: string, offset = 0) => head.length >= offset + text.length && head.subarray(offset, offset + text.length).toString("latin1") === text;

const isoBmff = (head: Buffer) => ascii(head, "ftyp", 4);
const isZip = (head: Buffer) => startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06]);
const isOle = (head: Buffer) => startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const isMatroska = (head: Buffer) => startsWith(head, [0x1a, 0x45, 0xdf, 0xa3]); // webm

export const RULES: Record<string, Rule> = {
  "video/mp4": { kind: "video", exts: [".mp4", ".m4v"], magic: isoBmff },
  "video/quicktime": { kind: "video", exts: [".mov"], magic: isoBmff },
  "video/webm": { kind: "video", exts: [".webm"], magic: isMatroska },
  "video/ogg": { kind: "video", exts: [".ogv", ".ogg"], magic: (h) => ascii(h, "OggS") },
  "audio/mpeg": { kind: "audio", exts: [".mp3"], magic: (h) => ascii(h, "ID3") || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) },
  "audio/mp4": { kind: "audio", exts: [".m4a"], magic: isoBmff },
  "audio/ogg": { kind: "audio", exts: [".ogg", ".oga", ".opus"], magic: (h) => ascii(h, "OggS") },
  "audio/wav": { kind: "audio", exts: [".wav"], magic: (h) => ascii(h, "RIFF") && ascii(h, "WAVE", 8) },
  "audio/x-wav": { kind: "audio", exts: [".wav"], magic: (h) => ascii(h, "RIFF") && ascii(h, "WAVE", 8) },
  "audio/webm": { kind: "audio", exts: [".weba", ".webm"], magic: isMatroska },
  "image/png": { kind: "image", exts: [".png"], magic: (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47]) },
  "image/jpeg": { kind: "image", exts: [".jpg", ".jpeg"], magic: (h) => startsWith(h, [0xff, 0xd8, 0xff]) },
  "image/gif": { kind: "image", exts: [".gif"], magic: (h) => ascii(h, "GIF8") },
  "image/webp": { kind: "image", exts: [".webp"], magic: (h) => ascii(h, "RIFF") && ascii(h, "WEBP", 8) },
  "application/pdf": { kind: "document", exts: [".pdf"], magic: (h) => ascii(h, "%PDF") },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { kind: "document", exts: [".docx"], magic: isZip },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { kind: "document", exts: [".pptx"], magic: isZip },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { kind: "document", exts: [".xlsx"], magic: isZip },
  "application/msword": { kind: "document", exts: [".doc"], magic: isOle },
  "application/vnd.ms-powerpoint": { kind: "document", exts: [".ppt"], magic: isOle },
  "application/vnd.ms-excel": { kind: "document", exts: [".xls"], magic: isOle },
  "application/zip": { kind: "archive", exts: [".zip"], magic: isZip },
};

/** Per-kind size ceilings (bytes). MAX_UPLOAD_MB (env) caps the whole thing lower if set. */
export const KIND_LIMIT_MB: Record<MediaKind, number> = { video: 500, audio: 100, image: 15, document: 50, archive: 100 };

export function maxBytesFor(kind: MediaKind, envCapMb = Number(process.env.MAX_UPLOAD_MB ?? 500)): number {
  const capMb = Number.isFinite(envCapMb) && envCapMb > 0 ? envCapMb : 500;
  return Math.min(KIND_LIMIT_MB[kind], capMb) * 1024 * 1024;
}

export function extensionOf(filename: string): string {
  const m = /\.[A-Za-z0-9]{1,8}$/.exec(filename);
  return m ? m[0].toLowerCase() : "";
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "upload";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "").replace(/\s+/g, " ").trim();
  return (cleaned || "upload").slice(0, 150);
}

export type UploadClassification =
  | { ok: true; kind: MediaKind; ext: string; mime: string }
  | { ok: false; status: 415; message: string };

export function classifyUpload(mimeType: string, filename: string): UploadClassification {
  const mime = mimeType.split(";")[0].trim().toLowerCase();
  const rule = RULES[mime];
  if (!rule) {
    return { ok: false, status: 415, message: `Files of type "${mime || "unknown"}" can't be uploaded. Allowed: MP4/WebM/MOV video, MP3/M4A/WAV/OGG audio, PNG/JPG/GIF/WebP images, PDF and Office documents, ZIP.` };
  }
  const ext = extensionOf(filename);
  if (!rule.exts.includes(ext)) {
    return { ok: false, status: 415, message: `The file extension "${ext || "(none)"}" doesn't match its type (${mime}).` };
  }
  return { ok: true, kind: rule.kind, ext, mime };
}

/** True when the file's leading bytes really look like the claimed type. */
export function magicMatches(mimeType: string, head: Buffer): boolean {
  const rule = RULES[mimeType.split(";")[0].trim().toLowerCase()];
  return !!rule && head.length >= 8 && rule.magic(head);
}

/** Media that a browser can show inline; everything else is served as a download. */
export function isInlineKind(kind: string, mime: string): boolean {
  return kind === "video" || kind === "audio" || kind === "image" || mime === "application/pdf";
}
