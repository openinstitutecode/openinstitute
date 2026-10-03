import { prisma } from "../lib/prisma.js";
import { emitPortalEvent } from "./events.js";
import { postApprovedResultToGradebook, unpostReversedResult } from "./gradebook.js";
import { canReviewUnit, type Reviewer } from "./scope.js";

// VBI022/024/033 — the trainer/admin review workflow that stands between a Lab result and the
// official gradebook: approve (posts to the mapped component), reject, reverse an approval.
// Extracted from the route so the state machine is testable; the route only does auth + parsing.
//
// Batch 66: (1) every state change is now ONE conditional UPDATE ("... WHERE id = ? AND status =
// <expected>") committed together with its audit row, so two reviewers clicking at the same moment
// cannot both win — the loser gets a 409 instead of a second approval and a double-posted grade
// (previously: read, check in JS, then write). (2) A TRAINER may only review results for units they
// teach (scope.ts).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type Emit = (e: { eventType: string; entityType?: string; entityId?: string; payload: Record<string, unknown> }) => Promise<unknown>;
export interface LabResultDeps { db: Db; emit: Emit }
const defaultDeps = (): LabResultDeps => ({ db: prisma, emit: emitPortalEvent });

export interface ReviewOutcome { status: number; body: Record<string, unknown> }

function fireAndLog(p: Promise<unknown>, what: string) {
  p.catch((err) => console.error(`Failed to queue ${what} for VBL sync`, err));
}

const forbidden = (): ReviewOutcome => ({ status: 403, body: { message: "You can only review Virtual Lab results for units you teach." } });

async function conflict(db: Db, id: string, fallback: string): Promise<ReviewOutcome> {
  const current = await db.virtualLabAssessmentResult.findUnique({ where: { id }, select: { status: true } });
  return { status: 409, body: { message: current ? `Already ${String(current.status).toLowerCase()}.` : fallback } };
}

export async function approveLabResult(id: string, reviewer: Reviewer, note: string | undefined, deps: LabResultDeps = defaultDeps()): Promise<ReviewOutcome> {
  const { db, emit } = deps;
  const result = await db.virtualLabAssessmentResult.findUnique({ where: { id } });
  if (!result) return { status: 404, body: { message: "Lab result not found." } };
  if (!(await canReviewUnit(reviewer, result.unitId, db))) return forbidden();

  const reviewedAt = new Date();
  const won: boolean = await db.$transaction(async (tx: Db) => {
    const claimed = await tx.virtualLabAssessmentResult.updateMany({
      where: { id, status: "PENDING_APPROVAL" },
      data: { status: "APPROVED", reviewedById: reviewer.id, reviewedAt, reviewNote: note },
    });
    if (claimed.count !== 1) return false;
    await tx.auditLog.create({ data: { userId: reviewer.id, action: "VBL_LAB_RESULT_APPROVE", entityType: "VirtualLabAssessmentResult", entityId: id } });
    return true;
  });
  if (!won) return conflict(db, id, "Lab result not found.");

  // VBI033 — tell the Lab what happened to the assessment.decided event it sent us.
  fireAndLog(emit({ eventType: "assessment.approved", entityType: "VirtualLabAssessmentResult", entityId: id,
    payload: { externalAssessmentId: result.externalAssessmentId, reviewedBy: reviewer.id, reviewNote: note, reviewedAt: reviewedAt.toISOString() } }), "assessment.approved");
  // VBI025/026/034 — post into the mapped gradebook component, if one exists yet.
  const gradebook = await postApprovedResultToGradebook(id, reviewer.id, deps);
  const updated = await db.virtualLabAssessmentResult.findUnique({ where: { id } });
  return { status: 200, body: { ...updated, gradebook } };
}

export async function rejectLabResult(id: string, reviewer: Reviewer, note: string | undefined, deps: LabResultDeps = defaultDeps()): Promise<ReviewOutcome> {
  const { db, emit } = deps;
  const result = await db.virtualLabAssessmentResult.findUnique({ where: { id } });
  if (!result) return { status: 404, body: { message: "Lab result not found." } };
  if (!(await canReviewUnit(reviewer, result.unitId, db))) return forbidden();

  const reviewedAt = new Date();
  const won: boolean = await db.$transaction(async (tx: Db) => {
    const claimed = await tx.virtualLabAssessmentResult.updateMany({
      where: { id, status: "PENDING_APPROVAL" },
      data: { status: "REJECTED", reviewedById: reviewer.id, reviewedAt, reviewNote: note },
    });
    if (claimed.count !== 1) return false;
    await tx.auditLog.create({ data: { userId: reviewer.id, action: "VBL_LAB_RESULT_REJECT", entityType: "VirtualLabAssessmentResult", entityId: id } });
    return true;
  });
  if (!won) return conflict(db, id, "Lab result not found.");

  fireAndLog(emit({ eventType: "assessment.rejected", entityType: "VirtualLabAssessmentResult", entityId: id,
    payload: { externalAssessmentId: result.externalAssessmentId, reviewedBy: reviewer.id, reviewNote: note, reviewedAt: reviewedAt.toISOString() } }), "assessment.rejected");
  const updated = await db.virtualLabAssessmentResult.findUnique({ where: { id } });
  return { status: 200, body: { ...updated } };
}

// Deliberately separate from reject(): reject() is "never good enough to post"; reverse() is "was
// posted and approved, and we were wrong". Requires a reason, never overwrites the original
// approval fields, and zeroes/annotates the posted Submission rather than deleting it. Reversal is
// an admin action (route-level ICT_ADMIN/SUPER_ADMIN), so no per-unit scoping applies.
export async function reverseLabResult(id: string, reviewer: Reviewer, reason: string, deps: LabResultDeps = defaultDeps()): Promise<ReviewOutcome> {
  const { db, emit } = deps;
  if (!reason || !reason.trim()) return { status: 400, body: { message: "A reason is required to reverse an approved result." } };
  const result = await db.virtualLabAssessmentResult.findUnique({ where: { id } });
  if (!result) return { status: 404, body: { message: "Lab result not found." } };

  const reversedAt = new Date();
  const won: boolean = await db.$transaction(async (tx: Db) => {
    const claimed = await tx.virtualLabAssessmentResult.updateMany({
      where: { id, status: "APPROVED" },
      data: { status: "REVERSED", reversedById: reviewer.id, reversedAt, reversalReason: reason },
    });
    if (claimed.count !== 1) return false;
    await tx.auditLog.create({ data: { userId: reviewer.id, action: "VBL_LAB_RESULT_REVERSE", entityType: "VirtualLabAssessmentResult", entityId: id, metadata: { reason } } });
    return true;
  });
  if (!won) return { status: 409, body: { message: "Only an APPROVED result can be reversed." } };

  fireAndLog(emit({ eventType: "assessment.reversed", entityType: "VirtualLabAssessmentResult", entityId: id,
    payload: { externalAssessmentId: result.externalAssessmentId, reviewedBy: reviewer.id, reviewNote: reason, reviewedAt: reversedAt.toISOString() } }), "assessment.reversed");
  const gradebook = await unpostReversedResult(id, deps);
  const updated = await db.virtualLabAssessmentResult.findUnique({ where: { id } });
  return { status: 200, body: { ...updated, gradebook } };
}
