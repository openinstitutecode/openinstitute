// Batch 77 — LMS gradebook maths (LMS-GRD-005…018, 029, 036, 038). Pure logic, no database.
import { percentToLetterGrade, PASS_MARK_PERCENT } from "./grade-scale.js";
import { scoreStats } from "./score-stats.js";

export const GRADE_CATEGORIES = ["FORMATIVE_QUIZ", "ASSIGNMENT", "PRACTICAL", "PROJECT", "CAT", "FINAL_EXAM"] as const;
export type GradeCategory = (typeof GRADE_CATEGORIES)[number];

const r1 = (n: number) => Math.round(n * 10) / 10;

export type GradeItem = {
  id: string;
  kind: "ASSESSMENT" | "ASSIGNMENT";
  title: string;
  category: string;
  totalMarks: number;
  /** Assessments: only published results count. Assignments: only released grades count. */
  open?: boolean;
};

export type StudentScore = { itemId: string; score: number | null; submitted: boolean };

/** GRD015/016 — overall course percentage. Categories with no graded work yet are left out and the rest re-scaled. */
export function weightedCourseGrade(
  cells: { category: string; percent: number | null }[],
  weights: Record<string, number>
): { percent: number | null; letter: string | null; weighted: boolean; coveredWeight: number; totalWeight: number; byCategory: { category: string; averagePercent: number | null; items: number; graded: number; weight: number }[] } {
  const cats = new Map<string, { sum: number; graded: number; items: number }>();
  for (const c of cells) {
    const e = cats.get(c.category) ?? { sum: 0, graded: 0, items: 0 };
    e.items++;
    if (c.percent !== null) { e.sum += c.percent; e.graded++; }
    cats.set(c.category, e);
  }
  const byCategory = [...cats.entries()].map(([category, e]) => ({ category, averagePercent: e.graded ? r1(e.sum / e.graded) : null, items: e.items, graded: e.graded, weight: weights[category] ?? 0 }));
  const totalWeight = Object.values(weights).reduce((s, w) => s + (w > 0 ? w : 0), 0);
  const withData = byCategory.filter((c) => c.averagePercent !== null);
  if (!withData.length) return { percent: null, letter: null, weighted: totalWeight > 0, coveredWeight: 0, totalWeight, byCategory };

  const weightedCats = withData.filter((c) => c.weight > 0);
  if (totalWeight > 0 && weightedCats.length) {
    const covered = weightedCats.reduce((s, c) => s + c.weight, 0);
    const pct = weightedCats.reduce((s, c) => s + (c.averagePercent as number) * c.weight, 0) / covered;
    return { percent: r1(pct), letter: percentToLetterGrade(pct), weighted: true, coveredWeight: covered, totalWeight, byCategory };
  }
  // No weights configured: every graded item counts equally.
  const all = cells.filter((c) => c.percent !== null).map((c) => c.percent as number);
  const pct = all.reduce((s, v) => s + v, 0) / all.length;
  return { percent: r1(pct), letter: percentToLetterGrade(pct), weighted: false, coveredWeight: 0, totalWeight, byCategory };
}

/** GRD005-009 — weights must be non-negative and add up to 100. */
export function validateWeights(weights: { category: string; weightPercent: number }[]): string | null {
  const seen = new Set<string>();
  for (const w of weights) {
    if (!(GRADE_CATEGORIES as readonly string[]).includes(w.category)) return `Unknown category "${w.category}".`;
    if (seen.has(w.category)) return `Category "${w.category}" appears twice.`;
    seen.add(w.category);
    if (!Number.isFinite(w.weightPercent) || w.weightPercent < 0 || w.weightPercent > 100) return `The weight for ${w.category} must be between 0 and 100.`;
  }
  const total = weights.reduce((s, w) => s + w.weightPercent, 0);
  if (weights.length && Math.abs(total - 100) > 0.01) return `Weights add up to ${r1(total)}%, not 100%.`;
  return null;
}

/** GRD017/018 — what a student still owes: graded vs. missing vs. awaiting a mark. */
export function classifyCell(item: { open?: boolean }, s: StudentScore | undefined, isPastDue: boolean): "GRADED" | "MISSING" | "AWAITING" | "NOT_DUE" {
  if (s && s.score !== null) return "GRADED";
  if (s && s.submitted) return "AWAITING";
  return isPastDue ? "MISSING" : "NOT_DUE";
}

/** GRD038 — a stored course grade that no longer matches the freshly computed one. */
export function gradeDiscrepancy(stored: string | null | undefined, computed: string | null): { mismatch: boolean; note: string } {
  if (!stored || !computed) return { mismatch: false, note: "" };
  const s = stored.trim().toUpperCase(), c = computed.trim().toUpperCase();
  return s === c ? { mismatch: false, note: "" } : { mismatch: true, note: `Recorded ${s}, computed ${c}.` };
}

/** GRD029/030/033/036 — class-level numbers for one item. */
export function itemSummary(percents: number[], expected: number) {
  const st = scoreStats(percents, PASS_MARK_PERCENT);
  const difficulty = st.mean === null ? null : st.mean >= 75 ? "EASY" : st.mean >= 50 ? "MODERATE" : st.mean >= 35 ? "HARD" : "VERY_HARD";
  return { ...st, expected, completionPercent: expected ? r1((percents.length / expected) * 100) : null, difficulty };
}

/** GRD031 — trend over a student's graded work in date order: the slope of percent over sequence. */
export function trend(percentsInOrder: number[]): { direction: "IMPROVING" | "DECLINING" | "STEADY" | "INSUFFICIENT"; slope: number | null } {
  const n = percentsInOrder.length;
  if (n < 3) return { direction: "INSUFFICIENT", slope: null };
  const xs = percentsInOrder.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = percentsInOrder.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (percentsInOrder[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0) || 1;
  const slope = num / den;
  return { direction: slope > 2 ? "IMPROVING" : slope < -2 ? "DECLINING" : "STEADY", slope: r1(slope) };
}
