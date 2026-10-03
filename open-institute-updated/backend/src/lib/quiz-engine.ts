// Batch 76 — quiz engine v2 (LMS-QZ-006 … LMS-QZ-080).
//
// Pure functions only: no database, no Express. Everything that decides what
// a student is marked, when a quiz is open, and which attempt counts is here
// so it can be unit-tested on its own (tests/quiz-engine.test.ts).
//
// Backwards compatibility: a question with no `config`, of type mcq /
// short_answer / essay, scores EXACTLY as lib/quiz-scoring.ts's scoreQuiz()
// always did (see the "legacy parity" test). New behaviour only switches on
// when a question carries a new type or a config.

import { normaliseAnswer, round2, seededShuffle } from "./quiz-scoring.js";

// ---------------------------------------------------------------- types ----

export const QUESTION_TYPES = [
  "mcq", // single answer, pick one option (legacy + QZ006/QZ007)
  "mcq_multi", // QZ008 multiple correct answers
  "true_false", // QZ009 (stored as mcq True/False — see normaliseQuestion)
  "fill_blank", // QZ010
  "short_answer", // QZ011 (+ QZ024 multiple accepted answers)
  "numerical", // QZ012
  "matching", // QZ013
  "ordering", // QZ014
  "essay", // QZ015
  "case_study", // QZ019 manual
  "scenario", // QZ020 manual
  "practical", // QZ021 manual (competency demonstrated / not yet)
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Types a human must always mark. */
export const MANUAL_TYPES: readonly string[] = ["essay", "case_study", "scenario", "practical"];

export type QuestionConfig = {
  // type-specific answer keys
  correct?: string[]; // mcq_multi
  blanks?: string[][]; // fill_blank — accepted answers per blank
  acceptedAnswers?: string[]; // short_answer (QZ024)
  caseSensitive?: boolean;
  numeric?: { answer: number; tolerance?: number; toleranceType?: "abs" | "percent"; unit?: string }; // numerical
  pairs?: { left: string; right: string }[]; // matching
  order?: string[]; // ordering — correct sequence
  // marking policy (QZ025 / QZ026)
  partialCredit?: boolean;
  negativeFraction?: number; // 0..1 of the question's marks deducted for a wrong answer
  // authoring extras
  stem?: string; // QZ019/QZ020 shared case/scenario text
  answerFeedback?: Record<string, string>; // QZ027 per-option feedback
  incorrectExplanation?: string; // QZ029
  rubricHint?: string; // practical/essay marker guidance
};

export type EngineQuestion = {
  id: string;
  type: string;
  marks: number; // effective marks for this quiz
  correctAnswer?: string | null;
  options?: string[];
  config?: QuestionConfig | null;
  topic?: string | null;
  difficulty?: string | null;
};

export type EngineResponse = { questionId: string; answerGiven: string };

export type EngineOutcome = {
  questionId: string;
  maxMarks: number;
  isCorrect: boolean | null; // null = needs a human / unanswered manual
  partial: boolean; // earned some but not all marks
  marksAwarded: number | null; // may be negative when negative marking applies
  answered: boolean;
  needsManual: boolean;
};

export type EngineScore = {
  perQuestion: EngineOutcome[];
  fullyAutoMarkable: boolean;
  autoMarksScaled: number; // objective marks only, scaled to totalMarks, floored at 0
  score: number | null; // final when nothing needs a human
  correctCount: number;
  objectiveCount: number;
  manualCount: number;
};

// --------------------------------------------------------- answer parsing ----

export function parseJsonArray(raw: string): string[] | null {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map((x) => String(x)) : null;
  } catch {
    return null;
  }
}

export function parseJsonObject(raw: string): Record<string, string> | null {
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const out: Record<string, string> = {};
      for (const [k, val] of Object.entries(v)) out[k] = String(val);
      return out;
    }
    return null;
  } catch {
    return null;
  }
}

const norm = (s: string, caseSensitive = false) => {
  const t = s.trim().replace(/\s+/g, " ");
  return caseSensitive ? t : t.toLowerCase();
};

export function isAnswered(raw: string | undefined | null): boolean {
  if (typeof raw !== "string") return false;
  const t = raw.trim();
  if (t.length === 0) return false;
  if (t === "[]" || t === "{}") return false;
  return true;
}

/** Whether the system can mark this question without a human. */
export function isAutoMarkable(q: Pick<EngineQuestion, "type" | "correctAnswer" | "config">): boolean {
  const c = q.config ?? {};
  switch (q.type) {
    case "mcq":
    case "true_false":
      return typeof q.correctAnswer === "string" && q.correctAnswer.trim().length > 0;
    case "mcq_multi":
      return Array.isArray(c.correct) && c.correct.length > 0;
    case "fill_blank":
      return Array.isArray(c.blanks) && c.blanks.length > 0 && c.blanks.every((b) => Array.isArray(b) && b.length > 0);
    case "short_answer":
      return Array.isArray(c.acceptedAnswers) && c.acceptedAnswers.length > 0;
    case "numerical":
      return !!c.numeric && Number.isFinite(c.numeric.answer);
    case "matching":
      return Array.isArray(c.pairs) && c.pairs.length >= 2;
    case "ordering":
      return Array.isArray(c.order) && c.order.length >= 2;
    default:
      return false; // essay / case_study / scenario / practical
  }
}

// ----------------------------------------------------- per-question marking ----

/** Fraction of full marks earned: 0..1 (partial credit possible). */
export function fractionCorrect(q: EngineQuestion, raw: string): number {
  const c = q.config ?? {};
  switch (q.type) {
    case "mcq":
    case "true_false":
      return normaliseAnswer(raw) === normaliseAnswer(q.correctAnswer ?? "") ? 1 : 0;

    case "mcq_multi": {
      const chosen = parseJsonArray(raw) ?? [];
      const correct = (c.correct ?? []).map((x) => norm(x));
      const picked = new Set(chosen.map((x) => norm(x)));
      const options = (q.options ?? []).map((x) => norm(x));
      const hits = correct.filter((x) => picked.has(x)).length;
      const wrongPicks = [...picked].filter((x) => !correct.includes(x)).length;
      if (hits === correct.length && wrongPicks === 0) return 1;
      if (!c.partialCredit) return 0;
      // Standard "right picks minus wrong picks", never below zero.
      const denom = Math.max(1, correct.length);
      void options;
      return Math.max(0, (hits - wrongPicks) / denom);
    }

    case "fill_blank": {
      const blanks = c.blanks ?? [];
      const given = parseJsonArray(raw) ?? [raw];
      let ok = 0;
      blanks.forEach((accepted, i) => {
        const g = norm(given[i] ?? "", c.caseSensitive);
        if (accepted.some((a) => norm(a, c.caseSensitive) === g && g.length > 0)) ok++;
      });
      if (blanks.length === 0) return 0;
      if (ok === blanks.length) return 1;
      return c.partialCredit ? ok / blanks.length : 0;
    }

    case "short_answer": {
      const g = norm(raw, c.caseSensitive);
      if (!g) return 0;
      return (c.acceptedAnswers ?? []).some((a) => norm(a, c.caseSensitive) === g) ? 1 : 0;
    }

    case "numerical": {
      const n = c.numeric;
      if (!n) return 0;
      const given = parseNumber(raw, n.unit);
      if (given === null) return 0;
      const tol = n.tolerance ?? 0;
      const delta = Math.abs(given - n.answer);
      const allowed = n.toleranceType === "percent" ? (Math.abs(n.answer) * tol) / 100 : tol;
      // epsilon so 0.1+0.2 style float noise never costs a mark
      return delta <= allowed + 1e-9 ? 1 : 0;
    }

    case "matching": {
      const pairs = c.pairs ?? [];
      const given = parseJsonObject(raw) ?? {};
      const ok = pairs.filter((p) => given[p.left] !== undefined && norm(given[p.left]) === norm(p.right)).length;
      if (ok === pairs.length && pairs.length > 0) return 1;
      return c.partialCredit && pairs.length > 0 ? ok / pairs.length : 0;
    }

    case "ordering": {
      const order = c.order ?? [];
      const given = parseJsonArray(raw) ?? [];
      if (order.length === 0) return 0;
      const exact = order.length === given.length && order.every((x, i) => norm(x) === norm(given[i] ?? ""));
      if (exact) return 1;
      if (!c.partialCredit) return 0;
      const inPlace = order.filter((x, i) => norm(x) === norm(given[i] ?? "")).length;
      return inPlace / order.length;
    }

    default:
      return 0;
  }
}

/** "12.5", "12,5", "12.5 kg" (when unit is "kg") → 12.5. Returns null when it isn't a number. */
export function parseNumber(raw: string, unit?: string): number | null {
  let t = raw.trim();
  if (unit) {
    const u = unit.trim().toLowerCase();
    if (u && t.toLowerCase().endsWith(u)) t = t.slice(0, t.length - u.length).trim();
  }
  t = t.replace(/\s/g, "");
  // a lone comma is a decimal comma ("12,5"); "1,200.50" keeps its thousands separator
  if (/^-?\d+,\d+$/.test(t)) t = t.replace(",", ".");
  else t = t.replace(/,/g, "");
  if (!/^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function scoreQuestion(q: EngineQuestion, rawGiven: string | undefined): EngineOutcome {
  const answered = isAnswered(rawGiven);
  if (!isAutoMarkable(q)) {
    return { questionId: q.id, maxMarks: q.marks, isCorrect: null, partial: false, marksAwarded: null, answered, needsManual: true };
  }
  if (!answered) {
    return { questionId: q.id, maxMarks: q.marks, isCorrect: false, partial: false, marksAwarded: 0, answered, needsManual: false };
  }
  const frac = fractionCorrect(q, rawGiven!);
  const neg = clamp01(q.config?.negativeFraction ?? 0);
  // Negative marking (QZ026) only bites on a wholly wrong, ATTEMPTED answer.
  const marks = frac === 0 && neg > 0 ? -round2(q.marks * neg) : round2(q.marks * frac);
  return {
    questionId: q.id,
    maxMarks: q.marks,
    isCorrect: frac === 1,
    partial: frac > 0 && frac < 1,
    marksAwarded: marks,
    answered,
    needsManual: false,
  };
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

// ------------------------------------------------------------ whole quiz ----

export function scoreQuizV2(questions: EngineQuestion[], responses: EngineResponse[], totalMarks: number): EngineScore {
  const byQ = new Map(responses.map((r) => [r.questionId, r.answerGiven]));
  const maxSum = questions.reduce((s, q) => s + q.marks, 0);
  const scale = maxSum > 0 ? totalMarks / maxSum : 0;

  let earned = 0;
  let correctCount = 0;
  let objectiveCount = 0;
  let manualCount = 0;

  const perQuestion = questions.map((q) => {
    const o = scoreQuestion(q, byQ.get(q.id));
    if (o.needsManual) {
      manualCount++;
    } else {
      objectiveCount++;
      earned += o.marksAwarded ?? 0;
      if (o.isCorrect) correctCount++;
    }
    return o;
  });

  const fullyAutoMarkable = questions.length > 0 && manualCount === 0;
  // A quiz total can't go below zero however much negative marking piles up.
  const autoMarksScaled = Math.max(0, round2(earned * scale));
  return {
    perQuestion,
    fullyAutoMarkable,
    autoMarksScaled,
    score: fullyAutoMarkable ? autoMarksScaled : null,
    correctCount,
    objectiveCount,
    manualCount,
  };
}

/** Combines auto marks with a trainer's manual marks (QZ066 / QZ067). */
export function finalScoreWithManual(
  auto: Pick<EngineScore, "perQuestion">,
  manual: Record<string, number>,
  questions: Pick<EngineQuestion, "id" | "marks">[],
  totalMarks: number
): { score: number; complete: boolean } {
  const maxSum = questions.reduce((s, q) => s + q.marks, 0);
  const scale = maxSum > 0 ? totalMarks / maxSum : 0;
  let earned = 0;
  let complete = true;
  for (const o of auto.perQuestion) {
    if (o.needsManual) {
      const m = manual[o.questionId];
      if (m === undefined) complete = false;
      else earned += Math.min(o.maxMarks, Math.max(0, m));
    } else {
      earned += o.marksAwarded ?? 0;
    }
  }
  return { score: Math.max(0, round2(earned * scale)), complete };
}

// ------------------------------------------------- attempts → one grade ----

export type GradingMethod = "HIGHEST" | "AVERAGE" | "LATEST" | "FIRST";
export const GRADING_METHODS: readonly GradingMethod[] = ["HIGHEST", "AVERAGE", "LATEST", "FIRST"];

/** QZ051 / QZ052 / QZ053. Attempts with a null score (awaiting marking) are skipped. */
export function aggregateAttempts(attempts: { score: number | null; submittedAt: Date }[], method: GradingMethod): number | null {
  const graded = attempts.filter((a): a is { score: number; submittedAt: Date } => a.score !== null).sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
  if (graded.length === 0) return null;
  switch (method) {
    case "HIGHEST":
      return Math.max(...graded.map((a) => a.score));
    case "AVERAGE":
      return round2(graded.reduce((s, a) => s + a.score, 0) / graded.length);
    case "LATEST":
      return graded[graded.length - 1].score;
    case "FIRST":
      return graded[0].score;
  }
}

// ----------------------------------------------------- availability rules ----

export type AvailabilityInput = {
  isDraft: boolean;
  type: string;
  scheduledAt: Date | null; // legacy "opens at"
  durationMinutes: number | null;
  opensAt?: Date | null;
  closesAt?: Date | null;
  allowedIntakes?: string[];
  maxAttempts: number;
};
export type AvailabilityContext = { now: Date; studentIntake?: string | null; attemptsUsed: number; extraAttempts?: number; extendedCloseAt?: Date | null };
export type Availability = { open: boolean; code: "ok" | "draft" | "not_open" | "closed" | "group" | "no_attempts"; message: string };

export function checkAvailability(a: AvailabilityInput, ctx: AvailabilityContext): Availability {
  if (a.isDraft) return { open: false, code: "draft", message: "This quiz isn't published." };

  if (a.allowedIntakes && a.allowedIntakes.length > 0) {
    const ok = !!ctx.studentIntake && a.allowedIntakes.some((i) => norm(i) === norm(ctx.studentIntake!));
    if (!ok) return { open: false, code: "group", message: "This quiz isn't assigned to your group." };
  }

  const opens = a.opensAt ?? (a.type !== "FORMATIVE_QUIZ" ? a.scheduledAt : null);
  if (opens && ctx.now < opens) return { open: false, code: "not_open", message: `This quiz opens ${opens.toISOString()}.` };

  let closes = a.closesAt ?? null;
  if (!closes && a.scheduledAt && a.durationMinutes) closes = new Date(a.scheduledAt.getTime() + a.durationMinutes * 60_000); // legacy fixed sitting window
  if (ctx.extendedCloseAt && (!closes || ctx.extendedCloseAt > closes)) closes = ctx.extendedCloseAt; // QZ080
  if (closes && ctx.now > closes) return { open: false, code: "closed", message: "This quiz has closed." };

  if (ctx.attemptsUsed >= a.maxAttempts + (ctx.extraAttempts ?? 0)) {
    return { open: false, code: "no_attempts", message: "You have used all your attempts." };
  }
  return { open: true, code: "ok", message: "Open" };
}

// ------------------------------------------------ result / key visibility ----

export type VisibilityMode = "IMMEDIATE" | "AFTER_CLOSE" | "ON_RELEASE" | "HIDDEN";
export const VISIBILITY_MODES: readonly VisibilityMode[] = ["IMMEDIATE", "AFTER_CLOSE", "ON_RELEASE", "HIDDEN"];

export type VisibilityInput = {
  resultVisibility: string; // QZ071
  markingMode: string; // IMMEDIATE | DEFERRED (QZ063/QZ064)
  resultsPublished: boolean; // QZ069
  answerKeyReleaseAt?: Date | null; // QZ070
  closesAt?: Date | null;
};

export function canSeeScore(v: VisibilityInput, now: Date): boolean {
  if (v.resultVisibility === "HIDDEN") return false;
  if (v.markingMode === "DEFERRED" && !v.resultsPublished) return false; // deferred = nothing until released
  if (v.resultVisibility === "ON_RELEASE") return v.resultsPublished;
  if (v.resultVisibility === "AFTER_CLOSE") return !!v.closesAt && now > v.closesAt;
  return true;
}

export function canSeeAnswerKey(v: VisibilityInput, now: Date, allowFeedback: boolean): boolean {
  if (!allowFeedback) return false;
  if (!canSeeScore(v, now)) return false;
  if (v.answerKeyReleaseAt && now < v.answerKeyReleaseAt) return false;
  return true;
}

// ---------------------------------------------------- random selection ----

export type RandomRule = { count: number; topic?: string; difficulty?: string };

/** QZ035 — draw `count` questions per rule from a pool, stable per (seed). No question twice. */
export function drawRandom<T extends { id: string; topic?: string | null; difficulty?: string | null }>(pool: readonly T[], rules: RandomRule[], seed: string): T[] {
  const taken = new Set<string>();
  const out: T[] = [];
  rules.forEach((rule, ri) => {
    const candidates = pool.filter(
      (q) => !taken.has(q.id) && (!rule.topic || (q.topic ?? "") === rule.topic) && (!rule.difficulty || (q.difficulty ?? "") === rule.difficulty)
    );
    const picked = seededShuffle(candidates, `${seed}:rule${ri}`).slice(0, Math.max(0, rule.count));
    for (const p of picked) {
      taken.add(p.id);
      out.push(p);
    }
  });
  return out;
}

export function parseRandomRules(input: unknown): RandomRule[] {
  if (!Array.isArray(input)) return [];
  const out: RandomRule[] = [];
  for (const r of input) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const count = Number(o.count);
    if (!Number.isInteger(count) || count < 1 || count > 200) continue;
    out.push({
      count,
      topic: typeof o.topic === "string" && o.topic.trim() ? o.topic.trim() : undefined,
      difficulty: typeof o.difficulty === "string" && ["easy", "medium", "hard"].includes(o.difficulty) ? o.difficulty : undefined,
    });
  }
  return out;
}

// ---------------------------------------------------------- pagination ----

/** QZ056 / QZ057 — split into pages. perPage 0/undefined = everything on one page; 1 = one at a time. */
export function paginate<T>(items: readonly T[], perPage: number | null | undefined): T[][] {
  const n = !perPage || perPage < 1 ? items.length || 1 : Math.floor(perPage);
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += n) pages.push(items.slice(i, i + n));
  return pages.length ? pages : [[]];
}

// ------------------------------------------------ question authoring ----

export type QuestionInput = {
  type: string;
  prompt: string;
  options?: string[];
  correctAnswer?: string;
  config?: QuestionConfig;
};
export type NormalisedQuestion = { type: string; options: string[]; correctAnswer: string | null; config: QuestionConfig | null };

const isType = (t: string): t is QuestionType => (QUESTION_TYPES as readonly string[]).includes(t);

/** Validates + canonicalises authoring input for every type. Returns a message when invalid. */
export function normaliseQuestion(d: QuestionInput): NormalisedQuestion | string {
  if (!isType(d.type)) return "Unknown question type.";
  const cfg: QuestionConfig = { ...(d.config ?? {}) };
  const policy = (): QuestionConfig => {
    const out: QuestionConfig = {};
    if (cfg.partialCredit) out.partialCredit = true;
    if (cfg.negativeFraction && cfg.negativeFraction > 0) {
      if (cfg.negativeFraction > 1) return out;
      out.negativeFraction = round2(cfg.negativeFraction);
    }
    if (cfg.stem?.trim()) out.stem = cfg.stem.trim();
    if (cfg.incorrectExplanation?.trim()) out.incorrectExplanation = cfg.incorrectExplanation.trim();
    if (cfg.answerFeedback && Object.keys(cfg.answerFeedback).length) out.answerFeedback = cfg.answerFeedback;
    if (cfg.rubricHint?.trim()) out.rubricHint = cfg.rubricHint.trim();
    return out;
  };
  if (cfg.negativeFraction !== undefined && (cfg.negativeFraction < 0 || cfg.negativeFraction > 1)) {
    return "Negative marking must be between 0 and 100% of the question's marks.";
  }
  const pol = policy();

  switch (d.type) {
    case "true_false": {
      const a = normaliseAnswer(d.correctAnswer ?? "");
      if (a !== "true" && a !== "false") return "Choose whether the statement is True or False.";
      return { type: "mcq", options: ["True", "False"], correctAnswer: a === "true" ? "True" : "False", config: Object.keys(pol).length ? pol : null };
    }
    case "mcq": {
      const options = (d.options ?? []).map((o) => o.trim());
      const p = validateOptions(options);
      if (p) return p;
      const hit = options.find((o) => normaliseAnswer(o) === normaliseAnswer(d.correctAnswer ?? ""));
      if (!hit) return "Mark which option is the correct answer (it must match one of the options).";
      return { type: "mcq", options, correctAnswer: hit, config: Object.keys(pol).length ? pol : null };
    }
    case "mcq_multi": {
      const options = (d.options ?? []).map((o) => o.trim());
      const p = validateOptions(options);
      if (p) return p;
      const correct = (cfg.correct ?? []).map((c) => c.trim()).filter(Boolean);
      if (correct.length < 1) return "Mark at least one correct option.";
      const canon: string[] = [];
      for (const c of correct) {
        const hit = options.find((o) => norm(o) === norm(c));
        if (!hit) return "Every correct answer must match one of the options.";
        if (!canon.includes(hit)) canon.push(hit);
      }
      if (canon.length === options.length) return "Not every option can be correct.";
      return { type: "mcq_multi", options, correctAnswer: null, config: { ...pol, correct: canon } };
    }
    case "fill_blank": {
      const blanks = (cfg.blanks ?? []).map((b) => b.map((x) => x.trim()).filter(Boolean));
      if (blanks.length < 1 || blanks.some((b) => b.length === 0)) return "Give at least one accepted answer for every blank.";
      if (blanks.length > 10) return "At most ten blanks per question.";
      const markers = (d.prompt.match(/_{3,}/g) ?? []).length;
      if (markers !== blanks.length) return `The question text needs ${blanks.length} blank marker(s) written as ___ (found ${markers}).`;
      return { type: "fill_blank", options: [], correctAnswer: null, config: { ...pol, blanks, caseSensitive: !!cfg.caseSensitive } };
    }
    case "short_answer": {
      // Only explicit accepted answers switch on auto-marking. `correctAnswer` stays what it always was for a
      // short answer: a model answer shown to the marker, NOT a key (so older hand-marked questions stay hand-marked).
      const accepted = (cfg.acceptedAnswers ?? []).map((a) => a.trim()).filter(Boolean);
      const unique = [...new Set(accepted)];
      // With accepted answers the question is auto-marked (QZ024); without, it stays hand-marked like before.
      return { type: "short_answer", options: [], correctAnswer: d.correctAnswer?.trim() || null, config: unique.length ? { ...pol, acceptedAnswers: unique, caseSensitive: !!cfg.caseSensitive } : Object.keys(pol).length ? pol : null };
    }
    case "numerical": {
      const n = cfg.numeric;
      if (!n || !Number.isFinite(n.answer)) return "Enter the correct numeric answer.";
      if (n.tolerance !== undefined && (!Number.isFinite(n.tolerance) || n.tolerance < 0)) return "Tolerance can't be negative.";
      if (n.toleranceType === "percent" && (n.tolerance ?? 0) > 100) return "A percentage tolerance can't exceed 100.";
      return { type: "numerical", options: [], correctAnswer: String(n.answer), config: { ...pol, numeric: { answer: n.answer, tolerance: n.tolerance ?? 0, toleranceType: n.toleranceType ?? "abs", unit: n.unit?.trim() || undefined } } };
    }
    case "matching": {
      const pairs = (cfg.pairs ?? []).map((p) => ({ left: p.left.trim(), right: p.right.trim() })).filter((p) => p.left && p.right);
      if (pairs.length < 2) return "A matching question needs at least two pairs.";
      if (pairs.length > 10) return "At most ten pairs per matching question.";
      if (new Set(pairs.map((p) => norm(p.left))).size !== pairs.length) return "The left-hand items must all be different.";
      return { type: "matching", options: pairs.map((p) => p.right), correctAnswer: null, config: { ...pol, pairs } };
    }
    case "ordering": {
      const order = (cfg.order ?? []).map((x) => x.trim()).filter(Boolean);
      if (order.length < 2) return "An ordering question needs at least two items.";
      if (order.length > 12) return "At most twelve items per ordering question.";
      if (new Set(order.map((x) => norm(x))).size !== order.length) return "Ordering items must all be different.";
      return { type: "ordering", options: order, correctAnswer: null, config: { ...pol, order } };
    }
    case "essay":
    case "case_study":
    case "scenario":
    case "practical": {
      if ((d.type === "case_study" || d.type === "scenario") && !pol.stem) return "Write the case study / scenario text for students to read.";
      return { type: d.type, options: [], correctAnswer: d.correctAnswer?.trim() || null, config: Object.keys(pol).length ? pol : null };
    }
  }
  return "Unsupported question.";
}

export function validateOptions(options: string[]): string | null {
  if (options.length < 2) return "A multiple-choice question needs at least two options.";
  if (options.length > 8) return "A multiple-choice question can have at most eight options.";
  if (options.some((o) => o.length === 0)) return "Options can't be blank.";
  if (new Set(options.map(normaliseAnswer)).size !== options.length) return "Options must all be different.";
  return null;
}

/** What a student may see of a question — never the answer key. Matching/ordering get their items shuffled per student. */
export function studentView(q: EngineQuestion & { prompt: string; mediaUrl?: string | null; mediaKind?: string | null }, seed?: string) {
  const c = q.config ?? {};
  const base = { id: q.id, type: q.type, prompt: q.prompt, marks: q.marks, mediaUrl: q.mediaUrl ?? null, mediaKind: q.mediaKind ?? null, stem: c.stem ?? null };
  switch (q.type) {
    case "matching": {
      const pairs = c.pairs ?? [];
      const rights = pairs.map((p) => p.right);
      return { ...base, options: seed ? seededShuffle(rights, `${seed}:${q.id}:r`) : rights, lefts: pairs.map((p) => p.left) };
    }
    case "ordering": {
      const items = c.order ?? [];
      const shuffled = seed ? seededShuffle(items, `${seed}:${q.id}:o`) : items;
      // never hand back the answer order verbatim
      const same = items.length > 1 && shuffled.every((x, i) => x === items[i]);
      return { ...base, options: same ? [...shuffled.slice(1), shuffled[0]] : shuffled };
    }
    case "fill_blank":
      return { ...base, options: [], blanks: (c.blanks ?? []).length };
    case "numerical":
      return { ...base, options: [], unit: c.numeric?.unit ?? null };
    default:
      return { ...base, options: q.options ?? [] };
  }
}

/** Human-readable correct answer for the review screen (only ever sent when the key may be shown). */
export function describeCorrect(q: EngineQuestion): string | null {
  const c = q.config ?? {};
  switch (q.type) {
    case "mcq":
    case "true_false":
      return q.correctAnswer ?? null;
    case "mcq_multi":
      return (c.correct ?? []).join("; ") || null;
    case "fill_blank":
      return (c.blanks ?? []).map((b, i) => `(${i + 1}) ${b.join(" / ")}`).join("  ") || null;
    case "short_answer":
      return (c.acceptedAnswers ?? []).join(" / ") || null;
    case "numerical":
      return c.numeric ? `${c.numeric.answer}${c.numeric.unit ? " " + c.numeric.unit : ""}${c.numeric.tolerance ? ` (±${c.numeric.tolerance}${c.numeric.toleranceType === "percent" ? "%" : ""})` : ""}` : null;
    case "matching":
      return (c.pairs ?? []).map((p) => `${p.left} → ${p.right}`).join("; ") || null;
    case "ordering":
      return (c.order ?? []).join(" → ") || null;
    default:
      return null;
  }
}

// ----------------------------------------------- CSV import / export ----

/** Minimal RFC-4180 CSV parser (quotes, doubled quotes, CRLF). Pure so it's testable without a dependency. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Guard against spreadsheet formula injection when staff open the export.
    const safe = /^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

export const CSV_HEADER = ["type", "prompt", "marks", "difficulty", "topic", "options", "correct", "explanation", "tags"] as const;

export type ImportedQuestion = {
  row: number;
  type: string;
  prompt: string;
  marks: number;
  difficulty: "easy" | "medium" | "hard";
  topic?: string;
  explanation?: string;
  tags: string[];
  normalised: NormalisedQuestion;
};
export type ImportResult = { questions: ImportedQuestion[]; errors: { row: number; message: string }[] };

/**
 * QZ041 / QZ042 — bulk import. Columns: type, prompt, marks, difficulty, topic,
 * options (pipe-separated), correct (pipe-separated for multi/matching/ordering),
 * explanation, tags (pipe-separated). Matching: options = "left=right|left=right".
 * Ordering: correct = items in the right order. Numerical: correct = "12.5" or
 * "12.5±0.5". Fill-blank: correct = "ans1/alt|ans2" (one group per blank).
 */
export function parseQuestionCsv(text: string): ImportResult {
  const rows = parseCsv(text);
  const errors: ImportResult["errors"] = [];
  const questions: ImportedQuestion[] = [];
  if (rows.length < 2) return { questions, errors: [{ row: 1, message: "The file needs a header row and at least one question." }] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  for (const need of ["type", "prompt"]) if (col(need) < 0) return { questions, errors: [{ row: 1, message: `Missing required column "${need}".` }] };
  if (rows.length - 1 > 500) return { questions, errors: [{ row: 1, message: "Import at most 500 questions at a time." }] };
  const cell = (r: string[], name: string) => (col(name) >= 0 ? (r[col(name)] ?? "").trim() : "");
  const list = (s: string) => s.split("|").map((x) => x.trim()).filter(Boolean);

  rows.slice(1).forEach((r, idx) => {
    const rowNo = idx + 2;
    const type = cell(r, "type").toLowerCase().replace(/[\s-]+/g, "_");
    const prompt = cell(r, "prompt");
    if (!prompt) return errors.push({ row: rowNo, message: "Missing question text." });
    const marks = cell(r, "marks") ? Number(cell(r, "marks")) : 1;
    if (!Number.isInteger(marks) || marks < 1 || marks > 100) return errors.push({ row: rowNo, message: "Marks must be a whole number from 1 to 100." });
    const dRaw = cell(r, "difficulty").toLowerCase();
    const difficulty = dRaw === "easy" || dRaw === "hard" ? dRaw : "medium";
    const options = list(cell(r, "options"));
    const correct = cell(r, "correct");

    const input: QuestionInput = { type, prompt, options, correctAnswer: correct };
    const config: QuestionConfig = {};
    switch (type) {
      case "mcq_multi":
        config.correct = list(correct);
        break;
      case "fill_blank":
        config.blanks = list(correct).map((g) => g.split("/").map((x) => x.trim()).filter(Boolean));
        break;
      case "short_answer":
        config.acceptedAnswers = list(correct);
        break;
      case "numerical": {
        const m = /^(-?[\d.,]+)\s*(?:±|\+-)\s*([\d.,]+)$/.exec(correct);
        const ans = parseNumber(m ? m[1] : correct);
        if (ans === null) return errors.push({ row: rowNo, message: "Numerical answer must be a number, optionally like 12.5±0.5." });
        config.numeric = { answer: ans, tolerance: m ? (parseNumber(m[2]) ?? 0) : 0, toleranceType: "abs" };
        break;
      }
      case "matching":
        config.pairs = list(cell(r, "options")).map((p) => {
          const [left, ...rest] = p.split("=");
          return { left: (left ?? "").trim(), right: rest.join("=").trim() };
        });
        break;
      case "ordering":
        config.order = list(correct);
        break;
    }
    input.config = config;
    const normalised = normaliseQuestion(input);
    if (typeof normalised === "string") return errors.push({ row: rowNo, message: normalised });
    questions.push({ row: rowNo, type, prompt, marks, difficulty, topic: cell(r, "topic") || undefined, explanation: cell(r, "explanation") || undefined, tags: list(cell(r, "tags")), normalised });
  });
  return { questions, errors };
}

/** Inverse of the importer, so an export can be re-imported. */
export function questionToCsvRow(q: {
  type: string;
  prompt: string;
  marks: number;
  difficulty: string;
  topic: string | null;
  options: string[];
  correctAnswer: string | null;
  explanation: string | null;
  tags: string[];
  config: QuestionConfig | null;
}): (string | number)[] {
  const c = q.config ?? {};
  let type = q.type;
  let options = q.options.join("|");
  let correct = q.correctAnswer ?? "";
  if (q.type === "mcq" && q.options.length === 2 && q.options[0] === "True" && q.options[1] === "False") {
    type = "true_false";
    options = "";
  }
  switch (q.type) {
    case "mcq_multi":
      correct = (c.correct ?? []).join("|");
      break;
    case "fill_blank":
      correct = (c.blanks ?? []).map((b) => b.join("/")).join("|");
      options = "";
      break;
    case "short_answer":
      correct = (c.acceptedAnswers ?? (q.correctAnswer ? [q.correctAnswer] : [])).join("|");
      break;
    case "numerical":
      correct = c.numeric ? `${c.numeric.answer}${c.numeric.tolerance ? `±${c.numeric.tolerance}` : ""}` : "";
      options = "";
      break;
    case "matching":
      options = (c.pairs ?? []).map((p) => `${p.left}=${p.right}`).join("|");
      correct = "";
      break;
    case "ordering":
      correct = (c.order ?? []).join("|");
      options = "";
      break;
  }
  return [type, q.prompt, q.marks, q.difficulty, q.topic ?? "", options, correct, q.explanation ?? "", q.tags.join("|")];
}

// --------------------------------------------------- question analytics ----

/** QZ077 — classical item statistics. `upper`/`lower` are the top and bottom 27% of attempts by total score. */
export function itemStats(perAttempt: { total: number; got: number | null }[]): { difficultyIndex: number | null; discrimination: number | null; n: number } {
  const rows = perAttempt.filter((r): r is { total: number; got: number } => r.got !== null);
  const n = rows.length;
  if (n === 0) return { difficultyIndex: null, discrimination: null, n: 0 };
  const p = rows.reduce((s, r) => s + r.got, 0) / n; // proportion correct (0..1)
  if (n < 6) return { difficultyIndex: round2(p), discrimination: null, n };
  const sorted = rows.slice().sort((a, b) => b.total - a.total);
  const k = Math.max(1, Math.round(n * 0.27));
  const upper = sorted.slice(0, k);
  const lower = sorted.slice(-k);
  const pu = upper.reduce((s, r) => s + r.got, 0) / k;
  const pl = lower.reduce((s, r) => s + r.got, 0) / k;
  return { difficultyIndex: round2(p), discrimination: round2(pu - pl), n };
}

export function classifyItem(difficultyIndex: number | null, discrimination: number | null): "too_easy" | "too_hard" | "poor_discrimination" | "good" | "insufficient_data" {
  if (difficultyIndex === null) return "insufficient_data";
  if (discrimination !== null && discrimination < 0.1) return "poor_discrimination";
  if (difficultyIndex > 0.9) return "too_easy";
  if (difficultyIndex < 0.2) return "too_hard";
  return "good";
}

// ---------------------------------------------------------- review items ----

export type ReviewQuestion = EngineQuestion & { prompt: string; explanation?: string | null };
export type ReviewOutcome = { isCorrect: boolean | null; partial?: boolean; marksAwarded: number | null; markerFeedback?: string | null };

/**
 * QZ027 / QZ028 / QZ029 / QZ059 / QZ075 — the per-question review a student
 * sees after an attempt. Pure: callers decide WHETHER the key may be shown
 * (canSeeAnswerKey) and only then call this.
 */
export function buildReviewItems(questions: ReviewQuestion[], outcomes: Map<string, ReviewOutcome>, answers: Map<string, string>) {
  return questions.map((q) => {
    const o = outcomes.get(q.id);
    const given = answers.get(q.id) ?? null;
    const cfg = q.config ?? null;
    const wrongOrPartial = o?.isCorrect === false || !!o?.partial;
    return {
      questionId: q.id,
      prompt: q.prompt,
      type: q.type,
      yourAnswer: given,
      isCorrect: o?.isCorrect ?? null,
      partial: o?.partial ?? false,
      correctAnswer: describeCorrect(q),
      explanation: q.explanation ?? null,
      answerFeedback: given && cfg?.answerFeedback ? cfg.answerFeedback[given] ?? null : null,
      incorrectExplanation: wrongOrPartial ? cfg?.incorrectExplanation ?? null : null,
      markerFeedback: o?.markerFeedback ?? null,
      marks: q.marks,
      marksAwarded: o?.marksAwarded ?? null,
    };
  });
}

/** Percent of a quiz's marks, for pass/fail. null when no pass mark or no score. */
export function passedQuiz(score: number | null, totalMarks: number, passMarkPercent: number | null): boolean | null {
  if (score === null || passMarkPercent == null || totalMarks <= 0) return null;
  return (score / totalMarks) * 100 >= passMarkPercent;
}
