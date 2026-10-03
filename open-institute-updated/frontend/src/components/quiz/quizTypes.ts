// Batch 76 — shared quiz types/labels (mirrors backend lib/quiz-engine.ts).

export type QuestionConfig = {
  correct?: string[];
  blanks?: string[][];
  acceptedAnswers?: string[];
  caseSensitive?: boolean;
  numeric?: { answer: number; tolerance?: number; toleranceType?: "abs" | "percent"; unit?: string };
  pairs?: { left: string; right: string }[];
  order?: string[];
  partialCredit?: boolean;
  negativeFraction?: number;
  stem?: string;
  answerFeedback?: Record<string, string>;
  incorrectExplanation?: string;
  rubricHint?: string;
};

export const TYPE_LABEL: Record<string, string> = {
  mcq: "Multiple choice (one answer)",
  mcq_multi: "Multiple choice (several answers)",
  true_false: "True / False",
  fill_blank: "Fill in the blank(s)",
  short_answer: "Short answer",
  numerical: "Numerical",
  matching: "Matching",
  ordering: "Ordering / sequencing",
  essay: "Essay",
  case_study: "Case study",
  scenario: "Scenario",
  practical: "Practical competency",
};
export const MANUAL_TYPES = ["essay", "case_study", "scenario", "practical"];
export const TYPE_ORDER = Object.keys(TYPE_LABEL);

/** Label for a stored question (a True/False is stored as a 2-option mcq). */
export function typeLabelOf(type: string, options: string[]): string {
  if (type === "mcq" && options.length === 2 && options[0] === "True" && options[1] === "False") return TYPE_LABEL.true_false;
  return TYPE_LABEL[type] ?? type;
}
export const isTrueFalse = (type: string, options: string[]) => type === "mcq" && options.length === 2 && options[0] === "True" && options[1] === "False";

export type QuestionPayload = {
  type: string;
  prompt: string;
  options?: string[];
  correctAnswer?: string;
  marks: number;
  difficulty: string;
  topic?: string;
  explanation?: string;
  config?: QuestionConfig;
  mediaUrl?: string | null;
  mediaKind?: "image" | "audio" | "video" | null;
  tags?: string[];
};

export type QuizQuestion = {
  questionId: string; order: number; marks: number; marksOverride: number | null; type: string; prompt: string; options: string[];
  correctAnswer: string | null; explanation: string | null; difficulty: string; topic: string | null; approved: boolean;
  config: QuestionConfig | null; mediaUrl: string | null; mediaKind: string | null; tags: string[]; version: number; autoMarked: boolean;
};

export type Quiz = {
  id: string; courseId: string; unitId: string; title: string; type: string; isDraft: boolean; instructions: string | null; durationMinutes: number | null; maxAttempts: number;
  scheduledAt: string | null; shuffleQuestions: boolean; passMarkPercent: number | null; showFeedbackAfterSubmit: boolean; totalMarks: number;
  attempts: number; locked: boolean; usesUnitPool: boolean; questions: QuizQuestion[];
  opensAt: string | null; closesAt: string | null; gradingMethod: string; questionsPerPage: number | null; navigationMode: string; markingMode: string;
  resultVisibility: string; answerKeyReleaseAt: string | null; allowedIntakes: string[]; shuffleOptions: boolean | null; retakeCooldownMins: number;
  randomRules: { count: number; topic?: string; difficulty?: string }[]; resultsPublished: boolean;
};

/** What the student is served for one question (no answer key). */
export type StudentQuestion = {
  id: string; type: string; prompt: string; marks: number; options: string[];
  mediaUrl?: string | null; mediaKind?: string | null; stem?: string | null;
  lefts?: string[]; blanks?: number; unit?: string | null;
};

/** Pages of `perPage` questions; 0/null = all on one page. */
export function paginate<T>(items: T[], perPage: number | null | undefined): T[][] {
  const n = !perPage || perPage < 1 ? items.length || 1 : Math.floor(perPage);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out.length ? out : [[]];
}
