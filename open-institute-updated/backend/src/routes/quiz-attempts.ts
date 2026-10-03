// Batch 76 — student-side quiz extras (LMS-QZ-058 … 080). Mounted at
// /api/quiz-attempts. Every route is STUDENT-only and scoped to the caller:
// a student can never read another student's attempt or draft.
//
//   PUT  /:assessmentId/draft        QZ060  autosave answers while sitting
//   GET  /:assessmentId/mine         QZ074  my attempts + official grade
//   GET  /review/:submissionId       QZ059 QZ075  review one of my attempts
//   POST /report                     QZ078  report an error in a question

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { isEnrolledInCourse } from "../lib/course-access.js";
import { resolveQuizQuestions } from "../lib/quiz-delivery.js";
import { aggregateAttempts, buildReviewItems, canSeeAnswerKey, canSeeScore, passedQuiz, type GradingMethod, type ReviewQuestion } from "../lib/quiz-engine.js";

export const quizAttemptsRouter = Router();
const studentOnly = [requireAuth, requireRole("STUDENT")];

const MAX_DRAFT_BYTES = 200_000;

quizAttemptsRouter.put("/:assessmentId/draft", ...studentOnly, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      answers: z.record(z.string().max(20000)),
      flagged: z.array(z.string()).max(500).optional(),
      currentIndex: z.number().int().min(0).max(1000).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid draft." });
  if (Object.keys(parsed.data.answers).length > 500 || JSON.stringify(parsed.data.answers).length > MAX_DRAFT_BYTES) {
    return res.status(413).json({ message: "Draft too large." });
  }
  const a = await prisma.assessment.findUnique({ where: { id: req.params.assessmentId }, select: { id: true, courseId: true, isDraft: true } });
  if (!a || a.isDraft) return res.status(404).json({ message: "Quiz not found." });
  if (!(await isEnrolledInCourse(req.user!.id, a.courseId))) return res.status(403).json({ message: "You are not enrolled in this course." });

  // Only while an attempt is actually open: a draft can't be used to smuggle answers in after the attempt ended.
  const session = await prisma.examSession.findUnique({ where: { assessmentId_studentUserId: { assessmentId: a.id, studentUserId: req.user!.id } } });
  if (!session || session.endedAt) return res.status(409).json({ message: "No open attempt to save." });

  const saved = await prisma.quizAttemptDraft.upsert({
    where: { assessmentId_studentUserId: { assessmentId: a.id, studentUserId: req.user!.id } },
    update: { answers: parsed.data.answers, flagged: parsed.data.flagged ?? [], currentIndex: parsed.data.currentIndex ?? 0 },
    create: { assessmentId: a.id, studentUserId: req.user!.id, answers: parsed.data.answers, flagged: parsed.data.flagged ?? [], currentIndex: parsed.data.currentIndex ?? 0 },
  });
  res.json({ savedAt: saved.updatedAt });
});

quizAttemptsRouter.get("/:assessmentId/mine", ...studentOnly, async (req: AuthedRequest, res) => {
  const a = await prisma.assessment.findUnique({ where: { id: req.params.assessmentId } });
  if (!a || a.isDraft) return res.status(404).json({ message: "Quiz not found." });
  if (!(await isEnrolledInCourse(req.user!.id, a.courseId))) return res.status(403).json({ message: "You are not enrolled in this course." });
  const subs = await prisma.submission.findMany({ where: { assessmentId: a.id, studentUserId: req.user!.id }, orderBy: { submittedAt: "asc" }, select: { id: true, score: true, submittedAt: true } });
  const now = new Date();
  const closesAt = a.closesAt ?? (a.scheduledAt && a.durationMinutes ? new Date(a.scheduledAt.getTime() + a.durationMinutes * 60000) : null);
  const vis = { resultVisibility: a.resultVisibility, markingMode: a.markingMode, resultsPublished: a.resultsPublished, answerKeyReleaseAt: a.answerKeyReleaseAt, closesAt };
  const show = canSeeScore(vis, now);
  const grade = aggregateAttempts(subs, a.gradingMethod as GradingMethod);
  res.json({
    title: a.title,
    totalMarks: a.totalMarks,
    gradingMethod: a.gradingMethod,
    passMarkPercent: a.passMarkPercent,
    officialGrade: show ? grade : null,
    passed: show ? passedQuiz(grade, a.totalMarks, a.passMarkPercent) : null,
    scoresVisible: show,
    keyVisible: canSeeAnswerKey(vis, now, a.showFeedbackAfterSubmit),
    attempts: subs.map((s: { id: string; score: number | null; submittedAt: Date }, i: number) => ({
      submissionId: s.id,
      attemptNumber: i + 1,
      submittedAt: s.submittedAt,
      status: s.score === null ? "awaiting_marking" : "marked",
      score: show ? s.score : null,
      passed: show ? passedQuiz(s.score, a.totalMarks, a.passMarkPercent) : null,
    })),
  });
});

quizAttemptsRouter.get("/review/:submissionId", ...studentOnly, async (req: AuthedRequest, res) => {
  const sub = await prisma.submission.findUnique({ where: { id: req.params.submissionId }, include: { questionResponses: true, assessment: { include: { course: { select: { unitId: true } } } } } });
  // 404 (not 403) for someone else's attempt, so ids can't be probed.
  if (!sub || !sub.assessment || sub.studentUserId !== req.user!.id) return res.status(404).json({ message: "Attempt not found." });
  const a = sub.assessment;
  const now = new Date();
  const closesAt = a.closesAt ?? (a.scheduledAt && a.durationMinutes ? new Date(a.scheduledAt.getTime() + a.durationMinutes * 60000) : null);
  const vis = { resultVisibility: a.resultVisibility, markingMode: a.markingMode, resultsPublished: a.resultsPublished, answerKeyReleaseAt: a.answerKeyReleaseAt, closesAt };
  const showScore = canSeeScore(vis, now);
  const keyVisible = a.builderType === "QUIZ" && canSeeAnswerKey(vis, now, a.showFeedbackAfterSubmit);

  const base = { assessmentId: a.id, title: a.title, totalMarks: a.totalMarks, submittedAt: sub.submittedAt, score: showScore ? sub.score : null, passed: showScore ? passedQuiz(sub.score, a.totalMarks, a.passMarkPercent) : null, scoreVisible: showScore };
  if (!keyVisible) return res.json({ ...base, review: null, reason: showScore ? "Answers aren't shown for this quiz yet." : "Results haven't been released yet." });

  const resolved = await resolveQuizQuestions(a, a.course.unitId, { seed: req.user!.id });
  const answers = new Map<string, string>(sub.questionResponses.map((r: { questionId: string; answerGiven: string }) => [r.questionId, r.answerGiven]));
  const outcomes = new Map(
    sub.questionResponses.map((r: { questionId: string; isCorrect: boolean | null; marksAwarded: number | null; markerFeedback: string | null }) => {
      const max = resolved.questions.find((q) => q.id === r.questionId)?.marks ?? 0;
      return [r.questionId, { isCorrect: r.isCorrect, partial: r.marksAwarded !== null && r.marksAwarded > 0 && r.marksAwarded < max, marksAwarded: r.marksAwarded, markerFeedback: r.markerFeedback }] as const;
    })
  );
  const rq: ReviewQuestion[] = resolved.questions.map((q) => ({ id: q.id, type: q.type, marks: q.marks, correctAnswer: q.correctAnswer, options: q.options, config: q.config, prompt: q.prompt, explanation: q.explanation }));
  res.json({ ...base, review: buildReviewItems(rq, outcomes, answers) });
});

quizAttemptsRouter.post("/report", ...studentOnly, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({ assessmentId: z.string(), questionId: z.string(), category: z.enum(["error", "unclear", "ambiguous", "typo", "other"]).default("error"), message: z.string().min(5).max(1000) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Describe the problem in a sentence or two.", issues: parsed.error.issues?.slice(0, 3) });
  const a = await prisma.assessment.findUnique({ where: { id: parsed.data.assessmentId }, include: { course: { select: { unitId: true } } } });
  if (!a || a.isDraft) return res.status(404).json({ message: "Quiz not found." });
  if (!(await isEnrolledInCourse(req.user!.id, a.courseId))) return res.status(403).json({ message: "You are not enrolled in this course." });
  // Only questions the student could actually have been shown.
  const resolved = await resolveQuizQuestions(a, a.course.unitId, { seed: req.user!.id });
  if (!resolved.questions.some((q) => q.id === parsed.data.questionId)) return res.status(400).json({ message: "That question isn't part of this quiz." });
  const dup = await prisma.questionReport.findFirst({ where: { questionId: parsed.data.questionId, assessmentId: a.id, reporterUserId: req.user!.id, status: "open" } });
  if (dup) return res.status(409).json({ message: "You've already reported this question; your trainer will respond." });
  const report = await prisma.questionReport.create({ data: { questionId: parsed.data.questionId, assessmentId: a.id, reporterUserId: req.user!.id, category: parsed.data.category, message: parsed.data.message.trim() } });
  res.status(201).json({ id: report.id });
});
