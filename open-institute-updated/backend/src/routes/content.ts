import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { canTeachCourse, trainerIdForUser, canAccessCourseContent, isLearnerRole, courseGate } from "../lib/course-access.js";
import {
  blocksSchema,
  blocksToMarkdown,
  checkBlockRefs,
  collectMediaIds,
  estimateMinutes,
  isHttpUrl,
  type LessonBlock,
} from "../lib/lesson-blocks.js";
import { presentLessons } from "../lib/lesson-delivery.js";
import { handInAssignment } from "./assignments-v2.js";

export const contentRouter = Router();

// LMS037 — set CONTENT_REVIEW_REQUIRED=false to let trainers' edits go live
// without a QA approval step (default: edits to a PUBLISHED lesson wait for approval).
const REVIEW_REQUIRED = process.env.CONTENT_REVIEW_REQUIRED !== "false";

const notYours = (res: { status: (n: number) => { json: (b: unknown) => unknown } }) =>
  res.status(403).json({ message: "You don't teach this course." });

async function loadLesson(id: string) {
  return prisma.lesson.findUnique({ where: { id }, include: { module: { select: { id: true, courseId: true } } } });
}

/** Every media id a lesson references must exist and be the actor's own upload or belong to this course. */
async function checkMedia(ids: string[], courseId: string, actor: { id: string; role: string }): Promise<string | null> {
  if (ids.length === 0) return null;
  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: ids } }, select: { id: true, courseId: true, ownerUserId: true } });
  const byId = new Map(assets.map((a: { id: string; courseId: string | null; ownerUserId: string }) => [a.id, a]));
  for (const id of ids) {
    const a = byId.get(id) as { courseId: string | null; ownerUserId: string } | undefined;
    if (!a) return "One of the attached files no longer exists — re-upload it.";
    if (actor.role !== "SUPER_ADMIN" && a.courseId !== courseId && a.ownerUserId !== actor.id) return "You can only attach files you uploaded.";
  }
  return null;
}

// ---------------------------------------------------------------- modules
const moduleSchema = z.object({ courseId: z.string(), title: z.string().min(2).max(200), order: z.number().int().optional() });

contentRouter.post("/modules", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = moduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid module." });
  if (!(await canTeachCourse(req.user!, parsed.data.courseId))) return notYours(res);
  let order = parsed.data.order;
  if (order === undefined) {
    const last = await prisma.courseModule.aggregate({ where: { courseId: parsed.data.courseId }, _max: { order: true } });
    order = (last._max.order ?? 0) + 1;
  }
  const module_ = await prisma.courseModule.create({ data: { courseId: parsed.data.courseId, title: parsed.data.title, order } });
  res.status(201).json(module_);
});

contentRouter.patch("/modules/:id", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = z.object({ title: z.string().min(2).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid module." });
  const mod = await prisma.courseModule.findUnique({ where: { id: req.params.id } });
  if (!mod) return res.status(404).json({ message: "Module not found." });
  if (!(await canTeachCourse(req.user!, mod.courseId))) return notYours(res);
  res.json(await prisma.courseModule.update({ where: { id: mod.id }, data: { title: parsed.data.title } }));
});

contentRouter.delete("/modules/:id", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const mod = await prisma.courseModule.findUnique({ where: { id: req.params.id }, include: { lessons: { select: { id: true } } } });
  if (!mod) return res.status(404).json({ message: "Module not found." });
  if (!(await canTeachCourse(req.user!, mod.courseId))) return notYours(res);
  if (mod.lessons.length > 0 && req.query.force !== "true") {
    const progress = await prisma.lessonProgress.count({ where: { lessonId: { in: mod.lessons.map((l: { id: string }) => l.id) } } });
    return res.status(409).json({
      message: `This module has ${mod.lessons.length} lesson(s)${progress ? ` and ${progress} student completion record(s)` : ""}. Deleting it removes them permanently.`,
      lessons: mod.lessons.length,
      progressRecords: progress,
    });
  }
  await prisma.courseModule.delete({ where: { id: mod.id } });
  res.status(204).send();
});

// The builder's course tree: every module and lesson, drafts included.
contentRouter.get("/course/:courseId/outline", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const { courseId } = req.params;
  if (!(await canTeachCourse(req.user!, courseId))) return notYours(res);
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      unit: { select: { id: true, code: true, title: true, learningOutcomes: true } },
      modules: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            orderBy: { order: "asc" },
            select: { id: true, title: true, order: true, contentType: true, durationMins: true, isPublished: true, approvalStatus: true, blocks: true, mediaAssetId: true, contentUrl: true },
          },
        },
      },
    },
  });
  if (!course) return res.status(404).json({ message: "Course not found." });
  res.json({
    course: { id: course.id, title: course.title, unit: course.unit },
    modules: course.modules.map((m: any) => ({
      id: m.id,
      title: m.title,
      order: m.order,
      lessons: m.lessons.map((l: any) => ({
        id: l.id,
        title: l.title,
        order: l.order,
        contentType: l.contentType,
        durationMins: l.durationMins,
        isPublished: l.isPublished,
        approvalStatus: l.approvalStatus,
        blockCount: Array.isArray(l.blocks) ? l.blocks.length : 0,
        hasMedia: !!l.mediaAssetId || !!l.contentUrl,
      })),
    })),
  });
});

// Reorder in one atomic step, including moving lessons between modules.
// The payload must list EVERY module and lesson of the course exactly once,
// so a stale browser tab can't silently drop or duplicate content.
contentRouter.put("/course/:courseId/structure", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const { courseId } = req.params;
  const parsed = z.object({ modules: z.array(z.object({ id: z.string(), lessonIds: z.array(z.string()) })) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid structure." });
  if (!(await canTeachCourse(req.user!, courseId))) return notYours(res);

  const modules = await prisma.courseModule.findMany({ where: { courseId }, include: { lessons: { select: { id: true } } } });
  const moduleIds = new Set<string>(modules.map((m: { id: string }) => m.id));
  const lessonIds = new Set<string>(modules.flatMap((m: { lessons: { id: string }[] }) => m.lessons.map((l) => l.id)));
  const sentModules = parsed.data.modules.map((m) => m.id);
  const sentLessons = parsed.data.modules.flatMap((m) => m.lessonIds);
  const sameSet = (sent: string[], have: Set<string>) => sent.length === have.size && new Set(sent).size === sent.length && sent.every((x) => have.has(x));
  if (!sameSet(sentModules, moduleIds) || !sameSet(sentLessons, lessonIds)) {
    return res.status(409).json({ message: "The course changed since you loaded it. Refresh and try again." });
  }

  await prisma.$transaction(
    parsed.data.modules.flatMap((m, mi) => [
      prisma.courseModule.update({ where: { id: m.id }, data: { order: mi + 1 } }),
      ...m.lessonIds.map((lid, li) => prisma.lesson.update({ where: { id: lid }, data: { moduleId: m.id, order: li + 1 } })),
    ])
  );
  res.json({ ok: true });
});

// ---------------------------------------------------------------- lessons
const httpUrl = z.string().max(2048).refine(isHttpUrl, "Must be an http(s) URL.");
const lessonFields = {
  title: z.string().min(2).max(200),
  contentType: z.enum(["video", "reading", "interactive", "scorm"]),
  contentUrl: httpUrl.nullable().optional(),
  contentBody: z.string().max(200000).optional(),
  blocks: blocksSchema.nullable().optional(),
  mediaAssetId: z.string().nullable().optional(),
  isPublished: z.boolean().optional(),
  durationMins: z.number().int().positive().max(1000).nullable().optional(),
  outcomesCovered: z.array(z.string()).optional(),
  reviewDueDate: z.string().datetime().nullable().optional(),
  // LMS007 / LMS024
  tags: z.array(z.string().max(40)).max(20).optional(),
  offlineAvailable: z.boolean().optional(),
};
const createLessonSchema = z.object({ moduleId: z.string(), order: z.number().int().optional(), ...lessonFields });
const updateLessonSchema = z.object(lessonFields).partial();

const jsonEq = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

contentRouter.post("/lessons", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = createLessonSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid lesson.", issues: parsed.error.issues?.slice(0, 3) });
  const d = parsed.data;

  const mod = await prisma.courseModule.findUnique({ where: { id: d.moduleId } });
  if (!mod) return res.status(404).json({ message: "Module not found." });
  if (!(await canTeachCourse(req.user!, mod.courseId))) return notYours(res);

  const blocks = (d.blocks ?? null) as LessonBlock[] | null;
  if (blocks) {
    const problem = checkBlockRefs(blocks);
    if (problem) return res.status(400).json({ message: problem });
  }
  const mediaProblem = await checkMedia([...(d.mediaAssetId ? [d.mediaAssetId] : []), ...collectMediaIds(blocks)], mod.courseId, req.user!);
  if (mediaProblem) return res.status(400).json({ message: mediaProblem });

  let order = d.order;
  if (order === undefined) {
    const last = await prisma.lesson.aggregate({ where: { moduleId: d.moduleId }, _max: { order: true } });
    order = (last._max.order ?? 0) + 1;
  }

  const lesson = await prisma.lesson.create({
    data: {
      moduleId: d.moduleId,
      title: d.title,
      order,
      contentType: d.contentType,
      contentUrl: d.contentUrl ?? null,
      contentBody: blocks ? blocksToMarkdown(blocks) : d.contentBody ?? null,
      blocks: blocks ?? Prisma.DbNull,
      mediaAssetId: d.mediaAssetId ?? null,
      // New lessons start as drafts — nothing reaches students until the trainer publishes.
      isPublished: d.isPublished ?? false,
      durationMins: d.durationMins ?? (blocks ? estimateMinutes(blocks) : null),
      outcomesCovered: d.outcomesCovered ?? [],
      reviewDueDate: d.reviewDueDate ? new Date(d.reviewDueDate) : null,
      tags: d.tags ?? [],
      offlineAvailable: d.offlineAvailable ?? false,
    },
  });
  res.status(201).json(lesson);
});

// TP005 — every substantive edit is snapshotted into LessonVersion BEFORE the
// live row changes. TP006 — "substantive" now includes blocks and media, and
// an unchanged save (autosave) is not an edit at all.
contentRouter.patch("/lessons/:id", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = updateLessonSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid update.", issues: parsed.error.issues?.slice(0, 3) });
  const p = parsed.data;

  const existing = await loadLesson(req.params.id);
  if (!existing) return res.status(404).json({ message: "Lesson not found." });
  const courseId = existing.module.courseId;
  if (!(await canTeachCourse(req.user!, courseId))) return notYours(res);

  const blocks = p.blocks as LessonBlock[] | null | undefined;
  if (blocks) {
    const problem = checkBlockRefs(blocks);
    if (problem) return res.status(400).json({ message: problem });
  }
  const mediaProblem = await checkMedia(
    [...(p.mediaAssetId ? [p.mediaAssetId] : []), ...collectMediaIds(blocks ?? null)],
    courseId,
    req.user!
  );
  if (mediaProblem) return res.status(400).json({ message: mediaProblem });

  const data: Record<string, unknown> = {};
  for (const key of ["title", "contentType", "contentUrl", "durationMins", "outcomesCovered", "isPublished", "mediaAssetId", "tags", "offlineAvailable"] as const) {
    if (p[key] !== undefined) data[key] = p[key];
  }
  if (p.reviewDueDate !== undefined) data.reviewDueDate = p.reviewDueDate ? new Date(p.reviewDueDate) : null;

  if (blocks !== undefined) {
    data.blocks = blocks === null ? Prisma.DbNull : blocks;
    if (blocks) {
      data.contentBody = blocksToMarkdown(blocks);
      if (p.durationMins === undefined && existing.durationMins == null) data.durationMins = estimateMinutes(blocks);
    } else if (p.contentBody !== undefined) {
      data.contentBody = p.contentBody;
    }
  } else if (p.contentBody !== undefined) {
    data.contentBody = p.contentBody;
    if (existing.blocks != null) data.blocks = Prisma.DbNull; // a plain-text edit takes over from blocks
  }

  const changed =
    (data.contentBody !== undefined && data.contentBody !== existing.contentBody) ||
    (p.contentUrl !== undefined && p.contentUrl !== existing.contentUrl) ||
    (p.mediaAssetId !== undefined && p.mediaAssetId !== existing.mediaAssetId) ||
    (blocks !== undefined && !jsonEq(blocks, existing.blocks));

  const willBePublished = p.isPublished ?? existing.isPublished;
  // Only content students can already see needs QA sign-off; drafts and first publication don't.
  const needsReview = REVIEW_REQUIRED && changed && req.user!.role !== "SUPER_ADMIN" && existing.isPublished && willBePublished;

  const lesson = await prisma.$transaction(async (tx) => {
    if (changed) {
      await tx.lessonVersion.create({
        data: {
          lessonId: existing.id,
          contentBody: existing.contentBody,
          contentUrl: existing.contentUrl,
          blocks: existing.blocks ?? Prisma.DbNull,
          mediaAssetId: existing.mediaAssetId,
          wasApproved: existing.approvalStatus === "approved",
          editedById: req.user!.id,
        },
      });
    }
    return tx.lesson.update({
      where: { id: existing.id },
      data: { ...data, ...(needsReview ? { approvalStatus: "pending_review", approvedById: null, approvedAt: null } : {}) },
    });
  });
  res.json(lesson);
});

// One lesson exactly as the trainer authored it (blocks + resolved media), for the builder.
contentRouter.get("/lessons/:id/full", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const lesson = await loadLesson(req.params.id);
  if (!lesson) return res.status(404).json({ message: "Lesson not found." });
  if (!(await canTeachCourse(req.user!, lesson.module.courseId))) return notYours(res);
  const [presented] = await presentLessons([lesson], { forStaff: true });
  const versionCount = await prisma.lessonVersion.count({ where: { lessonId: lesson.id } });
  res.json({ ...presented, courseId: lesson.module.courseId, versionCount });
});

contentRouter.delete("/lessons/:id", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const lesson = await loadLesson(req.params.id);
  if (!lesson) return res.status(404).json({ message: "Lesson not found." });
  if (!(await canTeachCourse(req.user!, lesson.module.courseId))) return notYours(res);
  const progress = await prisma.lessonProgress.count({ where: { lessonId: lesson.id } });
  if (progress > 0 && req.query.force !== "true") {
    return res.status(409).json({ message: `${progress} student completion record(s) exist for this lesson. Deleting it removes them permanently.`, progressRecords: progress });
  }
  await prisma.lesson.delete({ where: { id: lesson.id } });
  res.status(204).send();
});

contentRouter.post("/lessons/:id/duplicate", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const src = await loadLesson(req.params.id);
  if (!src) return res.status(404).json({ message: "Lesson not found." });
  if (!(await canTeachCourse(req.user!, src.module.courseId))) return notYours(res);
  const last = await prisma.lesson.aggregate({ where: { moduleId: src.moduleId }, _max: { order: true } });
  const copy = await prisma.lesson.create({
    data: {
      moduleId: src.moduleId,
      title: `${src.title} (copy)`.slice(0, 200),
      order: (last._max.order ?? 0) + 1,
      contentType: src.contentType,
      contentUrl: src.contentUrl,
      contentBody: src.contentBody,
      blocks: src.blocks ?? Prisma.DbNull,
      mediaAssetId: src.mediaAssetId,
      durationMins: src.durationMins,
      outcomesCovered: src.outcomesCovered,
      isPublished: false,
    },
  });
  res.status(201).json(copy);
});

contentRouter.get("/lessons/:id/versions", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const lesson = await loadLesson(req.params.id);
  if (!lesson) return res.status(404).json({ message: "Lesson not found." });
  if (!(await canTeachCourse(req.user!, lesson.module.courseId))) return notYours(res);
  const versions = await prisma.lessonVersion.findMany({ where: { lessonId: lesson.id }, orderBy: { editedAt: "asc" } });
  res.json(versions.map((v: any, i: number) => ({ ...v, version: i + 1 })));
});

// Restore an earlier snapshot. The current content is snapshotted first, so a
// restore is itself undoable, and it goes through the same approval rule.
contentRouter.post("/lessons/:id/versions/:versionId/restore", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const lesson = await loadLesson(req.params.id);
  if (!lesson) return res.status(404).json({ message: "Lesson not found." });
  if (!(await canTeachCourse(req.user!, lesson.module.courseId))) return notYours(res);
  const version = await prisma.lessonVersion.findFirst({ where: { id: req.params.versionId, lessonId: lesson.id } });
  if (!version) return res.status(404).json({ message: "Version not found." });

  const needsReview = REVIEW_REQUIRED && req.user!.role !== "SUPER_ADMIN" && lesson.isPublished;
  const restored = await prisma.$transaction(async (tx) => {
    await tx.lessonVersion.create({
      data: {
        lessonId: lesson.id,
        contentBody: lesson.contentBody,
        contentUrl: lesson.contentUrl,
        blocks: lesson.blocks ?? Prisma.DbNull,
        mediaAssetId: lesson.mediaAssetId,
        wasApproved: lesson.approvalStatus === "approved",
        editedById: req.user!.id,
      },
    });
    return tx.lesson.update({
      where: { id: lesson.id },
      data: {
        contentBody: version.contentBody,
        contentUrl: version.contentUrl,
        blocks: version.blocks ?? Prisma.DbNull,
        mediaAssetId: version.mediaAssetId,
        ...(needsReview ? { approvalStatus: "pending_review", approvedById: null, approvedAt: null } : {}),
      },
    });
  });
  res.json(restored);
});

// LMS037 — Content approval queue. A trainer's substantive edit to a
// published lesson puts it into pending_review; students keep seeing the last
// approved content (lib/lesson-delivery.ts) until QA decides here.
contentRouter.get(
  "/lessons/pending-review",
  requireAuth,
  requireRole("QA_OFFICER", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const pending = await prisma.lesson.findMany({
      where: { approvalStatus: "pending_review" },
      include: {
        module: { include: { course: { select: { title: true } } } },
        versions: { where: { wasApproved: true }, orderBy: { editedAt: "desc" }, take: 1 },
      },
      orderBy: { title: "asc" },
    });
    res.json(
      pending.map((l: any) => ({
        id: l.id,
        title: l.title,
        courseTitle: l.module.course.title,
        contentType: l.contentType,
        previousVersion: l.versions[0] ?? null,
      }))
    );
  }
);

contentRouter.patch(
  "/lessons/:id/approve",
  requireAuth,
  requireRole("QA_OFFICER", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    try {
      const lesson = await prisma.lesson.update({
        where: { id: req.params.id },
        data: { approvalStatus: "approved", approvedById: req.user!.id, approvedAt: new Date() },
      });
      res.json(lesson);
    } catch {
      res.status(404).json({ message: "Lesson not found." });
    }
  }
);

// Reject: restore the last APPROVED snapshot (not merely the previous edit —
// there may have been several unreviewed edits in between).
contentRouter.patch(
  "/lessons/:id/reject",
  requireAuth,
  requireRole("QA_OFFICER", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const lastApproved = await prisma.lessonVersion.findFirst({
      where: { lessonId: req.params.id, wasApproved: true },
      orderBy: { editedAt: "desc" },
    });
    try {
      const lesson = await prisma.lesson.update({
        where: { id: req.params.id },
        data: {
          approvalStatus: "approved",
          approvedById: req.user!.id,
          approvedAt: new Date(),
          ...(lastApproved
            ? {
                contentBody: lastApproved.contentBody,
                contentUrl: lastApproved.contentUrl,
                blocks: lastApproved.blocks ?? Prisma.DbNull,
                mediaAssetId: lastApproved.mediaAssetId,
              }
            : {}),
        },
      });
      res.json(lesson);
    } catch {
      res.status(404).json({ message: "Lesson not found." });
    }
  }
);

// LMS038 — content review dates. A trainer sees only their own courses' lessons.
contentRouter.get("/lessons/overdue-review", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  let courseFilter: Record<string, unknown> = {};
  if (req.user!.role === "TRAINER") {
    const trainerId = await trainerIdForUser(req.user!.id);
    if (!trainerId) return res.json([]);
    courseFilter = { module: { course: { trainerId } } };
  }
  const overdue = await prisma.lesson.findMany({
    where: { reviewDueDate: { lt: new Date() }, ...courseFilter },
    include: { module: { include: { course: { select: { title: true } } } } },
  });
  res.json(overdue.map((l: any) => ({ id: l.id, title: l.title, courseTitle: l.module.course.title, reviewDueDate: l.reviewDueDate })));
});

contentRouter.patch("/lessons/:id/mark-reviewed", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const existing = await loadLesson(req.params.id);
  if (!existing) return res.status(404).json({ message: "Lesson not found." });
  if (!(await canTeachCourse(req.user!, existing.module.courseId))) return notYours(res);
  const lesson = await prisma.lesson.update({ where: { id: req.params.id }, data: { lastReviewedAt: new Date() } });
  res.json(lesson);
});

// LMS040 — LMS administration: a single real aggregate view (content
// counts by type, overdue-review count) rather than a single settings
// page with nothing behind it.
contentRouter.get("/lms-summary", requireAuth, requireRole("TRAINER", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"), async (_req: AuthedRequest, res) => {
  const lessons = await prisma.lesson.findMany();
  const byType = lessons.reduce<Record<string, number>>((acc, l) => {
    acc[l.contentType] = (acc[l.contentType] ?? 0) + 1;
    return acc;
  }, {});
  const overdueCount = lessons.filter((l) => l.reviewDueDate && l.reviewDueDate < new Date()).length;
  const noOutcomesMapped = lessons.filter((l) => l.outcomesCovered.length === 0).length;

  res.json({
    totalLessons: lessons.length,
    byType,
    overdueForReview: overdueCount,
    lessonsWithoutOutcomesMapped: noOutcomesMapped,
  });
});

// TP010/LMS016 — assignment creation.
const assignmentSchema = z.object({
  courseId: z.string(),
  title: z.string().min(2),
  instructions: z.string().min(2),
  dueAt: z.string().datetime(),
  totalMarks: z.number().int().positive(),
});

contentRouter.post("/assignments", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = assignmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid assignment." });
  if (!(await canTeachCourse(req.user!, parsed.data.courseId))) return notYours(res);
  const assignment = await prisma.assignment.create({
    data: { ...parsed.data, dueAt: new Date(parsed.data.dueAt) },
  });
  res.status(201).json(assignment);
});

contentRouter.get("/assignments/course/:courseId", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await courseGate(req, res, req.params.courseId))) return;
  const learner = isLearnerRole(req.user!.role);
  const now = new Date();
  const assignments = await prisma.assignment.findMany({
    // Batch 77: learners only see published, released assignments; staff see everything except archived.
    where: { courseId: req.params.courseId, ...(learner ? { status: "PUBLISHED", OR: [{ releaseAt: null }, { releaseAt: { lte: now } }] } : { status: { not: "ARCHIVED" } }) },
    orderBy: { dueAt: "asc" },
  });
  res.json(assignments);
});

// SP018 — student assignment submission.
// EX033 — AI-use disclosure: a real field the student actually sets.
const submitAssignmentSchema = z.object({
  assignmentId: z.string(),
  textAnswer: z.string().optional(),
  fileUrl: z.string().url().optional(),
  aiAssisted: z.boolean().optional(),
});

contentRouter.post("/assignments/submit", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = submitAssignmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide an answer or file." });
  // Batch 77: one code path for every hand-in — deadline, late rules, group, file rules, versioning and receipt all apply.
  const r = await handInAssignment(req.user!, parsed.data.assignmentId, { textAnswer: parsed.data.textAnswer ?? (parsed.data.fileUrl ? `Link: ${parsed.data.fileUrl}` : null), aiAssisted: parsed.data.aiAssisted }, false);
  res.status(r.status).json(r.status === 201 ? { id: r.body.submissionId, ...r.body } : r.body);
});

contentRouter.get("/assignments/:id/my-submission", requireAuth, async (req: AuthedRequest, res) => {
  const submission = await prisma.submission.findFirst({
    where: { assignmentId: req.params.id, studentUserId: req.user!.id },
  });
  res.json(submission);
});

// ---------------------------------------------------------------------------
// SP017 — Learning progress: a student marking a lesson complete/incomplete.
// Idempotent (upsert / delete-if-exists) so a double-click from a flaky
// connection can't create duplicate rows or error out. courses.ts's
// GET /courses/:id reads LessonProgress back to compute the real
// module/course percentages shown on the course page and dashboard.
// ---------------------------------------------------------------------------
contentRouter.post("/lessons/:id/complete", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const lesson = await prisma.lesson.findUnique({ where: { id: req.params.id } });
  if (!lesson) return res.status(404).json({ message: "Lesson not found." });

  const progress = await prisma.lessonProgress.upsert({
    where: { studentId_lessonId: { studentId: student.id, lessonId: lesson.id } },
    update: {},
    create: { studentId: student.id, lessonId: lesson.id },
  });
  res.status(201).json(progress);
});

contentRouter.delete("/lessons/:id/complete", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  await prisma.lessonProgress
    .delete({ where: { studentId_lessonId: { studentId: student.id, lessonId: req.params.id } } })
    .catch(() => undefined);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// LMS032 — peer learning: real student-formed study groups, distinct from
// LMS033's peer ASSESSMENT (PeerReview). This is collaborative study, not
// grading — any enrolled student can create or join a group for a course.
// ---------------------------------------------------------------------------
const groupSchema = z.object({ courseId: z.string(), name: z.string().min(2) });

contentRouter.post("/study-groups", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = groupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide courseId and a name." });
  const group = await prisma.$transaction(async (tx) => {
    const g = await tx.studyGroup.create({ data: { ...parsed.data, createdById: req.user!.id } });
    await tx.studyGroupMembership.create({ data: { groupId: g.id, userId: req.user!.id } });
    return g;
  });
  res.status(201).json(group);
});

contentRouter.get("/study-groups/course/:courseId", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await courseGate(req, res, req.params.courseId))) return;
  const groups = await prisma.studyGroup.findMany({
    where: { courseId: req.params.courseId },
    include: { members: true },
  });
  res.json(groups.map((g) => ({ id: g.id, name: g.name, memberCount: g.members.length })));
});

contentRouter.post("/study-groups/:id/join", requireAuth, async (req: AuthedRequest, res) => {
  const membership = await prisma.studyGroupMembership
    .create({ data: { groupId: req.params.id, userId: req.user!.id } })
    .catch(() => null);
  if (!membership) return res.status(409).json({ message: "Already a member." });
  res.status(201).json(membership);
});

const postSchema = z.object({ body: z.string().min(1) });

contentRouter.post("/study-groups/:id/posts", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide a message." });
  const membership = await prisma.studyGroupMembership.findUnique({
    where: { groupId_userId: { groupId: req.params.id, userId: req.user!.id } },
  });
  if (!membership) return res.status(403).json({ message: "Join the group before posting." });
  const post = await prisma.studyGroupPost.create({
    data: { groupId: req.params.id, authorId: req.user!.id, body: parsed.data.body },
  });
  res.status(201).json(post);
});

contentRouter.get("/study-groups/:id/posts", requireAuth, async (req: AuthedRequest, res) => {
  const membership = await prisma.studyGroupMembership.findUnique({
    where: { groupId_userId: { groupId: req.params.id, userId: req.user!.id } },
  });
  if (!membership) return res.status(403).json({ message: "Join the group to see its posts." });
  const posts = await prisma.studyGroupPost.findMany({ where: { groupId: req.params.id }, orderBy: { postedAt: "asc" } });
  res.json(posts);
});

// ---------------------------------------------------------------------------
// LMS007 — Content library. A cross-course, searchable index of published
// lessons (title/tags/outcomes), distinct from LMS031's federated external
// digital library (library.ts) — this is the institution's OWN authored
// content, browsable by anyone who could otherwise reach it lesson-by-lesson
// (enrolled students see their own courses' lessons; staff/oversight roles
// see everything published).
// ---------------------------------------------------------------------------
contentRouter.get("/library", requireAuth, async (req: AuthedRequest, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const staff = !isLearnerRole(req.user!.role);

  let courseIds: string[] | null = null;
  if (!staff) {
    const student = await prisma.student.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
    if (!student) return res.json([]);
    const enrollments = await prisma.enrollment.findMany({ where: { studentId: student.id }, select: { unitId: true } });
    const unitIds = enrollments.map((e: { unitId: string }) => e.unitId);
    const courses = unitIds.length ? await prisma.course.findMany({ where: { unitId: { in: unitIds } }, select: { id: true } }) : [];
    courseIds = courses.map((c: { id: string }) => c.id);
    if (courseIds.length === 0) return res.json([]);
  }

  const lessons = await prisma.lesson.findMany({
    where: {
      isPublished: true,
      ...(courseIds ? { module: { courseId: { in: courseIds } } } : {}),
    },
    include: { module: { include: { course: { select: { id: true, title: true } } } } },
    orderBy: { title: "asc" },
    take: 500,
  });

  const filtered = q
    ? lessons.filter(
        (l: any) =>
          l.title.toLowerCase().includes(q) ||
          l.tags.some((t: string) => t.toLowerCase().includes(q)) ||
          l.outcomesCovered.some((o: string) => o.toLowerCase().includes(q))
      )
    : lessons;

  res.json(
    filtered.map((l: any) => ({
      id: l.id,
      title: l.title,
      contentType: l.contentType,
      durationMins: l.durationMins,
      tags: l.tags,
      offlineAvailable: l.offlineAvailable,
      courseId: l.module.course.id,
      courseTitle: l.module.course.title,
    }))
  );
});

// ---------------------------------------------------------------------------
// LMS024 — offline content. Every lesson the caller may see and that its
// trainer has marked offlineAvailable, with everything a service worker
// needs to precache it (its own text plus resolved, signed media URLs so
// the cache works without a live token exchange while offline).
// ---------------------------------------------------------------------------
contentRouter.get("/offline-bundle/:courseId", requireAuth, async (req: AuthedRequest, res) => {
  const { courseId } = req.params;
  if (!(await canAccessCourseContent(req.user!, courseId))) return res.status(403).json({ message: "You don't have access to this course." });

  const lessons = await prisma.lesson.findMany({
    where: { module: { courseId }, isPublished: true, offlineAvailable: true },
    include: { module: { select: { title: true } } },
    orderBy: { order: "asc" },
  });
  const presented = await presentLessons(lessons, { forStaff: false });
  res.json(
    presented.map((l: any) => ({
      id: l.id,
      title: l.title,
      moduleTitle: l.module.title,
      contentType: l.contentType,
      contentBody: l.contentBody,
      media: l.media,
    }))
  );
});

// ---------------------------------------------------------------------------
// LMS027 — progress synchronization. A device that was offline replays every
// queued completion/incompletion in one call instead of one request per
// lesson. Upsert/delete-if-exists is naturally idempotent (see the single
// POST/DELETE /lessons/:id/complete above), so replaying the same queued
// action twice (e.g. a retried sync after a dropped connection) is safe.
// ---------------------------------------------------------------------------
const syncSchema = z.object(
  {
    items: z
      .array(z.object({ lessonId: z.string(), action: z.enum(["complete", "incomplete"]), at: z.string().datetime().optional() }))
      .max(500),
  }
);

contentRouter.post("/progress/sync", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = syncSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid sync payload." });

  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const results: { lessonId: string; ok: boolean }[] = [];
  for (const item of parsed.data.items) {
    try {
      if (item.action === "complete") {
        await prisma.lessonProgress.upsert({
          where: { studentId_lessonId: { studentId: student.id, lessonId: item.lessonId } },
          update: {},
          create: { studentId: student.id, lessonId: item.lessonId, ...(item.at ? { completedAt: new Date(item.at) } : {}) },
        });
      } else {
        await prisma.lessonProgress.delete({ where: { studentId_lessonId: { studentId: student.id, lessonId: item.lessonId } } }).catch(() => undefined);
      }
      results.push({ lessonId: item.lessonId, ok: true });
    } catch {
      results.push({ lessonId: item.lessonId, ok: false });
    }
  }
  res.json({ synced: results.filter((r) => r.ok).length, results });
});

// ---------------------------------------------------------------------------
// LMS019 — Completion rules. A trainer sets what "completed" means for
// their course; GET .../completion computes it live against real data
// (LessonProgress + best Submission per Assessment) rather than that being
// an undefined concept students can't check.
// ---------------------------------------------------------------------------
const completionRuleSchema = z.object({
  minLessonPercent: z.number().int().min(0).max(100).default(100),
  requirePassingAssessments: z.boolean().default(true),
});

contentRouter.put("/courses/:courseId/completion-rule", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const { courseId } = req.params;
  if (!(await canTeachCourse(req.user!, courseId))) return notYours(res);
  const parsed = completionRuleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid completion rule." });

  const rule = await prisma.courseCompletionRule.upsert({
    where: { courseId },
    update: { ...parsed.data, updatedById: req.user!.id },
    create: { courseId, ...parsed.data, updatedById: req.user!.id },
  });
  res.json(rule);
});

contentRouter.get("/courses/:courseId/completion-rule", requireAuth, async (req: AuthedRequest, res) => {
  const rule = await prisma.courseCompletionRule.findUnique({ where: { courseId: req.params.courseId } });
  // No custom rule yet → the honest default is "100% of lessons, must pass every assessment".
  res.json(rule ?? { courseId: req.params.courseId, minLessonPercent: 100, requirePassingAssessments: true, isDefault: true });
});

async function computeCompletion(courseId: string, studentId: string) {
  const rule = await prisma.courseCompletionRule.findUnique({ where: { courseId } });
  const minLessonPercent = rule?.minLessonPercent ?? 100;
  const requirePassingAssessments = rule?.requirePassingAssessments ?? true;

  const lessons = await prisma.lesson.findMany({ where: { module: { courseId }, isPublished: true }, select: { id: true } });
  const lessonIds = lessons.map((l: { id: string }) => l.id);
  const doneCount = lessonIds.length
    ? await prisma.lessonProgress.count({ where: { studentId, lessonId: { in: lessonIds } } })
    : 0;
  const lessonPercent = lessonIds.length ? Math.round((doneCount / lessonIds.length) * 100) : 100;
  const lessonsMet = lessonPercent >= minLessonPercent;

  let assessmentsMet = true;
  let assessmentBreakdown: { assessmentId: string; title: string; passed: boolean; bestPercent: number | null }[] = [];
  if (requirePassingAssessments) {
    const studentRow = await prisma.student.findUnique({ where: { id: studentId }, select: { userId: true } });
    const assessments = await prisma.assessment.findMany({ where: { courseId, isDraft: false }, select: { id: true, title: true, totalMarks: true, passMarkPercent: true } });
    for (const a of assessments) {
      const submissions = studentRow
        ? await prisma.submission.findMany({
            where: { assessmentId: a.id, studentUserId: studentRow.userId },
            select: { score: true },
          })
        : [];
      const best = submissions.reduce((max: number | null, s: { score: number | null }) => (s.score != null && (max == null || s.score > max) ? s.score : max), null as number | null);
      const bestPercent = best != null && a.totalMarks > 0 ? Math.round((best / a.totalMarks) * 100) : null;
      const passMark = a.passMarkPercent ?? 50;
      const passed = bestPercent != null && bestPercent >= passMark;
      if (!passed) assessmentsMet = false;
      assessmentBreakdown.push({ assessmentId: a.id, title: a.title, passed, bestPercent });
    }
  }

  return {
    completed: lessonsMet && assessmentsMet,
    lessonPercent,
    minLessonPercent,
    lessonsMet,
    requirePassingAssessments,
    assessmentsMet,
    assessments: assessmentBreakdown,
  };
}

contentRouter.get("/courses/:courseId/completion", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });
  if (!(await canAccessCourseContent(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't have access to this course." });
  res.json(await computeCompletion(req.params.courseId, student.id));
});

contentRouter.get("/courses/:courseId/completion/:studentId", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await canViewCourseAsStaffSafe(req.user!, req.params.courseId))) return res.status(403).json({ message: "Not permitted." });
  res.json(await computeCompletion(req.params.courseId, req.params.studentId));
});

async function canViewCourseAsStaffSafe(actor: { id: string; role: string }, courseId: string): Promise<boolean> {
  return canTeachCourse(actor, courseId) || ["SUPER_ADMIN", "REGISTRAR", "QA_OFFICER", "PROGRAMME_COORDINATOR"].includes(actor.role);
}
