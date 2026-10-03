import { prisma } from "../lib/prisma.js";
import { emitPortalEvent } from "./events.js";
import { buildCriteriaScores, describeLabCriteria, parseLabCriteria, type RubricCriterion } from "./rubric-mapping.js";

// `db` is a PrismaClient (default) or a transaction client; `emit` is the outbound-event function.
// Both are parameters only so a caller can run this inside its own transaction — production
// callers just omit `deps`. There is no in-memory substitute: tests run against real Postgres
// (tests/db/*).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface GradebookDeps { db: any; emit: (e: { eventType: string; entityType?: string; entityId?: string; payload: Record<string, unknown> }) => Promise<unknown> }
const defaultDeps = (): GradebookDeps => ({ db: prisma, emit: emitPortalEvent });

// VBI025/026/027/034 — Gradebook Mapping + posting. Deliberately narrow
// scope: one Assessment "component" per VBL-enabled Unit (IntegrationGradebookMapping),
// not a general multi-component weighting engine — see
// docs/VBL_MAIN_PORTAL_INTEGRATION_AUDIT.md for why a broader weighting
// system was left out. What this DOES do for real: turn an APPROVED
// VirtualLabAssessmentResult into an actual Submission with a real score, so it counts toward
// the student's grade the same way any other graded Submission does.
//
// Batch 66: the Submission upsert and the result's postedAt stamp now commit in ONE transaction
// (previously two statements — a crash between them left a posted grade the sweep would post
// again), and criterion-level rubric mapping (VBI027) feeds Submission.criteriaScores.

export interface PostingOutcome {
  posted: boolean;
  reason?: string;
  submissionId?: string;
  criteriaScored?: boolean;
}

export async function postApprovedResultToGradebook(resultId: string, postedById: string, deps: GradebookDeps = defaultDeps()): Promise<PostingOutcome> {
  const { db, emit } = deps;
  const result = await db.virtualLabAssessmentResult.findUnique({ where: { id: resultId } });
  if (!result) return { posted: false, reason: "Lab result not found." };
  if (result.status !== "APPROVED") return { posted: false, reason: `Result is ${result.status}, not APPROVED.` };

  const mapping = await db.integrationGradebookMapping.findUnique({
    where: { unitId: result.unitId },
    include: { assessment: true },
  });
  if (!mapping) {
    // Not an error — a unit can be VBL-enabled and receiving approved results well before an
    // admin maps it to a gradebook component. The result stays APPROVED and queryable; the
    // sweep (postPendingApprovedResults) picks it up once the mapping exists.
    return { posted: false, reason: `No gradebook mapping for this unit yet (VBI025) — result stays APPROVED but unposted.` };
  }

  const scorePercent = result.outcome === "COMPETENT" ? mapping.competentScorePercent : mapping.notYetCompetentScorePercent;
  const score = Math.round((scorePercent / 100) * mapping.assessment.totalMarks);

  const student = await db.student.findUnique({ where: { id: result.studentId }, select: { userId: true } });
  if (!student) return { posted: false, reason: "Student has no linked portal user account." };

  // VBI027 — criterion-level breakdown, only when the unit has a Rubric AND an admin mapped Lab
  // criteria onto it AND the Lab sent verdicts for them (see rubric-mapping.ts for the rules).
  const labCriteria = parseLabCriteria(result.criteria);
  const rubric = await db.rubric.findUnique({ where: { assessmentId: mapping.assessmentId } });
  const criterionMappings = rubric ? await db.integrationRubricCriterionMapping.findMany({ where: { gradebookMappingId: mapping.id } }) : [];
  const breakdown = rubric && criterionMappings.length > 0 ? buildCriteriaScores(rubric.criteria as RubricCriterion[], criterionMappings, labCriteria) : null;
  const criteriaScores = breakdown?.criteriaScores ?? undefined;

  const feedback = [
    `Posted automatically from the Virtual Business Lab (outcome: ${result.outcome}).`,
    result.competencyCode ? `Competency: ${result.competencyCode}.` : null,
    mapping.rubricNote ? `Rubric note: ${mapping.rubricNote}` : null,
    describeLabCriteria(labCriteria),
    result.feedback ? `Assessor feedback: ${result.feedback}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const now = new Date();
  const submission = await db.$transaction(async (tx: typeof db) => {
    const sub = await tx.submission.upsert({
      where: { vblResultId: result.id },
      create: {
        assessmentId: mapping.assessmentId,
        studentUserId: student.userId,
        score,
        gradedById: postedById,
        gradedAt: now,
        feedback,
        criteriaScores,
        vblResultId: result.id,
      },
      update: { score, gradedById: postedById, gradedAt: now, criteriaScores },
    });
    await tx.virtualLabAssessmentResult.update({ where: { id: result.id }, data: { postedAt: now } });
    return sub;
  });

  emit({
    eventType: "grade.posted",
    entityType: "Submission",
    entityId: submission.id,
    payload: {
      externalAssessmentId: result.externalAssessmentId,
      score,
      maxScore: mapping.assessment.totalMarks,
      postedBy: postedById,
      postedAt: now.toISOString(),
    },
  }).catch((err) => console.error("Failed to queue grade.posted for VBL sync", err));

  return { posted: true, submissionId: submission.id, criteriaScored: criteriaScores !== undefined };
}

// VBI024's counterpart on the gradebook side: a reversed result's posted score is zeroed and
// annotated, never silently deleted — the Submission row (and its history) stays.
export async function unpostReversedResult(resultId: string, deps: GradebookDeps = defaultDeps()): Promise<PostingOutcome> {
  const { db } = deps;
  const result = await db.virtualLabAssessmentResult.findUnique({ where: { id: resultId } });
  if (!result) return { posted: false, reason: "Lab result not found." };
  const submission = await db.submission.findUnique({ where: { vblResultId: result.id } });
  if (!submission) return { posted: false, reason: "Nothing was posted for this result." };
  await db.submission.update({
    where: { id: submission.id },
    data: {
      score: 0,
      feedback: `${submission.feedback ?? ""}\n\n[REVERSED ${new Date().toISOString()}] ${result.reversalReason ?? "No reason given."}`.trim(),
    },
  });
  return { posted: true, submissionId: submission.id };
}

// VBI039 — sweep every APPROVED-but-unposted result for a unit (or all units) and try posting
// again — the natural remedy once an admin creates the mapping a batch of results was waiting on.
export async function postPendingApprovedResults(unitId: string | undefined, postedById: string, deps: GradebookDeps = defaultDeps()) {
  const { db } = deps;
  const pending = await db.virtualLabAssessmentResult.findMany({
    where: { status: "APPROVED", postedAt: null, ...(unitId ? { unitId } : {}) },
  });
  const results: Array<{ resultId: string } & PostingOutcome> = [];
  for (const r of pending as Array<{ id: string }>) {
    results.push({ resultId: r.id, ...(await postApprovedResultToGradebook(r.id, postedById, deps)) });
  }
  return results;
}
