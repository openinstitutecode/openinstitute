// TP011 — pure quiz scoring + question ordering. No database access here on
// purpose: the rules that decide a student's mark should be readable (and
// unit-testable) on their own.

export type ScoreQuestion = {
  id: string;
  type: string; // mcq | short_answer | essay
  marks: number; // effective marks for THIS quiz (link override already applied)
  correctAnswer?: string | null;
  explanation?: string | null;
  prompt?: string;
};

export type ScoreResponse = { questionId: string; answerGiven: string };

export type QuestionOutcome = {
  questionId: string;
  maxMarks: number;
  isCorrect: boolean | null; // null = needs a human (non-objective) or unanswered non-objective
  marksAwarded: number | null;
  answered: boolean;
};

export type QuizScore = {
  perQuestion: QuestionOutcome[];
  /** Every question is objective (mcq) → the whole attempt can be scored by the system. */
  fullyAutoMarkable: boolean;
  /** Marks earned on the objective questions only, scaled to `totalMarks`. */
  autoMarksScaled: number;
  /** Final score, scaled to totalMarks; null while any question still needs a human. */
  score: number | null;
  correctCount: number;
  objectiveCount: number;
};

export function normaliseAnswer(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isObjective(q: Pick<ScoreQuestion, "type" | "correctAnswer">): boolean {
  return q.type === "mcq" && typeof q.correctAnswer === "string" && q.correctAnswer.trim().length > 0;
}

/**
 * Scores an attempt against the FULL question set of the quiz — an unanswered
 * question counts as zero rather than shrinking the denominator (the earlier
 * unit-pool scorer only divided by questions the student happened to answer).
 * The result is scaled so a perfect attempt equals `totalMarks`, whatever the
 * per-question marks add up to.
 */
export function scoreQuiz(questions: ScoreQuestion[], responses: ScoreResponse[], totalMarks: number): QuizScore {
  const byQuestion = new Map(responses.map((r) => [r.questionId, r.answerGiven]));
  const maxSum = questions.reduce((s, q) => s + q.marks, 0);
  const scale = maxSum > 0 ? totalMarks / maxSum : 0;

  let earned = 0;
  let correctCount = 0;
  let objectiveCount = 0;

  const perQuestion: QuestionOutcome[] = questions.map((q) => {
    const given = byQuestion.get(q.id);
    const answered = typeof given === "string" && given.trim().length > 0;
    if (!isObjective(q)) {
      return { questionId: q.id, maxMarks: q.marks, isCorrect: null, marksAwarded: null, answered };
    }
    objectiveCount++;
    const correct = answered && normaliseAnswer(given!) === normaliseAnswer(q.correctAnswer!);
    if (correct) {
      earned += q.marks;
      correctCount++;
    }
    return { questionId: q.id, maxMarks: q.marks, isCorrect: correct, marksAwarded: correct ? q.marks : 0, answered };
  });

  const fullyAutoMarkable = questions.length > 0 && objectiveCount === questions.length;
  const autoMarksScaled = round2(earned * scale);
  return {
    perQuestion,
    fullyAutoMarkable,
    autoMarksScaled,
    score: fullyAutoMarkable ? autoMarksScaled : null,
    correctCount,
    objectiveCount,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- deterministic shuffle, so a student who refreshes mid-attempt sees the
// same order, while different students (and different quizzes) differ. ------

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const rand = mulberry32(hashSeed(seed));
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Grace (ms) allowed after the time limit for network latency on submit. */
export const SUBMIT_GRACE_MS = 60_000;

// EX018 — Batch 56: an approved ExamAccommodation grants a student extra
// time on top of the assessment's normal duration. `extraMinutes` defaults
// to 0 so every existing call site (no accommodation on file) behaves
// exactly as before.
export function attemptDeadline(
  startedAt: Date,
  durationMinutes: number | null | undefined,
  extraMinutes: number = 0
): Date | null {
  if (!durationMinutes) return null;
  return new Date(startedAt.getTime() + (durationMinutes + Math.max(0, extraMinutes)) * 60_000);
}

export function isPastDeadline(deadline: Date | null, now = new Date()): boolean {
  return !!deadline && now.getTime() > deadline.getTime() + SUBMIT_GRACE_MS;
}

/** Validates the authoring-side shape of an mcq question. Returns a message or null. */
export function validateMcq(options: string[], correctAnswer: string | undefined | null): string | null {
  const clean = options.map((o) => o.trim());
  if (clean.length < 2) return "A multiple-choice question needs at least two options.";
  if (clean.length > 8) return "A multiple-choice question can have at most eight options.";
  if (clean.some((o) => o.length === 0)) return "Options can't be blank.";
  if (new Set(clean.map(normaliseAnswer)).size !== clean.length) return "Options must all be different.";
  if (!correctAnswer || !clean.some((o) => normaliseAnswer(o) === normaliseAnswer(correctAnswer))) {
    return "Mark which option is the correct answer (it must match one of the options).";
  }
  return null;
}
