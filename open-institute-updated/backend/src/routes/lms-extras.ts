// Batch 77 — LMS extras. Mounted at /api/lms.
//
//   Content      bookmarks, notes, search, categories/tags, views, attachments (+replace, download tracking),
//                scheduled publishing, change notices, templates, review comments, export/import     CNT 025 030 043-048 051-060
//   Gradebook    weights, matrix, student gradebook, analysis, import/export, history, competency     GRD 001-020 023 029-039
//   Progress     my progress dashboard, activity history, engagement, completion analytics, export,
//                interventions                                                                         PRG 001-007 026-030
//   Communication course-wide notices, forum search/subscribe                                          COM 008 009 013 019

import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { canAccessCourseContent, canTeachCourse, canViewCourseAsStaff, isEnrolledInCourse, isLearnerRole } from "../lib/course-access.js";
import { blocksSchema, blocksToMarkdown } from "../lib/lesson-blocks.js";
import { mediaUrl } from "../lib/signed-url.js";
import { notifyOnce } from "../lib/reminder-jobs.js";
import { aggregateAttempts, parseCsv, toCsv, type GradingMethod } from "../lib/quiz-engine.js";
import { classifyCell, gradeDiscrepancy, itemSummary, trend, validateWeights, weightedCourseGrade, GRADE_CATEGORIES } from "../lib/gradebook-engine.js";
import { PASS_MARK_PERCENT } from "../lib/grade-scale.js";
import { scoreStats } from "../lib/score-stats.js";

export const lmsExtrasRouter = Router();
const staff = [requireAuth, requireRole("TRAINER", "SUPER_ADMIN")];
type Res = { status: (n: number) => { json: (b: unknown) => unknown } };
const r1 = (n: number) => Math.round(n * 10) / 10;
const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const htmlText = (value: unknown) => String(value ?? "").replace(/[&<>\"']/g, (c) => HTML_ESCAPES[c]);
function reportHtml(title: string, subtitle: string, rows: Array<Array<unknown>>) {
  const head = rows[0] ?? [];
  const body = rows.slice(1);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlText(title)}</title><style>body{font:14px/1.45 system-ui,sans-serif;color:#182533;max-width:1100px;margin:32px auto;padding:0 20px}h1{font-size:24px;margin:0 0 4px}p{color:#526170;margin:0 0 22px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccd4dc;padding:7px;text-align:left}th{background:#edf2f6}@media print{body{margin:12mm auto;padding:0}button{display:none}}</style><h1>${htmlText(title)}</h1><p>${htmlText(subtitle)} · generated ${new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</p><table><thead><tr>${head.map((x) => `<th>${htmlText(x)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((x) => `<td>${htmlText(x)}</td>`).join("")}</tr>`).join("")}</tbody></table><p style="margin-top:18px">Confidential student information. Handle according to institutional records policy.</p></html>`;
}

async function lessonCtx(id: string) {
  const l = await prisma.lesson.findUnique({ where: { id }, include: { module: { select: { id: true, courseId: true, course: { select: { id: true, title: true, unitId: true } } } } } });
  return l;
}
type LessonCtx = NonNullable<Awaited<ReturnType<typeof lessonCtx>>>;

async function teachLesson(req: AuthedRequest, res: Res, id: string): Promise<LessonCtx | null> {
  const l = await lessonCtx(id);
  if (!l) { res.status(404).json({ message: "Lesson not found." }); return null; }
  if (!(await canTeachCourse(req.user!, l.module.courseId))) { res.status(403).json({ message: "You don't teach this course." }); return null; }
  return l;
}

/** A lesson the caller may see: staff see everything; learners only published, approved lessons in a course they're enrolled in. */
async function seeLesson(req: AuthedRequest, res: Res, id: string): Promise<LessonCtx | null> {
  const l = await lessonCtx(id);
  if (!l || !(await canAccessCourseContent(req.user!, l.module.courseId))) { res.status(404).json({ message: "Lesson not found." }); return null; }
  if (isLearnerRole(req.user!.role) && (!l.isPublished || l.approvalStatus === "rejected")) { res.status(404).json({ message: "Lesson not found." }); return null; }
  return l;
}

async function enrolledStudents(unitId: string) {
  const rows = await prisma.enrollment.findMany({ where: { unitId, status: { not: "withdrawn" } }, select: { student: { select: { id: true, userId: true, fullName: true, studentNumber: true, intake: true } } } });
  return [...new Map(rows.map((r) => [r.student.userId, r.student])).values()];
}

const tell = (userIds: string[], title: string, body: string, category = "academic", withinDays = 1) =>
  userIds.length ? notifyOnce(userIds.map((userId) => ({ userId, title: title.slice(0, 120), body })), category, withinDays).catch(() => undefined) : Promise.resolve(undefined);

// ===================================================================== CONTENT
// Lesson-page helpers (Batch 77 UI): what the student has already done on this lesson, and a trainer's view of its metadata.
lmsExtrasRouter.get("/lessons/:id/state", requireAuth, async (req: AuthedRequest, res) => {
  const l = await seeLesson(req, res, req.params.id);
  if (!l) return;
  const [bookmark, notes, attachments] = await Promise.all([
    prisma.lessonBookmark.findUnique({ where: { studentUserId_lessonId: { studentUserId: req.user!.id, lessonId: l.id } }, select: { id: true } }),
    prisma.lessonNote.count({ where: { lessonId: l.id, studentUserId: req.user!.id } }),
    prisma.lessonAttachment.count({ where: { lessonId: l.id, audience: "ENROLLED" } }),
  ]);
  res.json({ bookmarked: !!bookmark, noteCount: notes, attachmentCount: attachments });
});

lmsExtrasRouter.get("/lessons/:id/meta", ...staff, async (req: AuthedRequest, res) => {
  const l = await teachLesson(req, res, req.params.id);
  if (!l) return;
  res.json({ id: l.id, isPublished: l.isPublished, publishAt: l.publishAt, category: l.category, tags: l.tags, lastNotifiedAt: l.lastNotifiedAt, courseId: l.module.courseId, moduleId: l.moduleId });
});

// CNT051 — bookmarks
lmsExtrasRouter.post("/lessons/:id/bookmark", requireAuth, async (req: AuthedRequest, res) => {
  const l = await seeLesson(req, res, req.params.id);
  if (!l) return;
  const where = { studentUserId_lessonId: { studentUserId: req.user!.id, lessonId: l.id } };
  const had = await prisma.lessonBookmark.findUnique({ where });
  if (had) { await prisma.lessonBookmark.delete({ where }); return res.json({ bookmarked: false }); }
  await prisma.lessonBookmark.create({ data: { studentUserId: req.user!.id, lessonId: l.id, courseId: l.module.courseId } });
  res.status(201).json({ bookmarked: true });
});

lmsExtrasRouter.get("/bookmarks", requireAuth, async (req: AuthedRequest, res) => {
  const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;
  const rows = await prisma.lessonBookmark.findMany({ where: { studentUserId: req.user!.id, ...(courseId ? { courseId } : {}) }, orderBy: { createdAt: "desc" }, take: 200 });
  const lessons = await prisma.lesson.findMany({ where: { id: { in: rows.map((r) => r.lessonId) }, isPublished: true }, select: { id: true, title: true, contentType: true, module: { select: { title: true, courseId: true } } } });
  const by = new Map(lessons.map((x) => [x.id, x]));
  res.json(rows.filter((r) => by.has(r.lessonId)).map((r) => ({ lessonId: r.lessonId, courseId: r.courseId, title: by.get(r.lessonId)!.title, moduleTitle: by.get(r.lessonId)!.module.title, contentType: by.get(r.lessonId)!.contentType, savedAt: r.createdAt })));
});

// CNT052 — private lesson notes
lmsExtrasRouter.get("/lessons/:id/notes", requireAuth, async (req: AuthedRequest, res) => {
  const l = await seeLesson(req, res, req.params.id);
  if (!l) return;
  res.json(await prisma.lessonNote.findMany({ where: { lessonId: l.id, studentUserId: req.user!.id }, orderBy: { createdAt: "desc" } }));
});

lmsExtrasRouter.post("/lessons/:id/notes", requireAuth, async (req: AuthedRequest, res) => {
  const l = await seeLesson(req, res, req.params.id);
  if (!l) return;
  const body = z.string().trim().min(1).max(5000).safeParse(req.body?.body);
  if (!body.success) return res.status(400).json({ message: "Write a note (up to 5000 characters)." });
  if ((await prisma.lessonNote.count({ where: { lessonId: l.id, studentUserId: req.user!.id } })) >= 100) return res.status(409).json({ message: "You've reached the 100-note limit for this lesson." });
  res.status(201).json(await prisma.lessonNote.create({ data: { studentUserId: req.user!.id, lessonId: l.id, courseId: l.module.courseId, body: body.data } }));
});

lmsExtrasRouter.patch("/notes/:nid", requireAuth, async (req: AuthedRequest, res) => {
  const n = await prisma.lessonNote.findUnique({ where: { id: req.params.nid } });
  if (!n || n.studentUserId !== req.user!.id) return res.status(404).json({ message: "Note not found." });
  const body = z.string().trim().min(1).max(5000).safeParse(req.body?.body);
  if (!body.success) return res.status(400).json({ message: "Write a note (up to 5000 characters)." });
  res.json(await prisma.lessonNote.update({ where: { id: n.id }, data: { body: body.data } }));
});

lmsExtrasRouter.delete("/notes/:nid", requireAuth, async (req: AuthedRequest, res) => {
  const n = await prisma.lessonNote.findUnique({ where: { id: req.params.nid } });
  if (!n || n.studentUserId !== req.user!.id) return res.status(404).json({ message: "Note not found." });
  await prisma.lessonNote.delete({ where: { id: n.id } });
  res.json({ deleted: true });
});

lmsExtrasRouter.get("/notes", requireAuth, async (req: AuthedRequest, res) => {
  const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;
  const rows = await prisma.lessonNote.findMany({ where: { studentUserId: req.user!.id, ...(courseId ? { courseId } : {}) }, orderBy: { updatedAt: "desc" }, take: 300 });
  const lessons = await prisma.lesson.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.lessonId))] } }, select: { id: true, title: true } });
  const by = new Map(lessons.map((x) => [x.id, x.title]));
  res.json(rows.map((r) => ({ ...r, lessonTitle: by.get(r.lessonId) ?? "Lesson" })));
});

// CNT053 — lesson search inside one course
lmsExtrasRouter.get("/courses/:courseId/search", requireAuth, async (req: AuthedRequest, res) => {
  const courseId = req.params.courseId;
  if (!(await canAccessCourseContent(req.user!, courseId))) return res.status(404).json({ message: "Course not found." });
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return res.status(400).json({ message: "Type at least 2 characters." });
  const learner = isLearnerRole(req.user!.role);
  const lessons = await prisma.lesson.findMany({
    where: { module: { courseId }, ...(learner ? { isPublished: true } : {}) },
    select: { id: true, title: true, tags: true, category: true, contentBody: true, contentType: true, approvalStatus: true, isPublished: true, module: { select: { title: true } } },
    take: 1000,
  });
  const needle = q.toLowerCase();
  const hits = lessons.flatMap((l) => {
    const bodyOk = !learner || l.approvalStatus === "approved"; // never search text a reviewer hasn't approved yet
    const body = bodyOk ? l.contentBody ?? "" : "";
    const inTitle = l.title.toLowerCase().includes(needle);
    const inTags = l.tags.some((t) => t.toLowerCase().includes(needle)) || (l.category ?? "").toLowerCase().includes(needle);
    const at = body.toLowerCase().indexOf(needle);
    if (!inTitle && !inTags && at < 0) return [];
    const snippet = at >= 0 ? `${at > 40 ? "…" : ""}${body.slice(Math.max(0, at - 40), at + needle.length + 80).replace(/\s+/g, " ")}…` : null;
    return [{ lessonId: l.id, title: l.title, moduleTitle: l.module.title, contentType: l.contentType, tags: l.tags, category: l.category, snippet, rank: inTitle ? 0 : inTags ? 1 : 2, published: l.isPublished }];
  });
  hits.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
  res.json({ query: q, count: hits.length, hits: hits.slice(0, 50) });
});

// CNT054/055 — category and tags
lmsExtrasRouter.patch("/lessons/:id/meta", ...staff, async (req: AuthedRequest, res) => {
  const l = await teachLesson(req, res, req.params.id);
  if (!l) return;
  const p = z.object({ category: z.string().trim().max(60).nullable().optional(), tags: z.array(z.string().trim().min(1).max(40)).max(15).optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Category up to 60 characters; up to 15 tags of 40 characters." });
  const tags = p.data.tags ? [...new Set(p.data.tags.map((t) => t.toLowerCase()))] : undefined;
  res.json(await prisma.lesson.update({ where: { id: l.id }, data: { ...(p.data.category !== undefined ? { category: p.data.category || null } : {}), ...(tags ? { tags } : {}) }, select: { id: true, category: true, tags: true } }));
});

lmsExtrasRouter.get("/courses/:courseId/categories", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await canAccessCourseContent(req.user!, req.params.courseId))) return res.status(404).json({ message: "Course not found." });
  const learner = isLearnerRole(req.user!.role);
  const lessons = await prisma.lesson.findMany({ where: { module: { courseId: req.params.courseId }, ...(learner ? { isPublished: true } : {}) }, select: { category: true, tags: true } });
  const cats = new Map<string, number>(), tags = new Map<string, number>();
  for (const l of lessons) { const c = l.category ?? "Uncategorised"; cats.set(c, (cats.get(c) ?? 0) + 1); for (const t of l.tags) tags.set(t, (tags.get(t) ?? 0) + 1); }
  const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  res.json({ categories: sorted(cats), tags: sorted(tags) });
});

// CNT059 — view tracking and analytics
lmsExtrasRouter.post("/lessons/:id/view", requireAuth, async (req: AuthedRequest, res) => {
  const l = await seeLesson(req, res, req.params.id);
  if (!l) return;
  if (!isLearnerRole(req.user!.role)) return res.json({ recorded: false });
  const recent = await prisma.lessonView.findFirst({ where: { userId: req.user!.id, lessonId: l.id, viewedAt: { gte: new Date(Date.now() - 10 * 60_000) } }, select: { id: true } });
  if (recent) return res.json({ recorded: false });
  await prisma.lessonView.create({ data: { userId: req.user!.id, lessonId: l.id, courseId: l.module.courseId } });
  res.status(201).json({ recorded: true });
});

lmsExtrasRouter.get("/courses/:courseId/content-analytics", requireAuth, async (req: AuthedRequest, res) => {
  const courseId = req.params.courseId;
  if (!(await canViewCourseAsStaff(req.user!, courseId))) return res.status(403).json({ message: "You don't have access to this course." });
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { unitId: true } });
  if (!course) return res.status(404).json({ message: "Course not found." });
  const [lessons, views, downloads, completions, roster, atts] = await Promise.all([
    prisma.lesson.findMany({ where: { module: { courseId } }, select: { id: true, title: true, isPublished: true, module: { select: { title: true, order: true } }, order: true }, orderBy: [{ module: { order: "asc" } }, { order: "asc" }] }),
    prisma.lessonView.findMany({ where: { courseId }, select: { lessonId: true, userId: true } }),
    prisma.materialDownload.findMany({ where: { courseId }, select: { attachmentId: true, userId: true } }),
    prisma.lessonProgress.groupBy({ by: ["lessonId"], where: { lesson: { module: { courseId } } }, _count: { _all: true } }),
    enrolledStudents(course.unitId),
    prisma.lessonAttachment.findMany({ where: { courseId }, select: { id: true, label: true, lessonId: true } }),
  ]);
  const doneBy = new Map(completions.map((c) => [c.lessonId, c._count._all]));
  const rows = lessons.map((l) => {
    const v = views.filter((x) => x.lessonId === l.id);
    return { lessonId: l.id, title: l.title, moduleTitle: l.module.title, published: l.isPublished, views: v.length, uniqueViewers: new Set(v.map((x) => x.userId)).size, completions: doneBy.get(l.id) ?? 0, completionPercent: roster.length ? r1(((doneBy.get(l.id) ?? 0) / roster.length) * 100) : null };
  });
  const dlBy = new Map<string, { n: number; users: Set<string> }>();
  for (const d of downloads) { if (!d.attachmentId) continue; const e = dlBy.get(d.attachmentId) ?? { n: 0, users: new Set<string>() }; e.n++; e.users.add(d.userId); dlBy.set(d.attachmentId, e); }
  res.json({
    enrolled: roster.length, totalViews: views.length, neverViewed: rows.filter((r) => r.published && r.views === 0).map((r) => ({ lessonId: r.lessonId, title: r.title })),
    lessons: rows, materials: atts.map((a) => ({ attachmentId: a.id, label: a.label, lessonId: a.lessonId, downloads: dlBy.get(a.id)?.n ?? 0, uniqueDownloaders: dlBy.get(a.id)?.users.size ?? 0 })),
  });
});

// CNT030 — scheduled publishing. The sweeper (lib/lesson-publisher.ts) flips due lessons every few minutes.
lmsExtrasRouter.patch("/lessons/:id/schedule", ...staff, async (req: AuthedRequest, res) => {
  const l = await teachLesson(req, res, req.params.id);
  if (!l) return;
  const p = z.object({ publishAt: z.string().datetime().nullable() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Give a publish date, or null to cancel." });
  if (p.data.publishAt && new Date(p.data.publishAt) <= new Date()) return res.status(400).json({ message: "Pick a time in the future (or just publish the lesson now)." });
  if (p.data.publishAt && l.isPublished) return res.status(409).json({ message: "This lesson is already published." });
  res.json(await prisma.lesson.update({ where: { id: l.id }, data: { publishAt: p.data.publishAt ? new Date(p.data.publishAt) : null }, select: { id: true, publishAt: true, isPublished: true } }));
});

// CNT044/COM019 — tell enrolled students about new or changed content (at most once an hour per lesson)
lmsExtrasRouter.post("/lessons/:id/notify-change", ...staff, async (req: AuthedRequest, res) => {
  const l = await teachLesson(req, res, req.params.id);
  if (!l) return;
  if (!l.isPublished) return res.status(409).json({ message: "Publish the lesson before notifying students." });
  if (l.lastNotifiedAt && Date.now() - l.lastNotifiedAt.getTime() < 3_600_000) return res.status(429).json({ message: "Students were already notified about this lesson in the last hour." });
  const msg = z.string().max(300).optional().safeParse(req.body?.message);
  const roster = await enrolledStudents(l.module.course.unitId);
  await tell(roster.map((s) => s.userId), `Course content updated: ${l.title}`, msg.success && msg.data ? msg.data : `"${l.title}" in ${l.module.course.title} has new or updated content.`, "academic", 1);
  await prisma.lesson.update({ where: { id: l.id }, data: { lastNotifiedAt: new Date() } });
  res.json({ notified: roster.length });
});

// CNT045/025/056/057/058 — attachments
async function assetOk(req: AuthedRequest, assetId: string, courseId: string) {
  const a = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!a) return { ok: false as const, message: "That file no longer exists — upload it again." };
  if (req.user!.role !== "SUPER_ADMIN" && a.ownerUserId !== req.user!.id && a.courseId !== courseId) return { ok: false as const, message: "You can only attach files you uploaded." };
  return { ok: true as const, asset: a };
}

lmsExtrasRouter.get("/lessons/:id/attachments", requireAuth, async (req: AuthedRequest, res) => {
  const l = await seeLesson(req, res, req.params.id);
  if (!l) return;
  const asStaff = await canViewCourseAsStaff(req.user!, l.module.courseId);
  const rows = await prisma.lessonAttachment.findMany({ where: { lessonId: l.id, ...(asStaff ? {} : { audience: "ENROLLED" }) }, orderBy: { createdAt: "asc" } });
  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: rows.map((r) => r.assetId) } } });
  const by = new Map(assets.map((a) => [a.id, a]));
  res.json(rows.filter((r) => by.has(r.assetId)).map((r) => { const a = by.get(r.assetId)!; return { id: r.id, label: r.label, downloadable: r.downloadable, audience: r.audience, version: r.version, name: a.originalName, kind: a.kind, mimeType: a.mimeType, sizeBytes: a.sizeBytes, assetId: a.id, previewUrl: mediaUrl(a.id), updatedAt: r.updatedAt }; }));
});

const attachSchema = z.object({ assetId: z.string(), label: z.string().trim().min(1).max(120), downloadable: z.boolean().optional(), audience: z.enum(["ENROLLED", "STAFF"]).optional() });

lmsExtrasRouter.post("/lessons/:id/attachments", ...staff, async (req: AuthedRequest, res) => {
  const l = await teachLesson(req, res, req.params.id);
  if (!l) return;
  const p = attachSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Choose a file and give it a label." });
  if ((await prisma.lessonAttachment.count({ where: { lessonId: l.id } })) >= 30) return res.status(409).json({ message: "A lesson can have at most 30 attachments." });
  const chk = await assetOk(req, p.data.assetId, l.module.courseId);
  if (!chk.ok) return res.status(400).json({ message: chk.message });
  res.status(201).json(await prisma.lessonAttachment.create({ data: { lessonId: l.id, courseId: l.module.courseId, assetId: p.data.assetId, label: p.data.label, downloadable: p.data.downloadable ?? true, audience: p.data.audience ?? "ENROLLED", createdById: req.user!.id } }));
});

async function teachAttachment(req: AuthedRequest, res: Res, id: string) {
  const a = await prisma.lessonAttachment.findUnique({ where: { id } });
  if (!a) { res.status(404).json({ message: "Attachment not found." }); return null; }
  if (!(await canTeachCourse(req.user!, a.courseId))) { res.status(403).json({ message: "You don't teach this course." }); return null; }
  return a;
}

lmsExtrasRouter.patch("/attachments/:aid", ...staff, async (req: AuthedRequest, res) => {
  const a = await teachAttachment(req, res, req.params.aid);
  if (!a) return;
  const p = attachSchema.pick({ label: true, downloadable: true, audience: true }).partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid changes." });
  res.json(await prisma.lessonAttachment.update({ where: { id: a.id }, data: p.data }));
});

lmsExtrasRouter.delete("/attachments/:aid", ...staff, async (req: AuthedRequest, res) => {
  const a = await teachAttachment(req, res, req.params.aid);
  if (!a) return;
  await prisma.lessonAttachment.delete({ where: { id: a.id } });
  res.json({ deleted: true });
});

lmsExtrasRouter.post("/attachments/:aid/replace", ...staff, async (req: AuthedRequest, res) => {
  const a = await teachAttachment(req, res, req.params.aid);
  if (!a) return;
  const id = z.string().safeParse(req.body?.assetId);
  if (!id.success) return res.status(400).json({ message: "Choose the replacement file." });
  if (id.data === a.assetId) return res.status(400).json({ message: "That is already the current file." });
  const chk = await assetOk(req, id.data, a.courseId);
  if (!chk.ok) return res.status(400).json({ message: chk.message });
  res.json(await prisma.lessonAttachment.update({ where: { id: a.id }, data: { assetId: id.data, version: a.version + 1, previousAssetIds: [...a.previousAssetIds, a.assetId] } }));
});

lmsExtrasRouter.post("/attachments/:aid/download", requireAuth, async (req: AuthedRequest, res) => {
  const a = await prisma.lessonAttachment.findUnique({ where: { id: req.params.aid } });
  if (!a) return res.status(404).json({ message: "Attachment not found." });
  const l = await seeLesson(req, res, a.lessonId);
  if (!l) return;
  const asStaff = await canViewCourseAsStaff(req.user!, a.courseId);
  if (a.audience === "STAFF" && !asStaff) return res.status(404).json({ message: "Attachment not found." });
  if (!a.downloadable && !asStaff) return res.status(403).json({ message: "This file can be viewed in the lesson but not downloaded." });
  if (isLearnerRole(req.user!.role)) await prisma.materialDownload.create({ data: { userId: req.user!.id, attachmentId: a.id, assetId: a.assetId, courseId: a.courseId } });
  res.json({ url: mediaUrl(a.assetId) });
});

// CNT047 — lesson templates
lmsExtrasRouter.get("/templates", ...staff, async (req: AuthedRequest, res) => {
  res.json(await prisma.lessonTemplate.findMany({ where: { OR: [{ ownerUserId: req.user!.id }, { shared: true }] }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, name: true, description: true, contentType: true, shared: true, ownerUserId: true, createdAt: true } }));
});

lmsExtrasRouter.post("/templates", ...staff, async (req: AuthedRequest, res) => {
  const p = z.object({ name: z.string().trim().min(2).max(100), description: z.string().max(300).optional(), shared: z.boolean().optional(), fromLessonId: z.string().optional(), contentType: z.string().max(20).optional(), contentBody: z.string().max(100_000).optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Give the template a name." });
  let contentType = p.data.contentType ?? "reading", contentBody = p.data.contentBody ?? "", blocks: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
  if (p.data.fromLessonId) {
    const l = await teachLesson(req, res, p.data.fromLessonId);
    if (!l) return;
    contentType = l.contentType; contentBody = l.contentBody ?? ""; blocks = (l.blocks ?? Prisma.DbNull) as Prisma.InputJsonValue;
  }
  res.status(201).json(await prisma.lessonTemplate.create({ data: { ownerUserId: req.user!.id, name: p.data.name, description: p.data.description ?? null, shared: p.data.shared ?? false, contentType, contentBody, blocks } }));
});

lmsExtrasRouter.post("/templates/:tid/use", ...staff, async (req: AuthedRequest, res) => {
  const t = await prisma.lessonTemplate.findUnique({ where: { id: req.params.tid } });
  if (!t || (t.ownerUserId !== req.user!.id && !t.shared)) return res.status(404).json({ message: "Template not found." });
  const p = z.object({ moduleId: z.string(), title: z.string().trim().min(2).max(200).optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Choose the module to add the lesson to." });
  const mod = await prisma.courseModule.findUnique({ where: { id: p.data.moduleId }, select: { id: true, courseId: true } });
  if (!mod) return res.status(404).json({ message: "Module not found." });
  if (!(await canTeachCourse(req.user!, mod.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  const last = await prisma.lesson.findFirst({ where: { moduleId: mod.id }, orderBy: { order: "desc" }, select: { order: true } });
  const lesson = await prisma.lesson.create({ data: { moduleId: mod.id, title: p.data.title ?? t.name, order: (last?.order ?? 0) + 1, contentType: t.contentType, contentBody: t.contentBody, blocks: (t.blocks ?? Prisma.DbNull) as Prisma.InputJsonValue, isPublished: false } });
  res.status(201).json(lesson);
});

lmsExtrasRouter.delete("/templates/:tid", ...staff, async (req: AuthedRequest, res) => {
  const t = await prisma.lessonTemplate.findUnique({ where: { id: req.params.tid } });
  if (!t || (t.ownerUserId !== req.user!.id && req.user!.role !== "SUPER_ADMIN")) return res.status(404).json({ message: "Template not found." });
  await prisma.lessonTemplate.delete({ where: { id: t.id } });
  res.json({ deleted: true });
});

// CNT043 — reviewer comments on a lesson
const reviewers = [requireAuth, requireRole("TRAINER", "SUPER_ADMIN", "QA_OFFICER", "PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD")];
lmsExtrasRouter.get("/lessons/:id/reviews", ...reviewers, async (req: AuthedRequest, res) => {
  const l = await lessonCtx(req.params.id);
  if (!l || !(await canViewCourseAsStaff(req.user!, l.module.courseId))) return res.status(404).json({ message: "Lesson not found." });
  res.json(await prisma.lessonReviewComment.findMany({ where: { lessonId: l.id }, orderBy: { createdAt: "desc" }, take: 200 }));
});

lmsExtrasRouter.post("/lessons/:id/reviews", ...reviewers, async (req: AuthedRequest, res) => {
  const l = await lessonCtx(req.params.id);
  if (!l || !(await canViewCourseAsStaff(req.user!, l.module.courseId))) return res.status(404).json({ message: "Lesson not found." });
  const body = z.string().trim().min(3).max(2000).safeParse(req.body?.body);
  if (!body.success) return res.status(400).json({ message: "Write your feedback (3–2000 characters)." });
  const c = await prisma.lessonReviewComment.create({ data: { lessonId: l.id, courseId: l.module.courseId, authorId: req.user!.id, body: body.data } });
  const owner = await prisma.course.findUnique({ where: { id: l.module.courseId }, select: { trainer: { select: { userId: true } } } });
  if (owner?.trainer?.userId && owner.trainer.userId !== req.user!.id) await tell([owner.trainer.userId], `Review feedback: ${l.title}`, body.data.slice(0, 200), "academic", 1);
  res.status(201).json(c);
});

lmsExtrasRouter.patch("/reviews/:rid/resolve", ...reviewers, async (req: AuthedRequest, res) => {
  const c = await prisma.lessonReviewComment.findUnique({ where: { id: req.params.rid } });
  if (!c || !(await canViewCourseAsStaff(req.user!, c.courseId))) return res.status(404).json({ message: "Comment not found." });
  const reopen = req.body?.reopen === true;
  res.json(await prisma.lessonReviewComment.update({ where: { id: c.id }, data: reopen ? { status: "OPEN", resolvedById: null, resolvedAt: null } : { status: "RESOLVED", resolvedById: req.user!.id, resolvedAt: new Date() } }));
});

// CNT060/048 — course content export and import
lmsExtrasRouter.get("/courses/:courseId/export.json", ...staff, async (req: AuthedRequest, res) => {
  if (!(await canTeachCourse(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  const course = await prisma.course.findUnique({ where: { id: req.params.courseId }, select: { id: true, title: true, description: true } });
  if (!course) return res.status(404).json({ message: "Course not found." });
  const modules = await prisma.courseModule.findMany({ where: { courseId: course.id }, orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" } } } });
  const assignments = await prisma.assignment.findMany({ where: { courseId: course.id, status: { not: "ARCHIVED" } } });
  const out = {
    format: "measur-course-content", version: 1, exportedAt: new Date().toISOString(), course: { title: course.title, description: course.description },
    modules: modules.map((m) => ({ title: m.title, order: m.order, lessons: m.lessons.map((l) => ({ title: l.title, order: l.order, contentType: l.contentType, contentUrl: l.contentUrl, contentBody: l.contentBody, blocks: l.blocks, tags: l.tags, category: l.category, durationMins: l.durationMins })) })),
    assignments: assignments.map((a) => ({ title: a.title, instructions: a.instructions, totalMarks: a.totalMarks, category: a.category, mode: a.mode, allowText: a.allowText, allowFiles: a.allowFiles, maxFiles: a.maxFiles, maxFileMb: a.maxFileMb, allowedKinds: a.allowedKinds, lateMode: a.lateMode, maxResubmissions: a.maxResubmissions, rubricCriteria: a.rubricCriteria })),
  };
  res.setHeader("Content-Disposition", `attachment; filename="course-content-${course.id}.json"`);
  res.json(out);
});

const importSchema = z.object({
  format: z.literal("measur-course-content"),
  modules: z.array(z.object({
    title: z.string().min(1).max(200),
    lessons: z.array(z.object({ title: z.string().min(1).max(200), contentType: z.string().max(20).default("reading"), contentUrl: z.string().max(2000).nullish(), contentBody: z.string().max(200_000).nullish(), blocks: z.unknown().optional(), tags: z.array(z.string().max(40)).max(15).optional(), category: z.string().max(60).nullish(), durationMins: z.number().int().min(0).max(1000).nullish() })).max(200),
  })).max(60),
});

lmsExtrasRouter.post("/courses/:courseId/import", ...staff, async (req: AuthedRequest, res) => {
  if (!(await canTeachCourse(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  const p = importSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "That isn't a course content export (expected format \"measur-course-content\")." });
  const total = p.data.modules.reduce((s, m) => s + m.lessons.length, 0);
  if (total > 500) return res.status(400).json({ message: "Import at most 500 lessons at a time." });
  const last = await prisma.courseModule.findFirst({ where: { courseId: req.params.courseId }, orderBy: { order: "desc" }, select: { order: true } });
  let order = (last?.order ?? 0) + 1, lessons = 0, droppedBlocks = 0;
  for (const m of p.data.modules) {
    const mod = await prisma.courseModule.create({ data: { courseId: req.params.courseId, title: m.title, order: order++ } });
    let lo = 1;
    for (const l of m.lessons) {
      const b = l.blocks === undefined || l.blocks === null ? null : blocksSchema.safeParse(l.blocks);
      if (b && !b.success) droppedBlocks++;
      const blocks = b && b.success ? b.data : null;
      await prisma.lesson.create({
        data: { moduleId: mod.id, title: l.title, order: lo++, contentType: l.contentType, contentUrl: l.contentUrl ?? null, contentBody: blocks ? blocksToMarkdown(blocks) : l.contentBody ?? null, blocks: (blocks ?? Prisma.DbNull) as Prisma.InputJsonValue,
          tags: l.tags ?? [], category: l.category ?? null, durationMins: l.durationMins ?? null, isPublished: false },
      });
      lessons++;
    }
  }
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: "COURSE_CONTENT_IMPORTED", entityType: "Course", entityId: req.params.courseId, metadata: { modules: p.data.modules.length, lessons, droppedBlocks } } }).catch(() => undefined);
  res.status(201).json({ modules: p.data.modules.length, lessons, droppedBlocks, note: "Imported lessons are unpublished drafts. Media and attachments are not copied — re-attach them." });
});

// ================================================================== COMMUNICATION
// COM013 — a notice to every student on the course
lmsExtrasRouter.post("/courses/:courseId/notify", ...staff, async (req: AuthedRequest, res) => {
  if (!(await canTeachCourse(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  const p = z.object({ title: z.string().trim().min(3).max(100), body: z.string().trim().min(3).max(1000) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Give the notice a title and a message." });
  const course = await prisma.course.findUnique({ where: { id: req.params.courseId }, select: { title: true, unitId: true } });
  if (!course) return res.status(404).json({ message: "Course not found." });
  const roster = await enrolledStudents(course.unitId);
  const r = await notifyOnce(roster.map((s) => ({ userId: s.userId, title: `${course.title}: ${p.data.title}`.slice(0, 120), body: p.data.body })), "announcement", 1);
  res.json({ recipients: roster.length, ...r });
});

lmsExtrasRouter.get("/courses/:courseId/notices", ...staff, async (req: AuthedRequest, res) => {
  if (!(await canTeachCourse(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  res.json(await prisma.courseAnnouncement.findMany({ where: { courseId: req.params.courseId, status: "SCHEDULED" }, orderBy: { scheduledAt: "asc" }, take: 100, select: { id: true, title: true, content: true, scheduledAt: true } }));
});

lmsExtrasRouter.delete("/notices/:noticeId", ...staff, async (req: AuthedRequest, res) => {
  const notice = await prisma.courseAnnouncement.findUnique({ where: { id: req.params.noticeId }, select: { id: true, courseId: true, status: true } });
  if (!notice || !(await canTeachCourse(req.user!, notice.courseId))) return res.status(404).json({ message: "Scheduled notice not found." });
  if (notice.status !== "SCHEDULED") return res.status(409).json({ message: "Only a notice that has not been sent can be cancelled." });
  await prisma.courseAnnouncement.update({ where: { id: notice.id }, data: { status: "CANCELLED" } });
  res.json({ cancelled: true });
});

// COM008 — forum search
lmsExtrasRouter.get("/forums/search", requireAuth, async (req: AuthedRequest, res) => {
  const courseId = String(req.query.courseId ?? "");
  const q = String(req.query.q ?? "").trim();
  if (!courseId || q.length < 2) return res.status(400).json({ message: "Provide courseId and at least 2 characters to search." });
  if (!(await canAccessCourseContent(req.user!, courseId))) return res.status(404).json({ message: "Course not found." });
  const posts = await prisma.forumPost.findMany({ where: { body: { contains: q, mode: "insensitive" }, forum: { courseId } }, orderBy: { createdAt: "desc" }, take: 50, include: { forum: { select: { id: true, title: true } } } });
  res.json({ query: q, count: posts.length, posts: posts.map((x) => ({ id: x.id, forumId: x.forum.id, forumTitle: x.forum.title, body: x.body.slice(0, 300), parentId: x.parentId, createdAt: x.createdAt })) });
});

// COM009 — forum subscriptions (forums.ts notifies subscribers when a post arrives)
lmsExtrasRouter.post("/forums/:forumId/subscribe", requireAuth, async (req: AuthedRequest, res) => {
  const f = await prisma.forum.findUnique({ where: { id: req.params.forumId }, select: { id: true, courseId: true } });
  if (!f || !(await canAccessCourseContent(req.user!, f.courseId))) return res.status(404).json({ message: "Forum not found." });
  const where = { userId_forumId: { userId: req.user!.id, forumId: f.id } };
  if (req.body?.subscribe === false) { await prisma.forumSubscription.delete({ where }).catch(() => undefined); return res.json({ subscribed: false }); }
  await prisma.forumSubscription.upsert({ where, update: {}, create: { userId: req.user!.id, forumId: f.id } });
  res.status(201).json({ subscribed: true });
});

lmsExtrasRouter.get("/forums/subscriptions", requireAuth, async (req: AuthedRequest, res) => {
  res.json((await prisma.forumSubscription.findMany({ where: { userId: req.user!.id } })).map((s) => s.forumId));
});

// ===================================================================== GRADEBOOK
type Item = { id: string; kind: "ASSESSMENT" | "ASSIGNMENT"; title: string; category: string; totalMarks: number; dueAt: Date | null; visibleToStudents: boolean };

async function weightsFor(courseId: string): Promise<Record<string, number>> {
  const rows = await prisma.gradeWeight.findMany({ where: { courseId } });
  return Object.fromEntries(rows.map((r) => [r.category, r.weightPercent]));
}

/** One matrix for a course: every assessment and assignment × every enrolled student. `forUserId` limits to one student's visible results. */
async function buildGradebook(courseId: string, opts: { forUserId?: string } = {}) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, title: true, unitId: true } });
  if (!course) return null;
  const now = new Date();
  const [assessments, assignments, roster, weights] = await Promise.all([
    prisma.assessment.findMany({ where: { courseId, isDraft: false }, select: { id: true, title: true, type: true, totalMarks: true, gradingMethod: true, resultsPublished: true, closesAt: true, scheduledAt: true } }),
    prisma.assignment.findMany({ where: { courseId, status: "PUBLISHED" } }),
    enrolledStudents(course.unitId),
    weightsFor(courseId),
  ]);
  const students = opts.forUserId ? roster.filter((s) => s.userId === opts.forUserId) : roster;
  const items: Item[] = [
    ...assessments.map((a) => ({ id: a.id, kind: "ASSESSMENT" as const, title: a.title, category: a.type as string, totalMarks: a.totalMarks, dueAt: a.closesAt ?? a.scheduledAt, visibleToStudents: a.resultsPublished })),
    ...assignments.map((a) => ({ id: a.id, kind: "ASSIGNMENT" as const, title: a.title, category: a.category, totalMarks: a.totalMarks, dueAt: a.dueAt, visibleToStudents: !a.holdGrades || !!a.gradesReleasedAt })),
  ];
  const userIds = students.map((s) => s.userId);
  const [asmSubs, asgSubs] = await Promise.all([
    assessments.length ? prisma.submission.findMany({ where: { assessmentId: { in: assessments.map((a) => a.id) }, studentUserId: { in: userIds } }, select: { assessmentId: true, studentUserId: true, score: true, submittedAt: true } }) : [],
    assignments.length ? prisma.submission.findMany({ where: { assignmentId: { in: assignments.map((a) => a.id) }, studentUserId: { in: userIds }, isDraft: false }, select: { assignmentId: true, studentUserId: true, score: true, submittedAt: true } }) : [],
  ]);
  const method = new Map(assessments.map((a) => [a.id, a.gradingMethod as GradingMethod]));
  const grouped = new Map<string, { score: number | null; submittedAt: Date }[]>();
  for (const s of asmSubs) { const k = `${s.assessmentId}|${s.studentUserId}`; grouped.set(k, [...(grouped.get(k) ?? []), { score: s.score, submittedAt: s.submittedAt }]); }
  const asgBy = new Map(asgSubs.map((s) => [`${s.assignmentId}|${s.studentUserId}`, s]));

  const rows = students.map((st) => {
    const cells: Record<string, { score: number | null; percent: number | null; state: string }> = {};
    const forAverage: { category: string; percent: number | null }[] = [];
    let missing = 0, awaiting = 0;
    for (const it of items) {
      const hidden = !!opts.forUserId && !it.visibleToStudents;
      let score: number | null = null, submitted = false;
      if (it.kind === "ASSESSMENT") {
        const att = grouped.get(`${it.id}|${st.userId}`) ?? [];
        submitted = att.length > 0;
        score = att.length ? aggregateAttempts(att, method.get(it.id) ?? "HIGHEST") : null;
      } else {
        const s = asgBy.get(`${it.id}|${st.userId}`);
        submitted = !!s;
        score = s?.score ?? null;
      }
      if (hidden) { cells[it.id] = { score: null, percent: null, state: submitted ? "WITHHELD" : "NOT_DUE" }; continue; }
      const state = classifyCell({ open: true }, { itemId: it.id, score, submitted }, !!it.dueAt && it.dueAt < now);
      const percent = score !== null && it.totalMarks > 0 ? r1((score / it.totalMarks) * 100) : null;
      cells[it.id] = { score, percent, state };
      if (state === "MISSING") missing++;
      if (state === "AWAITING") awaiting++;
      if (state !== "NOT_DUE") forAverage.push({ category: it.category, percent });
    }
    const overall = weightedCourseGrade(forAverage.filter((c) => c.percent !== null), weights);
    return { studentUserId: st.userId, studentId: st.id, fullName: st.fullName, studentNumber: st.studentNumber, intake: st.intake, cells, overall: { percent: overall.percent, letter: overall.letter, weighted: overall.weighted, coveredWeight: overall.coveredWeight }, missing, awaiting };
  });
  return { course, items, weights, rows };
}

lmsExtrasRouter.get("/gradebook/:courseId/weights", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await canViewCourseAsStaff(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't have access to this course." });
  const w = await weightsFor(req.params.courseId);
  res.json({ categories: GRADE_CATEGORIES, weights: w, total: Object.values(w).reduce((a, b) => a + b, 0) });
});

lmsExtrasRouter.put("/gradebook/:courseId/weights", ...staff, async (req: AuthedRequest, res) => {
  if (!(await canTeachCourse(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  const p = z.object({ weights: z.array(z.object({ category: z.string(), weightPercent: z.number() })).max(10) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Provide a list of category weights." });
  const bad = validateWeights(p.data.weights);
  if (bad) return res.status(400).json({ message: bad });
  await prisma.$transaction([
    prisma.gradeWeight.deleteMany({ where: { courseId: req.params.courseId } }),
    ...p.data.weights.filter((w) => w.weightPercent > 0).map((w) => prisma.gradeWeight.create({ data: { courseId: req.params.courseId, category: w.category, weightPercent: w.weightPercent, updatedById: req.user!.id } })),
  ]);
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: "GRADE_WEIGHTS_CHANGED", entityType: "Course", entityId: req.params.courseId, metadata: { weights: p.data.weights } } }).catch(() => undefined);
  res.json({ saved: true, weights: await weightsFor(req.params.courseId) });
});

lmsExtrasRouter.get("/gradebook/:courseId", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await canViewCourseAsStaff(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't have access to this course." });
  const gb = await buildGradebook(req.params.courseId);
  if (!gb) return res.status(404).json({ message: "Course not found." });
  const itemStats = gb.items.map((it) => {
    const pcts = gb.rows.map((r) => r.cells[it.id]?.percent).filter((p): p is number => p !== null && p !== undefined);
    return { itemId: it.id, ...itemSummary(pcts, gb.rows.length) };
  });
  res.json({ course: gb.course, weights: gb.weights, items: gb.items, rows: gb.rows, itemStats, classAverage: (() => { const v = gb.rows.map((r) => r.overall.percent).filter((p): p is number => p !== null); return v.length ? r1(v.reduce((a, b) => a + b, 0) / v.length) : null; })() });
});

// GRD004 — a student's own gradebook (only what has been released to them)
lmsExtrasRouter.get("/gradebook/:courseId/me", requireAuth, async (req: AuthedRequest, res) => {
  if (!isLearnerRole(req.user!.role) || !(await isEnrolledInCourse(req.user!.id, req.params.courseId))) return res.status(404).json({ message: "Course not found." });
  const gb = await buildGradebook(req.params.courseId, { forUserId: req.user!.id });
  if (!gb || !gb.rows.length) return res.status(404).json({ message: "Course not found." });
  const row = gb.rows[0];
  const dated = gb.items.filter((i) => row.cells[i.id]?.percent !== null && row.cells[i.id]?.percent !== undefined).sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0));
  res.json({ course: gb.course, weights: gb.weights, items: gb.items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, category: i.category, totalMarks: i.totalMarks, dueAt: i.dueAt })), cells: row.cells, overall: row.overall, missing: row.missing, awaiting: row.awaiting, trend: trend(dated.map((i) => row.cells[i.id].percent as number)) });
});

lmsExtrasRouter.get("/gradebook/:courseId/student/:studentUserId", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await canViewCourseAsStaff(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't have access to this course." });
  const gb = await buildGradebook(req.params.courseId);
  const row = gb?.rows.find((r) => r.studentUserId === req.params.studentUserId);
  if (!gb || !row) return res.status(404).json({ message: "That student is not enrolled in this course." });
  const dated = gb.items.filter((i) => row.cells[i.id]?.percent !== null).sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0));
  res.json({ course: gb.course, student: { fullName: row.fullName, studentNumber: row.studentNumber }, items: gb.items, cells: row.cells, overall: row.overall, missing: row.missing, awaiting: row.awaiting, trend: trend(dated.map((i) => row.cells[i.id].percent as number)) });
});

lmsExtrasRouter.get("/gradebook/:courseId/export.csv", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await canViewCourseAsStaff(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't have access to this course." });
  const gb = await buildGradebook(req.params.courseId);
  if (!gb) return res.status(404).json({ message: "Course not found." });
  const head = ["student_number", "full_name", "intake", ...gb.items.map((i) => `${i.title} (/${i.totalMarks})`), "overall_percent", "letter", "missing"];
  const body = gb.rows.map((r) => [r.studentNumber, r.fullName, r.intake, ...gb.items.map((i) => r.cells[i.id]?.score ?? (r.cells[i.id]?.state === "MISSING" ? "MISSING" : "")), r.overall.percent, r.overall.letter, r.missing]);
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: "GRADEBOOK_EXPORTED", entityType: "Course", entityId: req.params.courseId, metadata: { rows: gb.rows.length } } }).catch(() => undefined);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="gradebook-${req.params.courseId}.csv"`);
  res.send("\uFEFF" + toCsv([head, ...body]));
});

// GRD019 — import marks for one assignment from a CSV (student_number,score[,feedback]). dryRun first to see problems.
lmsExtrasRouter.post("/gradebook/:courseId/import", ...staff, async (req: AuthedRequest, res) => {
  if (!(await canTeachCourse(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  const p = z.object({ assignmentId: z.string(), csv: z.string().min(5).max(500_000), dryRun: z.boolean().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Provide assignmentId and the CSV text." });
  const a = await prisma.assignment.findUnique({ where: { id: p.data.assignmentId }, include: { course: { select: { unitId: true } } } });
  if (!a || a.courseId !== req.params.courseId) return res.status(404).json({ message: "Assignment not found in this course." });
  if (a.competencyBased) return res.status(400).json({ message: "Competency-based assignments are marked individually, not imported." });
  const table = parseCsv(p.data.csv).filter((r) => r.some((c) => c.trim()));
  const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
  const iNum = header.indexOf("student_number"), iScore = header.indexOf("score"), iFb = header.indexOf("feedback");
  if (iNum < 0 || iScore < 0) return res.status(400).json({ message: "The first row must contain student_number and score columns." });
  const roster = await enrolledStudents(a.course.unitId);
  const byNum = new Map(roster.map((s) => [s.studentNumber.toLowerCase(), s]));
  const errors: { row: number; message: string }[] = [];
  const good: { userId: string; score: number; feedback: string | null }[] = [];
  const seen = new Set<string>();
  table.slice(1, 1001).forEach((r, i) => {
    const row = i + 2, num = (r[iNum] ?? "").trim().toLowerCase(), score = Number((r[iScore] ?? "").trim());
    const st = byNum.get(num);
    if (!st) return void errors.push({ row, message: `Student number "${r[iNum] ?? ""}" is not enrolled in this course.` });
    if (seen.has(num)) return void errors.push({ row, message: `Student ${r[iNum]} appears more than once.` });
    seen.add(num);
    if (!Number.isFinite(score) || (r[iScore] ?? "").trim() === "" || score < 0 || score > a.totalMarks) return void errors.push({ row, message: `Score must be between 0 and ${a.totalMarks}.` });
    good.push({ userId: st.userId, score, feedback: iFb >= 0 ? (r[iFb] ?? "").trim().slice(0, 2000) || null : null });
  });
  if (p.data.dryRun || errors.length) return res.status(errors.length && !p.data.dryRun ? 422 : 200).json({ dryRun: !!p.data.dryRun, valid: good.length, errors, applied: 0 });
  const now = new Date();
  for (const g of good) {
    const ex = await prisma.submission.findFirst({ where: { assignmentId: a.id, studentUserId: g.userId } });
    const data = { score: g.score, rawScore: g.score, feedback: g.feedback ?? ex?.feedback ?? null, gradedById: req.user!.id, gradedAt: now, isDraft: false, needsRegrade: false };
    if (ex) await prisma.submission.update({ where: { id: ex.id }, data });
    else await prisma.submission.create({ data: { ...data, assignmentId: a.id, studentUserId: g.userId, textAnswer: "(marks imported from CSV — no submission on the platform)", submittedAt: now } });
  }
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: "ASSIGNMENT_MARKS_IMPORTED", entityType: "Assignment", entityId: a.id, metadata: { rows: good.length } } }).catch(() => undefined);
  res.status(201).json({ applied: good.length, errors: [] });
});

// GRD023/037 — who changed which grade, when
lmsExtrasRouter.get("/gradebook/:courseId/history", ...staff, async (req: AuthedRequest, res) => {
  if (!(await canTeachCourse(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  const [asgs, asms] = await Promise.all([prisma.assignment.findMany({ where: { courseId: req.params.courseId }, select: { id: true, title: true } }), prisma.assessment.findMany({ where: { courseId: req.params.courseId }, select: { id: true, title: true } })]);
  const subs = await prisma.submission.findMany({ where: { OR: [{ assignmentId: { in: asgs.map((a) => a.id) } }, { assessmentId: { in: asms.map((a) => a.id) } }] }, select: { id: true } , take: 5000 });
  const ids = [...asgs.map((a) => a.id), ...asms.map((a) => a.id), ...subs.map((s) => s.id)];
  const rows = await prisma.auditLog.findMany({
    where: { entityId: { in: ids }, OR: [{ action: { startsWith: "ASSIGNMENT_" } }, { action: { contains: "GRADE" } }, { action: { contains: "RESULT" } }, { action: { contains: "REGRADE" } }] },
    orderBy: { createdAt: "desc" }, take: 300,
  });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))] } }, select: { id: true, email: true } });
  const by = new Map(users.map((u) => [u.id, u.email]));
  res.json(rows.map((r) => ({ at: r.createdAt, action: r.action, by: r.userId ? by.get(r.userId) ?? r.userId : "system", entityType: r.entityType, entityId: r.entityId, details: r.metadata })));
});

// GRD029-033/036/038/039 — class analysis: per-item difficulty, distribution, results summary, recorded-vs-computed grades
lmsExtrasRouter.get("/gradebook/:courseId/analysis", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await canViewCourseAsStaff(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't have access to this course." });
  const gb = await buildGradebook(req.params.courseId);
  if (!gb) return res.status(404).json({ message: "Course not found." });
  const items = gb.items.map((it) => {
    const pcts = gb.rows.map((r) => r.cells[it.id]?.percent).filter((p): p is number => p !== null && p !== undefined);
    return { itemId: it.id, title: it.title, kind: it.kind, category: it.category, ...itemSummary(pcts, gb.rows.length) };
  });
  const overall = gb.rows.map((r) => r.overall.percent).filter((p): p is number => p !== null);
  const letters: Record<string, number> = {};
  for (const r of gb.rows) if (r.overall.letter) letters[r.overall.letter] = (letters[r.overall.letter] ?? 0) + 1;
  const sorted = [...gb.rows].filter((r) => r.overall.percent !== null).sort((a, b) => (b.overall.percent as number) - (a.overall.percent as number));
  const course = await prisma.course.findUnique({ where: { id: req.params.courseId }, select: { unitId: true } });
  const enrolments = course ? await prisma.enrollment.findMany({ where: { unitId: course.unitId, finalGrade: { not: null } }, select: { finalGrade: true, student: { select: { userId: true } } } }) : [];
  const recorded = new Map(enrolments.map((e) => [e.student.userId, e.finalGrade]));
  const discrepancies = gb.rows.flatMap((r) => { const d = gradeDiscrepancy(recorded.get(r.studentUserId), r.overall.letter); return d.mismatch ? [{ studentNumber: r.studentNumber, fullName: r.fullName, note: d.note }] : []; });
  res.json({
    items, distribution: scoreStats(overall, PASS_MARK_PERCENT), letters, atRiskBelowPass: gb.rows.filter((r) => r.overall.percent !== null && (r.overall.percent as number) < PASS_MARK_PERCENT).length,
    top: sorted.slice(0, 3).map((r) => ({ fullName: r.fullName, percent: r.overall.percent })), bottom: sorted.slice(-3).reverse().map((r) => ({ fullName: r.fullName, percent: r.overall.percent })),
    incomplete: gb.rows.filter((r) => r.missing > 0 || r.awaiting > 0).map((r) => ({ studentNumber: r.studentNumber, fullName: r.fullName, missing: r.missing, awaiting: r.awaiting })),
    discrepancies, passMark: PASS_MARK_PERCENT,
  });
});

// GRD035/039 — printable, structured course progress and individual result reports.
// The same rows feed the CSV; the HTML keeps the report readable on screen and on paper.
lmsExtrasRouter.get("/gradebook/:courseId/progress-report.html", requireAuth, async (req: AuthedRequest, res) => {
  const courseId = req.params.courseId;
  if (!(await canViewCourseAsStaff(req.user!, courseId))) return res.status(403).json({ message: "You don't have access to this course." });
  const base = await courseRoster(courseId);
  if (!base) return res.status(404).json({ message: "Course not found." });
  const gb = await buildGradebook(courseId);
  const total = await prisma.lesson.count({ where: { module: { courseId }, isPublished: true } });
  const done = await prisma.lessonProgress.groupBy({ by: ["studentId"], where: { studentId: { in: base.roster.map((s) => s.id) }, lesson: { module: { courseId } } }, _count: { _all: true } });
  const dn = new Map(done.map((d) => [d.studentId, d._count._all]));
  const rows: unknown[][] = [["Student number", "Student", "Intake", "Lessons complete", "Published lessons", "Lesson progress", "Grade", "Letter", "Missing work"]];
  for (const s of base.roster) {
    const g = gb?.rows.find((r) => r.studentUserId === s.userId);
    const n = dn.get(s.id) ?? 0;
    rows.push([s.studentNumber, s.fullName, s.intake, n, total, total ? `${r1((n / total) * 100)}%` : "—", g?.overall.percent == null ? "—" : `${g.overall.percent}%`, g?.overall.letter ?? "—", g?.missing ?? 0]);
  }
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: "ACADEMIC_PROGRESS_REPORT_EXPORTED", entityType: "Course", entityId: courseId, metadata: { rows: base.roster.length } } }).catch(() => undefined);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="progress-report-${courseId}.html"`);
  res.send(reportHtml(`Academic progress — ${base.course.title}`, `${base.roster.length} enrolled student(s)`, rows));
});

lmsExtrasRouter.get("/gradebook/:courseId/student/:studentUserId/report.html", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await canViewCourseAsStaff(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't have access to this course." });
  const gb = await buildGradebook(req.params.courseId);
  const row = gb?.rows.find((r) => r.studentUserId === req.params.studentUserId);
  if (!gb || !row) return res.status(404).json({ message: "That student is not enrolled in this course." });
  const rows: unknown[][] = [["Assessment", "Category", "Result", "Out of", "Status"], ...gb.items.map((i) => {
    const c = row.cells[i.id];
    return [i.title, i.category, c?.score ?? "—", i.totalMarks, c?.state ?? "NOT_GRADED"];
  })];
  rows.push(["Overall", "", row.overall.percent == null ? "—" : `${row.overall.percent}% ${row.overall.letter ?? ""}`, "", `${row.missing} missing; ${row.awaiting} awaiting marking`]);
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: "STUDENT_RESULT_REPORT_EXPORTED", entityType: "Course", entityId: req.params.courseId, metadata: { studentUserId: req.params.studentUserId } } }).catch(() => undefined);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="result-${row.studentNumber}.html"`);
  res.send(reportHtml(`Academic result — ${row.fullName} (${row.studentNumber})`, gb.course.title, rows));
});

// GRD032 — compare the courses a trainer teaches
lmsExtrasRouter.get("/gradebook/compare/mine", ...staff, async (req: AuthedRequest, res) => {
  const trainer = await prisma.trainer.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  const courses = await prisma.course.findMany({ where: req.user!.role === "SUPER_ADMIN" ? {} : { trainerId: trainer?.id ?? "none" }, select: { id: true, title: true, unit: { select: { code: true, title: true } } }, take: 12 });
  const out = [];
  for (const c of courses) {
    const gb = await buildGradebook(c.id);
    const v = gb ? gb.rows.map((r) => r.overall.percent).filter((p): p is number => p !== null) : [];
    out.push({ courseId: c.id, title: c.title, unitCode: c.unit.code, students: gb?.rows.length ?? 0, graded: v.length, averagePercent: v.length ? r1(v.reduce((a, b) => a + b, 0) / v.length) : null, passRatePercent: v.length ? r1((v.filter((x) => x >= PASS_MARK_PERCENT).length / v.length) * 100) : null });
  }
  res.json(out);
});

// GRD034 — competency attainment for the unit this course delivers
lmsExtrasRouter.get("/gradebook/:courseId/competency", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await canViewCourseAsStaff(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't have access to this course." });
  const course = await prisma.course.findUnique({ where: { id: req.params.courseId }, select: { unitId: true } });
  if (!course) return res.status(404).json({ message: "Course not found." });
  const [maps, roster] = await Promise.all([prisma.unitCompetency.findMany({ where: { unitId: course.unitId }, include: { competency: { select: { id: true, name: true } } } }), enrolledStudents(course.unitId)]);
  const records = await prisma.competencyRecord.findMany({ where: { competencyId: { in: maps.map((m) => m.competencyId) }, studentId: { in: roster.map((s) => s.id) } }, select: { competencyId: true, studentId: true, level: true } });
  res.json({ enrolled: roster.length, competencies: maps.map((m) => {
    const rs = records.filter((r) => r.competencyId === m.competencyId);
    const ach = new Set(rs.filter((r) => r.level === "competent" || r.level === "advanced").map((r) => r.studentId));
    return { competencyId: m.competencyId, name: m.competency.name, competent: ach.size, developing: rs.filter((r) => r.level === "developing" && !ach.has(r.studentId)).length, notAssessed: Math.max(0, roster.length - new Set(rs.map((r) => r.studentId)).size), attainmentPercent: roster.length ? r1((ach.size / roster.length) * 100) : null };
  }) });
});

// ====================================================================== PROGRESS
async function courseProgress(userId: string, studentId: string, courseId: string) {
  const [lessons, done, asm, asg] = await Promise.all([
    prisma.lesson.findMany({ where: { module: { courseId }, isPublished: true }, select: { id: true, moduleId: true, module: { select: { title: true } } } }),
    prisma.lessonProgress.findMany({ where: { studentId, lesson: { module: { courseId } } }, select: { lessonId: true } }),
    prisma.assessment.findMany({ where: { courseId, isDraft: false }, select: { id: true } }),
    prisma.assignment.findMany({ where: { courseId, status: "PUBLISHED" }, select: { id: true } }),
  ]);
  const [asmDone, asgDone] = await Promise.all([
    asm.length ? prisma.submission.findMany({ where: { assessmentId: { in: asm.map((a) => a.id) }, studentUserId: userId }, select: { assessmentId: true } }) : [],
    asg.length ? prisma.submission.findMany({ where: { assignmentId: { in: asg.map((a) => a.id) }, studentUserId: userId, isDraft: false }, select: { assignmentId: true } }) : [],
  ]);
  const doneSet = new Set(done.map((d) => d.lessonId));
  const modules = new Map<string, { title: string; total: number; done: number }>();
  for (const l of lessons) { const m = modules.get(l.moduleId) ?? { title: l.module.title, total: 0, done: 0 }; m.total++; if (doneSet.has(l.id)) m.done++; modules.set(l.moduleId, m); }
  const pct = (a: number, b: number) => (b ? r1((a / b) * 100) : null);
  return {
    lessons: { total: lessons.length, done: doneSet.size, percent: pct(doneSet.size, lessons.length) },
    modules: [...modules.values()].map((m) => ({ ...m, percent: pct(m.done, m.total) })),
    assessments: { total: asm.length, attempted: new Set(asmDone.map((s) => s.assessmentId)).size },
    assignments: { total: asg.length, handedIn: new Set(asgDone.map((s) => s.assignmentId)).size },
  };
}

// PRG001-005/026 — the student's own dashboard across their courses
lmsExtrasRouter.get("/progress/me", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });
  const enrols = await prisma.enrollment.findMany({ where: { studentId: student.id, status: { not: "withdrawn" } }, select: { unitId: true, status: true, semester: true } });
  const courses = await prisma.course.findMany({ where: { unitId: { in: enrols.map((e) => e.unitId) } }, select: { id: true, title: true, unitId: true, unit: { select: { code: true, title: true } } }, take: 12 });
  const out = [];
  for (const c of courses) {
    const [prog, gb] = await Promise.all([courseProgress(req.user!.id, student.id, c.id), buildGradebook(c.id, { forUserId: req.user!.id })]);
    const row = gb?.rows[0];
    const lessonPct = prog.lessons.percent ?? 0;
    out.push({ courseId: c.id, title: c.title, unitCode: c.unit.code, enrolmentStatus: enrols.find((e) => e.unitId === c.unitId)?.status, ...prog, grade: row ? { percent: row.overall.percent, letter: row.overall.letter, missing: row.missing, awaiting: row.awaiting } : null, onTrack: lessonPct >= 50 || (row?.overall.percent ?? 100) >= PASS_MARK_PERCENT });
  }
  res.json({ courses: out });
});

// PRG006 — what the student has actually done lately
lmsExtrasRouter.get("/activity/me", requireAuth, async (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const student = await prisma.student.findUnique({ where: { userId: uid }, select: { id: true } });
  const [done, asg, asm, views, notes] = await Promise.all([
    student ? prisma.lessonProgress.findMany({ where: { studentId: student.id }, orderBy: { completedAt: "desc" }, take: 25, select: { completedAt: true, lesson: { select: { title: true } } } }) : [],
    prisma.submission.findMany({ where: { studentUserId: uid, assignmentId: { not: null }, isDraft: false }, orderBy: { submittedAt: "desc" }, take: 25, select: { submittedAt: true, assignment: { select: { title: true } } } }),
    prisma.submission.findMany({ where: { studentUserId: uid, assessmentId: { not: null } }, orderBy: { submittedAt: "desc" }, take: 25, select: { submittedAt: true, assessment: { select: { title: true } } } }),
    prisma.lessonView.findMany({ where: { userId: uid }, orderBy: { viewedAt: "desc" }, take: 25, select: { viewedAt: true, lessonId: true } }),
    prisma.lessonNote.findMany({ where: { studentUserId: uid }, orderBy: { createdAt: "desc" }, take: 10, select: { createdAt: true, lessonId: true } }),
  ]);
  const titles = await prisma.lesson.findMany({ where: { id: { in: [...views.map((v) => v.lessonId), ...notes.map((n) => n.lessonId)] } }, select: { id: true, title: true } });
  const t = new Map(titles.map((x) => [x.id, x.title]));
  const events = [
    ...done.map((d) => ({ at: d.completedAt, type: "LESSON_COMPLETED", label: d.lesson.title })),
    ...asg.map((s) => ({ at: s.submittedAt, type: "ASSIGNMENT_SUBMITTED", label: s.assignment?.title ?? "Assignment" })),
    ...asm.map((s) => ({ at: s.submittedAt, type: "ASSESSMENT_ATTEMPTED", label: s.assessment?.title ?? "Assessment" })),
    ...views.map((v) => ({ at: v.viewedAt, type: "LESSON_VIEWED", label: t.get(v.lessonId) ?? "Lesson" })),
    ...notes.map((n) => ({ at: n.createdAt, type: "NOTE_ADDED", label: t.get(n.lessonId) ?? "Lesson" })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 100);
  res.json(events);
});

async function courseRoster(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, title: true, unitId: true } });
  if (!course) return null;
  return { course, roster: await enrolledStudents(course.unitId) };
}

// PRG007/COM025 — engagement per student
lmsExtrasRouter.get("/courses/:courseId/engagement", requireAuth, async (req: AuthedRequest, res) => {
  const courseId = req.params.courseId;
  if (!(await canViewCourseAsStaff(req.user!, courseId))) return res.status(403).json({ message: "You don't have access to this course." });
  const base = await courseRoster(courseId);
  if (!base) return res.status(404).json({ message: "Course not found." });
  const sIds = base.roster.map((s) => s.id), uIds = base.roster.map((s) => s.userId);
  const [done, time, views, subs] = await Promise.all([
    prisma.lessonProgress.groupBy({ by: ["studentId"], where: { studentId: { in: sIds }, lesson: { module: { courseId } } }, _count: { _all: true } }),
    prisma.lessonTimeLog.groupBy({ by: ["studentId"], where: { studentId: { in: sIds }, lesson: { module: { courseId } } }, _sum: { seconds: true } }),
    prisma.lessonView.groupBy({ by: ["userId"], where: { userId: { in: uIds }, courseId }, _count: { _all: true }, _max: { viewedAt: true } }),
    prisma.submission.groupBy({ by: ["studentUserId"], where: { studentUserId: { in: uIds }, isDraft: false, OR: [{ assignment: { courseId } }, { assessment: { courseId } }] }, _count: { _all: true }, _max: { submittedAt: true } }),
  ]);
  const dn = new Map(done.map((x) => [x.studentId, x._count._all])), tm = new Map(time.map((x) => [x.studentId, x._sum.seconds ?? 0]));
  const vw = new Map(views.map((x) => [x.userId, x])), sb = new Map(subs.map((x) => [x.studentUserId, x]));
  const rows = base.roster.map((s) => {
    const lastAt = [vw.get(s.userId)?._max.viewedAt, sb.get(s.userId)?._max.submittedAt].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const idleDays = lastAt ? Math.floor((Date.now() - lastAt.getTime()) / 86_400_000) : null;
    const score = Math.min(100, (dn.get(s.id) ?? 0) * 8 + Math.min(40, Math.round((tm.get(s.id) ?? 0) / 60) / 3) + (vw.get(s.userId)?._count._all ?? 0) * 2 + (sb.get(s.userId)?._count._all ?? 0) * 10);
    return { studentUserId: s.userId, fullName: s.fullName, studentNumber: s.studentNumber, lessonsCompleted: dn.get(s.id) ?? 0, minutesOnTask: Math.round((tm.get(s.id) ?? 0) / 60), lessonViews: vw.get(s.userId)?._count._all ?? 0, submissions: sb.get(s.userId)?._count._all ?? 0, lastActiveAt: lastAt, idleDays, engagementScore: Math.round(score), level: score >= 60 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW" };
  }).sort((a, b) => a.engagementScore - b.engagementScore);
  res.json({ course: base.course.title, note: "The score is a simple activity index (completions, time, views, hand-ins) for spotting who needs a nudge — not a measure of learning.", rows });
});

// PRG029 — completion analytics
lmsExtrasRouter.get("/courses/:courseId/completion-analytics", requireAuth, async (req: AuthedRequest, res) => {
  const courseId = req.params.courseId;
  if (!(await canViewCourseAsStaff(req.user!, courseId))) return res.status(403).json({ message: "You don't have access to this course." });
  const base = await courseRoster(courseId);
  if (!base) return res.status(404).json({ message: "Course not found." });
  const [lessons, progress] = await Promise.all([
    prisma.lesson.findMany({ where: { module: { courseId }, isPublished: true }, select: { id: true, title: true } }),
    prisma.lessonProgress.findMany({ where: { lesson: { module: { courseId } }, studentId: { in: base.roster.map((s) => s.id) } }, select: { studentId: true, lessonId: true } }),
  ]);
  const per = new Map<string, number>(), perLesson = new Map<string, number>();
  for (const p of progress) { per.set(p.studentId, (per.get(p.studentId) ?? 0) + 1); perLesson.set(p.lessonId, (perLesson.get(p.lessonId) ?? 0) + 1); }
  const pcts = base.roster.map((s) => (lessons.length ? ((per.get(s.id) ?? 0) / lessons.length) * 100 : 0));
  const buckets = [{ label: "0%", min: 0, max: 0 }, { label: "1–25%", min: 0.01, max: 25 }, { label: "26–50%", min: 25.01, max: 50 }, { label: "51–75%", min: 50.01, max: 75 }, { label: "76–99%", min: 75.01, max: 99.99 }, { label: "100%", min: 100, max: 100 }].map((b) => ({ label: b.label, students: pcts.filter((p) => p >= b.min && p <= b.max).length }));
  const lessonRows = lessons.map((l) => ({ lessonId: l.id, title: l.title, completionPercent: base.roster.length ? r1(((perLesson.get(l.id) ?? 0) / base.roster.length) * 100) : null })).sort((a, b) => (a.completionPercent ?? 0) - (b.completionPercent ?? 0));
  res.json({ enrolled: base.roster.length, lessons: lessons.length, averageCompletionPercent: pcts.length ? r1(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null, completed: pcts.filter((p) => p >= 100).length, distribution: buckets, hardestToFinish: lessonRows.slice(0, 5) });
});

// PRG030 — progress export
lmsExtrasRouter.get("/courses/:courseId/progress.csv", requireAuth, async (req: AuthedRequest, res) => {
  const courseId = req.params.courseId;
  if (!(await canViewCourseAsStaff(req.user!, courseId))) return res.status(403).json({ message: "You don't have access to this course." });
  const base = await courseRoster(courseId);
  if (!base) return res.status(404).json({ message: "Course not found." });
  const gb = await buildGradebook(courseId);
  const total = await prisma.lesson.count({ where: { module: { courseId }, isPublished: true } });
  const done = await prisma.lessonProgress.groupBy({ by: ["studentId"], where: { studentId: { in: base.roster.map((s) => s.id) }, lesson: { module: { courseId } } }, _count: { _all: true } });
  const dn = new Map(done.map((d) => [d.studentId, d._count._all]));
  const rows = base.roster.map((s) => { const g = gb?.rows.find((r) => r.studentUserId === s.userId); return [s.studentNumber, s.fullName, s.intake, dn.get(s.id) ?? 0, total, total ? r1(((dn.get(s.id) ?? 0) / total) * 100) : "", g?.overall.percent ?? "", g?.overall.letter ?? "", g?.missing ?? ""]; });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="progress-${courseId}.csv"`);
  res.send("\uFEFF" + toCsv([["student_number", "full_name", "intake", "lessons_done", "lessons_total", "lesson_percent", "grade_percent", "letter", "missing_work"], ...rows]));
});

// PRG028 — interventions
lmsExtrasRouter.get("/courses/:courseId/interventions", ...staff, async (req: AuthedRequest, res) => {
  if (!(await canTeachCourse(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  const rows = await prisma.supportIntervention.findMany({ where: { courseId: req.params.courseId }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 });
  const people = await prisma.student.findMany({ where: { userId: { in: rows.map((r) => r.studentUserId) } }, select: { userId: true, fullName: true, studentNumber: true } });
  const by = new Map(people.map((p) => [p.userId, p]));
  res.json(rows.map((r) => ({ ...r, fullName: by.get(r.studentUserId)?.fullName, studentNumber: by.get(r.studentUserId)?.studentNumber })));
});

lmsExtrasRouter.post("/courses/:courseId/interventions", ...staff, async (req: AuthedRequest, res) => {
  if (!(await canTeachCourse(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  const p = z.object({ studentUserId: z.string(), reason: z.string().trim().min(5).max(1000), action: z.string().trim().max(1000).optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Pick a student and say why (at least 5 characters)." });
  if (!(await isEnrolledInCourse(p.data.studentUserId, req.params.courseId))) return res.status(400).json({ message: "That student is not enrolled in this course." });
  res.status(201).json(await prisma.supportIntervention.create({ data: { courseId: req.params.courseId, studentUserId: p.data.studentUserId, openedById: req.user!.id, reason: p.data.reason, action: p.data.action ?? null } }));
});

lmsExtrasRouter.patch("/interventions/:iid", ...staff, async (req: AuthedRequest, res) => {
  const i = await prisma.supportIntervention.findUnique({ where: { id: req.params.iid } });
  if (!i || !(await canTeachCourse(req.user!, i.courseId))) return res.status(404).json({ message: "Intervention not found." });
  const p = z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "CLOSED"]).optional(), action: z.string().max(1000).optional(), outcome: z.string().max(1000).optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid update." });
  res.json(await prisma.supportIntervention.update({ where: { id: i.id }, data: { ...p.data, ...(p.data.status === "CLOSED" ? { closedAt: new Date() } : p.data.status ? { closedAt: null } : {}) } }));
});
