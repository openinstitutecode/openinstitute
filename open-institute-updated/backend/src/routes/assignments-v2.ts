// Batch 77 — assignments v2 (LMS-ASG-001…040). Mounted at /api/assignments.
//
//   Setup        POST /, PATCH /:id, POST /:id/publish|unpublish|archive|restore|duplicate     ASG001-006 005 019 023 028 029 035 039 040
//   Listing      GET  /course/:courseId (role-aware), GET /:id                                 ASG003 004
//   Student      POST /:id/files (raw upload), PUT /:id/draft, POST /:id/submit, GET /:id/mine  ASG008-018 023 024
//   Extensions   POST /:id/extension-request, GET /:id/extensions, PATCH /extensions/:eid,
//                POST /:id/extensions/grant                                                    ASG021 022
//   Groups       GET/POST /:id/groups, POST /groups/:gid/join, POST /:id/groups/leave,
//                POST /groups/:gid/members, DELETE /groups/:gid                                ASG006 007
//   Marking      GET  /:id/submissions, GET /submissions/:sid, PUT /submissions/:sid/grade,
//                PUT /submissions/:sid/annotations, POST /submissions/:sid/request-resubmission  ASG020 026-036
//   Moderation   GET  /:id/moderation, POST /submissions/:sid/moderate                         ASG035
//   Release      POST /:id/release-grades | /withhold-grades                                   ASG037
//   Reports      GET  /:id/analytics, GET /:id/download.zip, GET /:id/similarity                ASG025 038 039
//   Files        GET  /files/:assetId/url                                                       ASG009-016 032-034

import { Router } from "express";
import type { Readable } from "node:stream";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import AdmZip from "adm-zip";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { canTeachCourse, canViewCourseAsStaff, isEnrolledInCourse, isLearnerRole } from "../lib/course-access.js";
import { classifyUpload, magicMatches, maxBytesFor, sanitizeFilename } from "../lib/media-policy.js";
import { removeFromDisk, resolveStoragePath, streamToDisk, UploadTooLargeError } from "../lib/media-storage.js";
import { mediaUrl } from "../lib/signed-url.js";
import { jaccardSimilarity, shingleSimilarity } from "../lib/similarity.js";
import { notifyOnce } from "../lib/reminder-jobs.js";
import {
  FILE_KINDS, applyPenalty, assignmentAnalytics, cleanAnnotations, competencyScore, moderationSample, receiptText, resubmitAllowance, scoreRubric,
  submissionWindow, textChange, validateContent, validateCriteria, validateFiles, r2, type AssignmentRules, type Criterion,
} from "../lib/assignment-engine.js";

export const assignmentsV2Router = Router();
const staff = [requireAuth, requireRole("TRAINER", "SUPER_ADMIN")];
const moderators = [requireAuth, requireRole("TRAINER", "SUPER_ADMIN", "QA_OFFICER", "EXAMINATION_OFFICER", "DEPARTMENT_HEAD", "PROGRAMME_COORDINATOR")];

type Res = { status: (n: number) => { json: (b: unknown) => unknown } };
type Asg = NonNullable<Awaited<ReturnType<typeof loadAssignment>>>;

async function loadAssignment(id: string) {
  return prisma.assignment.findUnique({ where: { id }, include: { course: { select: { id: true, title: true, unitId: true } } } });
}

async function ownedAssignment(req: AuthedRequest, res: Res, id: string): Promise<Asg | null> {
  const a = await loadAssignment(id);
  if (!a) { res.status(404).json({ message: "Assignment not found." }); return null; }
  if (!(await canTeachCourse(req.user!, a.courseId))) { res.status(403).json({ message: "You don't teach this course." }); return null; }
  return a;
}

const rulesOf = (a: Asg): AssignmentRules => ({
  status: a.status, dueAt: a.dueAt, releaseAt: a.releaseAt, cutoffAt: a.cutoffAt, lateMode: a.lateMode, latePenaltyPctPerDay: a.latePenaltyPctPerDay,
  latePenaltyMaxPct: a.latePenaltyMaxPct, maxResubmissions: a.maxResubmissions, allowText: a.allowText, allowFiles: a.allowFiles, maxFiles: a.maxFiles,
  maxFileMb: a.maxFileMb, allowedKinds: a.allowedKinds, requireEvidence: a.requireEvidence,
});

const gradesVisible = (a: { holdGrades: boolean; gradesReleasedAt: Date | null }) => !a.holdGrades || !!a.gradesReleasedAt;

async function enrolled(courseId: string, unitId: string) {
  const rows = await prisma.enrollment.findMany({
    where: { unitId, status: { not: "withdrawn" } },
    select: { student: { select: { id: true, userId: true, fullName: true, studentNumber: true, intake: true } } },
  });
  void courseId;
  const seen = new Map<string, { id: string; userId: string; fullName: string; studentNumber: string; intake: string }>();
  for (const r of rows) seen.set(r.student.userId, r.student);
  return [...seen.values()];
}

const audit = (userId: string, action: string, entityId: string, metadata: Prisma.InputJsonValue) =>
  prisma.auditLog.create({ data: { userId, action, entityType: "Assignment", entityId, metadata } }).catch(() => undefined);

async function tell(userIds: string[], title: string, body: string, withinDays = 1) {
  if (!userIds.length) return;
  await notifyOnce(userIds.map((userId) => ({ userId, title: title.slice(0, 120), body })), "academic", withinDays).catch(() => undefined);
}

// ------------------------------------------------------------------ setup
const criterionSchema = z.object({ name: z.string().min(1).max(120), description: z.string().max(500).optional(), maxMarks: z.number().positive() });
const settingsShape = {
  title: z.string().min(2).max(200),
  instructions: z.string().min(2).max(20000),
  dueAt: z.string().datetime(),
  totalMarks: z.number().int().positive().max(1000),
  releaseAt: z.string().datetime().nullable().optional(),
  category: z.enum(["ASSIGNMENT", "PRACTICAL", "PROJECT", "CAT"]).optional(),
  weightPercent: z.number().min(0).max(100).optional(),
  mode: z.enum(["INDIVIDUAL", "GROUP"]).optional(),
  maxGroupSize: z.number().int().min(2).max(20).optional(),
  allowText: z.boolean().optional(),
  allowFiles: z.boolean().optional(),
  maxFiles: z.number().int().min(1).max(20).optional(),
  maxFileMb: z.number().int().min(1).max(500).optional(),
  allowedKinds: z.array(z.enum(FILE_KINDS)).max(9).optional(),
  requireEvidence: z.boolean().optional(),
  lateMode: z.enum(["NONE", "PENALTY", "ACCEPT"]).optional(),
  cutoffAt: z.string().datetime().nullable().optional(),
  latePenaltyPctPerDay: z.number().min(0).max(100).optional(),
  latePenaltyMaxPct: z.number().min(0).max(100).optional(),
  maxResubmissions: z.number().int().min(0).max(10).optional(),
  rubricCriteria: z.array(criterionSchema).max(20).nullable().optional(),
  competencyBased: z.boolean().optional(),
  competencyId: z.string().nullable().optional(),
  holdGrades: z.boolean().optional(),
  requireModeration: z.boolean().optional(),
  moderationSamplePct: z.number().int().min(0).max(100).optional(),
  checkSimilarity: z.boolean().optional(),
  confirmationNote: z.string().max(500).nullable().optional(),
};
const createSchema = z.object({ courseId: z.string(), status: z.enum(["DRAFT", "PUBLISHED"]).optional(), ...settingsShape });
const patchSchema = z.object(settingsShape).partial();

function checkSettings(d: Record<string, unknown> & { totalMarks?: number }, existing?: Asg): string | null {
  const total = (d.totalMarks as number | undefined) ?? existing?.totalMarks ?? 0;
  const rubric = d.rubricCriteria !== undefined ? d.rubricCriteria : existing?.rubricCriteria;
  if (rubric) {
    const v = validateCriteria(rubric, total);
    if (!v.ok) return v.message;
  }
  const allowText = (d.allowText as boolean | undefined) ?? existing?.allowText ?? true;
  const allowFiles = (d.allowFiles as boolean | undefined) ?? existing?.allowFiles ?? true;
  if (!allowText && !allowFiles) return "An assignment must accept typed answers, files, or both.";
  const due = new Date((d.dueAt as string | undefined) ?? existing?.dueAt ?? Date.now());
  const release = d.releaseAt !== undefined ? d.releaseAt : existing?.releaseAt;
  if (release && new Date(release as string | Date) > due) return "The release date must be before the deadline.";
  const cutoff = d.cutoffAt !== undefined ? d.cutoffAt : existing?.cutoffAt;
  if (cutoff && new Date(cutoff as string | Date) < due) return "The late cutoff must be after the deadline.";
  if ((d.competencyBased ?? existing?.competencyBased) && rubric) return "Competency-based assignments are marked Competent / Not yet competent, not against a rubric.";
  return null;
}

function toData(d: z.infer<typeof patchSchema>) {
  const { dueAt, releaseAt, cutoffAt, rubricCriteria, ...rest } = d;
  return {
    ...rest,
    ...(dueAt ? { dueAt: new Date(dueAt) } : {}),
    ...(releaseAt !== undefined ? { releaseAt: releaseAt ? new Date(releaseAt) : null } : {}),
    ...(cutoffAt !== undefined ? { cutoffAt: cutoffAt ? new Date(cutoffAt) : null } : {}),
    ...(rubricCriteria !== undefined ? { rubricCriteria: rubricCriteria ?? Prisma.DbNull } : {}),
  };
}

assignmentsV2Router.post("/", ...staff, async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid assignment.", issues: parsed.error.issues.slice(0, 5) });
  const { courseId, status, ...rest } = parsed.data;
  if (!(await canTeachCourse(req.user!, courseId))) return res.status(403).json({ message: "You don't teach this course." });
  const bad = checkSettings(rest);
  if (bad) return res.status(400).json({ message: bad });
  const a = await prisma.assignment.create({
    data: { ...toData(rest), courseId, status: status ?? "PUBLISHED", createdById: req.user!.id } as Prisma.AssignmentUncheckedCreateInput,
  });
  await audit(req.user!.id, "ASSIGNMENT_CREATED", a.id, { courseId, status: a.status });
  if (a.status === "PUBLISHED" && !a.releaseAt) void announce(a.id);
  res.status(201).json(a);
});

assignmentsV2Router.patch("/:id", ...staff, async (req: AuthedRequest, res) => {
  const a = await ownedAssignment(req, res, req.params.id);
  if (!a) return;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid changes.", issues: parsed.error.issues.slice(0, 5) });
  const bad = checkSettings(parsed.data, a);
  if (bad) return res.status(400).json({ message: bad });
  const count = await prisma.submission.count({ where: { assignmentId: a.id, isDraft: false } });
  if (count > 0) {
    if (parsed.data.mode && parsed.data.mode !== a.mode) return res.status(409).json({ message: "Work has already been handed in, so the assignment can't switch between individual and group." });
    if (parsed.data.competencyBased !== undefined && parsed.data.competencyBased !== a.competencyBased) return res.status(409).json({ message: "Work has already been handed in, so the marking style can't change." });
    if (parsed.data.totalMarks && parsed.data.totalMarks !== a.totalMarks) {
      const graded = await prisma.submission.count({ where: { assignmentId: a.id, score: { not: null } } });
      if (graded) return res.status(409).json({ message: "Some work is already graded; changing the total marks would silently change those results." });
    }
  }
  const updated = await prisma.assignment.update({ where: { id: a.id }, data: toData(parsed.data) as Prisma.AssignmentUncheckedUpdateInput });
  await audit(req.user!.id, "ASSIGNMENT_EDITED", a.id, { fields: Object.keys(parsed.data) });
  res.json(updated);
});

async function announce(assignmentId: string) {
  const a = await loadAssignment(assignmentId);
  if (!a) return;
  const students = await enrolled(a.courseId, a.course.unitId);
  await tell(students.map((s) => s.userId), `New assignment: ${a.title}`, `${a.course.title} — due ${a.dueAt.toISOString().slice(0, 16).replace("T", " ")} UTC, ${a.totalMarks} marks.`, 7);
}

assignmentsV2Router.post("/:id/publish", ...staff, async (req: AuthedRequest, res) => {
  const a = await ownedAssignment(req, res, req.params.id);
  if (!a) return;
  if (a.status === "PUBLISHED") return res.json(a);
  const u = await prisma.assignment.update({ where: { id: a.id }, data: { status: "PUBLISHED", archivedAt: null } });
  await audit(req.user!.id, "ASSIGNMENT_PUBLISHED", a.id, {});
  if (!u.releaseAt || u.releaseAt <= new Date()) void announce(a.id);
  res.json(u);
});

assignmentsV2Router.post("/:id/unpublish", ...staff, async (req: AuthedRequest, res) => {
  const a = await ownedAssignment(req, res, req.params.id);
  if (!a) return;
  const handedIn = await prisma.submission.count({ where: { assignmentId: a.id, isDraft: false } });
  if (handedIn) return res.status(409).json({ message: "Students have already handed work in — archive it instead of unpublishing." });
  res.json(await prisma.assignment.update({ where: { id: a.id }, data: { status: "DRAFT" } }));
});

assignmentsV2Router.post("/:id/archive", ...staff, async (req: AuthedRequest, res) => {
  const a = await ownedAssignment(req, res, req.params.id);
  if (!a) return;
  const u = await prisma.assignment.update({ where: { id: a.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
  await audit(req.user!.id, "ASSIGNMENT_ARCHIVED", a.id, {});
  res.json(u);
});

assignmentsV2Router.post("/:id/restore", ...staff, async (req: AuthedRequest, res) => {
  const a = await ownedAssignment(req, res, req.params.id);
  if (!a) return;
  const u = await prisma.assignment.update({ where: { id: a.id }, data: { status: "PUBLISHED", archivedAt: null } });
  await audit(req.user!.id, "ASSIGNMENT_RESTORED", a.id, {});
  res.json(u);
});

assignmentsV2Router.post("/:id/duplicate", ...staff, async (req: AuthedRequest, res) => {
  const a = await ownedAssignment(req, res, req.params.id);
  if (!a) return;
  const days = Math.max(0, Math.min(365, Number(req.body?.shiftDays ?? 0) || 0));
  const shift = (d: Date | null) => (d ? new Date(d.getTime() + days * 86_400_000) : null);
  const copy = await prisma.assignment.create({
    data: {
      courseId: a.courseId, title: `${a.title} (copy)`.slice(0, 200), instructions: a.instructions, dueAt: shift(a.dueAt) as Date, totalMarks: a.totalMarks,
      createdById: req.user!.id, status: "DRAFT", releaseAt: shift(a.releaseAt), cutoffAt: shift(a.cutoffAt), category: a.category, weightPercent: a.weightPercent,
      mode: a.mode, maxGroupSize: a.maxGroupSize, allowText: a.allowText, allowFiles: a.allowFiles, maxFiles: a.maxFiles, maxFileMb: a.maxFileMb,
      allowedKinds: a.allowedKinds, requireEvidence: a.requireEvidence, lateMode: a.lateMode, latePenaltyPctPerDay: a.latePenaltyPctPerDay,
      latePenaltyMaxPct: a.latePenaltyMaxPct, maxResubmissions: a.maxResubmissions, rubricCriteria: (a.rubricCriteria ?? Prisma.DbNull) as Prisma.InputJsonValue,
      competencyBased: a.competencyBased, competencyId: a.competencyId, holdGrades: a.holdGrades, requireModeration: a.requireModeration,
      moderationSamplePct: a.moderationSamplePct, checkSimilarity: a.checkSimilarity, confirmationNote: a.confirmationNote,
    },
  });
  await audit(req.user!.id, "ASSIGNMENT_DUPLICATED", copy.id, { from: a.id });
  res.status(201).json(copy);
});

// ---------------------------------------------------------------- listing
type SubLite = { id: string; isDraft: boolean; score: number | null; isLate: boolean; submittedAt: Date; versionCount: number; needsRegrade: boolean; gradedAt: Date | null; groupId: string | null };

function studentCard(a: Asg, sub: SubLite | null, ext: { status: string; grantedDueAt: Date | null } | null, now: Date) {
  const win = submissionWindow(rulesOf(a), now, ext?.status === "APPROVED" ? ext.grantedDueAt : null);
  const visible = gradesVisible(a);
  const allow = sub && !sub.isDraft ? resubmitAllowance(a.maxResubmissions, sub.versionCount) : { allowed: false, remaining: a.maxResubmissions };
  return {
    id: a.id, title: a.title, instructions: a.instructions, dueAt: a.dueAt, effectiveDueAt: win.effectiveDueAt, totalMarks: a.totalMarks, mode: a.mode, maxGroupSize: a.maxGroupSize,
    allowText: a.allowText, allowFiles: a.allowFiles, maxFiles: a.maxFiles, maxFileMb: a.maxFileMb, allowedKinds: a.allowedKinds, requireEvidence: a.requireEvidence,
    lateMode: a.lateMode, latePenaltyPctPerDay: a.latePenaltyPctPerDay, latePenaltyMaxPct: a.latePenaltyMaxPct, cutoffAt: a.cutoffAt, maxResubmissions: a.maxResubmissions,
    competencyBased: a.competencyBased, rubricCriteria: a.rubricCriteria, category: a.category, weightPercent: a.weightPercent, releaseAt: a.releaseAt,
    window: { state: win.state, reason: win.reason, penaltyPct: win.penaltyPct },
    extension: ext ? { status: ext.status, grantedDueAt: ext.grantedDueAt } : null,
    mine: sub ? { id: sub.id, isDraft: sub.isDraft, isLate: sub.isLate, submittedAt: sub.submittedAt, versionCount: sub.versionCount, needsRegrade: sub.needsRegrade,
      graded: sub.score !== null, score: visible ? sub.score : null, gradeWithheld: sub.score !== null && !visible, canResubmit: allow.allowed && win.state !== "CLOSED" && win.state !== "NOT_OPEN", resubmissionsLeft: allow.remaining } : null,
  };
}

assignmentsV2Router.get("/course/:courseId", requireAuth, async (req: AuthedRequest, res) => {
  const courseId = req.params.courseId;
  const asStaff = await canViewCourseAsStaff(req.user!, courseId);
  const now = new Date();
  if (asStaff) {
    const includeArchived = req.query.archived === "1";
    const list = await prisma.assignment.findMany({
      where: { courseId, ...(includeArchived ? {} : { status: { not: "ARCHIVED" } }) },
      orderBy: { dueAt: "asc" },
      include: { _count: { select: { submissions: true } } },
    });
    return res.json(list.map((a) => ({ ...a, submissionCount: a._count.submissions })));
  }
  if (!isLearnerRole(req.user!.role) || !(await isEnrolledInCourse(req.user!.id, courseId))) return res.status(404).json({ message: "Course not found." });
  const list = await prisma.assignment.findMany({
    where: { courseId, status: "PUBLISHED", OR: [{ releaseAt: null }, { releaseAt: { lte: now } }] },
    orderBy: { dueAt: "asc" },
    include: { course: { select: { id: true, title: true, unitId: true } } },
  });
  const subs = await prisma.submission.findMany({
    where: { assignmentId: { in: list.map((a) => a.id) }, studentUserId: req.user!.id },
    select: { id: true, assignmentId: true, isDraft: true, score: true, isLate: true, submittedAt: true, versionCount: true, needsRegrade: true, gradedAt: true, groupId: true },
  });
  const exts = await prisma.assignmentExtension.findMany({ where: { assignmentId: { in: list.map((a) => a.id) }, studentUserId: req.user!.id } });
  const subBy = new Map(subs.map((s) => [s.assignmentId as string, s]));
  const extBy = new Map(exts.map((e) => [e.assignmentId, e]));
  res.json(list.map((a) => studentCard(a as Asg, subBy.get(a.id) ?? null, extBy.get(a.id) ?? null, now)));
});

assignmentsV2Router.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const a = await loadAssignment(req.params.id);
  if (!a) return res.status(404).json({ message: "Assignment not found." });
  if (await canViewCourseAsStaff(req.user!, a.courseId)) return res.json(a);
  const now = new Date();
  if (!isLearnerRole(req.user!.role) || !(await isEnrolledInCourse(req.user!.id, a.courseId)) || a.status !== "PUBLISHED" || (a.releaseAt && a.releaseAt > now)) {
    return res.status(404).json({ message: "Assignment not found." });
  }
  const sub = await prisma.submission.findFirst({ where: { assignmentId: a.id, studentUserId: req.user!.id } });
  const ext = await prisma.assignmentExtension.findUnique({ where: { assignmentId_studentUserId: { assignmentId: a.id, studentUserId: req.user!.id } } });
  res.json(studentCard(a, sub, ext, now));
});

// ------------------------------------------------------------ student files
// Raw-body upload (same convention as /api/media/upload) so a phone can send a 20 MB file without multipart.
// The asset has no courseId, so it is visible to its owner only until it is attached to a submission.
assignmentsV2Router.post("/:id/files", requireAuth, async (req: AuthedRequest, res) => {
  const a = await loadAssignment(req.params.id);
  if (!a || a.status !== "PUBLISHED") return res.status(404).json({ message: "Assignment not found." });
  if (!isLearnerRole(req.user!.role) || !(await isEnrolledInCourse(req.user!.id, a.courseId))) return res.status(403).json({ message: "Only enrolled students can upload work." });
  if (!a.allowFiles) return res.status(400).json({ message: "This assignment does not accept file uploads." });

  const mime = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  let filename = "upload";
  try { filename = sanitizeFilename(decodeURIComponent(String(req.headers["x-file-name"] ?? "upload"))); } catch { return res.status(400).json({ message: "X-File-Name must be URI-encoded." }); }
  const cls = classifyUpload(mime, filename);
  if (!cls.ok) return res.status(cls.status).json({ message: cls.message });
  const problems = validateFiles([{ name: filename, sizeBytes: Number(req.headers["content-length"] ?? 0) }], rulesOf(a as Asg));
  if (problems.length) return res.status(400).json({ message: problems[0] });
  const limit = Math.min(maxBytesFor(cls.kind), a.maxFileMb * 1048576);

  const storageKey = `${randomBytes(16).toString("hex")}${cls.ext}`;
  try {
    const stored = await streamToDisk(req as unknown as Readable, storageKey, limit);
    if (stored.bytes === 0) { await removeFromDisk(storageKey); return res.status(400).json({ message: "The uploaded file is empty." }); }
    if (!magicMatches(cls.mime, stored.head)) { await removeFromDisk(storageKey); return res.status(415).json({ message: "The file's contents don't match its declared type." }); }
    const asset = await prisma.mediaAsset.create({
      data: { ownerUserId: req.user!.id, courseId: null, originalName: filename, mimeType: cls.mime, kind: cls.kind, sizeBytes: stored.bytes, storageKey, sha256: stored.sha256 },
    });
    res.status(201).json({ id: asset.id, name: asset.originalName, sizeBytes: asset.sizeBytes, kind: asset.kind, mimeType: asset.mimeType });
  } catch (err) {
    await removeFromDisk(storageKey).catch(() => undefined);
    if (err instanceof UploadTooLargeError) return res.status(413).json({ message: `That file is larger than the ${Math.round(limit / 1048576)} MB limit.` });
    console.error("assignment upload failed", err);
    res.status(500).json({ message: "The upload failed. Please try again." });
  }
});

// A short-lived link to one file — its owner, the course's staff, or (for feedback) the student it is addressed to.
assignmentsV2Router.get("/files/:assetId/url", requireAuth, async (req: AuthedRequest, res) => {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: req.params.assetId } });
  if (!asset) return res.status(404).json({ message: "File not found." });
  let allowed = asset.ownerUserId === req.user!.id || req.user!.role === "SUPER_ADMIN";
  if (!allowed) {
    const sub = await prisma.submission.findFirst({
      where: { OR: [{ fileAssetIds: { has: asset.id } }, { feedbackAssetIds: { has: asset.id } }], assignmentId: { not: null } },
      select: { assignmentId: true, studentUserId: true, fileAssetIds: true, assignment: { select: { courseId: true, holdGrades: true, gradesReleasedAt: true } } },
    });
    if (sub?.assignment) {
      if (await canViewCourseAsStaff(req.user!, sub.assignment.courseId)) allowed = true;
      else if (sub.studentUserId === req.user!.id) allowed = sub.fileAssetIds.includes(asset.id) || gradesVisible(sub.assignment);
    }
  }
  if (!allowed) return res.status(403).json({ message: "You don't have access to that file." });
  res.json({ id: asset.id, name: asset.originalName, mimeType: asset.mimeType, kind: asset.kind, sizeBytes: asset.sizeBytes, url: mediaUrl(asset.id) });
});

// ------------------------------------------------------------------ groups
async function groupOf(assignmentId: string, userId: string) {
  const m = await prisma.assignmentGroupMember.findUnique({ where: { assignmentId_studentUserId: { assignmentId, studentUserId: userId } }, include: { group: { include: { members: true } } } });
  return m?.group ?? null;
}

assignmentsV2Router.get("/:id/groups", requireAuth, async (req: AuthedRequest, res) => {
  const a = await loadAssignment(req.params.id);
  if (!a) return res.status(404).json({ message: "Assignment not found." });
  const asStaff = await canViewCourseAsStaff(req.user!, a.courseId);
  if (!asStaff && !(isLearnerRole(req.user!.role) && (await isEnrolledInCourse(req.user!.id, a.courseId)))) return res.status(404).json({ message: "Assignment not found." });
  const groups = await prisma.assignmentGroup.findMany({ where: { assignmentId: a.id }, include: { members: true }, orderBy: { createdAt: "asc" } });
  const ids = groups.flatMap((g) => g.members.map((m) => m.studentUserId));
  const people = await prisma.student.findMany({ where: { userId: { in: ids } }, select: { userId: true, fullName: true, studentNumber: true } });
  const by = new Map(people.map((p) => [p.userId, p]));
  res.json(groups.map((g) => ({ id: g.id, name: g.name, size: g.members.length, full: g.members.length >= a.maxGroupSize, mine: g.members.some((m) => m.studentUserId === req.user!.id),
    members: g.members.map((m) => ({ userId: m.studentUserId, fullName: by.get(m.studentUserId)?.fullName ?? "Student", studentNumber: by.get(m.studentUserId)?.studentNumber })) })));
});

assignmentsV2Router.post("/:id/groups", requireAuth, async (req: AuthedRequest, res) => {
  const a = await loadAssignment(req.params.id);
  if (!a || a.mode !== "GROUP") return res.status(400).json({ message: "This is not a group assignment." });
  const name = z.string().min(2).max(80).safeParse(req.body?.name);
  if (!name.success) return res.status(400).json({ message: "Give the group a name (2–80 characters)." });
  const asTeacher = await canTeachCourse(req.user!, a.courseId);
  if (!asTeacher && !(isLearnerRole(req.user!.role) && (await isEnrolledInCourse(req.user!.id, a.courseId)))) return res.status(403).json({ message: "Only enrolled students can form a group." });
  if (!asTeacher && (await groupOf(a.id, req.user!.id))) return res.status(409).json({ message: "You are already in a group for this assignment." });
  if (!asTeacher && (await prisma.submission.count({ where: { assignmentId: a.id, studentUserId: req.user!.id, isDraft: false } }))) return res.status(409).json({ message: "You have already handed this in." });
  const group = await prisma.assignmentGroup.create({ data: { assignmentId: a.id, name: name.data, createdById: req.user!.id } });
  if (!asTeacher) await prisma.assignmentGroupMember.create({ data: { groupId: group.id, assignmentId: a.id, studentUserId: req.user!.id } });
  res.status(201).json(group);
});

assignmentsV2Router.post("/groups/:gid/join", requireAuth, async (req: AuthedRequest, res) => {
  const g = await prisma.assignmentGroup.findUnique({ where: { id: req.params.gid }, include: { members: true, assignment: true } });
  if (!g) return res.status(404).json({ message: "Group not found." });
  if (!isLearnerRole(req.user!.role) || !(await isEnrolledInCourse(req.user!.id, g.assignment.courseId))) return res.status(403).json({ message: "Only enrolled students can join a group." });
  if (await groupOf(g.assignmentId, req.user!.id)) return res.status(409).json({ message: "You are already in a group for this assignment." });
  if (g.members.length >= g.assignment.maxGroupSize) return res.status(409).json({ message: "That group is full." });
  if (g.members.length && (await prisma.submission.count({ where: { assignmentId: g.assignmentId, studentUserId: { in: g.members.map((m) => m.studentUserId) }, isDraft: false } }))) {
    return res.status(409).json({ message: "That group has already handed its work in." });
  }
  await prisma.assignmentGroupMember.create({ data: { groupId: g.id, assignmentId: g.assignmentId, studentUserId: req.user!.id } });
  res.status(201).json({ joined: true });
});

assignmentsV2Router.post("/:id/groups/leave", requireAuth, async (req: AuthedRequest, res) => {
  const g = await groupOf(req.params.id, req.user!.id);
  if (!g) return res.status(404).json({ message: "You are not in a group." });
  if (await prisma.submission.count({ where: { assignmentId: req.params.id, groupId: g.id, isDraft: false } })) return res.status(409).json({ message: "Your group has already handed in; you can no longer leave." });
  await prisma.assignmentGroupMember.deleteMany({ where: { groupId: g.id, studentUserId: req.user!.id } });
  res.json({ left: true });
});

assignmentsV2Router.post("/groups/:gid/members", ...staff, async (req: AuthedRequest, res) => {
  const g = await prisma.assignmentGroup.findUnique({ where: { id: req.params.gid }, include: { assignment: true, members: true } });
  if (!g) return res.status(404).json({ message: "Group not found." });
  if (!(await canTeachCourse(req.user!, g.assignment.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  const uid = z.string().safeParse(req.body?.studentUserId);
  if (!uid.success) return res.status(400).json({ message: "studentUserId is required." });
  if (!(await isEnrolledInCourse(uid.data, g.assignment.courseId))) return res.status(400).json({ message: "That student is not enrolled in this course." });
  if (g.members.length >= g.assignment.maxGroupSize) return res.status(409).json({ message: "That group is full." });
  await prisma.assignmentGroupMember.deleteMany({ where: { assignmentId: g.assignmentId, studentUserId: uid.data } });
  await prisma.assignmentGroupMember.create({ data: { groupId: g.id, assignmentId: g.assignmentId, studentUserId: uid.data } });
  res.status(201).json({ added: true });
});

assignmentsV2Router.delete("/groups/:gid", ...staff, async (req: AuthedRequest, res) => {
  const g = await prisma.assignmentGroup.findUnique({ where: { id: req.params.gid }, include: { assignment: true } });
  if (!g) return res.status(404).json({ message: "Group not found." });
  if (!(await canTeachCourse(req.user!, g.assignment.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  if (await prisma.submission.count({ where: { assignmentId: g.assignmentId, groupId: g.id } })) return res.status(409).json({ message: "This group has submitted work and can't be deleted." });
  await prisma.assignmentGroup.delete({ where: { id: g.id } });
  res.json({ deleted: true });
});

// ------------------------------------------------------- hand-in (student)
const handInSchema = z.object({
  textAnswer: z.string().max(100_000).nullable().optional(),
  fileAssetIds: z.array(z.string()).max(20).optional(),
  aiAssisted: z.boolean().optional(),
  note: z.string().max(500).optional(),
});

/** The rows a hand-in writes to: just me, or every member of my group. */
async function targetsFor(a: Asg, userId: string): Promise<{ userIds: string[]; groupId: string | null; error?: string }> {
  if (a.mode !== "GROUP") return { userIds: [userId], groupId: null };
  const g = await groupOf(a.id, userId);
  if (!g) return { userIds: [], groupId: null, error: "This is a group assignment — join or create a group first." };
  return { userIds: g.members.map((m) => m.studentUserId), groupId: g.id };
}

export type HandInResult = { status: number; body: Record<string, unknown> };

/** Shared by the new endpoints and the older POST /content/assignments/submit. */
export async function handInAssignment(user: { id: string; role: string }, assignmentId: string, input: z.infer<typeof handInSchema>, isDraft: boolean): Promise<HandInResult> {
  const a = await loadAssignment(assignmentId);
  const now = new Date();
  if (!a || a.status === "DRAFT" || (a.releaseAt && a.releaseAt > now)) return { status: 404, body: { message: "Assignment not found." } };
  if (!isLearnerRole(user.role) || !(await isEnrolledInCourse(user.id, a.courseId))) return { status: 403, body: { message: "Only students enrolled in this course can hand work in." } };

  const ext = await prisma.assignmentExtension.findUnique({ where: { assignmentId_studentUserId: { assignmentId: a.id, studentUserId: user.id } } });
  const win = submissionWindow(rulesOf(a), now, ext?.status === "APPROVED" ? ext.grantedDueAt : null);
  if (win.state === "NOT_OPEN" || win.state === "CLOSED") return { status: 403, body: { message: win.reason, window: win.state } };

  const t = await targetsFor(a, user.id);
  if (t.error) return { status: 400, body: { message: t.error } };

  const fileIds = [...new Set(input.fileAssetIds ?? [])];
  const assets = fileIds.length ? await prisma.mediaAsset.findMany({ where: { id: { in: fileIds } } }) : [];
  if (assets.length !== fileIds.length) return { status: 400, body: { message: "One of the attached files no longer exists — upload it again." } };
  if (assets.some((x) => !t.userIds.includes(x.ownerUserId))) return { status: 400, body: { message: "You can only attach files that you (or your group) uploaded for this work." } };
  const fileProblems = validateFiles(assets.map((x) => ({ name: x.originalName, sizeBytes: x.sizeBytes })), rulesOf(a));
  const contentProblems = validateContent(input.textAnswer, assets.length, rulesOf(a), isDraft);
  if (fileProblems.length || contentProblems.length) return { status: 400, body: { message: [...contentProblems, ...fileProblems][0], problems: [...contentProblems, ...fileProblems] } };

  const existing = await prisma.submission.findMany({ where: { assignmentId: a.id, studentUserId: { in: t.userIds } } });
  const mine = existing.find((s) => s.studentUserId === user.id);
  const finalised = existing.find((s) => !s.isDraft);
  if (!isDraft && finalised) {
    const allow = resubmitAllowance(a.maxResubmissions, finalised.versionCount);
    if (!allow.allowed) return { status: 409, body: { message: a.maxResubmissions === 0 ? "You've already handed this assignment in and resubmission isn't allowed." : "You've used all your resubmissions for this assignment." } };
  }
  if (isDraft && finalised) return { status: 409, body: { message: "Already handed in — use resubmit instead of saving a draft." } };

  const textForSim = (input.textAnswer ?? "").trim();
  const first = finalised ?? null;
  const flags = first
    ? { isLate: first.isLate, lateMinutes: first.lateMinutes, latePenaltyPct: first.latePenaltyPct }
    : { isLate: !isDraft && win.state === "LATE", lateMinutes: !isDraft && win.state === "LATE" ? win.lateMinutes : null, latePenaltyPct: !isDraft && win.state === "LATE" ? win.penaltyPct : null };

  let versionNo = 1;
  const written: { userId: string; id: string; versionNo: number }[] = [];
  for (const uid of t.userIds) {
    const row = existing.find((s) => s.studentUserId === uid);
    const wasHandedIn = !!row && !row.isDraft;
    versionNo = isDraft ? 1 : wasHandedIn ? (row as typeof existing[number]).versionCount + 1 : 1;
    const data = {
      textAnswer: input.textAnswer ?? null, fileAssetIds: fileIds, fileUrl: null as string | null, aiAssisted: input.aiAssisted ?? false, groupId: t.groupId,
      isDraft, submittedAt: now, ...(isDraft ? {} : { ...flags, versionCount: versionNo }),
      ...(wasHandedIn && !isDraft ? { resubmittedAt: now, needsRegrade: row!.score !== null } : {}),
    };
    let id: string;
    if (row) id = (await prisma.submission.update({ where: { id: row.id }, data })).id;
    else id = (await prisma.submission.create({ data: { ...data, assignmentId: a.id, studentUserId: uid } })).id;
    if (!isDraft) {
      // Work handed in before versioning existed has no snapshot yet — keep its content as the earlier version.
      if (wasHandedIn && row) {
        await prisma.submissionVersion.upsert({
          where: { submissionId_versionNo: { submissionId: row.id, versionNo: row.versionCount } },
          update: {},
          create: { submissionId: row.id, versionNo: row.versionCount, textAnswer: row.textAnswer, fileAssetIds: row.fileAssetIds, isLate: row.isLate, submittedAt: row.submittedAt },
        });
      }
      await prisma.submissionVersion.upsert({
        where: { submissionId_versionNo: { submissionId: id, versionNo } },
        update: {},
        create: { submissionId: id, versionNo, textAnswer: input.textAnswer ?? null, fileAssetIds: fileIds, isLate: win.state === "LATE", note: input.note ?? null },
      });
    }
    written.push({ userId: uid, id, versionNo });
  }

  const mineRow = written.find((w) => w.userId === user.id) as { id: string; versionNo: number };
  if (isDraft) return { status: 200, body: { saved: true, submissionId: mineRow.id, savedAt: now } };

  let similarity: { score: number; note: string } | null = null;
  if (a.checkSimilarity && textForSim.length > 40) similarity = await runSimilarity(a.id, mineRow.id, textForSim, t.userIds);
  const receipt = receiptText(a.title, now, mineRow.versionNo, assets.length, win.state === "LATE", a.confirmationNote);
  await tell(t.userIds, `Submission received: ${a.title} (v${mineRow.versionNo})`.slice(0, 120), receipt, 1);
  if (win.state === "LATE") await audit(user.id, "ASSIGNMENT_LATE_SUBMISSION", a.id, { submissionId: mineRow.id, lateMinutes: win.lateMinutes, penaltyPct: win.penaltyPct });
  return {
    status: 201,
    body: { submissionId: mineRow.id, versionNo: mineRow.versionNo, receipt, late: win.state === "LATE", penaltyPct: win.penaltyPct, groupMembers: t.userIds.length, ...(similarity ? { similarityChecked: true } : {}) },
  };
}

assignmentsV2Router.put("/:id/draft", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = handInSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid draft." });
  const r = await handInAssignment(req.user!, req.params.id, parsed.data, true);
  res.status(r.status).json(r.body);
});

assignmentsV2Router.post("/:id/submit", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = handInSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid submission." });
  const r = await handInAssignment(req.user!, req.params.id, parsed.data, false);
  res.status(r.status).json(r.body);
});

assignmentsV2Router.get("/:id/mine", requireAuth, async (req: AuthedRequest, res) => {
  const a = await loadAssignment(req.params.id);
  if (!a) return res.status(404).json({ message: "Assignment not found." });
  const sub = await prisma.submission.findFirst({ where: { assignmentId: a.id, studentUserId: req.user!.id }, include: { versions: { orderBy: { versionNo: "desc" } } } });
  if (!sub) return res.json(null);
  const visible = gradesVisible(a);
  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: [...sub.fileAssetIds, ...(visible ? sub.feedbackAssetIds : [])] } }, select: { id: true, originalName: true, sizeBytes: true, kind: true } });
  const nameOf = new Map(assets.map((x) => [x.id, x]));
  const filesOf = (ids: string[]) => ids.map((id) => nameOf.get(id)).filter(Boolean);
  res.json({
    id: sub.id, isDraft: sub.isDraft, textAnswer: sub.textAnswer, files: filesOf(sub.fileAssetIds), submittedAt: sub.submittedAt, isLate: sub.isLate, lateMinutes: sub.lateMinutes,
    versionCount: sub.versionCount, needsRegrade: sub.needsRegrade, groupId: sub.groupId, aiAssisted: sub.aiAssisted,
    versions: sub.versions.map((v) => ({ versionNo: v.versionNo, submittedAt: v.submittedAt, isLate: v.isLate, note: v.note, textAnswer: v.textAnswer, files: filesOf(v.fileAssetIds), fileCount: v.fileAssetIds.length })),
    graded: sub.score !== null, gradeWithheld: sub.score !== null && !visible,
    ...(visible && sub.score !== null
      ? { score: sub.score, totalMarks: a.totalMarks, rawScore: sub.rawScore, latePenaltyPct: sub.latePenaltyPct, feedback: sub.feedback, criteriaScores: sub.criteriaScores, competencyResult: sub.competencyResult, annotations: sub.annotations, feedbackFiles: filesOf(sub.feedbackAssetIds), gradedAt: sub.gradedAt }
      : {}),
  });
});

// ------------------------------------------------------------- extensions
assignmentsV2Router.post("/:id/extension-request", requireAuth, async (req: AuthedRequest, res) => {
  const a = await loadAssignment(req.params.id);
  if (!a || a.status !== "PUBLISHED") return res.status(404).json({ message: "Assignment not found." });
  if (!isLearnerRole(req.user!.role) || !(await isEnrolledInCourse(req.user!.id, a.courseId))) return res.status(403).json({ message: "Only enrolled students can ask for an extension." });
  const p = z.object({ requestedDueAt: z.string().datetime(), reason: z.string().min(10).max(1000) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Give a new date and a reason of at least 10 characters." });
  const asked = new Date(p.data.requestedDueAt);
  if (asked <= a.dueAt) return res.status(400).json({ message: "The requested date must be after the current deadline." });
  if (asked.getTime() - a.dueAt.getTime() > 60 * 86_400_000) return res.status(400).json({ message: "Extensions longer than 60 days need to go through the registry." });
  if (await prisma.submission.count({ where: { assignmentId: a.id, studentUserId: req.user!.id, isDraft: false } })) return res.status(409).json({ message: "You have already handed this in." });
  const prev = await prisma.assignmentExtension.findUnique({ where: { assignmentId_studentUserId: { assignmentId: a.id, studentUserId: req.user!.id } } });
  if (prev && prev.status !== "REQUESTED") return res.status(409).json({ message: `Your earlier request was ${prev.status.toLowerCase()}; ask your trainer directly for a new decision.` });
  const row = await prisma.assignmentExtension.upsert({
    where: { assignmentId_studentUserId: { assignmentId: a.id, studentUserId: req.user!.id } },
    update: { requestedDueAt: asked, reason: p.data.reason },
    create: { assignmentId: a.id, studentUserId: req.user!.id, requestedDueAt: asked, reason: p.data.reason },
  });
  const trainer = a.course && (await prisma.course.findUnique({ where: { id: a.courseId }, select: { trainer: { select: { userId: true } } } }));
  if (trainer?.trainer?.userId) await tell([trainer.trainer.userId], `Extension request: ${a.title}`, `A student asked to move the deadline to ${asked.toISOString().slice(0, 10)}. Open the assignment to decide.`, 1);
  res.status(201).json(row);
});

assignmentsV2Router.get("/:id/extensions", ...staff, async (req: AuthedRequest, res) => {
  const a = await ownedAssignment(req, res, req.params.id);
  if (!a) return;
  const rows = await prisma.assignmentExtension.findMany({ where: { assignmentId: a.id }, orderBy: { createdAt: "desc" } });
  const people = await prisma.student.findMany({ where: { userId: { in: rows.map((r) => r.studentUserId) } }, select: { userId: true, fullName: true, studentNumber: true } });
  const by = new Map(people.map((p) => [p.userId, p]));
  res.json(rows.map((r) => ({ ...r, fullName: by.get(r.studentUserId)?.fullName, studentNumber: by.get(r.studentUserId)?.studentNumber })));
});

assignmentsV2Router.patch("/extensions/:eid", ...staff, async (req: AuthedRequest, res) => {
  const e = await prisma.assignmentExtension.findUnique({ where: { id: req.params.eid }, include: { assignment: true } });
  if (!e) return res.status(404).json({ message: "Request not found." });
  if (!(await canTeachCourse(req.user!, e.assignment.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  const p = z.object({ decision: z.enum(["APPROVED", "DENIED"]), grantedDueAt: z.string().datetime().optional(), note: z.string().max(500).optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Choose APPROVED or DENIED." });
  const granted = p.data.decision === "APPROVED" ? new Date(p.data.grantedDueAt ?? e.requestedDueAt.toISOString()) : null;
  if (granted && granted <= e.assignment.dueAt) return res.status(400).json({ message: "The granted date must be after the current deadline." });
  const u = await prisma.assignmentExtension.update({ where: { id: e.id }, data: { status: p.data.decision, grantedDueAt: granted, decidedById: req.user!.id, decidedAt: new Date(), decisionNote: p.data.note ?? null } });
  await audit(req.user!.id, `ASSIGNMENT_EXTENSION_${p.data.decision}`, e.assignmentId, { studentUserId: e.studentUserId, grantedDueAt: granted });
  await tell([e.studentUserId], `Extension ${p.data.decision.toLowerCase()}: ${e.assignment.title}`, granted ? `New deadline: ${granted.toISOString().slice(0, 16).replace("T", " ")} UTC.` : p.data.note ?? "Your request was not approved.", 1);
  res.json(u);
});

assignmentsV2Router.post("/:id/extensions/grant", ...staff, async (req: AuthedRequest, res) => {
  const a = await ownedAssignment(req, res, req.params.id);
  if (!a) return;
  const p = z.object({ studentUserId: z.string(), grantedDueAt: z.string().datetime(), note: z.string().max(500).optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Provide a student and a new deadline." });
  const when = new Date(p.data.grantedDueAt);
  if (when <= a.dueAt) return res.status(400).json({ message: "The new deadline must be after the current one." });
  if (!(await isEnrolledInCourse(p.data.studentUserId, a.courseId))) return res.status(400).json({ message: "That student is not enrolled in this course." });
  const row = await prisma.assignmentExtension.upsert({
    where: { assignmentId_studentUserId: { assignmentId: a.id, studentUserId: p.data.studentUserId } },
    update: { status: "APPROVED", grantedDueAt: when, decidedById: req.user!.id, decidedAt: new Date(), decisionNote: p.data.note ?? null },
    create: { assignmentId: a.id, studentUserId: p.data.studentUserId, requestedDueAt: when, reason: p.data.note ?? "Granted by trainer", status: "APPROVED", grantedDueAt: when, decidedById: req.user!.id, decidedAt: new Date() },
  });
  await audit(req.user!.id, "ASSIGNMENT_EXTENSION_GRANTED", a.id, { studentUserId: p.data.studentUserId, grantedDueAt: when });
  await tell([p.data.studentUserId], `Extension granted: ${a.title}`, `New deadline: ${when.toISOString().slice(0, 16).replace("T", " ")} UTC.`, 1);
  res.status(201).json(row);
});

// -------------------------------------------------- marking (trainer side)
assignmentsV2Router.get("/:id/submissions", ...staff, async (req: AuthedRequest, res) => {
  const a = await ownedAssignment(req, res, req.params.id);
  if (!a) return;
  const [students, subs] = await Promise.all([
    enrolled(a.courseId, a.course.unitId),
    prisma.submission.findMany({ where: { assignmentId: a.id }, orderBy: { submittedAt: "asc" } }),
  ]);
  const bySt = new Map(subs.map((s) => [s.studentUserId, s]));
  const exts = await prisma.assignmentExtension.findMany({ where: { assignmentId: a.id } });
  const extBy = new Map(exts.map((e) => [e.studentUserId, e]));
  const now = new Date();
  const rows = students.map((st) => {
    const s = bySt.get(st.userId);
    const e = extBy.get(st.userId);
    const status = !s ? (a.dueAt < now && !(e?.status === "APPROVED" && e.grantedDueAt && e.grantedDueAt > now) ? "MISSING" : "NOT_STARTED")
      : s.isDraft ? "DRAFT" : s.needsRegrade ? "RESUBMITTED" : s.score !== null ? "GRADED" : "AWAITING_GRADING";
    return {
      studentUserId: st.userId, fullName: st.fullName, studentNumber: st.studentNumber, intake: st.intake, status,
      submissionId: s?.id ?? null, submittedAt: s && !s.isDraft ? s.submittedAt : null, isLate: s?.isLate ?? false, lateMinutes: s?.lateMinutes ?? null, versionCount: s?.versionCount ?? 0,
      fileCount: s?.fileAssetIds.length ?? 0, score: s?.score ?? null, rawScore: s?.rawScore ?? null, latePenaltyPct: s?.latePenaltyPct ?? null, competencyResult: s?.competencyResult ?? null,
      groupId: s?.groupId ?? null, similarityScore: s?.similarityScore ?? null, aiAssisted: s?.aiAssisted ?? false, extensionStatus: e?.status ?? null,
    };
  });
  const filter = typeof req.query.status === "string" ? req.query.status : "";
  res.json({
    assignment: { id: a.id, title: a.title, totalMarks: a.totalMarks, dueAt: a.dueAt, mode: a.mode, status: a.status, holdGrades: a.holdGrades, gradesReleasedAt: a.gradesReleasedAt, competencyBased: a.competencyBased, rubricCriteria: a.rubricCriteria, lateMode: a.lateMode, requireModeration: a.requireModeration },
    counts: rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {}),
    rows: filter ? rows.filter((r) => r.status === filter) : rows,
  });
});

async function loadSubmission(req: AuthedRequest, res: Res, sid: string, roles: "teach" | "moderate" = "teach") {
  const sub = await prisma.submission.findUnique({ where: { id: sid }, include: { versions: { orderBy: { versionNo: "asc" } }, assignment: { include: { course: { select: { id: true, title: true, unitId: true } } } } } });
  if (!sub || !sub.assignment) { res.status(404).json({ message: "Submission not found." }); return null; }
  const ok = roles === "moderate" ? await canViewCourseAsStaff(req.user!, sub.assignment.courseId) : await canTeachCourse(req.user!, sub.assignment.courseId);
  if (!ok) { res.status(403).json({ message: "You don't have access to this submission." }); return null; }
  return sub as typeof sub & { assignment: NonNullable<typeof sub.assignment> };
}

assignmentsV2Router.get("/submissions/:sid", ...moderators, async (req: AuthedRequest, res) => {
  const sub = await loadSubmission(req, res, req.params.sid, "moderate");
  if (!sub) return;
  const ids = [...sub.fileAssetIds, ...sub.feedbackAssetIds, ...sub.versions.flatMap((v) => v.fileAssetIds)];
  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: ids } }, select: { id: true, originalName: true, sizeBytes: true, kind: true, mimeType: true } });
  const by = new Map(assets.map((x) => [x.id, x]));
  const files = (l: string[]) => l.map((i) => by.get(i)).filter(Boolean);
  const st = await prisma.student.findUnique({ where: { userId: sub.studentUserId }, select: { fullName: true, studentNumber: true } });
  const marks = await prisma.submissionMark.findMany({ where: { submissionId: sub.id }, orderBy: { markerNumber: "asc" } });
  const members = sub.groupId ? await prisma.assignmentGroupMember.findMany({ where: { groupId: sub.groupId } }) : [];
  const versions = sub.versions.map((v, i) => ({ versionNo: v.versionNo, submittedAt: v.submittedAt, isLate: v.isLate, note: v.note, textAnswer: v.textAnswer, files: files(v.fileAssetIds),
    change: i > 0 ? textChange(sub.versions[i - 1].textAnswer ?? "", v.textAnswer ?? "") : null }));
  res.json({
    id: sub.id, assignmentId: sub.assignmentId, student: st, groupMemberCount: members.length, isDraft: sub.isDraft, textAnswer: sub.textAnswer, files: files(sub.fileAssetIds), submittedAt: sub.submittedAt, isLate: sub.isLate,
    lateMinutes: sub.lateMinutes, latePenaltyPct: sub.latePenaltyPct, rawScore: sub.rawScore, score: sub.score, feedback: sub.feedback, criteriaScores: sub.criteriaScores, competencyResult: sub.competencyResult,
    annotations: sub.annotations, feedbackFiles: files(sub.feedbackAssetIds), versions, needsRegrade: sub.needsRegrade, similarityScore: sub.similarityScore, similarityNote: sub.similarityNote, aiAssisted: sub.aiAssisted,
    marks: marks.map((m) => ({ markerNumber: m.markerNumber, markerId: m.markerId, score: m.score, feedback: m.feedback, createdAt: m.createdAt })),
  });
});

const submissionAnnotationSchema = z.array(z.union([
  z.object({ start: z.number().int().min(0), end: z.number().int().positive(), comment: z.string().trim().min(1).max(1000) }),
  z.object({ assetId: z.string().min(1), page: z.number().int().min(1).max(1000), comment: z.string().trim().min(1).max(1000) }),
])).max(100);

const gradeSchema = z.object({
  score: z.number().min(0).optional(),
  criteria: z.array(z.object({ name: z.string(), score: z.number() })).optional(),
  competencyResult: z.enum(["COMPETENT", "NOT_YET_COMPETENT"]).optional(),
  feedback: z.string().max(10_000).optional(),
  annotations: submissionAnnotationSchema.optional(),
  feedbackAssetIds: z.array(z.string()).max(10).optional(),
  waiveLatePenalty: z.boolean().optional(),
});

async function validateSubmissionAnnotations(text: string, submissionFileIds: string[], raw: unknown) {
  if (!Array.isArray(raw)) return { ok: false as const, message: "Annotations must be a list." };
  const typed = raw.filter((a): a is { start: number; end: number; comment: string } => !!a && typeof a === "object" && "start" in a && "end" in a);
  const docs = raw.filter((a): a is { assetId: string; page: number; comment: string } => !!a && typeof a === "object" && "assetId" in a && "page" in a);
  const cleanText = cleanAnnotations(text, typed);
  if (!cleanText.ok) return cleanText;
  const assets = docs.length ? await prisma.mediaAsset.findMany({ where: { id: { in: [...new Set(docs.map((a) => a.assetId))] }, mimeType: "application/pdf" }, select: { id: true } }) : [];
  if (assets.length !== new Set(docs.map((a) => a.assetId)).size || docs.some((a) => !submissionFileIds.includes(a.assetId))) return { ok: false as const, message: "PDF page notes must point to a PDF included in this submission." };
  return { ok: true as const, annotations: [...cleanText.annotations, ...docs.map((a) => ({ assetId: a.assetId, page: a.page, comment: a.comment.trim().slice(0, 1000) }))] };
}

assignmentsV2Router.put("/submissions/:sid/grade", ...staff, async (req: AuthedRequest, res) => {
  const sub = await loadSubmission(req, res, req.params.sid);
  if (!sub) return;
  const a = sub.assignment;
  if (sub.isDraft) return res.status(409).json({ message: "This is an unsubmitted draft — there is nothing to grade yet." });
  const p = gradeSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid grade." });
  const d = p.data;

  let raw: number;
  let criteriaScores: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
  let competencyResult: string | null = null;
  if (a.competencyBased) {
    if (!d.competencyResult) return res.status(400).json({ message: "Choose Competent or Not yet competent." });
    competencyResult = d.competencyResult;
    raw = competencyScore(d.competencyResult, a.totalMarks) as number;
  } else if (a.rubricCriteria && d.criteria) {
    const r = scoreRubric(a.rubricCriteria as unknown as Criterion[], d.criteria);
    if (r.errors.length) return res.status(400).json({ message: r.errors[0], problems: r.errors });
    raw = r.total;
    criteriaScores = r.rows;
  } else if (d.score !== undefined) {
    if (a.rubricCriteria) return res.status(400).json({ message: "This assignment is marked against a rubric — score each criterion." });
    if (d.score > a.totalMarks) return res.status(400).json({ message: `The score can't be more than ${a.totalMarks}.` });
    raw = r2(d.score);
  } else {
    return res.status(400).json({ message: a.rubricCriteria ? "Score every rubric criterion." : "Enter a score." });
  }

  const penaltyPct = a.lateMode === "PENALTY" && sub.isLate && !d.waiveLatePenalty ? sub.latePenaltyPct ?? 0 : 0;
  const finalScore = a.competencyBased ? raw : applyPenalty(raw, penaltyPct);

  let annotations: Prisma.InputJsonValue | undefined;
  if (d.annotations) {
    const c = await validateSubmissionAnnotations(sub.textAnswer ?? "", sub.fileAssetIds, d.annotations);
    if (!c.ok) return res.status(400).json({ message: c.message });
    annotations = c.annotations as unknown as Prisma.InputJsonValue;
  }
  if (d.feedbackAssetIds?.length) {
    const found = await prisma.mediaAsset.findMany({ where: { id: { in: d.feedbackAssetIds } }, select: { id: true, ownerUserId: true } });
    if (found.length !== d.feedbackAssetIds.length) return res.status(400).json({ message: "A feedback file no longer exists — upload it again." });
    if (req.user!.role !== "SUPER_ADMIN" && found.some((f) => f.ownerUserId !== req.user!.id)) return res.status(400).json({ message: "You can only attach feedback files you uploaded yourself." });
  }

  const siblings = sub.groupId ? await prisma.submission.findMany({ where: { assignmentId: a.id, groupId: sub.groupId }, select: { id: true, studentUserId: true } }) : [{ id: sub.id, studentUserId: sub.studentUserId }];
  const now = new Date();
  await prisma.$transaction([
    prisma.submission.updateMany({
      where: { id: { in: siblings.map((s) => s.id) } },
      data: {
        score: finalScore, rawScore: raw, latePenaltyPct: penaltyPct || null, feedback: d.feedback ?? sub.feedback, criteriaScores: criteriaScores as Prisma.InputJsonValue, competencyResult,
        gradedById: req.user!.id, gradedAt: now, needsRegrade: false, ...(annotations !== undefined ? { annotations } : {}), ...(d.feedbackAssetIds ? { feedbackAssetIds: d.feedbackAssetIds } : {}),
      },
    }),
    prisma.submissionMark.upsert({
      where: { submissionId_markerNumber: { submissionId: sub.id, markerNumber: 1 } },
      update: { markerId: req.user!.id, score: finalScore, feedback: d.feedback ?? null },
      create: { submissionId: sub.id, markerId: req.user!.id, markerNumber: 1, score: finalScore, feedback: d.feedback ?? null },
    }),
  ]);
  await audit(req.user!.id, "ASSIGNMENT_GRADED", a.id, { submissionId: sub.id, before: sub.score, raw, penaltyPct, after: finalScore, group: siblings.length > 1 });
  if (gradesVisible(a)) await tell(siblings.map((s) => s.studentUserId), `Assignment graded: ${a.title}`, `Your result for "${a.title}" is available.`, 1);
  res.json({ submissionId: sub.id, score: finalScore, rawScore: raw, latePenaltyPct: penaltyPct, gradedStudents: siblings.length, visibleToStudent: gradesVisible(a) });
});

assignmentsV2Router.put("/submissions/:sid/annotations", ...staff, async (req: AuthedRequest, res) => {
  const sub = await loadSubmission(req, res, req.params.sid);
  if (!sub) return;
  const parsed = z.object({ annotations: submissionAnnotationSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide up to 100 valid text or PDF page notes." });
  const c = await validateSubmissionAnnotations(sub.textAnswer ?? "", sub.fileAssetIds, parsed.data.annotations);
  if (!c.ok) return res.status(400).json({ message: c.message });
  const ids = sub.groupId ? (await prisma.submission.findMany({ where: { assignmentId: sub.assignmentId as string, groupId: sub.groupId }, select: { id: true } })).map((s) => s.id) : [sub.id];
  await prisma.submission.updateMany({ where: { id: { in: ids } }, data: { annotations: c.annotations as unknown as Prisma.InputJsonValue } });
  res.json({ saved: c.annotations.length });
});

assignmentsV2Router.post("/submissions/:sid/request-resubmission", ...staff, async (req: AuthedRequest, res) => {
  const sub = await loadSubmission(req, res, req.params.sid);
  if (!sub) return;
  const a = sub.assignment;
  const p = z.object({ extraAttempts: z.number().int().min(1).max(3).default(1), note: z.string().max(500).optional() }).safeParse(req.body ?? {});
  if (!p.success) return res.status(400).json({ message: "Invalid request." });
  if (sub.isDraft) return res.status(409).json({ message: "Nothing has been handed in yet." });
  const allow = resubmitAllowance(a.maxResubmissions, sub.versionCount);
  if (!allow.allowed) await prisma.assignment.update({ where: { id: a.id }, data: { maxResubmissions: Math.min(10, sub.versionCount - 1 + p.data.extraAttempts) } });
  await audit(req.user!.id, "ASSIGNMENT_RESUBMISSION_INVITED", a.id, { submissionId: sub.id, note: p.data.note });
  await tell([sub.studentUserId], `Resubmit invited: ${a.title}`, p.data.note ?? "Your trainer has invited you to resubmit this work.", 1);
  res.json({ invited: true, note: "The resubmission allowance is set per assignment, so it applies to everyone on it." });
});

// -------------------------------------------------------------- moderation
assignmentsV2Router.get("/:id/moderation", ...moderators, async (req: AuthedRequest, res) => {
  const a = await loadAssignment(req.params.id);
  if (!a) return res.status(404).json({ message: "Assignment not found." });
  if (!(await canViewCourseAsStaff(req.user!, a.courseId))) return res.status(403).json({ message: "You don't have access to this assignment." });
  const graded = await prisma.submission.findMany({ where: { assignmentId: a.id, score: { not: null }, isDraft: false }, select: { id: true, studentUserId: true, groupId: true, score: true, gradedById: true } });
  const reps = [...new Map(graded.map((g) => [g.groupId ?? g.id, g])).values()];
  const sample = a.requireModeration ? moderationSample(reps.map((r) => r.id), a.moderationSamplePct || 0, a.id) : [];
  const marks = await prisma.submissionMark.findMany({ where: { submissionId: { in: sample }, markerNumber: 2 } });
  const done = new Set(marks.map((m) => m.submissionId));
  res.json({ required: a.requireModeration, samplePercent: a.moderationSamplePct, gradedWork: reps.length, sampleSize: sample.length, moderated: sample.filter((s) => done.has(s)).length,
    sample: sample.map((id) => { const g = reps.find((r) => r.id === id)!; return { submissionId: id, firstMark: g.score, gradedById: g.gradedById, moderated: done.has(id), moderatorScore: marks.find((m) => m.submissionId === id)?.score ?? null }; }) });
});

assignmentsV2Router.post("/submissions/:sid/moderate", ...moderators, async (req: AuthedRequest, res) => {
  const sub = await loadSubmission(req, res, req.params.sid, "moderate");
  if (!sub) return;
  if (sub.score === null) return res.status(409).json({ message: "This work hasn't been marked yet." });
  const p = z.object({ score: z.number().min(0), feedback: z.string().max(2000).optional(), adopt: z.boolean().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Provide the moderator's score." });
  if (p.data.score > sub.assignment.totalMarks) return res.status(400).json({ message: `The score can't be more than ${sub.assignment.totalMarks}.` });
  if (sub.gradedById === req.user!.id && req.user!.role !== "SUPER_ADMIN") return res.status(403).json({ message: "A moderator must be someone other than the first marker." });
  await prisma.submissionMark.upsert({
    where: { submissionId_markerNumber: { submissionId: sub.id, markerNumber: 2 } },
    update: { markerId: req.user!.id, score: p.data.score, feedback: p.data.feedback ?? null },
    create: { submissionId: sub.id, markerId: req.user!.id, markerNumber: 2, score: p.data.score, feedback: p.data.feedback ?? null },
  });
  let adopted = false;
  if (p.data.adopt && p.data.score !== sub.score) {
    const ids = sub.groupId ? (await prisma.submission.findMany({ where: { assignmentId: sub.assignmentId as string, groupId: sub.groupId }, select: { id: true } })).map((s) => s.id) : [sub.id];
    await prisma.submission.updateMany({ where: { id: { in: ids } }, data: { score: p.data.score } });
    adopted = true;
  }
  await audit(req.user!.id, "ASSIGNMENT_MODERATED", sub.assignment.id, { submissionId: sub.id, firstMark: sub.score, moderatorScore: p.data.score, adopted });
  res.json({ moderated: true, firstMark: sub.score, moderatorScore: p.data.score, difference: r2(p.data.score - sub.score), adopted });
});

// ----------------------------------------------------------- grade release
assignmentsV2Router.post("/:id/release-grades", ...staff, async (req: AuthedRequest, res) => {
  const a = await ownedAssignment(req, res, req.params.id);
  if (!a) return;
  if (a.requireModeration && !req.body?.force) {
    const graded = await prisma.submission.findMany({ where: { assignmentId: a.id, score: { not: null }, isDraft: false }, select: { id: true, groupId: true } });
    const reps = [...new Map(graded.map((g) => [g.groupId ?? g.id, g.id])).values()];
    const sample = moderationSample(reps, a.moderationSamplePct, a.id);
    const done = await prisma.submissionMark.count({ where: { submissionId: { in: sample }, markerNumber: 2 } });
    if (done < sample.length) return res.status(409).json({ message: `${sample.length - done} sampled script(s) still need moderation before grades are released.` });
  }
  const u = await prisma.assignment.update({ where: { id: a.id }, data: { holdGrades: true, gradesReleasedAt: new Date() } });
  const who = await prisma.submission.findMany({ where: { assignmentId: a.id, score: { not: null } }, select: { studentUserId: true } });
  await tell(who.map((w) => w.studentUserId), `Results released: ${a.title}`, `Your result for "${a.title}" is now available.`, 1);
  await audit(req.user!.id, "ASSIGNMENT_GRADES_RELEASED", a.id, { students: who.length });
  res.json({ released: true, notified: who.length, assignment: u });
});

assignmentsV2Router.post("/:id/withhold-grades", ...staff, async (req: AuthedRequest, res) => {
  const a = await ownedAssignment(req, res, req.params.id);
  if (!a) return;
  const u = await prisma.assignment.update({ where: { id: a.id }, data: { holdGrades: true, gradesReleasedAt: null } });
  await audit(req.user!.id, "ASSIGNMENT_GRADES_WITHHELD", a.id, {});
  res.json(u);
});

// --------------------------------------------------------------- reports
assignmentsV2Router.get("/:id/analytics", requireAuth, async (req: AuthedRequest, res) => {
  const a = await loadAssignment(req.params.id);
  if (!a) return res.status(404).json({ message: "Assignment not found." });
  if (!(await canViewCourseAsStaff(req.user!, a.courseId))) return res.status(403).json({ message: "You don't have access to this assignment." });
  const [students, subs] = await Promise.all([enrolled(a.courseId, a.course.unitId), prisma.submission.findMany({ where: { assignmentId: a.id }, select: { studentUserId: true, score: true, isLate: true, isDraft: true, submittedAt: true, gradedAt: true, needsRegrade: true } })]);
  const out = assignmentAnalytics(a.totalMarks, subs, students.length);
  const hand = subs.filter((s) => !s.isDraft && s.gradedAt);
  const turnaround = hand.length ? r2(hand.reduce((s, x) => s + ((x.gradedAt as Date).getTime() - x.submittedAt.getTime()) / 86_400_000, 0) / hand.length) : null;
  res.json({ ...out, averageDaysToMark: turnaround });
});

assignmentsV2Router.get("/:id/similarity", ...staff, async (req: AuthedRequest, res) => {
  const a = await ownedAssignment(req, res, req.params.id);
  if (!a) return;
  const rows = await prisma.submission.findMany({ where: { assignmentId: a.id, isDraft: false, similarityScore: { not: null } }, orderBy: { similarityScore: "desc" }, select: { id: true, studentUserId: true, similarityScore: true, similarityNote: true } });
  res.json({ enabled: a.checkSimilarity, method: "word overlap (Jaccard + 3-word shingles) against classmates' typed answers — not paraphrase detection", flagged: rows.filter((r) => (r.similarityScore ?? 0) >= 70).length, rows });
});

async function runSimilarity(assignmentId: string, submissionId: string, text: string, mine: string[]) {
  const others = await prisma.submission.findMany({ where: { assignmentId, isDraft: false, studentUserId: { notIn: mine }, textAnswer: { not: null } }, select: { id: true, textAnswer: true }, take: 500 });
  let best = 0, bestId = "";
  for (const o of others) {
    const s = Math.max(jaccardSimilarity(text, o.textAnswer ?? ""), shingleSimilarity(text, o.textAnswer ?? ""));
    if (s > best) { best = s; bestId = o.id; }
  }
  const score = r2(best);
  const note = bestId ? `Highest overlap ${score}% with another submission.` : "No other typed submissions to compare with.";
  await prisma.submission.updateMany({ where: { id: submissionId }, data: { similarityScore: score, similarityNote: note, ...(score >= 70 ? { integrityFlag: true } : {}) } });
  return { score, note };
}

// ASG025 — every typed answer and uploaded file for an assignment, in one ZIP, named by student number.
const ZIP_CAP_BYTES = 300 * 1048576;
assignmentsV2Router.get("/:id/download.zip", ...staff, async (req: AuthedRequest, res) => {
  const a = await ownedAssignment(req, res, req.params.id);
  if (!a) return;
  const subs = await prisma.submission.findMany({ where: { assignmentId: a.id, isDraft: false }, orderBy: { submittedAt: "asc" } });
  const people = await prisma.student.findMany({ where: { userId: { in: subs.map((s) => s.studentUserId) } }, select: { userId: true, fullName: true, studentNumber: true } });
  const by = new Map(people.map((p) => [p.userId, p]));
  const assetIds = [...new Set(subs.flatMap((s) => s.fileAssetIds))];
  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: assetIds } } });
  const assetBy = new Map(assets.map((x) => [x.id, x]));
  const zip = new AdmZip();
  const manifest = ["student_number,full_name,submitted_at,late,versions,files,score"];
  let bytes = 0;
  const skipped: string[] = [];
  const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60);
  for (const s of subs) {
    const p = by.get(s.studentUserId);
    const folder = `${safe(p?.studentNumber ?? s.studentUserId)}_${safe(p?.fullName ?? "student")}`;
    if (s.textAnswer?.trim()) zip.addFile(`${folder}/answer.txt`, Buffer.from(s.textAnswer, "utf8"));
    for (const id of s.fileAssetIds) {
      const asset = assetBy.get(id);
      const abs = asset ? resolveStoragePath(asset.storageKey) : null;
      if (!asset || !abs) { skipped.push(`${folder}/${id}`); continue; }
      if (bytes + asset.sizeBytes > ZIP_CAP_BYTES) { skipped.push(`${folder}/${asset.originalName} (over the ${ZIP_CAP_BYTES / 1048576} MB bundle cap)`); continue; }
      try { zip.addFile(`${folder}/${safe(asset.originalName)}`, await readFile(abs)); bytes += asset.sizeBytes; } catch { skipped.push(`${folder}/${asset.originalName} (file missing on disk)`); }
    }
    manifest.push([p?.studentNumber ?? "", `"${(p?.fullName ?? "").replace(/"/g, '""')}"`, s.submittedAt.toISOString(), s.isLate, s.versionCount, s.fileAssetIds.length, s.score ?? ""].join(","));
  }
  zip.addFile("_manifest.csv", Buffer.from(manifest.join("\n"), "utf8"));
  if (skipped.length) zip.addFile("_skipped.txt", Buffer.from(skipped.join("\n"), "utf8"));
  await audit(req.user!.id, "ASSIGNMENT_BULK_DOWNLOAD", a.id, { submissions: subs.length, skipped: skipped.length });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${safe(a.title)}-submissions.zip"`);
  res.send(zip.toBuffer());
});
