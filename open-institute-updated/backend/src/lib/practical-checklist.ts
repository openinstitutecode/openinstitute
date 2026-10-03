// EX034 — Practical/competency-based assessment: pure scoring logic for a
// CBET-style checklist (competent / not-yet-competent per criterion),
// distinct from EX021's marks-based Rubric. No DB access — unit-tested in
// tests/practical-checklist.test.ts.

export type ChecklistCriterion = { name: string; description?: string; mandatory: boolean };
export type CriterionCall = { name: string; competent: boolean; comment?: string };

export class ChecklistValidationError extends Error {}

/**
 * Validates that a set of criterion calls actually matches the checklist's
 * defined criteria (no invented criterion, none missing) and computes the
 * overall outcome from them — never a separately-typed overall result that
 * could drift from the individual calls.
 *
 * Overall outcome rule: every *mandatory* criterion must be called
 * competent for an overall "competent" outcome. A non-mandatory criterion
 * marked not-yet-competent doesn't by itself fail the assessment (e.g. an
 * optional/bonus competency), but is still recorded.
 */
export function computeOverallOutcome(
  criteria: ChecklistCriterion[],
  calls: CriterionCall[]
): "competent" | "not_yet_competent" {
  const byName = new Map(calls.map((c) => [c.name, c]));

  for (const criterion of criteria) {
    const call = byName.get(criterion.name);
    if (!call) {
      throw new ChecklistValidationError(`Missing a call for criterion "${criterion.name}".`);
    }
  }
  for (const call of calls) {
    if (!criteria.some((c) => c.name === call.name)) {
      throw new ChecklistValidationError(`"${call.name}" isn't a criterion on this checklist.`);
    }
  }

  const mandatoryFailed = criteria.some((criterion) => {
    if (!criterion.mandatory) return false;
    const call = byName.get(criterion.name);
    return !call || call.competent === false;
  });

  return mandatoryFailed ? "not_yet_competent" : "competent";
}
