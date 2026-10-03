// TP007 — lesson media: upload, signed-URL serving, library, delete.
//
// Uploads are streamed to disk (see lib/media-storage.ts), not buffered, and
// are sent as the raw request body:
//   POST /api/media/upload?courseId=<id>
//   Content-Type: <the file's MIME type>      X-File-Name: <encodeURIComponent(name)>
// (a raw body, not multipart, so no extra dependency is needed and large
// videos never sit fully in memory.)
import { Router } from "express";
import { randomBytes } from "node:crypto";
import type { Readable } from "node:stream";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { canAccessCourseContent, canTeachCourse } from "../lib/course-access.js";
import { classifyUpload, isInlineKind, magicMatches, maxBytesFor, sanitizeFilename } from "../lib/media-policy.js";
import { removeFromDisk, resolveStoragePath, streamToDisk, UploadTooLargeError } from "../lib/media-storage.js";
import { mediaUrl, verifyMediaToken } from "../lib/signed-url.js";
import { collectMediaIds, type LessonBlock } from "../lib/lesson-blocks.js";

export const mediaRouter = Router();

function present(a: { id: string; kind: string; mimeType: string; originalName: string; sizeBytes: number; courseId: string | null; createdAt: Date }) {
  return { id: a.id, kind: a.kind, mimeType: a.mimeType, name: a.originalName, sizeBytes: a.sizeBytes, courseId: a.courseId, createdAt: a.createdAt, url: mediaUrl(a.id) };
}

mediaRouter.post("/upload", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const mime = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  let filename = "upload";
  try {
    filename = sanitizeFilename(decodeURIComponent(String(req.headers["x-file-name"] ?? "upload")));
  } catch {
    return res.status(400).json({ message: "X-File-Name must be URI-encoded." });
  }

  const cls = classifyUpload(mime, filename);
  if (!cls.ok) return res.status(cls.status).json({ message: cls.message });

  const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;
  if (courseId && !(await canTeachCourse(req.user!, courseId))) {
    return res.status(403).json({ message: "You don't teach that course." });
  }

  const limit = maxBytesFor(cls.kind);
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > limit) {
    return res.status(413).json({ message: `That ${cls.kind} file is larger than the ${Math.round(limit / 1048576)} MB limit.` });
  }

  const storageKey = `${randomBytes(16).toString("hex")}${cls.ext}`;
  try {
    const stored = await streamToDisk(req as unknown as Readable, storageKey, limit);
    if (stored.bytes === 0) {
      await removeFromDisk(storageKey);
      return res.status(400).json({ message: "The uploaded file is empty." });
    }
    if (!magicMatches(cls.mime, stored.head)) {
      await removeFromDisk(storageKey);
      return res.status(415).json({ message: "The file's contents don't match its declared type." });
    }
    const asset = await prisma.mediaAsset.create({
      data: {
        ownerUserId: req.user!.id,
        courseId: courseId ?? null,
        originalName: filename,
        mimeType: cls.mime,
        kind: cls.kind,
        sizeBytes: stored.bytes,
        storageKey,
        sha256: stored.sha256,
      },
    });
    res.status(201).json(present(asset));
  } catch (err) {
    if (err instanceof UploadTooLargeError) {
      return res.status(413).json({ message: `That ${cls.kind} file is larger than the ${Math.round(limit / 1048576)} MB limit.` });
    }
    console.error("media upload failed", err);
    res.status(500).json({ message: "The upload failed. Please try again." });
  }
});

// The trainer's own library (optionally one course's), for re-using uploads.
mediaRouter.get("/mine", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;
  const assets = await prisma.mediaAsset.findMany({
    where: { ownerUserId: req.user!.id, ...(courseId ? { courseId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(assets.map(present));
});

// Fresh signed URL for an asset the caller may see.
mediaRouter.get("/:id/url", requireAuth, async (req: AuthedRequest, res) => {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
  if (!asset) return res.status(404).json({ message: "File not found." });
  const allowed =
    asset.ownerUserId === req.user!.id ||
    req.user!.role === "SUPER_ADMIN" ||
    (!!asset.courseId && (await canAccessCourseContent(req.user!, asset.courseId)));
  if (!allowed) return res.status(403).json({ message: "You don't have access to that file." });
  res.json(present(asset));
});

// Serves the bytes. Authorised by the signed token minted for an allowed viewer.
// res.sendFile handles Range requests, which is what lets video seeking work.
mediaRouter.get("/file/:id", async (req, res) => {
  if (!verifyMediaToken(req.params.id, req.query.t)) {
    return res.status(403).json({ message: "This link has expired or is invalid." });
  }
  const asset = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
  const abs = asset ? resolveStoragePath(asset.storageKey) : null;
  if (!asset || !abs) return res.status(404).json({ message: "File not found." });

  const inline = isInlineKind(asset.kind, asset.mimeType);
  const safeName = asset.originalName.replace(/["\\\r\n]/g, "_");
  res.sendFile(
    abs,
    {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    },
    (err: unknown) => {
      if (err && !res.headersSent) res.status(404).json({ message: "File not found." });
    }
  );
});

mediaRouter.delete("/:id", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
  if (!asset) return res.status(404).json({ message: "File not found." });
  if (asset.ownerUserId !== req.user!.id && req.user!.role !== "SUPER_ADMIN") {
    return res.status(403).json({ message: "Only the uploader can delete this file." });
  }

  // Refuse while any lesson still uses it (as primary media or inside a block).
  const lessons = await prisma.lesson.findMany({
    where: asset.courseId ? { module: { courseId: asset.courseId } } : { mediaAssetId: asset.id },
    select: { id: true, title: true, mediaAssetId: true, blocks: true },
  });
  const using = lessons.filter(
    (l: { mediaAssetId: string | null; blocks: unknown }) =>
      l.mediaAssetId === asset.id || collectMediaIds(l.blocks as LessonBlock[] | null).includes(asset.id)
  );
  if (using.length > 0) {
    return res.status(409).json({ message: `Still used by: ${using.map((l: { title: string }) => l.title).join(", ")}. Remove it from those lessons first.` });
  }

  await prisma.mediaAsset.delete({ where: { id: asset.id } });
  await removeFromDisk(asset.storageKey);
  res.status(204).send();
});
