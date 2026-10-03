// TP011 / Batch 76 — resolves "which questions does this assessment contain,
// and with what marks" for ONE student. One place, used by the student
// sitting (exams.ts), the trainer's preview and the quiz builder
// (quizzes.ts), the regrader and autosave, so all of them agree.
//
//  * An assessment with explicit AssessmentQuestion rows (built in the quiz
//    builder) uses exactly those, in the trainer's order, with per-quiz marks.
//  * QZ035 — an assessment with `randomRules` additionally draws questions
//    from the unit bank per rule. The draw is seeded by the student id, so
//    the same student always gets the same draw (refresh-safe, regradable)
//    while different students get different ones.
//  * An assessment with neither keeps the original behaviour: every approved
//    question in the course's unit. Existing exams are unaffected.

import { prisma } from "./prisma.js";
import { seededShuffle } from "./quiz-scoring.js";
import { drawRandom, parseRandomRules, studentView, type QuestionConfig } from "./quiz-engine.js";

export type ResolvedQuestion = {
  id: string;
  type: string;
  prompt: string;
  options: string[];
  marks: number;
  correctAnswer: string | null;
  explanation: string | null;
  approved: boolean;
  config: QuestionConfig | null;
  mediaUrl: string | null;
  mediaKind: string | null;
  topic: string | null;
  difficulty: string | null;
  tags: string[];
};

export type ResolvedQuiz = { linked: boolean; questions: ResolvedQuestion[] };

type AssessmentRef = {
  id: string;
  courseId: string;
  shuffleQuestions: boolean;
  type?: string;
  randomRules?: unknown;
  shuffleOptions?: boolean | null;
};

export async function resolveQuizQuestions(
  assessment: AssessmentRef,
  unitId: string,
  opts: { seed?: string } = {}
): Promise<ResolvedQuiz> {
  const links = await prisma.assessmentQuestion.findMany({
    where: { assessmentId: assessment.id },
    include: { question: true },
    orderBy: { order: "asc" },
  });

  let questions: ResolvedQuestion[];
  const rules = parseRandomRules(assessment.randomRules);
  const linked = links.length > 0 || rules.length > 0;

  if (links.length > 0) {
    questions = links.map((l: { marks: number | null; question: any }) => toResolved(l.question, l.marks ?? l.question.marks));
  } else if (rules.length === 0) {
    const pool = await prisma.question.findMany({
      where: { unitId, approvedById: { not: null }, archivedAt: null },
      orderBy: { createdAt: "asc" },
    });
    questions = pool.map((q: any) => toResolved(q, q.marks));
  } else {
    questions = [];
  }

  if (rules.length > 0) {
    const fixed = new Set(questions.map((q) => q.id));
    const pool = await prisma.question.findMany({
      where: {
        unitId,
        archivedAt: null,
        // a graded CAT may only draw examination-office-approved questions
        ...(assessment.type && assessment.type !== "FORMATIVE_QUIZ" ? { approvedById: { not: null } } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
    const candidates = pool.filter((q: any) => !fixed.has(q.id));
    // Unseeded callers (analytics) get a stable draw too — the seed just fixes it to "no student".
    const drawn = drawRandom(candidates, rules, `${assessment.id}:${opts.seed ?? "pool"}`);
    questions = [...questions, ...drawn.map((q: any) => toResolved(q, q.marks))];
  }

  if (opts.seed) {
    const seed = `${assessment.id}:${opts.seed}`;
    if (assessment.shuffleQuestions) questions = seededShuffle(questions, seed);
    // QZ036 — option shuffling; when unset it follows shuffleQuestions, exactly as before.
    const shuffleOpts = assessment.shuffleOptions ?? assessment.shuffleQuestions;
    if (shuffleOpts) {
      questions = questions.map((q) => (q.type === "mcq" || q.type === "mcq_multi" ? { ...q, options: seededShuffle(q.options, `${seed}:${q.id}`) } : q));
    }
  }
  return { linked, questions };
}

function toResolved(q: any, marks: number): ResolvedQuestion {
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    options: q.options ?? [],
    marks,
    correctAnswer: q.correctAnswer ?? null,
    explanation: q.explanation ?? null,
    approved: !!q.approvedById,
    config: (q.config as QuestionConfig | null) ?? null,
    mediaUrl: q.mediaUrl ?? null,
    mediaKind: q.mediaKind ?? null,
    topic: q.topic ?? null,
    difficulty: q.difficulty ?? null,
    tags: q.tags ?? [],
  };
}

/** What a student (or a trainer's preview) may see — never the answer key. */
export function toStudentQuestion(q: ResolvedQuestion, seed?: string) {
  return studentView(q, seed);
}
