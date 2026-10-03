// TP011 — quiz builder. A trainer builds a quiz for one of their courses by
// choosing (or writing) specific questions, ordering them, setting per-quiz
// marks, timing, attempts, shuffle, pass mark and feedback, previewing it as
// a student, publishing it, and then reading item analysis once students
// have sat it.
//
// Rules enforced here rather than left to the UI:
//   * only the course's own trainer (or SUPER_ADMIN) can touch a quiz;
//   * a quiz's questions/marks are LOCKED once any student has attempted it
//     (changing them would silently change marks that were already awarded);
//   * a CAT (counts toward the grade) may only contain examination-office
//     approved questions; a formative quiz may use the trainer's own;
//   * a quiz can't be published empty or with a broken multiple-choice item.
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { canTeachCourse } from "../lib/course-access.js";
import { resolveQuizQuestions, toStudentQuestion } from "../lib/quiz-delivery.js";
import { normaliseAnswer, round2 } from "../lib/quiz-scoring.js";
import {
  QUESTION_TYPES, GRADING_METHODS, VISIBILITY_MODES, classifyItem, describeCorrect, isAutoMarkable, itemStats,
  normaliseQuestion, parseRandomRules, type QuestionConfig,
} from "../lib/quiz-engine.js"; // Batch 76 — quiz engine v2

export const quizzesRouter = Router();
const trainerOnly = [requireAuth, requireRole("TRAINER", "SUPER_ADMIN")];

const settings = {
  title: z.string().min(2).max(200),
  instructions: z.string().max(5000).nullable().optional(),
  durationMinutes: z.number().int().min(1).max(600).nullable().optional(),
  maxAttempts: z.number().int().min(1).max(20),
  scheduledAt: z.string().datetime().nullable().optional(),
  shuffleQuestions: z.boolean(),
  passMarkPercent: z.number().int().min(1).max(100).nullable().optional(),
  showFeedbackAfterSubmit: z.boolean(),
  // Batch 76 — quiz engine v2
  opensAt: z.string().datetime().nullable().optional(),
  closesAt: z.string().datetime().nullable().optional(),
  gradingMethod: z.enum(GRADING_METHODS as unknown as [string, ...string[]]),
  questionsPerPage: z.number().int().min(1).max(100).nullable().optional(),
  navigationMode: z.enum(["FREE", "FORWARD_ONLY"]),
  markingMode: z.enum(["IMMEDIATE", "DEFERRED"]),
  resultVisibility: z.enum(VISIBILITY_MODES as unknown as [string, ...string[]]),
  answerKeyReleaseAt: z.string().datetime().nullable().optional(),
  allowedIntakes: z.array(z.string().min(1).max(60)).max(30),
  shuffleOptions: z.boolean().nullable().optional(),
  retakeCooldownMins: z.number().int().min(0).max(525600),
  randomRules: z.array(z.object({ count: z.number().int().min(1).max(200), topic: z.string().max(100).optional(), difficulty: z.enum(["easy", "medium", "hard"]).optional() })).max(10).nullable().optional(),
};
const createSchema = z.object({
  courseId: z.string(),
  type: z.enum(["FORMATIVE_QUIZ", "CAT"]).default("FORMATIVE_QUIZ"),
  title: settings.title,
  instructions: settings.instructions,
  durationMinutes: settings.durationMinutes,
  maxAttempts: settings.maxAttempts.default(1),
  scheduledAt: settings.scheduledAt,
  shuffleQuestions: settings.shuffleQuestions.default(false),
  passMarkPercent: settings.passMarkPercent,
  showFeedbackAfterSubmit: settings.showFeedbackAfterSubmit.optional(),
  opensAt: settings.opensAt,
  closesAt: settings.closesAt,
  gradingMethod: settings.gradingMethod.optional(),
  questionsPerPage: settings.questionsPerPage,
  navigationMode: settings.navigationMode.optional(),
  markingMode: settings.markingMode.optional(),
  resultVisibility: settings.resultVisibility.optional(),
  answerKeyReleaseAt: settings.answerKeyReleaseAt,
  allowedIntakes: settings.allowedIntakes.optional(),
  shuffleOptions: settings.shuffleOptions,
  retakeCooldownMins: settings.retakeCooldownMins.optional(),
  randomRules: settings.randomRules,
});
const patchSchema = z.object(settings).partial();

/** Cross-field rules a single zod field can't express. Returns a message or null. */
function settingsProblem(d: { opensAt?: string | null; closesAt?: string | null; answerKeyReleaseAt?: string | null; passMarkPercent?: number | null }): string | null {
  if (d.opensAt && d.closesAt && new Date(d.closesAt) <= new Date(d.opensAt)) return "The closing time must be after the opening time.";
  if (d.closesAt && d.answerKeyReleaseAt && new Date(d.answerKeyReleaseAt) < new Date(d.closesAt)) return "Answers can't be released before the quiz closes.";
  return null;
}

async function loadOwned(req: AuthedRequest, res: { status: (n: number) => { json: (b: unknown) => unknown } }, id: string) {
  const quiz = await prisma.assessment.findUnique({
    where: { id },
    include: { course: { select: { id: true, title: true, unitId: true } } },
  });
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

const submissionCount = (assessmentId: string) => prisma.submission.count({ where: { assessmentId } });
const LOCKED = "Students have already attempted this quiz, so its questions and marks are locked. Duplicate it to make a changed version.";

async function syncTotals(tx: any, assessmentId: string) {
  const links = await tx.assessmentQuestion.findMany({ where: { assessmentId }, include: { question: { select: { marks: true } } } });
  const total = links.reduce((s: number, l: { marks: number | null; question: { marks: number } }) => s + (l.marks ?? l.question.marks), 0);
  await tx.assessment.update({ where: { id: assessmentId }, data: { totalMarks: total } });
  return total;
}

// ---- question authoring ----------------------------------------------------
const configSchema = z
  .object({
    correct: z.array(z.string().max(500)).max(8).optional(),
    blanks: z.array(z.array(z.string().max(200)).max(10)).max(10).optional(),
    acceptedAnswers: z.array(z.string().max(500)).max(20).optional(),
    caseSensitive: z.boolean().optional(),
    numeric: z.object({ answer: z.number().finite(), tolerance: z.number().min(0).optional(), toleranceType: z.enum(["abs", "percent"]).optional(), unit: z.string().max(20).optional() }).optional(),
    pairs: z.array(z.object({ left: z.string().max(300), right: z.string().max(300) })).max(10).optional(),
    order: z.array(z.string().max(300)).max(12).optional(),
    partialCredit: z.boolean().optional(),
    negativeFraction: z.number().min(0).max(1).optional(),
    stem: z.string().max(8000).optional(),
    answerFeedback: z.record(z.string().max(500)).optional(),
    incorrectExplanation: z.string().max(2000).optional(),
    rubricHint: z.string().max(2000).optional(),
  })
  .strict();

export const questionInput = z.object({
  type: z.enum(QUESTION_TYPES as unknown as [string, ...string[]]),
  prompt: z.string().min(3).max(4000),
  options: z.array(z.string().max(500)).max(8).optional(),
  correctAnswer: z.string().max(500).optional(),
  marks: z.number().int().min(1).max(100).default(1),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  topic: z.string().max(100).optional(),
  explanation: z.string().max(2000).optional(),
  config: configSchema.optional(),
  mediaUrl: z.string().url().max(2000).nullable().optional(), // QZ016-018
  mediaKind: z.enum(["image", "audio", "video"]).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(12).optional(),
});

/** Turns authoring input into what the Question table stores; returns a message when it's invalid. */
export function normaliseQuestionInput(d: z.infer<typeof questionInput>) {
  if (d.mediaUrl && !d.mediaKind) return "Say whether the attached media is an image, audio or video.";
  if (d.mediaUrl && !/^https:\/\//i.test(d.mediaUrl) && !d.mediaUrl.startsWith("/api/media/")) return "Media must be an https link or an uploaded file.";
  return normaliseQuestion({ type: d.type, prompt: d.prompt, options: d.options, correctAnswer: d.correctAnswer, config: d.config as QuestionConfig | undefined });
}

const extras = (d: z.infer<typeof questionInput>) => ({
  mediaUrl: d.mediaUrl ?? null,
  mediaKind: d.mediaUrl ? d.mediaKind ?? null : null,
  tags: [...new Set((d.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))],
});

/** QZ040 — snapshot a question before it changes. */
async function snapshotQuestion(tx: any, q: any, editedById: string) {
  await tx.questionVersion.create({
    data: {
      questionId: q.id,
      version: q.version,
      editedById,
      snapshot: {
        type: q.type, prompt: q.prompt, options: q.options, correctAnswer: q.correctAnswer, marks: q.marks, difficulty: q.difficulty, topic: q.topic,
        explanation: q.explanation, config: q.config ?? null, mediaUrl: q.mediaUrl ?? null, mediaKind: q.mediaKind ?? null, tags: q.tags ?? [],
      },
    },
  });
}

// ---- lists & reads ----------------------------------------------------------
quizzesRouter.get("/course/:courseId", ...trainerOnly, async (req: AuthedRequest, res) => {
  if (!(await canTeachCourse(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  const quizzes = await prisma.assessment.findMany({
    where: { courseId: req.params.courseId, OR: [{ builderType: "QUIZ" }, { type: { in: ["FORMATIVE_QUIZ", "CAT"] } }] },
    include: { _count: { select: { questionLinks: true, submissions: true } } },
    orderBy: { title: "asc" },
  });
  res.json(
    quizzes.map((q: any) => ({
      id: q.id,
      title: q.title,
      type: q.type,
      isDraft: q.isDraft,
      totalMarks: q.totalMarks,
      durationMinutes: q.durationMinutes,
      maxAttempts: q.maxAttempts,
      scheduledAt: q.scheduledAt,
      opensAt: q.opensAt,
      closesAt: q.closesAt,
      randomDraws: parseRandomRules(q.randomRules).reduce((n, r) => n + r.count, 0),
      questionCount: q._count.questionLinks,
      attempts: q._count.submissions,
      usesUnitPool: q._count.questionLinks === 0, // an older assessment that draws from the whole unit bank
    }))
  );
});

async function fullQuiz(id: string) {
  const quiz = await prisma.assessment.findUnique({
    where: { id },
    include: {
      course: { select: { id: true, title: true, unitId: true } },
      questionLinks: { orderBy: { order: "asc" }, include: { question: true } },
      _count: { select: { submissions: true } },
    },
  });
  if (!quiz) return null;
  return {
    id: quiz.id,
    courseId: quiz.courseId,
    courseTitle: quiz.course.title,
    title: quiz.title,
    type: quiz.type,
    isDraft: quiz.isDraft,
    instructions: quiz.instructions,
    durationMinutes: quiz.durationMinutes,
    maxAttempts: quiz.maxAttempts,
    scheduledAt: quiz.scheduledAt,
    shuffleQuestions: quiz.shuffleQuestions,
    passMarkPercent: quiz.passMarkPercent,
    showFeedbackAfterSubmit: quiz.showFeedbackAfterSubmit,
    opensAt: quiz.opensAt,
    closesAt: quiz.closesAt,
    gradingMethod: quiz.gradingMethod,
    questionsPerPage: quiz.questionsPerPage,
    navigationMode: quiz.navigationMode,
    markingMode: quiz.markingMode,
    resultVisibility: quiz.resultVisibility,
    answerKeyReleaseAt: quiz.answerKeyReleaseAt,
    allowedIntakes: quiz.allowedIntakes,
    shuffleOptions: quiz.shuffleOptions,
    retakeCooldownMins: quiz.retakeCooldownMins,
    randomRules: parseRandomRules(quiz.randomRules),
    resultsPublished: quiz.resultsPublished,
    unitId: quiz.course.unitId,
    totalMarks: quiz.totalMarks,
    attempts: quiz._count.submissions,
    locked: quiz._count.submissions > 0,
    usesUnitPool: quiz.questionLinks.length === 0,
    questions: quiz.questionLinks.map((l: any) => ({
      questionId: l.questionId,
      order: l.order,
      marks: l.marks ?? l.question.marks,
      marksOverride: l.marks,
      type: l.question.type,
      prompt: l.question.prompt,
      options: l.question.options,
      correctAnswer: l.question.correctAnswer,
      explanation: l.question.explanation,
      difficulty: l.question.difficulty,
      topic: l.question.topic,
      approved: !!l.question.approvedById,
      config: l.question.config ?? null,
      mediaUrl: l.question.mediaUrl,
      mediaKind: l.question.mediaKind,
      tags: l.question.tags,
      version: l.question.version,
      autoMarked: isAutoMarkable({ type: l.question.type, correctAnswer: l.question.correctAnswer, config: l.question.config }),
    })),
  };
}

// The unit's question bank, for adding existing questions to a quiz.
quizzesRouter.get("/bank/:courseId", ...trainerOnly, async (req: AuthedRequest, res) => {
  if (!(await canTeachCourse(req.user!, req.params.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  const course = await prisma.course.findUnique({ where: { id: req.params.courseId }, select: { unitId: true } });
  if (!course) return res.status(404).json({ message: "Course not found." });
  const { q, type, difficulty, topic, tag, archived } = req.query as Record<string, string | undefined>;
  const questions = await prisma.question.findMany({
    where: {
      unitId: course.unitId,
      archivedAt: archived === "true" ? { not: null } : null,
      ...(q ? { prompt: { contains: q, mode: "insensitive" } } : {}),
      ...(type ? { type } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(topic ? { topic } : {}),
      ...(tag ? { tags: { has: tag.toLowerCase() } } : {}),
    },
    include: { _count: { select: { assessmentLinks: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(
    questions.map((x: any) => ({
      id: x.id,
      type: x.type,
      prompt: x.prompt,
      options: x.options,
      correctAnswer: x.correctAnswer,
      explanation: x.explanation,
      marks: x.marks,
      difficulty: x.difficulty,
      topic: x.topic,
      approved: !!x.approvedById,
      mine: x.createdById === req.user!.id,
      usedInQuizzes: x._count.assessmentLinks,
      config: x.config ?? null,
      mediaUrl: x.mediaUrl,
      mediaKind: x.mediaKind,
      tags: x.tags,
      version: x.version,
      archived: !!x.archivedAt,
    }))
  );
});

quizzesRouter.get("/:id", ...trainerOnly, async (req: AuthedRequest, res) => {
  if (!(await loadOwned(req, res, req.params.id))) return;
  res.json(await fullQuiz(req.params.id));
});

// ---- create / settings ---------------------------------------------------------
quizzesRouter.post("/", ...trainerOnly, async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Give the quiz a title (at least 2 characters).", issues: parsed.error.issues?.slice(0, 3) });
  const d = parsed.data;
  if (!(await canTeachCourse(req.user!, d.courseId))) return res.status(403).json({ message: "You don't teach this course." });
  const bad = settingsProblem(d);
  if (bad) return res.status(400).json({ message: bad });
  const quiz = await prisma.assessment.create({
    data: {
      courseId: d.courseId,
      title: d.title,
      type: d.type,
      builderType: "QUIZ",
      totalMarks: 0, // grows as questions are added
      requiresHumanModeration: d.type !== "FORMATIVE_QUIZ",
      isDraft: true,
      instructions: d.instructions ?? null,
      durationMinutes: d.durationMinutes ?? null,
      maxAttempts: d.maxAttempts,
      scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : null,
      shuffleQuestions: d.shuffleQuestions,
      passMarkPercent: d.passMarkPercent ?? null,
      showFeedbackAfterSubmit: d.showFeedbackAfterSubmit ?? d.type === "FORMATIVE_QUIZ",
      opensAt: d.opensAt ? new Date(d.opensAt) : null,
      closesAt: d.closesAt ? new Date(d.closesAt) : null,
      gradingMethod: d.gradingMethod ?? "HIGHEST",
      questionsPerPage: d.questionsPerPage ?? null,
      navigationMode: d.navigationMode ?? "FREE",
      markingMode: d.markingMode ?? "IMMEDIATE",
      resultVisibility: d.resultVisibility ?? "IMMEDIATE",
      answerKeyReleaseAt: d.answerKeyReleaseAt ? new Date(d.answerKeyReleaseAt) : null,
      allowedIntakes: d.allowedIntakes ?? [],
      shuffleOptions: d.shuffleOptions ?? null,
      retakeCooldownMins: d.retakeCooldownMins ?? 0,
      randomRules: d.randomRules && d.randomRules.length ? d.randomRules : undefined,
    },
  });
  res.status(201).json(await fullQuiz(quiz.id));
});

quizzesRouter.patch("/:id", ...trainerOnly, async (req: AuthedRequest, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid quiz settings.", issues: parsed.error.issues?.slice(0, 3) });
  const quizRow = await loadOwned(req, res, req.params.id);
  if (!quizRow) return;
  const d = parsed.data;
  const data: Record<string, unknown> = {};
  for (const k of ["title", "instructions", "durationMinutes", "maxAttempts", "shuffleQuestions", "passMarkPercent", "showFeedbackAfterSubmit", "gradingMethod", "questionsPerPage", "navigationMode", "markingMode", "resultVisibility", "allowedIntakes", "shuffleOptions", "retakeCooldownMins"] as const) {
    if (d[k] !== undefined) data[k] = d[k];
  }
  for (const k of ["scheduledAt", "opensAt", "closesAt", "answerKeyReleaseAt"] as const) {
    if (d[k] !== undefined) data[k] = d[k] ? new Date(d[k] as string) : null;
  }
  if (d.randomRules !== undefined) data.randomRules = d.randomRules && d.randomRules.length ? d.randomRules : Prisma.JsonNull;
  // validate dates against what's already stored, so changing one field can't create an impossible pair
  const merged = {
    opensAt: d.opensAt !== undefined ? d.opensAt : quizRow.opensAt?.toISOString() ?? null,
    closesAt: d.closesAt !== undefined ? d.closesAt : quizRow.closesAt?.toISOString() ?? null,
    answerKeyReleaseAt: d.answerKeyReleaseAt !== undefined ? d.answerKeyReleaseAt : quizRow.answerKeyReleaseAt?.toISOString() ?? null,
  };
  const bad = settingsProblem(merged);
  if (bad) return res.status(400).json({ message: bad });
  await prisma.assessment.update({ where: { id: req.params.id }, data });
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: "quiz.settings.update", entityType: "Assessment", entityId: req.params.id, metadata: { fields: Object.keys(data) } as any } }).catch(() => undefined);
  res.json(await fullQuiz(req.params.id));
});

// ---- questions ---------------------------------------------------------------------
// Replace the quiz's ordered question list. Array order is the delivery order.
quizzesRouter.put("/:id/questions", ...trainerOnly, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({ items: z.array(z.object({ questionId: z.string(), marks: z.number().int().min(1).max(100).nullable().optional() })).max(200) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid question list." });
  const quiz = await loadOwned(req, res, req.params.id);
  if (!quiz) return;
  if ((await submissionCount(quiz.id)) > 0) return res.status(409).json({ message: LOCKED });

  const items = parsed.data.items;
  if (new Set(items.map((i) => i.questionId)).size !== items.length) return res.status(400).json({ message: "A question can only appear once in a quiz." });

  const questions = await prisma.question.findMany({ where: { id: { in: items.map((i) => i.questionId) } } });
  if (questions.length !== items.length || questions.some((q: { unitId: string }) => q.unitId !== quiz.course.unitId)) {
    return res.status(400).json({ message: "Every question must come from this course's unit question bank." });
  }
  if (!quiz.isDraft && quiz.type !== "FORMATIVE_QUIZ" && questions.some((q: { approvedById: string | null }) => !q.approvedById)) {
    return res.status(409).json({ message: "A published assessment may only contain examination-office-approved questions." });
  }

  await prisma.$transaction(async (tx) => {
    await tx.assessmentQuestion.deleteMany({ where: { assessmentId: quiz.id } });
    if (items.length > 0) {
      await tx.assessmentQuestion.createMany({
        data: items.map((it, i) => ({ assessmentId: quiz.id, questionId: it.questionId, order: i + 1, marks: it.marks ?? null })),
      });
    }
    await syncTotals(tx, quiz.id);
  });
  res.json(await fullQuiz(quiz.id));
});

// Write a brand-new question and append it to this quiz in one step.
quizzesRouter.post("/:id/questions/new", ...trainerOnly, async (req: AuthedRequest, res) => {
  const parsed = questionInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid question.", issues: parsed.error.issues?.slice(0, 3) });
  const quiz = await loadOwned(req, res, req.params.id);
  if (!quiz) return;
  if ((await submissionCount(quiz.id)) > 0) return res.status(409).json({ message: LOCKED });

  const norm = normaliseQuestionInput(parsed.data);
  if (typeof norm === "string") return res.status(400).json({ message: norm });

  await prisma.$transaction(async (tx) => {
    const question = await tx.question.create({
      data: {
        unitId: quiz.course.unitId,
        type: norm.type,
        prompt: parsed.data.prompt.trim(),
        options: norm.options,
        correctAnswer: norm.correctAnswer,
        marks: parsed.data.marks,
        difficulty: parsed.data.difficulty,
        topic: parsed.data.topic?.trim() || null,
        explanation: parsed.data.explanation?.trim() || null,
        config: norm.config ? (norm.config as any) : Prisma.JsonNull,
        ...extras(parsed.data),
        createdById: req.user!.id,
        // Not examination-office approved: fine for a formative quiz; a CAT can't be published with it.
      },
    });
    const last = await tx.assessmentQuestion.aggregate({ where: { assessmentId: quiz.id }, _max: { order: true } });
    await tx.assessmentQuestion.create({ data: { assessmentId: quiz.id, questionId: question.id, order: (last._max.order ?? 0) + 1 } });
    await syncTotals(tx, quiz.id);
  });
  res.status(201).json(await fullQuiz(quiz.id));
});

// Edit a question (only its author, and only while it isn't in a published quiz).
quizzesRouter.patch("/questions/:questionId", ...trainerOnly, async (req: AuthedRequest, res) => {
  const parsed = questionInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid question.", issues: parsed.error.issues?.slice(0, 3) });
  const question = await prisma.question.findUnique({ where: { id: req.params.questionId } });
  if (!question) return res.status(404).json({ message: "Question not found." });
  if (question.createdById !== req.user!.id && req.user!.role !== "SUPER_ADMIN") {
    return res.status(403).json({ message: "Only the question's author can edit it." });
  }
  const links = await prisma.assessmentQuestion.findMany({ where: { questionId: question.id }, include: { assessment: { select: { isDraft: true, title: true } } } });
  const live = links.filter((l: { assessment: { isDraft: boolean } }) => !l.assessment.isDraft);
  if (live.length > 0) {
    return res.status(409).json({ message: `This question is in a published quiz (${live.map((l: { assessment: { title: string } }) => l.assessment.title).join(", ")}). Unpublish it or write a new question.` });
  }
  const norm = normaliseQuestionInput(parsed.data);
  if (typeof norm === "string") return res.status(400).json({ message: norm });

  const updated = await prisma.$transaction(async (tx) => {
    await snapshotQuestion(tx, question, req.user!.id); // QZ040 — the old wording stays restorable
    const u = await tx.question.update({
      where: { id: question.id },
      data: {
        type: norm.type,
        prompt: parsed.data.prompt.trim(),
        options: norm.options,
        correctAnswer: norm.correctAnswer,
        marks: parsed.data.marks,
        difficulty: parsed.data.difficulty,
        topic: parsed.data.topic?.trim() || null,
        explanation: parsed.data.explanation?.trim() || null,
        config: norm.config ? (norm.config as any) : Prisma.JsonNull,
        ...extras(parsed.data),
        version: { increment: 1 },
        updatedAt: new Date(),
        approvedById: null, // changed content needs the examination office to approve it again
      },
    });
    for (const l of links) await syncTotals(tx, (l as { assessmentId: string }).assessmentId);
    return u;
  });
  res.json(updated);
});

// ---- publish / unpublish / delete / duplicate ------------------------------------------
quizzesRouter.post("/:id/publish", ...trainerOnly, async (req: AuthedRequest, res) => {
  const quiz = await loadOwned(req, res, req.params.id);
  if (!quiz) return;
  const links = await prisma.assessmentQuestion.findMany({ where: { assessmentId: quiz.id }, include: { question: true } });
  const problems: string[] = [];
  if (links.length === 0) problems.push("Add at least one question.");
  if (quiz.type !== "FORMATIVE_QUIZ") {
    const unapproved = links.filter((l: any) => !l.question.approvedById).length;
    if (unapproved > 0) problems.push(`${unapproved} question(s) still need examination-office approval before a CAT can be published.`);
  }
  links.forEach((l: any, i: number) => {
    // Re-run the authoring rules on what is stored, so a hand-edited / imported row can't go live broken.
    const q = l.question;
    const check = normaliseQuestion({
      type: q.type === "mcq" && q.options.length === 2 && q.options[0] === "True" && q.options[1] === "False" ? "true_false" : q.type,
      prompt: q.prompt, options: q.options, correctAnswer: q.correctAnswer ?? undefined, config: (q.config as QuestionConfig | null) ?? undefined,
    });
    if (typeof check === "string") problems.push(`Question ${i + 1}: ${check}`);
  });
  const rules = parseRandomRules(quiz.randomRules);
  if (rules.length > 0) {
    // QZ035 — every rule must be satisfiable from the unit bank, or students would silently get a shorter quiz.
    const fixed = new Set(links.map((l: any) => l.questionId));
    const pool = await prisma.question.findMany({
      where: { unitId: quiz.course.unitId, archivedAt: null, ...(quiz.type !== "FORMATIVE_QUIZ" ? { approvedById: { not: null } } : {}) },
      select: { id: true, topic: true, difficulty: true },
    });
    const available = pool.filter((q: { id: string }) => !fixed.has(q.id));
    rules.forEach((r, i) => {
      const n = available.filter((q: { topic: string | null; difficulty: string }) => (!r.topic || q.topic === r.topic) && (!r.difficulty || q.difficulty === r.difficulty)).length;
      if (n < r.count) problems.push(`Random rule ${i + 1} asks for ${r.count} question(s) but only ${n} match in the bank.`);
    });
  }
  if (rules.length > 0 && links.length === 0) {
    const i = problems.indexOf("Add at least one question.");
    if (i >= 0) problems.splice(i, 1);
  }
  if (problems.length > 0) return res.status(400).json({ message: problems[0], problems });
  await prisma.assessment.update({ where: { id: quiz.id }, data: { isDraft: false } });
  res.json(await fullQuiz(quiz.id));
});

quizzesRouter.post("/:id/unpublish", ...trainerOnly, async (req: AuthedRequest, res) => {
  const quiz = await loadOwned(req, res, req.params.id);
  if (!quiz) return;
  if ((await submissionCount(quiz.id)) > 0) return res.status(409).json({ message: "Students have already attempted this quiz, so it can't be taken offline." });
  await prisma.assessment.update({ where: { id: quiz.id }, data: { isDraft: true } });
  res.json(await fullQuiz(quiz.id));
});

quizzesRouter.delete("/:id", ...trainerOnly, async (req: AuthedRequest, res) => {
  const quiz = await loadOwned(req, res, req.params.id);
  if (!quiz) return;
  if ((await submissionCount(quiz.id)) > 0) return res.status(409).json({ message: "Students have attempted this quiz, so it can't be deleted." });
  try {
    await prisma.$transaction([
      prisma.examSession.deleteMany({ where: { assessmentId: quiz.id } }),
      prisma.assessment.delete({ where: { id: quiz.id } }), // its question links cascade
    ]);
  } catch {
    return res.status(409).json({ message: "Other records (rubric, incidents, approvals) depend on this quiz. Unpublish it instead." });
  }
  res.status(204).send();
});

quizzesRouter.post("/:id/duplicate", ...trainerOnly, async (req: AuthedRequest, res) => {
  const quiz = await loadOwned(req, res, req.params.id);
  if (!quiz) return;
  const links = await prisma.assessmentQuestion.findMany({ where: { assessmentId: quiz.id }, orderBy: { order: "asc" } });
  const copy = await prisma.assessment.create({
    data: {
      courseId: quiz.courseId,
      title: `${quiz.title} (copy)`.slice(0, 200),
      type: quiz.type,
      builderType: "QUIZ",
      totalMarks: quiz.totalMarks,
      requiresHumanModeration: quiz.requiresHumanModeration,
      isDraft: true,
      instructions: quiz.instructions,
      durationMinutes: quiz.durationMinutes,
      maxAttempts: quiz.maxAttempts,
      shuffleQuestions: quiz.shuffleQuestions,
      passMarkPercent: quiz.passMarkPercent,
      showFeedbackAfterSubmit: quiz.showFeedbackAfterSubmit,
      opensAt: quiz.opensAt,
      closesAt: quiz.closesAt,
      gradingMethod: quiz.gradingMethod,
      questionsPerPage: quiz.questionsPerPage,
      navigationMode: quiz.navigationMode,
      markingMode: quiz.markingMode,
      resultVisibility: quiz.resultVisibility,
      answerKeyReleaseAt: quiz.answerKeyReleaseAt,
      allowedIntakes: quiz.allowedIntakes,
      shuffleOptions: quiz.shuffleOptions,
      retakeCooldownMins: quiz.retakeCooldownMins,
      randomRules: quiz.randomRules ?? undefined,
      questionLinks: { create: links.map((l: any) => ({ questionId: l.questionId, order: l.order, marks: l.marks })) },
    },
  });
  res.status(201).json(await fullQuiz(copy.id));
});

// The quiz exactly as a student receives it (no answer key, nothing recorded).
quizzesRouter.get("/:id/preview", ...trainerOnly, async (req: AuthedRequest, res) => {
  const quiz = await loadOwned(req, res, req.params.id);
  if (!quiz) return;
  const resolved = await resolveQuizQuestions(quiz, quiz.course.unitId, { seed: req.user!.id });
  res.json({
    assessment: {
      id: quiz.id,
      title: quiz.title,
      type: quiz.type,
      totalMarks: quiz.totalMarks,
      durationMinutes: quiz.durationMinutes,
      instructions: quiz.instructions,
      unitTitle: "",
      questionsPerPage: quiz.questionsPerPage,
      navigationMode: quiz.navigationMode,
    },
    questions: resolved.questions.map((q) => toStudentQuestion(q, req.user!.id)),
  });
});

// ---- item analysis (QZ073 / QZ076 / QZ077) -------------------------------------------------
quizzesRouter.get("/:id/analytics", ...trainerOnly, async (req: AuthedRequest, res) => {
  const quiz = await loadOwned(req, res, req.params.id);
  if (!quiz) return;
  const [submissions, responses, resolved] = await Promise.all([
    prisma.submission.findMany({ where: { assessmentId: quiz.id }, select: { id: true, score: true, studentUserId: true, submittedAt: true } }),
    prisma.questionResponse.findMany({ where: { submission: { assessmentId: quiz.id } }, select: { submissionId: true, questionId: true, answerGiven: true, isCorrect: true, marksAwarded: true } }),
    resolveQuizQuestions(quiz, quiz.course.unitId),
  ]);
  const random = parseRandomRules(quiz.randomRules).length > 0;
  // Random draws mean the "question set" is whatever students actually saw.
  const marksById = new Map<string, number>(resolved.questions.map((q) => [q.id, q.marks]));
  const extraIds = [...new Set(responses.map((r: { questionId: string }) => r.questionId))].filter((id) => !marksById.has(id));
  const extraRows = extraIds.length ? await prisma.question.findMany({ where: { id: { in: extraIds as string[] } } }) : [];
  const questions = [
    ...resolved.questions.map((q) => ({ id: q.id, prompt: q.prompt, type: q.type, marks: q.marks, options: q.options, topic: q.topic, config: q.config, correctAnswer: q.correctAnswer, difficulty: q.difficulty })),
    ...extraRows.map((q: any) => ({ id: q.id, prompt: q.prompt, type: q.type, marks: q.marks, options: q.options as string[], topic: q.topic as string | null, config: q.config as QuestionConfig | null, correctAnswer: q.correctAnswer as string | null, difficulty: q.difficulty as string })),
  ];

  const attempts = submissions.length;
  const scored = submissions.filter((s: { score: number | null }) => s.score !== null) as { id: string; score: number; studentUserId: string; submittedAt: Date }[];
  const pct = (score: number) => (quiz.totalMarks > 0 ? (score / quiz.totalMarks) * 100 : 0);
  const percents = scored.map((s) => pct(s.score)).sort((a, b) => a - b);
  const passLine = quiz.passMarkPercent ?? 50;
  const buckets = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i === 9 ? 100 : i * 10 + 9, count: 0 }));
  for (const p of percents) buckets[Math.min(9, Math.floor(p / 10))].count++;
  const totalBySub = new Map<string, number>(scored.map((s) => [s.id, pct(s.score)]));
  const clamp = (n: number) => Math.min(1, Math.max(0, n));

  const perQuestion = questions.map((q) => {
    const rs = responses.filter((r: { questionId: string }) => r.questionId === q.id) as { submissionId: string; answerGiven: string; isCorrect: boolean | null; marksAwarded: number | null }[];
    const correct = rs.filter((r) => r.isCorrect === true).length;
    const denominator = random ? rs.length : attempts;
    const optionCounts: Record<string, number> = {};
    if (q.type === "mcq" || q.type === "mcq_multi") {
      for (const o of q.options) optionCounts[o] = 0;
      for (const r of rs) {
        let picked: string[] = [r.answerGiven];
        if (q.type === "mcq_multi") picked = (() => { try { const v = JSON.parse(r.answerGiven); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } })();
        for (const pk of picked) {
          const match = q.options.find((o) => normaliseAnswer(o) === normaliseAnswer(pk));
          if (match) optionCounts[match]++;
        }
      }
    }
    const marked = rs.filter((r) => r.marksAwarded !== null);
    const stats = itemStats(marked.map((r) => ({ total: totalBySub.get(r.submissionId) ?? 0, got: clamp((r.marksAwarded ?? 0) / Math.max(1, q.marks)) })));
    const auto = isAutoMarkable({ type: q.type, correctAnswer: q.correctAnswer, config: q.config });
    return {
      questionId: q.id,
      prompt: q.prompt,
      type: q.type,
      topic: q.topic,
      marks: q.marks,
      answered: rs.length,
      correct,
      percentCorrect: auto && denominator > 0 ? round2((correct / denominator) * 100) : null,
      correctAnswer: auto ? describeCorrect({ id: q.id, type: q.type, marks: q.marks, correctAnswer: q.correctAnswer, options: q.options, config: q.config }) : null,
      optionCounts: Object.keys(optionCounts).length ? optionCounts : null,
      difficultyIndex: stats.difficultyIndex, // share of marks earned (higher = easier)
      discrimination: stats.discrimination, // top-27% minus bottom-27% (≥0.3 is good)
      flag: auto ? classifyItem(stats.difficultyIndex, stats.discrimination) : "insufficient_data",
    };
  });

  // QZ073 — performance by topic
  const topicAgg = new Map<string, { sum: number; n: number }>();
  for (const q of perQuestion) {
    if (!q.topic || q.difficultyIndex === null) continue;
    const t = topicAgg.get(q.topic) ?? { sum: 0, n: 0 };
    t.sum += q.difficultyIndex;
    t.n++;
    topicAgg.set(q.topic, t);
  }
  const reports = await prisma.questionReport.groupBy({ by: ["questionId"], where: { assessmentId: quiz.id, status: "open" }, _count: { _all: true } });
  const openReports = new Map<string, number>(reports.map((r: { questionId: string; _count: { _all: number } }) => [r.questionId, r._count._all]));

  res.json({
    attempts,
    students: new Set(submissions.map((s: { studentUserId: string }) => s.studentUserId)).size,
    gradedAttempts: scored.length,
    ungradedAttempts: attempts - scored.length,
    meanPercent: percents.length ? round2(percents.reduce((a, b) => a + b, 0) / percents.length) : null,
    medianPercent: percents.length ? round2(percents[Math.floor(percents.length / 2)]) : null,
    highestPercent: percents.length ? round2(percents[percents.length - 1]) : null,
    lowestPercent: percents.length ? round2(percents[0]) : null,
    passLinePercent: passLine,
    passRatePercent: percents.length ? round2((percents.filter((p) => p >= passLine).length / percents.length) * 100) : null,
    distribution: buckets,
    byTopic: [...topicAgg.entries()].map(([topic, v]) => ({ topic, averagePercent: round2((v.sum / v.n) * 100), questions: v.n })).sort((a, b) => a.averagePercent - b.averagePercent),
    questions: perQuestion.map((q) => ({ ...q, openReports: openReports.get(q.questionId) ?? 0 })),
  });
});
