// VBI027 — Rubric Mapping, criterion by criterion (Batch 66). Pure logic, no database.
//
// The Lab judges each criterion as met / not met. The portal's Rubric.criteria are numeric
// ({ name, description?, maxMarks }). An admin maps each Lab criterion code onto the portal
// criterion it evidences (IntegrationRubricCriterionMapping); this turns one Lab decision into a
// Submission.criteriaScores array in the shape EX021 already uses ([{ name, maxMarks, score }]).
//
// Rules (deliberately conservative — a wrong per-criterion mark is worse than none):
//  * A portal criterion fed by several Lab criteria is "met" only if ALL of them are met.
//  * Met => full maxMarks, not met => 0. There is no partial credit: the Lab has no such notion.
//  * If ANY portal criterion cannot be resolved (no mapping, or the Lab sent no verdict for a
//    mapped code) the whole breakdown is withheld (criteriaScores = null) instead of guessing.
//    The readable breakdown still travels in the feedback text.
//  * Submission.score stays the outcome-driven figure (competency-based grading, see
//    gradebook.ts); criteriaScores explain the decision, they are not summed into it.

export interface LabCriterion {
  code: string;
  name?: string;
  met: boolean;
  comment?: string;
}
export interface RubricCriterion {
  name: string;
  description?: string;
  maxMarks: number;
}
export interface CriterionMapping {
  labCriterionCode: string;
  rubricCriterionName: string;
}
export interface CriteriaScore {
  name: string;
  maxMarks: number;
  score: number;
}
export interface CriteriaScoreResult {
  criteriaScores: CriteriaScore[] | null;
  unmappedRubricCriteria: string[]; // portal criteria nothing maps onto
  missingLabVerdicts: string[]; // mapped Lab codes the Lab did not report on
}

/** Validates the untrusted `criteria` array a Lab event carries; drops malformed entries. */
export function parseLabCriteria(raw: unknown): LabCriterion[] {
  if (!Array.isArray(raw)) return [];
  const out: LabCriterion[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    if (typeof c.code !== "string" || !c.code.trim() || typeof c.met !== "boolean") continue;
    if (seen.has(c.code)) continue; // first verdict for a code wins
    seen.add(c.code);
    out.push({
      code: c.code,
      met: c.met,
      ...(typeof c.name === "string" ? { name: c.name } : {}),
      ...(typeof c.comment === "string" ? { comment: c.comment.slice(0, 500) } : {}),
    });
  }
  return out;
}

export function buildCriteriaScores(rubric: RubricCriterion[], mappings: CriterionMapping[], labCriteria: LabCriterion[]): CriteriaScoreResult {
  const verdictByCode = new Map(labCriteria.map((c) => [c.code, c.met]));
  const unmappedRubricCriteria: string[] = [];
  const missingLabVerdicts: string[] = [];
  const scores: CriteriaScore[] = [];

  for (const criterion of rubric) {
    const feeding = mappings.filter((m) => m.rubricCriterionName === criterion.name);
    if (feeding.length === 0) {
      unmappedRubricCriteria.push(criterion.name);
      continue;
    }
    let allMet = true;
    let resolvable = true;
    for (const m of feeding) {
      const verdict = verdictByCode.get(m.labCriterionCode);
      if (verdict === undefined) {
        resolvable = false;
        if (!missingLabVerdicts.includes(m.labCriterionCode)) missingLabVerdicts.push(m.labCriterionCode);
      } else if (!verdict) {
        allMet = false;
      }
    }
    if (resolvable) scores.push({ name: criterion.name, maxMarks: criterion.maxMarks, score: allMet ? criterion.maxMarks : 0 });
  }

  const complete = rubric.length > 0 && unmappedRubricCriteria.length === 0 && missingLabVerdicts.length === 0 && scores.length === rubric.length;
  return { criteriaScores: complete ? scores : null, unmappedRubricCriteria, missingLabVerdicts };
}

/** One readable line for the Submission feedback, e.g. "Lab criteria: C-1 met; C-2 NOT met (late)". */
export function describeLabCriteria(labCriteria: LabCriterion[]): string | null {
  if (labCriteria.length === 0) return null;
  const parts = labCriteria.map((c) => `${c.name ?? c.code} ${c.met ? "met" : "NOT met"}${c.comment ? ` (${c.comment})` : ""}`);
  return `Lab criteria: ${parts.join("; ")}.`;
}
