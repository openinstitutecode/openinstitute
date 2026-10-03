// LMS022 — SCORM support (SCORM 1.2 subset). A trainer uploads a package
// for a lesson whose contentType is "scorm"; the zip is streamed to disk,
// extracted, and its imsmanifest.xml parsed for the launch file. Students
// launch it in an iframe (see frontend's ScormPlayer.tsx), which talks to a
// window.API SCORM 1.2 shim that reads/writes the student's ScormAttempt
// through the routes below — not full SCORM 2004 sequencing/navigation.
import { Router } from "express";
import { randomBytes } from "node:crypto";
import type { Readable } from "node:stream";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { canTeachCourse, canAccessCourseContent } from "../lib/course-access.js";
import { magicMatches, maxBytesFor, sanitizeFilename } from "../lib/media-policy.js";
import { removeFromDisk, resolveStoragePath, streamToDisk, UploadTooLargeError } from "../lib/media-storage.js";
import { extractScormZip, removeExtractedPackage, resolveContentFile, signScormToken, verifyScormToken } from "../lib/scorm-storage.js";

export const scormRouter = Router();

const EXT_MIME: Record<string, string> = {
  ".html": "text/html", ".htm": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".mp4": "video/mp4",
  ".woff": "font/woff", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain",
};

async function loadLessonForCourse(lessonId: string) {
  return prisma.lesson.findUnique({ where: { id: lessonId }, include: { module: { select: { courseId: true } } } });
}

// POST /api/scorm/upload?lessonId=<id>   body: raw zip bytes, Content-Type: application/zip, X-File-Name: <encoded>
scormRouter.post("/upload", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const lessonId = typeof req.query.lessonId === "string" ? req.query.lessonId : undefined;
  if (!lessonId) return res.status(400).json({ message: "lessonId is required." });

  const lesson = await loadLessonForCourse(lessonId);
  if (!lesson) return res.status(404).json({ message: "Lesson not found." });
  if (!(await canTeachCourse(req.user!, lesson.module.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  if (lesson.contentType !== "scorm") {
    return res.status(400).json({ message: "Set this lesson's content type to SCORM before uploading a package." });
  }

  let filename = "package.zip";
  try {
    filename = sanitizeFilename(decodeURIComponent(String(req.headers["x-file-name"] ?? "package.zip")));
  } catch {
    return res.status(400).json({ message: "X-File-Name must be URI-encoded." });
  }

  const limit = maxBytesFor("archive");
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > limit) return res.status(413).json({ message: `The package is larger than the ${Math.round(limit / 1048576)} MB limit.` });

  const storageKey = `${randomBytes(16).toString("hex")}.zip`;
  try {
    const stored = await streamToDisk(req as unknown as Readable, storageKey, limit);
    if (stored.bytes === 0) {
      await removeFromDisk(storageKey);
      return res.status(400).json({ message: "The uploaded file is empty." });
    }
    if (!magicMatches("application/zip", stored.head)) {
      await removeFromDisk(storageKey);
      return res.status(415).json({ message: "That doesn't look like a valid zip file." });
    }

    const { extractKey, manifest } = await extractScormZip(stored.absolutePath);

    const existing = await prisma.scormPackage.findUnique({ where: { lessonId } });
    if (existing) {
      await removeExtractedPackage(existing.extractKey);
      await removeFromDisk(existing.zipStorageKey);
    }

    const pkg = await prisma.scormPackage.upsert({
      where: { lessonId },
      update: { zipStorageKey: storageKey, extractKey, launchUrl: manifest.launchUrl, manifestTitle: manifest.title, uploadedById: req.user!.id },
      create: { lessonId, zipStorageKey: storageKey, extractKey, launchUrl: manifest.launchUrl, manifestTitle: manifest.title, uploadedById: req.user!.id },
    });
    res.status(201).json({ id: pkg.id, launchUrl: pkg.launchUrl, manifestTitle: pkg.manifestTitle });
  } catch (err) {
    if (err instanceof UploadTooLargeError) {
      return res.status(413).json({ message: `The package is larger than the ${Math.round(limit / 1048576)} MB limit.` });
    }
    console.error("scorm upload failed", err);
    res.status(500).json({ message: "The upload failed. Please try again." });
  }
});

// A student (or the trainer previewing) fetches the package + a signed launch URL.
scormRouter.get("/lesson/:lessonId", requireAuth, async (req: AuthedRequest, res) => {
  const lesson = await loadLessonForCourse(req.params.lessonId);
  if (!lesson) return res.status(404).json({ message: "Lesson not found." });
  if (!(await canAccessCourseContent(req.user!, lesson.module.courseId))) return res.status(403).json({ message: "You don't have access to this lesson." });

  const pkg = await prisma.scormPackage.findUnique({ where: { lessonId: req.params.lessonId } });
  if (!pkg) return res.status(404).json({ message: "No SCORM package has been uploaded for this lesson yet." });

  const token = signScormToken(pkg.id);
  res.json({
    packageId: pkg.id,
    manifestTitle: pkg.manifestTitle,
    scormVersion: pkg.scormVersion,
    launchUrl: `/api/scorm/content/${pkg.id}/${pkg.launchUrl}?t=${token}`,
  });
});

// Serves the extracted package's own files (html/js/css/images) under a
// signed token scoped to this one package, mirroring media.ts's pattern.
scormRouter.get("/content/:packageId/*", async (req, res) => {
  if (!verifyScormToken(req.params.packageId, req.query.t)) {
    return res.status(403).json({ message: "This link has expired or is invalid." });
  }
  const pkg = await prisma.scormPackage.findUnique({ where: { id: req.params.packageId } });
  if (!pkg) return res.status(404).json({ message: "Package not found." });

  const relative = (req.params as any)[0] as string;
  const abs = resolveContentFile(pkg.extractKey, relative);
  if (!abs) return res.status(400).json({ message: "Invalid path." });

  const ext = relative.slice(relative.lastIndexOf(".")).toLowerCase();
  const mime = EXT_MIME[ext] ?? "application/octet-stream";
  res.sendFile(
    abs,
    { headers: { "Content-Type": mime, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" } },
    (err: unknown) => {
      if (err && !res.headersSent) res.status(404).json({ message: "File not found in this package." });
    }
  );
});

// ---------------------------------------------------------------- cmi data
// The SCORM 1.2 JS API shim (frontend/src/lib/scorm-api.ts) calls these on
// LMSInitialize (GET, creating the attempt row if new) and on
// LMSCommit/LMSFinish (PUT, saving whatever cmi.* fields changed).
const attemptSchema = z.object({
  lessonStatus: z.enum(["passed", "completed", "failed", "incomplete", "browsed", "not attempted"]).optional(),
  scoreRaw: z.number().nullable().optional(),
  scoreMin: z.number().nullable().optional(),
  scoreMax: z.number().nullable().optional(),
  lessonLocation: z.string().max(1000).nullable().optional(),
  suspendData: z.string().max(64000).nullable().optional(),
  sessionTimeSeconds: z.number().int().min(0).max(24 * 60 * 60).optional(),
});

scormRouter.get("/attempts/:packageId", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const attempt = await prisma.scormAttempt.upsert({
    where: { packageId_studentId: { packageId: req.params.packageId, studentId: student.id } },
    update: {},
    create: { packageId: req.params.packageId, studentId: student.id },
  });
  res.json(attempt);
});

scormRouter.put("/attempts/:packageId", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = attemptSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid SCORM data." });
  const d = parsed.data;

  const student = await prisma.student.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const existing = await prisma.scormAttempt.findUnique({ where: { packageId_studentId: { packageId: req.params.packageId, studentId: student.id } } });
  const addedSeconds = d.sessionTimeSeconds ?? 0;

  const attempt = await prisma.scormAttempt.upsert({
    where: { packageId_studentId: { packageId: req.params.packageId, studentId: student.id } },
    update: {
      ...(d.lessonStatus !== undefined ? { lessonStatus: d.lessonStatus } : {}),
      ...(d.scoreRaw !== undefined ? { scoreRaw: d.scoreRaw } : {}),
      ...(d.scoreMin !== undefined ? { scoreMin: d.scoreMin } : {}),
      ...(d.scoreMax !== undefined ? { scoreMax: d.scoreMax } : {}),
      ...(d.lessonLocation !== undefined ? { lessonLocation: d.lessonLocation } : {}),
      ...(d.suspendData !== undefined ? { suspendData: d.suspendData } : {}),
      sessionTimeSeconds: addedSeconds,
      totalTimeSeconds: (existing?.totalTimeSeconds ?? 0) + addedSeconds,
    },
    create: {
      packageId: req.params.packageId,
      studentId: student.id,
      lessonStatus: d.lessonStatus ?? "incomplete",
      scoreRaw: d.scoreRaw ?? null,
      scoreMin: d.scoreMin ?? null,
      scoreMax: d.scoreMax ?? null,
      lessonLocation: d.lessonLocation ?? null,
      suspendData: d.suspendData ?? null,
      sessionTimeSeconds: addedSeconds,
      totalTimeSeconds: addedSeconds,
    },
  });

  // A completed/passed SCORM attempt also marks the underlying Lesson
  // complete, so it counts toward LMS019's completion rule like any other
  // lesson — SCORM shouldn't be a second, disconnected progress system.
  if (d.lessonStatus === "completed" || d.lessonStatus === "passed") {
    const pkg = await prisma.scormPackage.findUnique({ where: { id: req.params.packageId }, select: { lessonId: true } });
    if (pkg) {
      await prisma.lessonProgress.upsert({
        where: { studentId_lessonId: { studentId: student.id, lessonId: pkg.lessonId } },
        update: {},
        create: { studentId: student.id, lessonId: pkg.lessonId },
      });
    }
  }

  res.json(attempt);
});

// Trainer roster view — every student's SCORM attempt for this package.
scormRouter.get("/attempts/:packageId/all", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const pkg = await prisma.scormPackage.findUnique({ where: { id: req.params.packageId }, include: { lesson: { include: { module: { select: { courseId: true } } } } } });
  if (!pkg) return res.status(404).json({ message: "Package not found." });
  if (!(await canTeachCourse(req.user!, pkg.lesson.module.courseId))) return res.status(403).json({ message: "You don't teach this course." });

  const attempts = await prisma.scormAttempt.findMany({
    where: { packageId: req.params.packageId },
    include: { student: { select: { fullName: true, studentNumber: true } } },
    orderBy: { lastCommittedAt: "desc" },
  });
  res.json(attempts);
});
