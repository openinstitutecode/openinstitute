import { extensionOf } from "./media-policy.js";

const FILE_RULES: Record<string, { ext: string; magic: Buffer }> = {
  "application/pdf": { ext: ".pdf", magic: Buffer.from("%PDF") },
  "image/png": { ext: ".png", magic: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  "image/jpeg": { ext: ".jpg", magic: Buffer.from([0xff, 0xd8, 0xff]) },
};

export function classifyAdmissionUpload(mime: string, category: string) {
  const normalized = mime.toLowerCase();
  const rule = FILE_RULES[normalized];
  const allowed = category === "portrait_photo"
    ? normalized === "image/png" || normalized === "image/jpeg"
    : normalized === "image/png" || normalized === "application/pdf";
  if (!rule || !allowed) return { ok: false as const, message: "Use a PNG or PDF for documents and a PNG or JPEG passport photo." };
  return { ok: true as const, ext: rule.ext, mime: normalized };
}

export function maxAdmissionUploadBytes(category: string): number {
  return (category === "portrait_photo" ? 5 : 10) * 1024 * 1024;
}

export function admissionMagicMatches(mime: string, filename: string, head: Buffer): boolean {
  const rule = FILE_RULES[mime.toLowerCase()];
  if (!rule) return false;
  const extension = extensionOf(filename);
  const allowedExtensions = mime.toLowerCase() === "image/jpeg" ? [".jpg", ".jpeg"] : [rule.ext];
  return allowedExtensions.includes(extension) && head.subarray(0, rule.magic.length).equals(rule.magic);
}
