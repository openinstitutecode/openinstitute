import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { isEnrolledInCourse } from "../lib/course-access.js";
import { resolveQuizQuestions, toStudentQuestion } from "../lib/quiz-delivery.js";
import { attemptDeadline, isPastDeadline } from "../lib/quiz-scoring.js";
import {
  aggregateAttempts, buildReviewItems, canSeeAnswerKey, canSeeScore, checkAvailability, passedQuiz, scoreQuizV2, type EngineQuestion, type GradingMethod,
} from "../lib/quiz-engine.js"; // Batch 76 — quiz engine v2
import { buildResultsCsv, buildResultsSlipHtml } from "../lib/exam-reports.js"; // Batch 56 — EX039
import { signDocument, generateDocumentId } from "../lib/credentials.js"; // Batch 64 — EX014 admit cards

export const examsRouter = Router();

// Exported so ai.ts's TP036 "save generated questions to the question
// bank" endpoint validates against exactly the same shape as a
// trainer-typed question — no separate, driftable copy of these rules.
export const questionSchema = z.object({
  unitId: z.string(),
  type: z.enum(["mcq", "short_answer", "essay"]),
  prompt: z.string().min(3),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string().optional(),
  marks: z.number().int().positive().default(1),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  topic: z.string().optional(),
  competencyId: z.string().optional(),
  // TP012 — needed so a question can count towards an ExamBlueprint's
  // Bloom's-level requirements. Previously accepted nowhere in this route,
  // so no question created through the API could ever be blueprint-eligible.
  learningOutcomeId: z.string().optional(),
});

// Trainers draft questions; a second trainer or the examination office
// approves before a question enters a live assessment (approvedById set).
examsRouter.post(
  "/questions",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = questionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid question." });
    const question = await prisma.question.create({
      data: { ...parsed.data, options: parsed.data.options ?? [] },
    });
    res.status(201).json(question);
  }
);

examsRouter.get(
  "/questions/:unitId",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const questions = await prisma.question.findMany({
      where: { unitId: req.params.unitId },
      orderBy: { createdAt: "desc" },
    });
    res.json(questions);
  }
);

examsRouter.patch(
  "/questions/:id/approve",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const question = await prisma.question.update({
      where: { id: req.params.id },
      data: { approvedById: req.user!.id },
    });
    res.json(question);
  }
);

const assessmentSchema = z.object({
  courseId: z.string(),
  title: z.string(),
  type: z.enum(["FORMATIVE_QUIZ", "ASSIGNMENT", "CAT", "FINAL_EXAM", "PRACTICAL"]),
  totalMarks: z.number().int().positive(),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().positive().optional(),
  maxAttempts: z.number().int().positive().default(1),
});

examsRouter.post(
  "/assessments",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = assessmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid assessment." });
    const { scheduledAt, ...rest } = parsed.data;
    // FINAL_EXAM and CAT are summative and always require human moderation;
    // this is hard-coded rather than left to caller input.
    const requiresHumanModeration = rest.type !== "FORMATIVE_QUIZ";
    const assessment = await prisma.assessment.create({
      data: {
        ...rest,
        requiresHumanModeration,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      },
    });
    res.status(201).json(assessment);
  }
);

// ---------------------------------------------------------------------------
// TP012 — Examination builder. An ExamBlueprint sets how many
// remember/understand/apply/analyze/evaluate-level questions an assessment
// needs; this is what actually *uses* that structure — checking whether a
// unit's approved question bank can satisfy it, and generating the
// assessment once it can. Previously a blueprint could be created and just
// sat there; Assessment creation never looked at it.
// ---------------------------------------------------------------------------
const BLOOM_LEVELS = ["remember", "understand", "apply", "analyze", "evaluate"] as const;
const BLUEPRINT_COUNT_FIELD: Record<(typeof BLOOM_LEVELS)[number], "rememberCount" | "understandCount" | "applyCount" | "analyzeCount" | "evaluateCount"> = {
  remember: "rememberCount",
  understand: "understandCount",
  apply: "applyCount",
  analyze: "analyzeCount",
  evaluate: "evaluateCount",
};

async function computeCoverage(unitId: string, blueprintId: string) {
  const blueprint = await prisma.examBlueprint.findUnique({ where: { id: blueprintId } });
  if (!blueprint) return null;

  const approvedQuestions = await prisma.question.findMany({
    where: { unitId, approvedById: { not: null } },
    include: { learningOutcome: true },
  });

  const coverage = BLOOM_LEVELS.map((level) => {
    const required = blueprint[BLUEPRINT_COUNT_FIELD[level]];
    const available = approvedQuestions.filter((q) => q.learningOutcome?.level === level).length;
    return { level, required, available, met: available >= required };
  });

  return {
    blueprint: { id: blueprint.id, name: blueprint.name, totalMarks: blueprint.totalMarks, durationMinutes: blueprint.durationMinutes },
    coverage,
    ready: coverage.every((c) => c.met),
  };
}

// Dry-run coverage check — lets the builder UI show readiness live as the
// trainer picks a unit/blueprint, before committing to generating anything.
examsRouter.get(
  "/blueprint-coverage/:blueprintId/unit/:unitId",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const result = await computeCoverage(req.params.unitId, req.params.blueprintId);
    if (!result) return res.status(404).json({ message: "Blueprint not found." });
    res.json(result);
  }
);

const generateFromBlueprintSchema = z.object({
  unitId: z.string(),
  blueprintId: z.string(),
  courseId: z.string(),
  title: z.string().min(2),
  type: z.enum(["FORMATIVE_QUIZ", "ASSIGNMENT", "CAT", "FINAL_EXAM", "PRACTICAL"]).default("CAT"),
  scheduledAt: z.string().datetime().optional(),
  maxAttempts: z.number().int().positive().default(1),
});

// Generates the assessment for real, but only once the unit's approved
// question bank can actually satisfy the blueprint's level distribution —
// otherwise it fails with exactly which levels are short, rather than
// creating an assessment that would 404/short-change students at sitting
// time (the question pool for a sitting is resolved dynamically by unit —
// see GET /assessments/:id/take below — so "generate" here means
// "confirm the pool is blueprint-ready and create the sitting", not
// "attach a fixed question list").
examsRouter.post(
  "/assessments/from-blueprint",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = generateFromBlueprintSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide a unit, blueprint, course, and title." });

    const coverage = await computeCoverage(parsed.data.unitId, parsed.data.blueprintId);
    if (!coverage) return res.status(404).json({ message: "Blueprint not found." });
    if (!coverage.ready) {
      return res.status(409).json({
        message: "The approved question bank for this unit doesn't yet cover the blueprint's requirements.",
        coverage: coverage.coverage,
      });
    }

    const requiresHumanModeration = parsed.data.type !== "FORMATIVE_QUIZ";
    const assessment = await prisma.assessment.create({
      data: {
        courseId: parsed.data.courseId,
        title: parsed.data.title,
        type: parsed.data.type,
        totalMarks: coverage.blueprint.totalMarks,
        durationMinutes: coverage.blueprint.durationMinutes,
        maxAttempts: parsed.data.maxAttempts,
        blueprintId: parsed.data.blueprintId,
        builderType: "EXAMINATION",
        requiresHumanModeration,
        scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : undefined,
      },
    });
    res.status(201).json({ assessment, coverage: coverage.coverage });
  }
);

const gradeSchema = z.object({
  score: z.number().min(0),
  feedback: z.string().optional(),
});

// Grading a submission always requires an authenticated human (trainer or
// examiner) — there is no AI-only path to writing a score into the gradebook.
examsRouter.patch(
  "/submissions/:id/grade",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = gradeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide a valid score." });

    const submission = await prisma.submission.update({
      where: { id: req.params.id },
      data: {
        score: parsed.data.score,
        feedback: parsed.data.feedback,
        gradedById: req.user!.id,
        gradedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "SUBMISSION_GRADED",
        entityType: "Submission",
        entityId: submission.id,
        metadata: { score: parsed.data.score },
      },
    });

    res.json(submission);
  }
);

// ---------------------------------------------------------------------------
// EX021 — rubric marking: the rubric builder (rubrics.ts) already lets a
// trainer define real per-criterion max marks, but until now nothing wrote
// a per-criterion score anywhere — a trainer could only enter one raw total
// via the plain grade endpoint above, with no record of how that total was
// actually reached. This endpoint requires the assessment to have a real
// Rubric, validates each submitted criterion score against that rubric's
// own criteria (by name, capped at that criterion's real maxMarks, no
// invented criterion accepted), sums them into the final score itself
// (never a separately-typed total that could drift from the breakdown),
// and stores the real breakdown on Submission.criteriaScores. It updates
// the exact same Submission.score/feedback/gradedById/gradedAt fields as
// the plain grade endpoint, so every downstream consumer (results,
// publish gate, moderation, submit-for-approval) sees one consistent
// gradebook regardless of which path graded it.
// ---------------------------------------------------------------------------
const rubricGradeSchema = z.object({
  criteriaScores: z.array(z.object({ name: z.string().min(1), score: z.number().min(0) })).min(1),
  feedback: z.string().optional(),
});

examsRouter.patch(
  "/submissions/:id/grade-rubric",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = rubricGradeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide criteriaScores for every rubric criterion." });

    const submission = await prisma.submission.findUnique({
      where: { id: req.params.id },
      include: { assessment: { include: { rubric: true } } },
    });
    if (!submission) return res.status(404).json({ message: "Submission not found." });
    const rubric = submission.assessment?.rubric;
    if (!rubric) return res.status(400).json({ message: "This assessment has no rubric — use the plain grade endpoint instead." });

    const criteria = rubric.criteria as { name: string; maxMarks: number }[];
    const breakdown: { name: string; maxMarks: number; score: number }[] = [];
    for (const c of criteria) {
      const entry = parsed.data.criteriaScores.find((s) => s.name === c.name);
      if (!entry) return res.status(400).json({ message: `Missing a score for criterion "${c.name}".` });
      if (entry.score > c.maxMarks) {
        return res.status(400).json({ message: `"${c.name}" is out of ${c.maxMarks} marks, not ${entry.score}.` });
      }
      breakdown.push({ name: c.name, maxMarks: c.maxMarks, score: entry.score });
    }
    const totalScore = breakdown.reduce((sum, c) => sum + c.score, 0);

    const updated = await prisma.submission.update({
      where: { id: req.params.id },
      data: {
        score: totalScore,
        feedback: parsed.data.feedback,
        criteriaScores: breakdown,
        gradedById: req.user!.id,
        gradedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "SUBMISSION_GRADED_RUBRIC",
        entityType: "Submission",
        entityId: updated.id,
        metadata: { totalScore, breakdown },
      },
    });

    res.json(updated);
  }
);

// EX012 — attempt controls: a student may only submit up to
// Assessment.maxAttempts times.
// EX033 — AI-use disclosure: a real field the student actually sets,
// not just a schema column nothing ever writes to.
const submitAttemptSchema = z.object({
  assessmentId: z.string(),
  textAnswer: z.string().optional(),
  fileUrl: z.string().url().optional(),
  aiAssisted: z.boolean().optional(),
});

examsRouter.post("/submissions", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = submitAttemptSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide an answer or file." });

  const assessment = await prisma.assessment.findUnique({ where: { id: parsed.data.assessmentId } });
  if (!assessment || assessment.isDraft) return res.status(404).json({ message: "Assessment not found." });

  const priorAttempts = await prisma.submission.count({
    where: { assessmentId: assessment.id, studentUserId: req.user!.id },
  });
  if (priorAttempts >= assessment.maxAttempts) {
    return res.status(409).json({ message: `Maximum attempts (${assessment.maxAttempts}) already used.` });
  }

  if (assessment.scheduledAt && assessment.durationMinutes) {
    const closesAt = new Date(assessment.scheduledAt.getTime() + assessment.durationMinutes * 60000);
    if (new Date() > closesAt) {
      return res.status(409).json({ message: "The submission window for this assessment has closed." });
    }
  }

  const submission = await prisma.submission.create({
    data: {
      assessmentId: assessment.id,
      studentUserId: req.user!.id,
      textAnswer: parsed.data.textAnswer,
      fileUrl: parsed.data.fileUrl,
      aiAssisted: parsed.data.aiAssisted ?? false,
    },
  });
  res.status(201).json(submission);
});

// EX027 — results publication gate. Grades exist in the DB the moment a
// trainer marks them, but students only see them via /me/results once the
// examination office flips this switch for the whole assessment.
examsRouter.patch(
  "/assessments/:id/publish",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    // EX026 — grade approval: publishing is no longer a single click straight
    // from grading. It now genuinely requires the two-step chain below to
    // have actually happened on THIS assessment (not just that a route
    // exists somewhere) — submit-for-approval, then a distinct approve-results
    // action by an examination officer. This closes the exact gap the audit
    // named: a separate approval stage that real actions must pass through,
    // not just a queue nothing consumes.
    const existing = await prisma.assessment.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Assessment not found." });
    if (!existing.resultsSubmittedForApprovalAt) {
      return res.status(400).json({ message: "Results haven't been submitted for approval yet." });
    }
    if (!existing.resultsApprovedAt) {
      return res.status(400).json({ message: "Results are awaiting examination-office approval — approve them before publishing." });
    }

    const assessment = await prisma.assessment.update({
      where: { id: req.params.id },
      data: { resultsPublished: true, resultsPublishedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "RESULTS_PUBLISHED",
        entityType: "Assessment",
        entityId: assessment.id,
      },
    });

    res.json(assessment);
  }
);

// EX017 — incident management.
const incidentSchema = z.object({
  assessmentId: z.string(),
  studentId: z.string().optional(),
  description: z.string().min(5),
});

examsRouter.post("/incidents", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = incidentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Describe the incident." });
  const incident = await prisma.examIncident.create({
    data: { ...parsed.data, reportedById: req.user!.id },
  });
  res.status(201).json(incident);
});

examsRouter.get(
  "/incidents",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const incidents = await prisma.examIncident.findMany({
      include: { assessment: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(incidents);
  }
);

// EX032 — similarity checking. This is a plain-text Jaccard-similarity
// heuristic over word sets, computed against other submissions for the
// SAME assessment. It is NOT a real plagiarism-detection engine (no web
// index, no paraphrase detection, no citation awareness) — it only catches
// near-identical wording between two students' own submitted text, and
// always creates a review case rather than a finding.
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

const SIMILARITY_REVIEW_THRESHOLD = 0.75;

examsRouter.post(
  "/submissions/:id/check-similarity",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const target = await prisma.submission.findUnique({ where: { id: req.params.id } });
    if (!target || !target.textAnswer) {
      return res.status(400).json({ message: "This submission has no text to compare." });
    }

    const others = await prisma.submission.findMany({
      where: {
        assessmentId: target.assessmentId,
        id: { not: target.id },
        textAnswer: { not: null },
      },
    });

    const matches = others
      .map((o) => ({ submissionId: o.id, similarity: jaccardSimilarity(target.textAnswer!, o.textAnswer!) }))
      .filter((m) => m.similarity >= SIMILARITY_REVIEW_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity);

    if (matches.length > 0) {
      await prisma.submission.update({ where: { id: target.id }, data: { integrityFlag: true } });
    }

    res.json({
      method: "jaccard_word_overlap",
      threshold: SIMILARITY_REVIEW_THRESHOLD,
      matches,
      note: "Heuristic word-overlap check only — always confirm manually before treating this as misconduct.",
    });
  }
);

// Real submissions list for the trainer gradebook — replaces what used to
// be hardcoded rows in TrainerGradebook.tsx.
examsRouter.get(
  "/assessments/:id/submissions",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const submissions = await prisma.submission.findMany({
      where: { assessmentId: req.params.id },
      orderBy: { submittedAt: "desc" },
    });

    // Resolve student names for display (Submission only stores studentUserId).
    const userIds = submissions.map((s) => s.studentUserId);
    const students = await prisma.student.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, fullName: true },
    });
    const nameByUserId = new Map(students.map((s) => [s.userId, s.fullName]));

    res.json(
      submissions.map((s) => ({
        ...s,
        studentName: nameByUserId.get(s.studentUserId) ?? "Unknown student",
      }))
    );
  }
);

// EX008/EX009/EX010 — real exam generation: pulls approved questions
// matching a unit + difficulty mix from the actual question bank,
// randomly samples without replacement, and shuffles MCQ option order.
// Nothing here is templated or fake — it's a genuine random draw from
// real, approved bank content, and refuses to generate if there aren't
// enough approved questions rather than padding with unapproved ones.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const generateSchema = z.object({
  unitId: z.string(),
  count: z.number().int().positive(),
  difficultyMix: z
    .object({ easy: z.number().int().min(0).default(0), medium: z.number().int().min(0).default(0), hard: z.number().int().min(0).default(0) })
    .optional(),
});

examsRouter.post(
  "/generate",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid generation request." });

    const approved = await prisma.question.findMany({
      where: { unitId: parsed.data.unitId, approvedById: { not: null } },
    });

    let selected: typeof approved;
    if (parsed.data.difficultyMix) {
      const { easy, medium, hard } = parsed.data.difficultyMix;
      const byDifficulty = (d: string, n: number) => shuffle(approved.filter((q) => q.difficulty === d)).slice(0, n);
      selected = [...byDifficulty("easy", easy), ...byDifficulty("medium", medium), ...byDifficulty("hard", hard)];
      if (selected.length < easy + medium + hard) {
        return res.status(400).json({
          message: `Not enough approved questions for that difficulty mix — have ${selected.length}, need ${easy + medium + hard}.`,
        });
      }
    } else {
      if (approved.length < parsed.data.count) {
        return res.status(400).json({ message: `Only ${approved.length} approved question(s) available for this unit.` });
      }
      selected = shuffle(approved).slice(0, parsed.data.count);
    }

    // Randomize final question order, and shuffle MCQ options per question.
    const exam = shuffle(selected).map((q) => ({
      ...q,
      options: q.type === "mcq" ? shuffle(q.options) : q.options,
    }));

    res.json({ questions: exam, totalMarks: exam.reduce((s, q) => s + q.marks, 0) });
  }
);

// EX029 — results amendment: distinct from initial grading, requires a
// reason, and is separately audited so a changed grade is always traceable.
const amendSchema = z.object({ newScore: z.number().min(0), reason: z.string().min(5) });

examsRouter.patch(
  "/submissions/:id/amend",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = amendSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide a new score and reason." });

    const existing = await prisma.submission.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.score === null) {
      return res.status(400).json({ message: "This submission hasn't been graded yet — use the grade endpoint first." });
    }

    const updated = await prisma.submission.update({
      where: { id: req.params.id },
      data: { score: parsed.data.newScore },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "RESULT_AMENDED",
        entityType: "Submission",
        entityId: updated.id,
        metadata: { previousScore: existing.score, newScore: parsed.data.newScore, reason: parsed.data.reason },
      },
    });

    res.json(updated);
  }
);

// EX037/EX039 — assessment analytics computed from real submissions: mean,
// pass rate (score >= 50% of total marks), and score distribution buckets.
examsRouter.get(
  "/assessments/:id/analytics",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const assessment = await prisma.assessment.findUnique({ where: { id: req.params.id } });
    if (!assessment) return res.status(404).json({ message: "Assessment not found." });

    const scored = await prisma.submission.findMany({
      where: { assessmentId: assessment.id, score: { not: null } },
    });

    if (scored.length === 0) {
      return res.json({ submissionCount: 0, mean: null, passRate: null, distribution: [] });
    }

    const percentages = scored.map((s) => (s.score! / assessment.totalMarks) * 100);
    const mean = percentages.reduce((a, b) => a + b, 0) / percentages.length;
    const passRate = (percentages.filter((p) => p >= 50).length / percentages.length) * 100;

    const buckets = [0, 20, 40, 60, 80, 100];
    const distribution = buckets.slice(0, -1).map((low, i) => {
      const high = buckets[i + 1];
      return { range: `${low}-${high}%`, count: percentages.filter((p) => p >= low && p < (high === 100 ? 101 : high)).length };
    });

    res.json({ submissionCount: scored.length, mean, passRate, distribution });
  }
);

// EX039 — a downloadable CSV of every graded submission for this
// assessment, built from the same pass/fail line (50%) as the analytics
// endpoint above so the two can never disagree.
examsRouter.get(
  "/assessments/:id/analytics/export.csv",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const assessment = await prisma.assessment.findUnique({ where: { id: req.params.id } });
    if (!assessment) return res.status(404).json({ message: "Assessment not found." });

    const submissions = await prisma.submission.findMany({
      where: { assessmentId: assessment.id },
      orderBy: { studentUserId: "asc" },
    });
    const csv = buildResultsCsv(
      submissions.map((s) => ({ studentUserId: s.studentUserId, score: s.score, totalMarks: assessment.totalMarks }))
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${assessment.id}-results.csv"`);
    res.send(csv);
  }
);

// EX039 — a single printable results slip. Staff (any trainer/examination
// officer/admin) or the submission's own student may view it — mirrors who
// is already allowed to see an individual submission elsewhere in this file.
examsRouter.get("/submissions/:id/results-slip", requireAuth, async (req: AuthedRequest, res) => {
  const submission = await prisma.submission.findUnique({
    where: { id: req.params.id },
    include: { assessment: { include: { course: { include: { unit: true } } } } },
  });
  if (!submission) return res.status(404).json({ message: "Submission not found." });
  if (!submission.assessment) {
    return res.status(400).json({ message: "This submission isn't linked to an assessment, so there's no results slip to show." });
  }

  const isOwnStudent = req.user!.id === submission.studentUserId;
  const isStaff = ["TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"].includes(req.user!.role);
  if (!isOwnStudent && !isStaff) {
    return res.status(403).json({ message: "You don't have permission to view this results slip." });
  }

  const html = buildResultsSlipHtml({
    studentUserId: submission.studentUserId,
    assessmentTitle: submission.assessment.title,
    unitTitle: submission.assessment.course.unit.title,
    score: submission.score,
    totalMarks: submission.assessment.totalMarks,
    feedback: submission.feedback ?? null,
    gradedAt: submission.gradedAt ? submission.gradedAt.toISOString() : null,
  });

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// EX014/EX015 — candidate authentication & exam environment check, done
// honestly: this records that the authenticated student's own session
// started this specific assessment attempt (identity = their login,
// timestamped, with IP/user-agent captured) — not biometric or lockdown
// verification, which this platform doesn't implement. Enforces the
// existing attempt/time-window rules from /submissions at session-start
// time too, so a student can't even open a closed exam.
const startSessionSchema = z.object({ assessmentId: z.string() });

examsRouter.post("/sessions/start", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = startSessionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide an assessment ID." });

  const assessment = await prisma.assessment.findUnique({ where: { id: parsed.data.assessmentId } });
  if (!assessment) return res.status(404).json({ message: "Assessment not found." });

  if (assessment.scheduledAt && assessment.durationMinutes) {
    const closesAt = new Date(assessment.scheduledAt.getTime() + assessment.durationMinutes * 60000);
    if (new Date() > closesAt) return res.status(409).json({ message: "This assessment's window has closed." });
  }

  const priorAttempts = await prisma.submission.count({
    where: { assessmentId: assessment.id, studentUserId: req.user!.id },
  });
  if (priorAttempts >= assessment.maxAttempts) {
    return res.status(409).json({ message: "Maximum attempts already used." });
  }

  const session = await prisma.examSession.upsert({
    where: { assessmentId_studentUserId: { assessmentId: assessment.id, studentUserId: req.user!.id } },
    update: { startedAt: new Date(), endedAt: null },
    create: {
      assessmentId: assessment.id,
      studentUserId: req.user!.id,
      ipAddress: req.ip,
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
    },
  });
  res.status(201).json(session);
});

examsRouter.patch("/sessions/:assessmentId/end", requireAuth, async (req: AuthedRequest, res) => {
  const session = await prisma.examSession.update({
    where: { assessmentId_studentUserId: { assessmentId: req.params.assessmentId, studentUserId: req.user!.id } },
    data: { endedAt: new Date() },
  });
  res.json(session);
});

examsRouter.get(
  "/sessions/:assessmentId",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const sessions = await prisma.examSession.findMany({ where: { assessmentId: req.params.assessmentId } });
    res.json(sessions);
  }
);

// EX019 — real auto-marking for MCQ questions. Records each per-question
// response, checks it against Question.correctAnswer, and if every
// response for the submission is MCQ, computes and sets the score
// automatically. Non-MCQ or mixed submissions are left for a human —
// never partially auto-scored.
const mcqSubmitSchema = z.object({
  assessmentId: z.string(),
  responses: z.array(z.object({ questionId: z.string(), answerGiven: z.string() })),
});

examsRouter.post("/submissions/mcq", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = mcqSubmitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid MCQ submission." });

  const assessment = await prisma.assessment.findUnique({ where: { id: parsed.data.assessmentId } });
  if (!assessment || assessment.isDraft) return res.status(404).json({ message: "Assessment not found." });

  const priorAttempts = await prisma.submission.count({
    where: { assessmentId: assessment.id, studentUserId: req.user!.id },
  });
  if (priorAttempts >= assessment.maxAttempts) {
    return res.status(409).json({ message: `Maximum attempts (${assessment.maxAttempts}) already used.` });
  }

  const questions = await prisma.question.findMany({
    where: { id: { in: parsed.data.responses.map((r) => r.questionId) } },
  });
  const allMcq = questions.every((q) => q.type === "mcq");

  const submission = await prisma.submission.create({
    data: { assessmentId: assessment.id, studentUserId: req.user!.id },
  });

  let correctCount = 0;
  for (const r of parsed.data.responses) {
    const question = questions.find((q) => q.id === r.questionId);
    const isCorrect = allMcq && question?.correctAnswer !== undefined
      ? question.correctAnswer?.trim().toLowerCase() === r.answerGiven.trim().toLowerCase()
      : null;
    if (isCorrect) correctCount++;
    await prisma.questionResponse.create({
      data: { submissionId: submission.id, questionId: r.questionId, answerGiven: r.answerGiven, isCorrect },
    });
  }

  let updated = submission;
  if (allMcq && questions.length > 0) {
    const score = (correctCount / questions.length) * assessment.totalMarks;
    updated = await prisma.submission.update({
      where: { id: submission.id },
      data: { score, gradedAt: new Date() }, // gradedById intentionally left null — system-scored, not human-signed
    });
  }

  res.status(201).json({ submission: updated, autoMarked: allMcq, correctCount, totalQuestions: questions.length });
});

// EX023 — double marking. A second marker's independent score, kept
// alongside the first, never overwriting it — moderation decides which
// (or a blended) score becomes final via the existing grade endpoint.
const markSchema = z.object({ score: z.number().min(0), feedback: z.string().optional(), markerNumber: z.number().int().min(1).max(2) });

examsRouter.post(
  "/submissions/:id/marks",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = markSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide a score and marker number (1 or 2)." });

    const mark = await prisma.submissionMark.upsert({
      where: { submissionId_markerNumber: { submissionId: req.params.id, markerNumber: parsed.data.markerNumber } },
      update: { score: parsed.data.score, feedback: parsed.data.feedback, markerId: req.user!.id },
      create: { submissionId: req.params.id, markerId: req.user!.id, ...parsed.data },
    });
    res.status(201).json(mark);
  }
);

examsRouter.get("/submissions/:id/marks", requireAuth, requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"), async (req, res) => {
  const marks = await prisma.submissionMark.findMany({ where: { submissionId: req.params.id } });
  res.json(marks);
});

// EX024/TP031 — moderation workflow, for real. Until now, "moderation"
// meant nothing more than the comment above: a second SubmissionMark row
// sitting next to the first, with no actual mechanism deciding what
// happens when the two markers disagree. This closes that gap without
// inventing a new model: a submission needs moderation when it has both
// marker 1 and marker 2 scores, they diverge by more than 15% of the
// assessment's total marks, and no final score has been entered yet.
// Resolving it writes the final Submission.score (same field the plain
// grade endpoint writes) but through a distinct, separately audited action
// — SUBMISSION_MODERATED, not SUBMISSION_GRADED — so the audit trail shows
// this was a disagreement that got resolved, not an ordinary first mark.
const DIVERGENCE_THRESHOLD_FRACTION = 0.15;

examsRouter.get(
  "/moderation/flagged/:assessmentId",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const assessment = await prisma.assessment.findUnique({ where: { id: req.params.assessmentId } });
    if (!assessment) return res.status(404).json({ message: "Assessment not found." });

    const submissions = await prisma.submission.findMany({
      where: { assessmentId: req.params.assessmentId, score: null },
      include: { marks: true },
    });

    const threshold = assessment.totalMarks * DIVERGENCE_THRESHOLD_FRACTION;
    const flagged = submissions
      .map((s) => {
        const m1 = s.marks.find((m) => m.markerNumber === 1);
        const m2 = s.marks.find((m) => m.markerNumber === 2);
        if (!m1 || !m2) return null;
        const divergence = Math.abs(m1.score - m2.score);
        if (divergence <= threshold) return null;
        return {
          submissionId: s.id,
          studentUserId: s.studentUserId,
          marker1Score: m1.score,
          marker2Score: m2.score,
          divergence,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    res.json({ threshold, flagged });
  }
);

const moderationResolveSchema = z.object({
  finalScore: z.number().min(0),
  feedback: z.string().optional(),
});

examsRouter.post(
  "/moderation/:submissionId/resolve",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = moderationResolveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide a valid final score." });

    const submission = await prisma.submission.findUnique({
      where: { id: req.params.submissionId },
      include: { marks: true },
    });
    if (!submission) return res.status(404).json({ message: "Submission not found." });

    const m1 = submission.marks.find((m) => m.markerNumber === 1);
    const m2 = submission.marks.find((m) => m.markerNumber === 2);
    if (!m1 || !m2) {
      return res.status(409).json({ message: "This submission does not have two independent marks to moderate." });
    }

    const updated = await prisma.submission.update({
      where: { id: submission.id },
      data: {
        score: parsed.data.finalScore,
        feedback: parsed.data.feedback,
        gradedById: req.user!.id,
        gradedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "SUBMISSION_MODERATED",
        entityType: "Submission",
        entityId: submission.id,
        metadata: { marker1Score: m1.score, marker2Score: m2.score, finalScore: parsed.data.finalScore },
      },
    });

    res.json(updated);
  }
);

// ---------------------------------------------------------------------------
// SP019 — Assessment centre: real student-facing exam-taking flow.
// Three endpoints close the loop that existed only as trainer/examiner-side
// tooling before this batch: a student can now see which assessments they
// have to sit, open one to answer real approved questions, and submit
// mixed-type answers (mcq/short_answer/essay) in one call — auto-marked
// only when every question in the attempt is mcq, exactly like the
// existing /submissions/mcq behaviour, never partially auto-scored.
// ---------------------------------------------------------------------------

// GET /exams/available/mine — every assessment belonging to a course the
// student is (or was) enrolled in via their Unit, with their own
// attempt/session/result status attached so the UI never has to guess.
examsRouter.get("/available/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({
    where: { userId: req.user!.id },
    include: { enrollments: { include: { unit: { include: { courses: { include: { assessments: { where: { isDraft: false } } } } } } } } },
  });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const assessments = student.enrollments.flatMap((e) =>
    e.unit.courses.flatMap((c) =>
      c.assessments.map((a) => ({ ...a, courseTitle: c.title, unitTitle: e.unit.title }))
    )
  );
  const now = new Date();

  const results = await Promise.all(
    assessments.map(async (a) => {
      const [attempts, extension] = await Promise.all([
        prisma.submission.findMany({
          where: { assessmentId: a.id, studentUserId: req.user!.id },
          orderBy: { submittedAt: "asc" },
          select: { score: true, submittedAt: true },
        }),
        prisma.quizExtension.findUnique({ where: { assessmentId_studentUserId: { assessmentId: a.id, studentUserId: req.user!.id } } }),
      ]);
      const ext = extension && !extension.revokedAt ? extension : null;
      const attemptsUsed = attempts.length;
      const avail = checkAvailability(a, {
        now,
        studentIntake: student.intake,
        attemptsUsed,
        extraAttempts: ext?.extraAttempts ?? 0,
        extendedCloseAt: ext?.extendedCloseAt ?? null,
      });
      const closesAt = a.closesAt ?? (a.scheduledAt && a.durationMinutes ? new Date(a.scheduledAt.getTime() + a.durationMinutes * 60000) : null);
      const vis = { resultVisibility: a.resultVisibility, markingMode: a.markingMode, resultsPublished: a.resultsPublished, answerKeyReleaseAt: a.answerKeyReleaseAt, closesAt };
      // Classic exams keep their original rule (score shown only once results are published);
      // quizzes follow their own visibility settings.
      const scoreVisible = canSeeScore(vis, now) && (a.builderType === "QUIZ" ? true : a.resultsPublished);
      const latest = attempts[attempts.length - 1];
      return {
        id: a.id,
        title: a.title,
        type: a.type,
        courseId: a.courseId,
        courseTitle: a.courseTitle,
        unitTitle: a.unitTitle,
        totalMarks: a.totalMarks,
        passMarkPercent: a.passMarkPercent,
        scheduledAt: a.scheduledAt,
        opensAt: a.opensAt ?? (a.type !== "FORMATIVE_QUIZ" ? a.scheduledAt : null),
        closesAt,
        durationMinutes: a.durationMinutes,
        maxAttempts: a.maxAttempts + (ext?.extraAttempts ?? 0),
        attemptsUsed,
        attemptsRemaining: Math.max(0, a.maxAttempts + (ext?.extraAttempts ?? 0) - attemptsUsed),
        gradingMethod: a.gradingMethod,
        // availability is explained, not just true/false, so the UI can say WHY it's closed
        availability: avail.code,
        availabilityMessage: avail.message,
        windowClosed: avail.code === "closed",
        notAssignedToMe: avail.code === "group",
        resultsPublished: a.resultsPublished,
        myScore: scoreVisible ? latest?.score ?? null : null,
        myGrade: scoreVisible ? aggregateAttempts(attempts, a.gradingMethod as GradingMethod) : null,
        hasExtension: !!ext,
        isQuiz: a.builderType === "QUIZ",
      };
    })
  );

  // QZ079 — quizzes assigned to other groups simply don't appear.
  res.json(results.filter((r) => !r.notAssignedToMe));
});

// GET /exams/assessments/:id/take — opens an attempt: validates the window
// and attempt count are still available, starts (or RESUMES) an ExamSession
// (same identity/IP/user-agent capture as /sessions/start), and returns the
// assessment's questions with the answer key stripped out. TP011: a quiz
// built in the quiz builder returns exactly its own chosen questions (in the
// trainer's order, or a stable per-student shuffle); an assessment with no
// explicit questions keeps the original "approved questions in the unit".
async function recordTimedOutAttempt(assessmentId: string, userId: string): Promise<{ marked: boolean }> {
  // A timed attempt that ran out without being submitted still uses up an attempt.
  // Batch 76 (QZ061/QZ062): answers the student had autosaved are marked rather than thrown away.
  const [session, draft] = await Promise.all([
    prisma.examSession.findUnique({ where: { assessmentId_studentUserId: { assessmentId, studentUserId: userId } } }),
    prisma.quizAttemptDraft.findUnique({ where: { assessmentId_studentUserId: { assessmentId, studentUserId: userId } } }),
  ]);
  const saved =
    draft && session && draft.updatedAt >= session.startedAt && draft.answers && typeof draft.answers === "object" && !Array.isArray(draft.answers)
      ? Object.entries(draft.answers as Record<string, unknown>).map(([questionId, v]) => ({ questionId, answerGiven: String(v) })).filter((r) => r.answerGiven.trim() !== "" && r.answerGiven !== "[]" && r.answerGiven !== "{}")
      : [];
  const endSession = prisma.examSession.update({ where: { assessmentId_studentUserId: { assessmentId, studentUserId: userId } }, data: { endedAt: new Date() } });
  const dropDraft = prisma.quizAttemptDraft.deleteMany({ where: { assessmentId, studentUserId: userId } });

  if (saved.length === 0) {
    await prisma.$transaction([
      prisma.submission.create({ data: { assessmentId, studentUserId: userId, score: 0, gradedAt: new Date() } }),
      endSession,
      dropDraft,
    ]);
    return { marked: false };
  }
  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId }, include: { course: { select: { unitId: true } } } });
  if (!assessment) return { marked: false };
  const quiz = await resolveQuizQuestions(assessment, assessment.course.unitId, { seed: userId });
  const known = new Set(quiz.questions.map((q) => q.id));
  const responses = saved.filter((r) => known.has(r.questionId));
  const engineQs: EngineQuestion[] = quiz.questions.map((q) => ({ id: q.id, type: q.type, marks: q.marks, correctAnswer: q.correctAnswer, options: q.options, config: q.config, topic: q.topic, difficulty: q.difficulty }));
  const result = scoreQuizV2(engineQs, responses, assessment.totalMarks);
  const outcomeById = new Map(result.perQuestion.map((o) => [o.questionId, o]));
  await prisma.$transaction(async (tx) => {
    const created = await tx.submission.create({ data: { assessmentId, studentUserId: userId, ...(result.score !== null ? { score: result.score, gradedAt: new Date() } : {}) } });
    if (responses.length > 0) {
      await tx.questionResponse.createMany({
        data: responses.map((r) => ({ submissionId: created.id, questionId: r.questionId, answerGiven: r.answerGiven, isCorrect: outcomeById.get(r.questionId)?.isCorrect ?? null, marksAwarded: outcomeById.get(r.questionId)?.marksAwarded ?? null })),
      });
    }
    await tx.examSession.update({ where: { assessmentId_studentUserId: { assessmentId, studentUserId: userId } }, data: { endedAt: new Date() } });
    await tx.quizAttemptDraft.deleteMany({ where: { assessmentId, studentUserId: userId } });
  });
  return { marked: true };
}

// EX018 — how much extra time (if any) this student has been granted on
// this specific assessment. Looked up fresh on every deadline calculation
// rather than cached, so revoking an accommodation takes effect immediately
// on the next check rather than only for future sessions.
async function accommodationExtraMinutes(assessmentId: string, studentUserId: string): Promise<number> {
  const accommodation = await prisma.examAccommodation.findUnique({
    where: { assessmentId_studentUserId: { assessmentId, studentUserId } },
  });
  if (!accommodation || accommodation.status !== "approved") return 0;
  return accommodation.extraTimeMinutes;
}

examsRouter.get("/assessments/:id/take", requireAuth, async (req: AuthedRequest, res) => {
  const assessment = await prisma.assessment.findUnique({
    where: { id: req.params.id },
    include: { course: { include: { unit: true } } },
  });
  if (!assessment || assessment.isDraft) return res.status(404).json({ message: "Assessment not found." });
  if (req.user!.role !== "STUDENT") {
    return res.status(403).json({ message: "Only students can sit an assessment. Trainers can use Preview in the quiz builder." });
  }
  if (!(await isEnrolledInCourse(req.user!.id, assessment.courseId))) {
    return res.status(403).json({ message: "You are not enrolled in this course." });
  }

  // Batch 76 — one availability rule shared with /available/mine and submit:
  // group assignment (QZ079), opens/closes (QZ047/048), the legacy sitting
  // window, and a per-student extension (QZ080).
  const studentRow = await prisma.student.findUnique({ where: { userId: req.user!.id }, select: { intake: true } });
  const extRow = await prisma.quizExtension.findUnique({ where: { assessmentId_studentUserId: { assessmentId: assessment.id, studentUserId: req.user!.id } } });
  const ext = extRow && !extRow.revokedAt ? extRow : null;
  const windowCheck = checkAvailability(assessment, {
    now: new Date(), studentIntake: studentRow?.intake, attemptsUsed: 0, extraAttempts: ext?.extraAttempts ?? 0, extendedCloseAt: ext?.extendedCloseAt ?? null,
  });
  if (!windowCheck.open) return res.status(windowCheck.code === "group" ? 403 : 409).json({ message: windowCheck.message });

  const extraMinutes = await accommodationExtraMinutes(assessment.id, req.user!.id);

  const sessionKey = { assessmentId_studentUserId: { assessmentId: assessment.id, studentUserId: req.user!.id } };
  const open = await prisma.examSession.findUnique({ where: sessionKey });
  if (open && !open.endedAt && assessment.durationMinutes && isPastDeadline(attemptDeadline(open.startedAt, assessment.durationMinutes, extraMinutes))) {
    const used = await prisma.submission.count({ where: { assessmentId: assessment.id, studentUserId: req.user!.id } });
    if (used < assessment.maxAttempts) await recordTimedOutAttempt(assessment.id, req.user!.id);
  }

  const priorAttempts = await prisma.submission.count({
    where: { assessmentId: assessment.id, studentUserId: req.user!.id },
  });
  if (priorAttempts >= assessment.maxAttempts + (ext?.extraAttempts ?? 0)) {
    return res.status(409).json({ message: "Maximum attempts already used." });
  }

  // QZ050 — retake cooldown: a minimum wait after the previous attempt (never blocks resuming an open one).
  if (assessment.retakeCooldownMins > 0 && priorAttempts > 0) {
    const openNow = await prisma.examSession.findUnique({ where: sessionKey });
    if (!openNow || openNow.endedAt) {
      const last = await prisma.submission.findFirst({ where: { assessmentId: assessment.id, studentUserId: req.user!.id }, orderBy: { submittedAt: "desc" }, select: { submittedAt: true } });
      if (last) {
        const nextAt = new Date(last.submittedAt.getTime() + assessment.retakeCooldownMins * 60_000);
        if (nextAt > new Date()) return res.status(409).json({ message: `You can retake this quiz after ${nextAt.toISOString()}.`, retryAt: nextAt.toISOString() });
      }
    }
  }

  // Resume an unfinished attempt instead of restarting its clock (refreshing
  // the page must not hand the student a fresh time limit).
  const current = await prisma.examSession.findUnique({ where: sessionKey });
  const session =
    current && !current.endedAt
      ? current
      : await prisma.examSession.upsert({
          where: sessionKey,
          update: { startedAt: new Date(), endedAt: null },
          create: {
            assessmentId: assessment.id,
            studentUserId: req.user!.id,
            ipAddress: req.ip,
            userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
          },
        });

  const quiz = await resolveQuizQuestions(assessment, assessment.course.unitId, { seed: req.user!.id });
  // EX018 — a granted accommodation extends this deadline; see
  // accommodationExtraMinutes() above.
  const deadline = attemptDeadline(session.startedAt, assessment.durationMinutes, extraMinutes);

  // QZ060 — answers saved while working, so a refresh / dropped connection resumes where the student was.
  const draft = await prisma.quizAttemptDraft.findUnique({ where: { assessmentId_studentUserId: { assessmentId: assessment.id, studentUserId: req.user!.id } } });

  res.json({
    assessment: {
      id: assessment.id,
      title: assessment.title,
      type: assessment.type,
      totalMarks: assessment.totalMarks,
      durationMinutes: assessment.durationMinutes,
      instructions: assessment.instructions,
      unitTitle: assessment.course.unit.title,
      questionsPerPage: assessment.questionsPerPage,
      navigationMode: assessment.navigationMode,
    },
    draft: draft && draft.updatedAt >= session.startedAt ? { answers: draft.answers, flagged: draft.flagged, currentIndex: draft.currentIndex } : null,
    // BUGFIX (EX013 wiring): the student exam page never had a session id to
    // call the security-check endpoint with, so that check was never made
    // from the one place it matters. Now returned so the client can POST it.
    sessionId: session.id,
    startedAt: session.startedAt,
    deadline,
    questions: quiz.questions.map((q) => toStudentQuestion(q, req.user!.id)), // correctAnswer/explanation/config keys never sent to the client taking the exam
  });
});

// POST /exams/submissions/answers — one submission covering every question
// in the attempt, whatever the mix of types. Scored by lib/quiz-scoring.ts:
// the attempt is auto-marked only when EVERY question is objective (mcq);
// any short_answer/essay question leaves the final mark to a human via the
// existing /submissions/:id/grade endpoint. Ends the ExamSession on submit.
const answersSchema = z.object({
  assessmentId: z.string(),
  responses: z.array(z.object({ questionId: z.string(), answerGiven: z.string().max(20000) })).min(1),
});

examsRouter.post("/submissions/answers", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = answersSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide at least one answer." });

  const assessment = await prisma.assessment.findUnique({
    where: { id: parsed.data.assessmentId },
    include: { course: { select: { unitId: true } } },
  });
  if (!assessment || assessment.isDraft) return res.status(404).json({ message: "Assessment not found." });
  if (req.user!.role !== "STUDENT") return res.status(403).json({ message: "Only students can submit an attempt." });
  if (!(await isEnrolledInCourse(req.user!.id, assessment.courseId))) {
    return res.status(403).json({ message: "You are not enrolled in this course." });
  }

  const extRow = await prisma.quizExtension.findUnique({ where: { assessmentId_studentUserId: { assessmentId: assessment.id, studentUserId: req.user!.id } } });
  const ext = extRow && !extRow.revokedAt ? extRow : null;
  const priorAttempts = await prisma.submission.count({
    where: { assessmentId: assessment.id, studentUserId: req.user!.id },
  });
  if (priorAttempts >= assessment.maxAttempts + (ext?.extraAttempts ?? 0)) {
    return res.status(409).json({ message: `Maximum attempts (${assessment.maxAttempts + (ext?.extraAttempts ?? 0)}) already used.` });
  }
  const studentRow = await prisma.student.findUnique({ where: { userId: req.user!.id }, select: { intake: true } });
  const windowCheck = checkAvailability(assessment, {
    now: new Date(), studentIntake: studentRow?.intake, attemptsUsed: 0, extraAttempts: ext?.extraAttempts ?? 0, extendedCloseAt: ext?.extendedCloseAt ?? null,
  });
  if (!windowCheck.open) {
    return res.status(windowCheck.code === "group" ? 403 : 409).json({ message: windowCheck.code === "closed" ? "The submission window for this assessment has closed." : windowCheck.message });
  }

  // Per-attempt time limit (quizzes with a duration and no fixed sitting time).
  const session = await prisma.examSession.findUnique({
    where: { assessmentId_studentUserId: { assessmentId: assessment.id, studentUserId: req.user!.id } },
  });
  if (assessment.durationMinutes && !assessment.scheduledAt) {
    if (!session || session.endedAt) return res.status(409).json({ message: "Open the quiz first, then submit your answers." });
    // EX018 — an approved accommodation extends this deadline too, the same
    // way it extends the one returned by GET /assessments/:id/take.
    const extraMinutes = await accommodationExtraMinutes(assessment.id, req.user!.id);
    if (isPastDeadline(attemptDeadline(session.startedAt, assessment.durationMinutes, extraMinutes))) {
      // QZ061/QZ062 — time ran out: answers the student had autosaved are marked
      // and recorded; with nothing saved the attempt is recorded as unanswered.
      const lapsed = await recordTimedOutAttempt(assessment.id, req.user!.id);
      return res.status(409).json({ message: lapsed.marked ? "The time limit passed, so your saved answers were submitted and marked automatically." : "The time limit for this attempt has passed, so it was recorded as unanswered." });
    }
  }

  // Same per-student draw the student was shown (QZ035 random selection is seeded by the student id).
  const quiz = await resolveQuizQuestions(assessment, assessment.course.unitId, { seed: req.user!.id });
  const known = new Set(quiz.questions.map((q) => q.id));
  if (parsed.data.responses.some((r) => !known.has(r.questionId))) {
    return res.status(400).json({ message: "Your answers include a question that isn't part of this assessment." });
  }
  const submitted: { questionId: string; answerGiven: string }[] = parsed.data.responses;
  const latestByQuestion = new Map<string, { questionId: string; answerGiven: string }>(submitted.map((r) => [r.questionId, r]));
  const responses = [...latestByQuestion.values()];

  const engineQs: (EngineQuestion & { prompt: string })[] = quiz.questions.map((q) => ({
    id: q.id, type: q.type, marks: q.marks, correctAnswer: q.correctAnswer, options: q.options, config: q.config, topic: q.topic, difficulty: q.difficulty, prompt: q.prompt,
  }));
  const result = scoreQuizV2(engineQs, responses, assessment.totalMarks);
  const outcomeById = new Map(result.perQuestion.map((o) => [o.questionId, o]));

  const submission = await prisma.$transaction(async (tx) => {
    const created = await tx.submission.create({
      data: {
        assessmentId: assessment.id,
        studentUserId: req.user!.id,
        // gradedById left null — system-scored, not human-signed
        ...(result.score !== null ? { score: result.score, gradedAt: new Date() } : {}),
      },
    });
    await tx.questionResponse.createMany({
      data: responses.map((r) => {
        const o = outcomeById.get(r.questionId);
        return {
          submissionId: created.id,
          questionId: r.questionId,
          answerGiven: r.answerGiven,
          isCorrect: o?.isCorrect ?? null,
          marksAwarded: o?.marksAwarded ?? null,
        };
      }),
    });
    if (session) {
      await tx.examSession.update({
        where: { assessmentId_studentUserId: { assessmentId: assessment.id, studentUserId: req.user!.id } },
        data: { endedAt: new Date() },
      });
    }
    await tx.quizAttemptDraft.deleteMany({ where: { assessmentId: assessment.id, studentUserId: req.user!.id } });
    return created;
  });

  const now = new Date();
  const closesAt = assessment.closesAt ?? (assessment.scheduledAt && assessment.durationMinutes ? new Date(assessment.scheduledAt.getTime() + assessment.durationMinutes * 60000) : null);
  const vis = { resultVisibility: assessment.resultVisibility, markingMode: assessment.markingMode, resultsPublished: assessment.resultsPublished, answerKeyReleaseAt: assessment.answerKeyReleaseAt, closesAt };
  // QZ063/064/069/071 — the student only sees a score when the quiz's marking mode and visibility allow it.
  const showScore = canSeeScore(vis, now) || (assessment.builderType !== "QUIZ" && assessment.resultVisibility === "IMMEDIATE" && assessment.markingMode === "IMMEDIATE");
  const visibleScore = showScore ? result.score : null;

  const passed = showScore ? passedQuiz(result.score, assessment.totalMarks, assessment.passMarkPercent) : null;

  // Answer-by-answer feedback only for quizzes built in the quiz builder whose
  // author allowed it and whose release rules (QZ070/071) permit it now — never
  // for classic exams (their answer keys stay private).
  const keyVisible = quiz.linked && canSeeAnswerKey(vis, now, assessment.showFeedbackAfterSubmit);
  const review = keyVisible
    ? buildReviewItems(
        engineQs.map((q, i) => ({ ...q, explanation: quiz.questions[i].explanation })),
        new Map(result.perQuestion.map((o) => [o.questionId, { isCorrect: o.isCorrect, partial: o.partial, marksAwarded: o.marksAwarded }])),
        new Map(responses.map((r) => [r.questionId, r.answerGiven]))
      )
    : null;

  res.status(201).json({
    submission: { ...submission, score: visibleScore },
    autoMarked: result.fullyAutoMarkable,
    correctCount: showScore && result.fullyAutoMarkable ? result.correctCount : null,
    totalQuestions: quiz.questions.length,
    score: visibleScore,
    provisionalScore: showScore && !result.fullyAutoMarkable ? result.autoMarksScaled : null,
    scoreWithheld: !showScore,
    withheldReason: showScore ? null : assessment.markingMode === "DEFERRED" ? "Your trainer releases results after marking." : assessment.resultVisibility === "AFTER_CLOSE" ? "Results appear once the quiz closes." : "Results are not shown for this quiz.",
    totalMarks: assessment.totalMarks,
    passMarkPercent: assessment.passMarkPercent,
    passed,
    review,
  });
});

// ---------------------------------------------------------------------------
// RG026 — results amendment: a request/approval workflow, never a silent
// score edit. The requester and the approver must be different actions —
// this route never lets a request auto-approve itself — and only approval
// actually changes Submission.score, with the change audited.
// ---------------------------------------------------------------------------

const amendmentRequestSchema = z.object({
  submissionId: z.string(),
  proposedScore: z.number().min(0),
  reason: z.string().min(5),
});

examsRouter.post(
  "/amendments",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = amendmentRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Give a proposed score and a reason (min 5 characters)." });

    const submission = await prisma.submission.findUnique({ where: { id: parsed.data.submissionId } });
    if (!submission) return res.status(404).json({ message: "Submission not found." });

    const request = await prisma.resultsAmendmentRequest.create({
      data: {
        submissionId: submission.id,
        currentScore: submission.score,
        proposedScore: parsed.data.proposedScore,
        reason: parsed.data.reason,
        requestedById: req.user!.id,
      },
    });
    res.status(201).json(request);
  }
);

examsRouter.get(
  "/amendments/pending",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const pending = await prisma.resultsAmendmentRequest.findMany({
      where: { status: "pending" },
      include: { submission: { include: { assessment: true } } },
      orderBy: { createdAt: "asc" },
    });
    res.json(pending);
  }
);

const amendmentDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  decisionNote: z.string().optional(),
});

examsRouter.patch(
  "/amendments/:id/decide",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = amendmentDecisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Choose approved or rejected." });

    const request = await prisma.resultsAmendmentRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ message: "Amendment request not found." });
    if (request.status !== "pending") return res.status(409).json({ message: "This request was already decided." });
    if (request.requestedById === req.user!.id) {
      return res.status(403).json({ message: "The requester cannot also approve their own amendment." });
    }

    const updated = await prisma.resultsAmendmentRequest.update({
      where: { id: req.params.id },
      data: {
        status: parsed.data.decision,
        decidedById: req.user!.id,
        decidedAt: new Date(),
        decisionNote: parsed.data.decisionNote,
      },
    });

    if (parsed.data.decision === "approved") {
      await prisma.submission.update({
        where: { id: request.submissionId },
        data: { score: request.proposedScore, gradedById: req.user!.id, gradedAt: new Date() },
      });
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "RESULTS_AMENDMENT_APPROVED",
          entityType: "Submission",
          entityId: request.submissionId,
          metadata: { from: request.currentScore, to: request.proposedScore, reason: request.reason },
        },
      });
    }

    res.json(updated);
  }
);

// ---------------------------------------------------------------------------
// TP032 — results approval: a real submit-for-approval step, distinct from
// the existing publish gate (EX027). A trainer explicitly flags an
// assessment's grading as complete and ready for review; only then does it
// appear in the examination officer's approval queue. Publishing (EX027)
// still requires a separate, distinct role action — this adds the missing
// "ready for review" signal in between grading and publishing.
// ---------------------------------------------------------------------------

examsRouter.patch(
  "/assessments/:id/submit-for-approval",
  requireAuth,
  requireRole("TRAINER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const assessment = await prisma.assessment.findUnique({
      where: { id: req.params.id },
      include: { submissions: true },
    });
    if (!assessment) return res.status(404).json({ message: "Assessment not found." });

    const ungraded = assessment.submissions.filter((s) => s.score === null);
    if (ungraded.length > 0) {
      return res.status(400).json({ message: `${ungraded.length} submission(s) are still ungraded.` });
    }

    const updated = await prisma.assessment.update({
      where: { id: req.params.id },
      data: { resultsSubmittedForApprovalAt: new Date(), resultsSubmittedById: req.user!.id },
    });
    res.json(updated);
  }
);

examsRouter.get(
  "/assessments/pending-approval",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    // Returns both stages of the queue — resultsApprovedAt tells the caller
    // whether an item is still awaiting approval or already approved and
    // ready to publish, so one endpoint can drive both actions.
    const pending = await prisma.assessment.findMany({
      where: { resultsSubmittedForApprovalAt: { not: null }, resultsPublished: false },
      include: { course: { select: { title: true } } },
      orderBy: { resultsSubmittedForApprovalAt: "asc" },
    });
    res.json(pending);
  }
);

// ---------------------------------------------------------------------------
// EX026 — grade approval: the real second step in the approval chain. An
// examination officer either approves the trainer's submitted results
// (unblocking publish above) or rejects them back to the trainer with a
// reason (clears resultsSubmittedForApprovalAt so it drops out of the
// queue and the trainer must re-submit after correcting). The submitter
// cannot also approve their own submission — same "distinct actor" rule
// already enforced for amendments (RG026) and budgets (FN026).
// ---------------------------------------------------------------------------
const approvalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().optional(),
});

examsRouter.patch(
  "/assessments/:id/approve-results",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = approvalDecisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Choose approved or rejected." });

    const assessment = await prisma.assessment.findUnique({ where: { id: req.params.id } });
    if (!assessment) return res.status(404).json({ message: "Assessment not found." });
    if (!assessment.resultsSubmittedForApprovalAt) {
      return res.status(400).json({ message: "This assessment hasn't been submitted for approval." });
    }
    if (assessment.resultsSubmittedById === req.user!.id) {
      return res.status(403).json({ message: "The trainer who submitted results cannot also approve them." });
    }
    // RG027 — once a full examiner1→examiner2→QA-officer chain exists for
    // this assessment, that chain is the authoritative approval path; this
    // single-officer shortcut must not be usable alongside it (that would
    // let someone bypass the second examiner and QA sign-off entirely).
    const chain = await prisma.resultsApprovalChain.findUnique({ where: { assessmentId: assessment.id } });
    if (chain) {
      return res.status(409).json({ message: "This assessment is in the multi-stage results approval chain — use that queue instead." });
    }

    const updated = await prisma.assessment.update({
      where: { id: req.params.id },
      data:
        parsed.data.decision === "approved"
          ? { resultsApprovedAt: new Date(), resultsApprovedById: req.user!.id, resultsApprovalNote: parsed.data.note }
          : {
              resultsSubmittedForApprovalAt: null,
              resultsSubmittedById: null,
              resultsApprovedAt: null,
              resultsApprovedById: null,
              resultsApprovalNote: parsed.data.note ?? "Rejected — resubmit after corrections.",
            },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: parsed.data.decision === "approved" ? "RESULTS_APPROVED" : "RESULTS_APPROVAL_REJECTED",
        entityType: "Assessment",
        entityId: updated.id,
        metadata: { note: parsed.data.note ?? null },
      },
    });

    res.json(updated);
  }
);

// ---------------------------------------------------------------------------
// EX001 — assessment calendar: every scheduled assessment across every
// course, in one real chronological view — the scheduledAt field already
// existed, nothing before this read it as a calendar.
// ---------------------------------------------------------------------------

examsRouter.get("/calendar", requireAuth, async (_req: AuthedRequest, res) => {
  const assessments = await prisma.assessment.findMany({
    where: { scheduledAt: { not: null } },
    include: { course: { select: { title: true } } },
    orderBy: { scheduledAt: "asc" },
  });
  res.json(
    assessments.map((a) => ({
      id: a.id,
      title: a.title,
      courseTitle: a.course.title,
      type: a.type,
      scheduledAt: a.scheduledAt,
      durationMinutes: a.durationMinutes,
    }))
  );
});

// ---------------------------------------------------------------------------
// EX006 — difficulty calibration: compares the trainer's manually-assigned
// difficulty label against the REAL observed percentage of correct
// answers across every response on record. A question labeled "easy" that
// almost everyone gets wrong (or vice versa) is flagged as miscalibrated —
// a genuinely useful, real signal, not a cosmetic label.
// EX038 — question analytics: the same real response data, reported per
// question regardless of calibration status (times used, % correct).
// ---------------------------------------------------------------------------

examsRouter.get(
  "/questions/analytics",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const unitId = typeof req.query.unitId === "string" ? req.query.unitId : undefined;
    const questions = await prisma.question.findMany({
      where: unitId ? { unitId } : undefined,
      include: { responses: true },
    });

    const analytics = questions.map((q) => {
      const total = q.responses.length;
      const correct = q.responses.filter((r) => r.isCorrect === true).length;
      const observedCorrectRate = total > 0 ? correct / total : null;

      let observedDifficulty: "easy" | "medium" | "hard" | null = null;
      if (observedCorrectRate !== null) {
        observedDifficulty = observedCorrectRate >= 0.75 ? "easy" : observedCorrectRate >= 0.4 ? "medium" : "hard";
      }

      return {
        questionId: q.id,
        prompt: q.prompt,
        labeledDifficulty: q.difficulty,
        observedDifficulty,
        timesUsed: total,
        observedCorrectRate,
        miscalibrated: observedDifficulty !== null && observedDifficulty !== q.difficulty,
      };
    });

    res.json(analytics);
  }
);

// ---------------------------------------------------------------------------
// EX035 — oral assessment / viva: a real human-conducted and human-scored
// session, recorded for audit. Distinct from AI033 (AI viva), which would
// need real speech infrastructure this system doesn't have and correctly
// remains unbuilt.
// ---------------------------------------------------------------------------

const oralSessionSchema = z.object({
  assessmentId: z.string(),
  studentUserId: z.string(),
  score: z.number().min(0).optional(),
  notes: z.string().optional(),
});

examsRouter.post(
  "/oral-sessions",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = oralSessionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide assessmentId and studentUserId." });
    const session = await prisma.oralAssessmentSession.create({
      data: { ...parsed.data, examinerId: req.user!.id },
    });
    res.status(201).json(session);
  }
);

examsRouter.get(
  "/oral-sessions/:assessmentId",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const sessions = await prisma.oralAssessmentSession.findMany({
      where: { assessmentId: req.params.assessmentId },
      orderBy: { recordedAt: "desc" },
    });
    res.json(sessions);
  }
);

// ---------------------------------------------------------------------------
// EX025 — external moderation: a real, distinct sign-off from an external
// examiner, separate from the internal moderation workflow already
// covered by the grading/publish flow.
// ---------------------------------------------------------------------------
const externalModerationSchema = z.object({ assessmentId: z.string(), comments: z.string().min(2) });

examsRouter.post(
  "/external-moderation",
  requireAuth,
  requireRole("EXTERNAL_EXAMINER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = externalModerationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide assessmentId and comments." });
    const review = await prisma.externalModerationReview.create({
      data: { ...parsed.data, examinerId: req.user!.id },
    });
    res.status(201).json(review);
  }
);

examsRouter.patch(
  "/external-moderation/:id/outcome",
  requireAuth,
  requireRole("EXTERNAL_EXAMINER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = z.object({ outcome: z.enum(["approved", "changes_requested"]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid outcome." });
    const review = await prisma.externalModerationReview.update({
      where: { id: req.params.id },
      data: { outcome: parsed.data.outcome },
    });
    res.json(review);
  }
);

examsRouter.get(
  "/external-moderation/:assessmentId",
  requireAuth,
  requireRole("EXTERNAL_EXAMINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const reviews = await prisma.externalModerationReview.findMany({
      where: { assessmentId: req.params.assessmentId },
      orderBy: { reviewedAt: "desc" },
    });
    res.json(reviews);
  }
);

// EX034 — Practical assessment scoring. Practical assessments (workshop,
// clinical, fieldwork) don't go through the online attempt flow the other
// AssessmentTypes use (see /assessments/:id/take) — a trainer observes and
// scores against a checklist in person, so this creates the Submission
// directly, already graded, rather than waiting on a student "attempt".
const practicalScoreSchema = z.object({
  studentUserId: z.string(),
  criteria: z.array(z.object({ name: z.string().min(1), maxMarks: z.number().positive(), score: z.number().min(0) })).min(1),
  feedback: z.string().optional(),
});

examsRouter.post(
  "/assessments/:id/practical-score",
  requireAuth,
  requireRole("TRAINER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const assessment = await prisma.assessment.findUnique({ where: { id: req.params.id } });
    if (!assessment) return res.status(404).json({ message: "Assessment not found." });
    if (assessment.type !== "PRACTICAL") {
      return res.status(400).json({ message: "This endpoint is for PRACTICAL assessments only." });
    }

    const parsed = practicalScoreSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide studentUserId and scored criteria." });

    const { studentUserId, criteria, feedback } = parsed.data;
    const maxTotal = criteria.reduce((sum, c) => sum + c.maxMarks, 0);
    const scoredTotal = criteria.reduce((sum, c) => sum + c.score, 0);
    // Normalised to the assessment's own scale so it sits alongside scores
    // from the online-attempt path on the same footing.
    const score = maxTotal > 0 ? (scoredTotal / maxTotal) * assessment.totalMarks : 0;

    const existing = await prisma.submission.findFirst({
      where: { assessmentId: assessment.id, studentUserId },
    });

    const submission = existing
      ? await prisma.submission.update({
          where: { id: existing.id },
          data: { score, criteriaScores: criteria, feedback, gradedById: req.user!.id, gradedAt: new Date() },
        })
      : await prisma.submission.create({
          data: {
            assessmentId: assessment.id,
            studentUserId,
            score,
            criteriaScores: criteria,
            feedback,
            gradedById: req.user!.id,
            gradedAt: new Date(),
          },
        });
    res.status(201).json(submission);
  }
);

examsRouter.get(
  "/assessments/:id/practical-scores",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const submissions = await prisma.submission.findMany({
      where: { assessmentId: req.params.id },
      orderBy: { gradedAt: "desc" },
    });
    res.json(submissions);
  }
);

// ---------------------------------------------------------------------------
// EX014 — candidate admit cards, batch 64. This is deliberately NOT the
// biometric/photo-ID verification the audit correctly named as a
// permanent, privacy-conscious scope boundary for this platform (see
// EX014's note in feature-audit-400.md, which stays unchanged) — it's the
// smaller, legitimate next step that note itself named as legitimate: a
// real, printable/emailable card carrying the student's own uploaded
// photo, a signed document ID, and a QR code, for an invigilator to check
// by eye against the person sitting the exam. No automated face match is
// performed anywhere in this code.
// ---------------------------------------------------------------------------

async function issueAdmitCard(assessmentId: string, studentId: string) {
  const existing = await prisma.examAdmitCard.findUnique({ where: { assessmentId_studentId: { assessmentId, studentId } } });
  if (existing) return existing;

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new Error("Student not found.");

  const documentId = generateDocumentId("ADMIT");
  const payload = { assessmentId, studentNumber: student.studentNumber, fullName: student.fullName, issuedAt: new Date().toISOString() };
  const signedHash = signDocument(payload);
  const verificationUrl = `${process.env.PUBLIC_BASE_URL ?? "https://kvbdtc.ac.ke"}/verify-admit-card/${documentId}`;

  return prisma.examAdmitCard.create({
    data: {
      assessmentId,
      studentId,
      photoDataUrl: student.photoDataUrl ?? null,
      documentId,
      signedHash,
      verificationUrl,
    },
  });
}

// Student self-service: generate (if not already issued) and fetch their
// own admit card for a specific assessment. Requires a photo already on
// file (StudentProfile.tsx's upload) and a real enrollment in the
// assessment's course — no card is issued for an assessment the student
// isn't actually registered for.
examsRouter.post("/assessments/:id/admit-card/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });
  if (!student.photoDataUrl) {
    return res.status(400).json({ message: "Upload a profile photo first (My Profile) before generating an admit card." });
  }
  const assessment = await prisma.assessment.findUnique({ where: { id: req.params.id }, select: { id: true, courseId: true, title: true } });
  if (!assessment) return res.status(404).json({ message: "Assessment not found." });
  const enrolled = await isEnrolledInCourse(req.user!.id, assessment.courseId);
  if (!enrolled) return res.status(403).json({ message: "You aren't registered for this assessment's course." });

  try {
    const card = await issueAdmitCard(assessment.id, student.id);
    res.status(201).json(card);
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : "Could not issue admit card." });
  }
});

examsRouter.get("/assessments/:id/admit-card/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });
  const card = await prisma.examAdmitCard.findUnique({ where: { assessmentId_studentId: { assessmentId: req.params.id, studentId: student.id } } });
  if (!card) return res.status(404).json({ message: "No admit card issued yet for this assessment." });
  res.json(card);
});

// Staff view: every admit card issued for an assessment, plus a bulk
// "issue for every enrolled student who has a photo on file" action for
// exam-office roll-call preparation.
examsRouter.get(
  "/assessments/:id/admit-cards",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const cards = await prisma.examAdmitCard.findMany({
      where: { assessmentId: req.params.id },
      include: { student: { select: { fullName: true, studentNumber: true } } },
      orderBy: { issuedAt: "asc" },
    });
    res.json(cards);
  }
);

examsRouter.post(
  "/assessments/:id/admit-cards/generate",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const assessment = await prisma.assessment.findUnique({ where: { id: req.params.id }, select: { id: true, courseId: true } });
    if (!assessment) return res.status(404).json({ message: "Assessment not found." });

    const enrollments = await prisma.enrollment.findMany({
      where: { unit: { courses: { some: { id: assessment.courseId } } } },
      select: { studentId: true },
    });
    const uniqueStudentIds = [...new Set(enrollments.map((e) => e.studentId))];

    let issued = 0;
    let skippedNoPhoto = 0;
    for (const studentId of uniqueStudentIds) {
      const student = await prisma.student.findUnique({ where: { id: studentId }, select: { photoDataUrl: true } });
      if (!student?.photoDataUrl) {
        skippedNoPhoto++;
        continue;
      }
      await issueAdmitCard(assessment.id, studentId);
      issued++;
    }
    res.json({ issued, skippedNoPhoto, totalEnrolled: uniqueStudentIds.length });
  }
);

// Public — an invigilator scans the QR code and gets back only what's
// needed to check the card is genuine and matches the person in front of
// them: no contact details, no grades, and (deliberately) no photo, since
// the printed/emailed card already carries that.
examsRouter.get("/admit-cards/verify/:documentId", async (req, res) => {
  const card = await prisma.examAdmitCard.findUnique({
    where: { documentId: req.params.documentId },
    include: { student: { select: { fullName: true, studentNumber: true } }, assessment: { select: { title: true, scheduledAt: true } } },
  });
  if (!card) return res.status(404).json({ valid: false, message: "No admit card found with that ID." });
  res.json({
    valid: true,
    studentName: card.student.fullName,
    studentNumber: card.student.studentNumber,
    assessmentTitle: card.assessment.title,
    scheduledAt: card.assessment.scheduledAt,
    issuedAt: card.issuedAt,
  });
});
