// Batch 76 — trainer-side quiz engine v2 endpoints (LMS-QZ-0xx). Mounted at
// /api/quizzes right after quizzesRouter. Paths here never collide with
// quizzesRouter's single-segment `/:id`.
//
//   Marking      GET  /:id/marking-queue                      QZ066
//                PUT  /:id/submissions/:sid/marks             QZ066 QZ067 QZ072
//   Regrading    POST /:id/regrade                            QZ068
//                PATCH /:id/questions/:qid/key                QZ067 QZ068
//   Release      POST /:id/results/publish | /unpublish       QZ069 QZ070 QZ071
//   Attempts     GET  /:id/attempts                           QZ074
//   Extensions   GET/PUT/DELETE /:id/extensions…              QZ080
//   Reports      GET  /:id/reports, PATCH /reports/:rid       QZ078
//   Bank         GET  /bank/:courseId/export.csv              QZ043
//                POST /bank/:courseId/import                  QZ041 QZ042
//                GET  /bank/:courseId/facets                  QZ032
//                POST /questions/:qid/duplicate               QZ038
//                POST /questions/:qid/archive | /restore      QZ034
//                PATCH /questions/:qid/classify               QZ030 QZ031 QZ032
//                GET  /questions/:qid/versions                QZ040
//                POST /questions/:qid/restore-version         QZ040
//                POST /questions/:qid/try                     QZ044

import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { canTeachCourse } from "../lib/course-access.js";
import { resolveQuizQuestions } from "../lib/quiz-delivery.js";
import { round2 } from "../lib/quiz-scoring.js";
import {
  CSV_HEADER, aggregateAttempts, describeCorrect, fractionCorrect, isAutoMarkable, normaliseQuestion, parseQuestionCsv, questionToCsvRow, scoreQuestion,
  studentView, toCsv, type EngineQuestion, type GradingMethod, type QuestionConfig,
} from "../lib/quiz-engine.js";
import { dispatchNotification } from "../lib/notify.js";

export const quizzesV2Router = Router();
const trainerOnly = [requireAuth, requireRole("TRAINER", "SUPER_ADMIN")];

type Res = { status: (n: number) => { json: (b: unknown) => unknown } };

async function loadOwned(req: AuthedRequest, res: Res, id: string) {
  const quiz = await prisma.assessment.findUnique({ where: { id }, include: { course: { select: { id: true, title: true, unitId: true } } } });
  if (!quiz) {
    res.status(404).json({ message: "Quiz not found." });
    return null;
  }
  if (!(await canTeachCourse(req.user!, quiz.courseId))) {
    res.status(403).json({ message: "You don't teach this course." });
    return null;
  }
  return quiz;
}

/** Author, SUPER_ADMIN, or a trainer who teaches a course on the question's unit. */
async function loadQuestion(req: AuthedRequest, res: Res, id: string, { authorOnly = false } = {}) {
  const q = await prisma.question.findUnique({ where: { id } });
  if (!q) {
    res.status(404).json({ message: "Question not found." });
    return null;
  }
  if (req.user!.role === "SUPER_ADMIN" || q.createdById === req.user!.id) return q;
  if (authorOnly) {
    res.status(403).json({ message: "Only the question's author can do that." });
    return null;
  }
  const trainer = await prisma.trainer.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  const teaches = trainer ? await prisma.course.findFirst({ where: { unitId: q.unitId, trainerId: trainer.id }, select: { id: true } }) : null;
  if (!teaches) {
    res.status(403).json({ message: "You don't teach this question's unit." });
    return null;
  }
  return q;
}

const audit = (userId: string, action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) =>
  prisma.auditLog.create({ data: { userId, action, entityType, entityId, metadata: metadata as Prisma.InputJsonValue } }).catch(() => undefined);

// =========================================================== marking (QZ066/067/072) ====

/** Re-derives one submission's score from its stored per-question marks. Returns the new score (null while a written answer is unmarked). */
export async function recomputeSubmission(quiz: { id: string; courseId: string; totalMarks: number; shuffleQuestions: boolean; type: string; randomRules: unknown; shuffleOptions: boolean | null; course: { unitId: string } }, submissionId: string, markerId: string | null) {
  const sub = await prisma.submission.findUnique({ where: { id: submissionId }, include: { questionResponses: true } });
  if (!sub || sub.assessmentId !== quiz.id) return null;
  const resolved = await resolveQuizQuestions(quiz, quiz.course.unitId, { seed: sub.studentUserId });
  const byQ = new Map<string, { marksAwarded: number | null }>(sub.questionResponses.map((r: { questionId: string; marksAwarded: number | null }) => [r.questionId, r]));
  const maxSum = resolved.questions.reduce((s, q) => s + q.marks, 0);
  const scale = maxSum > 0 ? quiz.totalMarks / maxSum : 0;
  let earned = 0;
  let pending = 0;
  for (const q of resolved.questions) {
    const r = byQ.get(q.id);
    if (!r) continue; // unanswered → 0 (answered rows are the only ones stored)
    if (r.marksAwarded === null) pending++;
    else earned += r.marksAwarded;
  }
  const score = pending > 0 ? null : Math.max(0, round2(earned * scale));
  await prisma.submission.update({
    where: { id: sub.id },
    data: score === null ? { score: null, gradedAt: null } : { score, gradedAt: new Date(), ...(markerId ? { gradedById: markerId } : {}) },
  });
  return { score, pending };
}

quizzesV2Router.get("/:id/marking-queue", ...trainerOnly, async (req: AuthedRequest, res) => {
  const quiz = await loadOwned(req, res, req.params.id);
  if (!quiz) return;
  const manualRows = await prisma.questionResponse.findMany({
    where: { submission: { assessmentId: quiz.id }, marksAwarded: null },
    include: { question: true, submission: { select: { id: true, studentUserId: true, submittedAt: true } } },
    orderBy: { createdAt: "asc" },
    take: 1000,
  });
  const pending = manualRows.filter((r: any) => !isAutoMarkable({ type: r.question.type, correctAnswer: r.question.correctAnswer, config: r.question.config }));
  const userIds = [...new Set(pending.map((r: any) => r.submission.studentUserId))] as string[];
  const students = userIds.length ? await prisma.student.findMany({ where: { userId: { in: userIds } }, select: { userId: true, fullName: true, studentNumber: true } }) : [];
  const nameOf = new Map<string, { fullName: string; studentNumber: string }>(students.map((s: any) => [s.userId, s]));

  const bySub = new Map<string, any>();
  for (const r of pending as any[]) {
    const key = r.submission.id;
    if (!bySub.has(key)) {
      const st = nameOf.get(r.submission.studentUserId);
      bySub.set(key, { submissionId: key, studentUserId: r.submission.studentUserId, studentName: st?.fullName ?? "Student", studentNumber: st?.studentNumber ?? null, submittedAt: r.submission.submittedAt, items: [] });
    }
    const cfg = (r.question.config as QuestionConfig | null) ?? null;
    bySub.get(key).items.push({ questionId: r.questionId, type: r.question.type, stem: cfg?.stem ?? null, prompt: r.question.prompt, maxMarks: r.question.marks, answer: r.answerGiven, modelAnswer: r.question.correctAnswer, rubricHint: cfg?.rubricHint ?? null });
  }
  res.json({ pendingAttempts: bySub.size, attempts: [...bySub.values()] });
});

const marksSchema = z.object({
  marks: z.array(z.object({ questionId: z.string(), marks: z.number().min(0).max(1000), feedback: z.string().max(2000).optional() })).min(1).max(200),
  reason: z.string().min(3).max(500).optional(), // required when overriding an auto-marked answer (QZ067)
});

quizzesV2Router.put("/:id/submissions/:sid/marks", ...trainerOnly, async (req: AuthedRequest, res) => {
  const parsed = marksSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide marks for at least one question.", issues: parsed.error.issues?.slice(0, 3) });
  const quiz = await loadOwned(req, res, req.params.id);
  if (!quiz) return;
  const sub = await prisma.submission.findUnique({ where: { id: req.params.sid }, include: { questionResponses: { include: { question: true } } } });
  if (!sub || sub.assessmentId !== quiz.id) return res.status(404).json({ message: "Attempt not found." });

  const resolved = await resolveQuizQuestions(quiz, quiz.course.unitId, { seed: sub.studentUserId });
  const marksOf = new Map(resolved.questions.map((q) => [q.id, q.marks]));
  const rowOf = new Map(sub.questionResponses.map((r: any) => [r.questionId, r]));

  for (const m of parsed.data.marks) {
    const row: any = rowOf.get(m.questionId);
    const max = marksOf.get(m.questionId);
    if (!row || max === undefined) return res.status(400).json({ message: "That question wasn't answered in this attempt." });
    if (m.marks > max) return res.status(400).json({ message: `Marks for a question can't exceed ${max}.` });
    const auto = isAutoMarkable({ type: row.question.type, correctAnswer: row.question.correctAnswer, config: row.question.config });
    if (auto && !parsed.data.reason) return res.status(400).json({ message: "Give a reason to override a question the system already marked." });
  }

  await prisma.$transaction(async (tx) => {
    for (const m of parsed.data.marks) {
      const max = marksOf.get(m.questionId)!;
      await tx.questionResponse.update({
        where: { submissionId_questionId: { submissionId: sub.id, questionId: m.questionId } },
        data: { marksAwarded: round2(m.marks), isCorrect: m.marks >= max, markerFeedback: m.feedback?.trim() || null, markedById: req.user!.id, markedAt: new Date() },
      });
    }
  });
  const result = await recomputeSubmission(quiz, sub.id, req.user!.id);
  await audit(req.user!.id, "quiz.manual_marks", "Submission", sub.id, { assessmentId: quiz.id, questions: parsed.data.marks.map((m) => m.questionId), reason: parsed.data.reason ?? null, newScore: result?.score ?? null });
  res.json({ submissionId: sub.id, score: result?.score ?? null, stillUnmarked: result?.pending ?? 0 });
});

// =========================================================== regrading (QZ068) ====

async function regradeQuiz(quiz: Awaited<ReturnType<typeof loadOwned>> & {}, opts: { questionId?: string; apply: boolean; userId: string }) {
  const subs = await prisma.submission.findMany({ where: { assessmentId: quiz.id }, include: { questionResponses: { include: { question: true } } } });
  let changedAnswers = 0;
  let changedAttempts = 0;
  const examples: { submissionId: string; questionId: string; from: number | null; to: number }[] = [];

  for (const sub of subs as any[]) {
    const resolved = await resolveQuizQuestions(quiz, quiz.course.unitId, { seed: sub.studentUserId });
    const marksOf = new Map(resolved.questions.map((q) => [q.id, q.marks]));
    let touched = false;
    for (const r of sub.questionResponses) {
      if (opts.questionId && r.questionId !== opts.questionId) continue;
      if (r.markedById) continue; // never overwrite a human's marks
      const max = marksOf.get(r.questionId);
      if (max === undefined) continue;
      const eq: EngineQuestion = { id: r.question.id, type: r.question.type, marks: max, correctAnswer: r.question.correctAnswer, options: r.question.options, config: r.question.config };
      if (!isAutoMarkable(eq)) continue;
      const o = scoreQuestion(eq, r.answerGiven);
      if (o.marksAwarded !== r.marksAwarded || o.isCorrect !== r.isCorrect) {
        changedAnswers++;
        touched = true;
        if (examples.length < 20) examples.push({ submissionId: sub.id, questionId: r.questionId, from: r.marksAwarded, to: o.marksAwarded ?? 0 });
        if (opts.apply) {
          await prisma.questionResponse.update({ where: { id: r.id }, data: { marksAwarded: o.marksAwarded, isCorrect: o.isCorrect } });
        }
      }
    }
    if (touched) {
      changedAttempts++;
      if (opts.apply) await recomputeSubmission(quiz, sub.id, null);
    }
  }
  return { attemptsChecked: subs.length, changedAnswers, changedAttempts, examples };
}

quizzesV2Router.post("/:id/regrade", ...trainerOnly, async (req: AuthedRequest, res) => {
  const parsed = z.object({ questionId: z.string().optional(), apply: z.boolean().default(false) }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Invalid regrade request." });
  const quiz = await loadOwned(req, res, req.params.id);
  if (!quiz) return;
  const out = await regradeQuiz(quiz, { questionId: parsed.data.questionId, apply: parsed.data.apply, userId: req.user!.id });
  if (parsed.data.apply) await audit(req.user!.id, "quiz.regrade", "Assessment", quiz.id, { questionId: parsed.data.questionId ?? null, ...out, examples: undefined });
  res.json({ applied: parsed.data.apply, ...out });
});

// Fix a wrong answer KEY on a question that's already in a live / attempted quiz, then regrade just that question.
const keyFix = z.object({
  correctAnswer: z.string().max(500).optional(),
  config: z
    .object({
      correct: z.array(z.string().max(500)).max(8).optional(),
      blanks: z.array(z.array(z.string().max(200)).max(10)).max(10).optional(),
      acceptedAnswers: z.array(z.string().max(500)).max(20).optional(),
      numeric: z.object({ answer: z.number().finite(), tolerance: z.number().min(0).optional(), toleranceType: z.enum(["abs", "percent"]).optional(), unit: z.string().max(20).optional() }).optional(),
      pairs: z.array(z.object({ left: z.string().max(300), right: z.string().max(300) })).max(10).optional(),
      order: z.array(z.string().max(300)).max(12).optional(),
      caseSensitive: z.boolean().optional(),
    })
    .optional(),
  reason: z.string().min(5).max(500),
});

quizzesV2Router.patch("/:id/questions/:qid/key", ...trainerOnly, async (req: AuthedRequest, res) => {
  const parsed = keyFix.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Give the corrected key and a reason.", issues: parsed.error.issues?.slice(0, 3) });
  const quiz = await loadOwned(req, res, req.params.id);
  if (!quiz) return;
  const link = await prisma.assessmentQuestion.findUnique({ where: { assessmentId_questionId: { assessmentId: quiz.id, questionId: req.params.qid } }, include: { question: true } });
  const q = link?.question;
  if (!q) return res.status(404).json({ message: "That question isn't in this quiz." });
  if (q.createdById !== req.user!.id && req.user!.role !== "SUPER_ADMIN") return res.status(403).json({ message: "Only the question's author can correct its key." });

  const existing = (q.config as QuestionConfig | null) ?? {};
  const merged: QuestionConfig = { ...existing, ...(parsed.data.config ?? {}) };
  const isTf = q.type === "mcq" && q.options.length === 2 && q.options[0] === "True" && q.options[1] === "False";
  const check = normaliseQuestion({
    type: isTf ? "true_false" : q.type,
    prompt: q.prompt,
    options: q.options,
    correctAnswer: parsed.data.correctAnswer ?? q.correctAnswer ?? undefined,
    config: merged,
  });
  if (typeof check === "string") return res.status(400).json({ message: check });

  await prisma.$transaction(async (tx) => {
    await tx.questionVersion.create({
      data: { questionId: q.id, version: q.version, editedById: req.user!.id, snapshot: { type: q.type, prompt: q.prompt, options: q.options, correctAnswer: q.correctAnswer, marks: q.marks, difficulty: q.difficulty, topic: q.topic, explanation: q.explanation, config: q.config ?? null, mediaUrl: q.mediaUrl, mediaKind: q.mediaKind, tags: q.tags, keyFixReason: parsed.data.reason } as Prisma.InputJsonValue },
    });
    await tx.question.update({
      where: { id: q.id },
      data: { correctAnswer: check.correctAnswer, config: check.config ? (check.config as Prisma.InputJsonValue) : Prisma.JsonNull, version: { increment: 1 }, updatedAt: new Date() },
    });
  });
  const out = await regradeQuiz(quiz, { questionId: q.id, apply: true, userId: req.user!.id });
  await audit(req.user!.id, "quiz.key_correction", "Question", q.id, { assessmentId: quiz.id, reason: parsed.data.reason, ...out, examples: undefined });
  res.json({ corrected: true, ...out });
});

// ===================================================== results release (QZ069/070/071) ====

quizzesV2Router.post("/:id/results/publish", ...trainerOnly, async (req: AuthedRequest, res) => {
  const parsed = z.object({ force: z.boolean().default(false), notify: z.boolean().default(true) }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Invalid request." });
  const quiz = await loadOwned(req, res, req.params.id);
  if (!quiz) return;
  const ungraded = await prisma.submission.count({ where: { assessmentId: quiz.id, score: null } });
  if (ungraded > 0 && !parsed.data.force) {
    return res.status(409).json({ message: `${ungraded} attempt(s) still need marking. Mark them first, or publish anyway.`, ungraded });
  }
  await prisma.assessment.update({ where: { id: quiz.id }, data: { resultsPublished: true, resultsPublishedAt: new Date() } });
  await audit(req.user!.id, "quiz.results.publish", "Assessment", quiz.id, { ungraded, forced: parsed.data.force });

  let notified = 0;
  if (parsed.data.notify) {
    const users = await prisma.submission.findMany({ where: { assessmentId: quiz.id }, distinct: ["studentUserId"], select: { studentUserId: true } });
    for (const u of users as { studentUserId: string }[]) {
      await prisma.notification.create({ data: { userId: u.studentUserId, channel: "in_app", title: `Results published: ${quiz.title}`, body: `Your results for "${quiz.title}" in ${quiz.course.title} are now available in the Assessment Centre.`, sentAt: new Date() } });
      notified++;
    }
  }
  res.json({ published: true, notified, ungraded });
});

quizzesV2Router.post("/:id/results/unpublish", ...trainerOnly, async (req: AuthedRequest, res) => {
  const quiz = await loadOwned(req, res, req.params.id);
  if (!quiz) return;
  await prisma.assessment.update({ where: { id: quiz.id }, data: { resultsPublished: false, resultsPublishedAt: null } });
  await audit(req.user!.id, "quiz.results.unpublish", "Assessment", quiz.id);
  res.json({ published: false });
});

// ============================================================ attempts (QZ074 / QZ076) ====

quizzesV2Router.get("/:id/attempts", ...trainerOnly, async (req: AuthedRequest, res) => {
  const quiz = await loadOwned(req, res, req.params.id);
  if (!quiz) return;
  const subs = await prisma.submission.findMany({ where: { assessmentId: quiz.id }, orderBy: { submittedAt: "asc" }, select: { id: true, studentUserId: true, score: true, submittedAt: true, gradedAt: true } });
  const userIds = [...new Set(subs.map((s: { studentUserId: string }) => s.studentUserId))] as string[];
  const students = userIds.length ? await prisma.student.findMany({ where: { userId: { in: userIds } }, select: { userId: true, fullName: true, studentNumber: true, intake: true } }) : [];
  const info = new Map<string, any>(students.map((s: any) => [s.userId, s]));
  const grouped = new Map<string, { score: number | null; submittedAt: Date; id: string }[]>();
  for (const s of subs as any[]) grouped.set(s.studentUserId, [...(grouped.get(s.studentUserId) ?? []), s]);
  const rows = [...grouped.entries()].map(([uid, list]) => {
    const st = info.get(uid);
    return {
      studentUserId: uid,
      studentName: st?.fullName ?? "Student",
      studentNumber: st?.studentNumber ?? null,
      intake: st?.intake ?? null,
      attempts: list.length,
      scores: list.map((a) => a.score),
      officialGrade: aggregateAttempts(list, quiz.gradingMethod as GradingMethod),
      pendingMarking: list.filter((a) => a.score === null).length,
      lastSubmittedAt: list[list.length - 1].submittedAt,
      attemptIds: list.map((a) => a.id),
    };
  });
  res.json({ gradingMethod: quiz.gradingMethod, totalMarks: quiz.totalMarks, students: rows.sort((a, b) => a.studentName.localeCompare(b.studentName)) });
});

// ================================================================ extensions (QZ080) ====

quizzesV2Router.get("/:id/extensions", ...trainerOnly, async (req: AuthedRequest, res) => {
  const quiz = await loadOwned(req, res, req.params.id);
  if (!quiz) return;
  const list = await prisma.quizExtension.findMany({ where: { assessmentId: quiz.id, revokedAt: null }, orderBy: { createdAt: "desc" } });
  const students = list.length ? await prisma.student.findMany({ where: { userId: { in: list.map((x: { studentUserId: string }) => x.studentUserId) } }, select: { userId: true, fullName: true, studentNumber: true } }) : [];
  const info = new Map<string, any>(students.map((s: any) => [s.userId, s]));
  res.json(list.map((x: any) => ({ ...x, studentName: info.get(x.studentUserId)?.fullName ?? "Student", studentNumber: info.get(x.studentUserId)?.studentNumber ?? null })));
});

quizzesV2Router.put("/:id/extensions/:studentUserId", ...trainerOnly, async (req: AuthedRequest, res) => {
  const parsed = z.object({ extraAttempts: z.number().int().min(0).max(10).default(0), extendedCloseAt: z.string().datetime().nullable().optional(), reason: z.string().min(3).max(500) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Give a reason and the extension (extra attempts and/or a later closing time).", issues: parsed.error.issues?.slice(0, 3) });
  if (parsed.data.extraAttempts === 0 && !parsed.data.extendedCloseAt) return res.status(400).json({ message: "Grant extra attempts, a later closing time, or both." });
  const quiz = await loadOwned(req, res, req.params.id);
  if (!quiz) return;
  const student = await prisma.student.findUnique({ where: { userId: req.params.studentUserId }, select: { id: true, fullName: true } });
  if (!student) return res.status(404).json({ message: "Student not found." });
  const enrolled = await prisma.enrollment.findFirst({ where: { studentId: student.id, unitId: quiz.course.unitId }, select: { id: true } });
  if (!enrolled) return res.status(400).json({ message: "That student isn't enrolled in this course's unit." });
  const closes = parsed.data.extendedCloseAt ? new Date(parsed.data.extendedCloseAt) : null;

  const data = { extraAttempts: parsed.data.extraAttempts, extendedCloseAt: closes, reason: parsed.data.reason.trim(), grantedById: req.user!.id, revokedAt: null };
  const row = await prisma.quizExtension.upsert({
    where: { assessmentId_studentUserId: { assessmentId: quiz.id, studentUserId: req.params.studentUserId } },
    update: data,
    create: { assessmentId: quiz.id, studentUserId: req.params.studentUserId, ...data },
  });
  await audit(req.user!.id, "quiz.extension.grant", "Assessment", quiz.id, { studentUserId: req.params.studentUserId, extraAttempts: data.extraAttempts, extendedCloseAt: closes?.toISOString() ?? null, reason: data.reason });
  await prisma.notification.create({ data: { userId: req.params.studentUserId, channel: "in_app", title: `Extension granted: ${quiz.title}`, body: `Your trainer has approved an extension for "${quiz.title}"${data.extraAttempts ? ` (+${data.extraAttempts} attempt${data.extraAttempts === 1 ? "" : "s"})` : ""}${closes ? ` — now open until ${closes.toISOString()}` : ""}.`, sentAt: new Date() } });
  void dispatchNotification({ channel: "in_app", to: req.params.studentUserId, title: "Quiz extension", body: quiz.title });
  res.json(row);
});

quizzesV2Router.delete("/:id/extensions/:studentUserId", ...trainerOnly, async (req: AuthedRequest, res) => {
  const quiz = await loadOwned(req, res, req.params.id);
  if (!quiz) return;
  const row = await prisma.quizExtension.findUnique({ where: { assessmentId_studentUserId: { assessmentId: quiz.id, studentUserId: req.params.studentUserId } } });
  if (!row || row.revokedAt) return res.status(404).json({ message: "No active extension for that student." });
  await prisma.quizExtension.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  await audit(req.user!.id, "quiz.extension.revoke", "Assessment", quiz.id, { studentUserId: req.params.studentUserId });
  res.status(204).send();
});

// ============================================================ error reports (QZ078) ====

quizzesV2Router.get("/:id/reports", ...trainerOnly, async (req: AuthedRequest, res) => {
  const quiz = await loadOwned(req, res, req.params.id);
  if (!quiz) return;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const list = await prisma.questionReport.findMany({ where: { assessmentId: quiz.id, ...(status ? { status } : {}) }, include: { question: { select: { prompt: true, type: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  res.json(list.map((r: any) => ({ id: r.id, questionId: r.questionId, prompt: r.question.prompt, category: r.category, message: r.message, status: r.status, resolution: r.resolution, createdAt: r.createdAt })));
});

quizzesV2Router.patch("/reports/:rid", ...trainerOnly, async (req: AuthedRequest, res) => {
  const parsed = z.object({ status: z.enum(["resolved", "dismissed", "open"]), resolution: z.string().max(1000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Choose resolved, dismissed or open." });
  const rep = await prisma.questionReport.findUnique({ where: { id: req.params.rid } });
  if (!rep || !rep.assessmentId) return res.status(404).json({ message: "Report not found." });
  const quiz = await loadOwned(req, res, rep.assessmentId);
  if (!quiz) return;
  const updated = await prisma.questionReport.update({
    where: { id: rep.id },
    data: { status: parsed.data.status, resolution: parsed.data.resolution?.trim() || null, resolvedById: parsed.data.status === "open" ? null : req.user!.id, resolvedAt: parsed.data.status === "open" ? null : new Date() },
  });
  if (parsed.data.status !== "open") {
    await prisma.notification.create({ data: { userId: rep.reporterUserId, channel: "in_app", title: "Your question report was reviewed", body: parsed.data.resolution?.trim() || `Your trainer ${parsed.data.status} your report on "${quiz.title}".`, sentAt: new Date() } });
  }
  res.json(updated);
});

// ================================================================ question bank tools ====

quizzesV2Router.get("/bank/:courseId/facets", ...trainerOnly, async (req: AuthedRequest, res) => {
  if (!(await canTeachCourse(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  const course = await prisma.course.findUnique({ where: { id: req.params.courseId }, select: { unitId: true } });
  if (!course) return res.status(404).json({ message: "Course not found." });
  const qs = await prisma.question.findMany({ where: { unitId: course.unitId, archivedAt: null }, select: { topic: true, tags: true, type: true, difficulty: true } });
  const count = (items: (string | null)[]) => {
    const m = new Map<string, number>();
    for (const i of items) if (i) m.set(i, (m.get(i) ?? 0) + 1);
    return [...m.entries()].map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count);
  };
  res.json({
    total: qs.length,
    topics: count(qs.map((q: { topic: string | null }) => q.topic)),
    tags: count(qs.flatMap((q: { tags: string[] }) => q.tags)),
    types: count(qs.map((q: { type: string }) => q.type)),
    difficulties: count(qs.map((q: { difficulty: string }) => q.difficulty)),
  });
});

quizzesV2Router.get("/bank/:courseId/export.csv", ...trainerOnly, async (req: AuthedRequest, res) => {
  if (!(await canTeachCourse(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  const course = await prisma.course.findUnique({ where: { id: req.params.courseId }, select: { unitId: true, title: true } });
  if (!course) return res.status(404).json({ message: "Course not found." });
  const qs = await prisma.question.findMany({ where: { unitId: course.unitId, archivedAt: null }, orderBy: { createdAt: "asc" }, take: 5000 });
  const rows = [Array.from(CSV_HEADER) as (string | number)[], ...qs.map((q: any) => questionToCsvRow({ ...q, tags: q.tags ?? [], config: q.config ?? null }))];
  await audit(req.user!.id, "quiz.bank.export", "Course", req.params.courseId, { count: qs.length });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="question-bank-${course.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv"`);
  res.send("\uFEFF" + toCsv(rows));
});

quizzesV2Router.post("/bank/:courseId/import", ...trainerOnly, async (req: AuthedRequest, res) => {
  const parsed = z.object({ csv: z.string().min(10).max(1_000_000), dryRun: z.boolean().default(false) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Paste or upload a CSV (up to 1 MB)." });
  if (!(await canTeachCourse(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  const course = await prisma.course.findUnique({ where: { id: req.params.courseId }, select: { unitId: true } });
  if (!course) return res.status(404).json({ message: "Course not found." });

  const result = parseQuestionCsv(parsed.data.csv);
  if (parsed.data.dryRun || result.questions.length === 0) {
    return res.json({ dryRun: true, valid: result.questions.length, errors: result.errors, preview: result.questions.slice(0, 5).map((q) => ({ row: q.row, type: q.type, prompt: q.prompt })) });
  }
  // All-or-nothing on the valid rows; invalid rows are reported, never silently dropped.
  await prisma.question.createMany({
    data: result.questions.map((q) => ({
      unitId: course.unitId,
      type: q.normalised.type,
      prompt: q.prompt,
      options: q.normalised.options,
      correctAnswer: q.normalised.correctAnswer,
      marks: q.marks,
      difficulty: q.difficulty,
      topic: q.topic ?? null,
      explanation: q.explanation ?? null,
      config: q.normalised.config ? (q.normalised.config as Prisma.InputJsonValue) : Prisma.JsonNull,
      tags: q.tags.map((t) => t.toLowerCase()),
      createdById: req.user!.id,
    })),
  });
  await audit(req.user!.id, "quiz.bank.import", "Course", req.params.courseId, { imported: result.questions.length, rejected: result.errors.length });
  res.status(201).json({ dryRun: false, imported: result.questions.length, errors: result.errors });
});

quizzesV2Router.post("/questions/:qid/duplicate", ...trainerOnly, async (req: AuthedRequest, res) => {
  const q = await loadQuestion(req, res, req.params.qid);
  if (!q) return;
  const copy = await prisma.question.create({
    data: {
      unitId: q.unitId, type: q.type, prompt: `${q.prompt}`.slice(0, 4000), options: q.options, correctAnswer: q.correctAnswer, marks: q.marks, difficulty: q.difficulty,
      topic: q.topic, explanation: q.explanation, config: q.config ? (q.config as Prisma.InputJsonValue) : Prisma.JsonNull, mediaUrl: q.mediaUrl, mediaKind: q.mediaKind, tags: [...q.tags, "copy"],
      competencyId: q.competencyId, learningOutcomeId: q.learningOutcomeId, createdById: req.user!.id, // the copy is the duplicator's own, unapproved
    },
  });
  res.status(201).json({ id: copy.id });
});

quizzesV2Router.post("/questions/:qid/archive", ...trainerOnly, async (req: AuthedRequest, res) => {
  const q = await loadQuestion(req, res, req.params.qid, { authorOnly: true });
  if (!q) return;
  await prisma.question.update({ where: { id: q.id }, data: { archivedAt: new Date() } });
  await audit(req.user!.id, "quiz.question.archive", "Question", q.id);
  res.json({ archived: true });
});

quizzesV2Router.post("/questions/:qid/restore", ...trainerOnly, async (req: AuthedRequest, res) => {
  const q = await loadQuestion(req, res, req.params.qid, { authorOnly: true });
  if (!q) return;
  await prisma.question.update({ where: { id: q.id }, data: { archivedAt: null } });
  res.json({ archived: false });
});

quizzesV2Router.patch("/questions/:qid/classify", ...trainerOnly, async (req: AuthedRequest, res) => {
  const parsed = z.object({ difficulty: z.enum(["easy", "medium", "hard"]).optional(), topic: z.string().max(100).nullable().optional(), tags: z.array(z.string().min(1).max(40)).max(12).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid classification." });
  const q = await loadQuestion(req, res, req.params.qid);
  if (!q) return;
  // Labels only: no change to what is asked or marked, so no re-approval and no lock.
  const updated = await prisma.question.update({
    where: { id: q.id },
    data: {
      ...(parsed.data.difficulty ? { difficulty: parsed.data.difficulty } : {}),
      ...(parsed.data.topic !== undefined ? { topic: parsed.data.topic?.trim() || null } : {}),
      ...(parsed.data.tags ? { tags: [...new Set(parsed.data.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))] } : {}),
    },
    select: { id: true, difficulty: true, topic: true, tags: true },
  });
  res.json(updated);
});

quizzesV2Router.get("/questions/:qid/versions", ...trainerOnly, async (req: AuthedRequest, res) => {
  const q = await loadQuestion(req, res, req.params.qid);
  if (!q) return;
  const versions = await prisma.questionVersion.findMany({ where: { questionId: q.id }, orderBy: { version: "desc" }, take: 50 });
  res.json({ current: q.version, versions: versions.map((v: any) => ({ version: v.version, editedAt: v.editedAt, editedById: v.editedById, snapshot: v.snapshot })) });
});

quizzesV2Router.post("/questions/:qid/restore-version", ...trainerOnly, async (req: AuthedRequest, res) => {
  const parsed = z.object({ version: z.number().int().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Say which version to restore." });
  const q = await loadQuestion(req, res, req.params.qid, { authorOnly: true });
  if (!q) return;
  const live = await prisma.assessmentQuestion.findMany({ where: { questionId: q.id, assessment: { isDraft: false } }, select: { assessment: { select: { title: true } } } });
  if (live.length > 0) return res.status(409).json({ message: "This question is in a published quiz. Unpublish it first, or use the answer-key correction." });
  const v = await prisma.questionVersion.findUnique({ where: { questionId_version: { questionId: q.id, version: parsed.data.version } } });
  if (!v) return res.status(404).json({ message: "That version doesn't exist." });
  const s = v.snapshot as any;
  await prisma.$transaction(async (tx) => {
    await tx.questionVersion.create({ data: { questionId: q.id, version: q.version, editedById: req.user!.id, snapshot: { type: q.type, prompt: q.prompt, options: q.options, correctAnswer: q.correctAnswer, marks: q.marks, difficulty: q.difficulty, topic: q.topic, explanation: q.explanation, config: q.config ?? null, mediaUrl: q.mediaUrl, mediaKind: q.mediaKind, tags: q.tags } as Prisma.InputJsonValue } });
    await tx.question.update({
      where: { id: q.id },
      data: {
        type: s.type, prompt: s.prompt, options: s.options ?? [], correctAnswer: s.correctAnswer ?? null, marks: s.marks, difficulty: s.difficulty, topic: s.topic ?? null,
        explanation: s.explanation ?? null, config: s.config ? (s.config as Prisma.InputJsonValue) : Prisma.JsonNull, mediaUrl: s.mediaUrl ?? null, mediaKind: s.mediaKind ?? null, tags: s.tags ?? [],
        version: { increment: 1 }, updatedAt: new Date(), approvedById: null, // restored content needs approving again
      },
    });
  });
  await audit(req.user!.id, "quiz.question.restore_version", "Question", q.id, { restored: parsed.data.version });
  res.json({ restored: parsed.data.version });
});

// QZ044 — try a question exactly as a student would, and see how it would be marked.
quizzesV2Router.post("/questions/:qid/try", ...trainerOnly, async (req: AuthedRequest, res) => {
  const parsed = z.object({ answer: z.string().max(20000).optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Invalid answer." });
  const q = await loadQuestion(req, res, req.params.qid);
  if (!q) return;
  const eq: EngineQuestion & { prompt: string } = { id: q.id, type: q.type, marks: q.marks, correctAnswer: q.correctAnswer, options: q.options, config: q.config as QuestionConfig | null, prompt: q.prompt };
  const view = studentView({ ...eq, mediaUrl: q.mediaUrl, mediaKind: q.mediaKind }, req.user!.id);
  if (parsed.data.answer === undefined) return res.json({ question: view });
  const o = scoreQuestion(eq, parsed.data.answer);
  const frac = isAutoMarkable(eq) ? fractionCorrect(eq, parsed.data.answer) : null;
  res.json({ question: view, outcome: { ...o, fraction: frac, correctAnswer: describeCorrect(eq), explanation: q.explanation } });
});
