import { prisma } from "../lib/prisma.js";
import { hashPayload } from "./signing.js";
import { verifyAgainstAnyActiveCredential } from "./credentials.js";
import { parseLabCriteria } from "./rubric-mapping.js";

// Inbound VBL -> portal event processing (VBI012/013/014/017/019/020/021/023/029/030/035/036),
// extracted from the route so it can be exercised without Express or Postgres — see
// tests/integration-vbl-events.test.ts. The route is now just: read raw body, call
// processVblWebhook, send the result.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any; // a PrismaClient (default) or a transaction client — there is no in-memory substitute

const MAX_CLOCK_SKEW_SECONDS = 300;

export interface WebhookInput {
  timestamp?: string;
  signature?: string;
  keyId?: string;
  /** The exact bytes the sender signed. Never a re-serialisation of parsed JSON. */
  rawBody: string;
}
export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

// VBI012/013/014/017 — verify, dedupe, ledger, dispatch.
//
// Retry semantics (a real bug fixed here): an event whose processing FAILED must be reprocessed
// when the sender redelivers it — e.g. it arrived before the student's enrollment had synced,
// and succeeds a minute later. Only events already RECEIVED are duplicates. Treating a FAILED
// ledger row as a duplicate would acknowledge the retry (so the sender marks it delivered) while
// the portal never actually applied it — silent, permanent loss.
export async function processVblWebhook(input: WebhookInput, db: Db = prisma, nowMs: number = Date.now()): Promise<WebhookResult> {
  const { timestamp, signature, keyId, rawBody } = input;
  const verified = timestamp && (await verifyAgainstAnyActiveCredential("VBL_TO_PORTAL", Number(timestamp), rawBody, signature, keyId ?? undefined, db));
  if (!verified) return { status: 401, body: { message: "Invalid or missing signature." } };
  // Reject stale deliveries — narrows replay of a captured signature.
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS) {
    return { status: 401, body: { message: "Signature timestamp is stale." } };
  }

  let event: Parameters<typeof routeVblEvent>[1];
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { message: "Body is not valid JSON." } };
  }
  if (!event?.eventId || !event?.eventType) return { status: 400, body: { message: "Missing eventId/eventType." } };

  const existing = await db.integrationEvent.findUnique({ where: { eventId: event.eventId } });
  if (existing && existing.status === "RECEIVED") {
    return { status: 200, body: { status: "duplicate_ignored" } };
  }
  const ledgerRow = existing
    ? await db.integrationEvent.update({ where: { id: existing.id }, data: { status: "PROCESSING", attempts: { increment: 1 } } })
    : await db.integrationEvent.create({
        data: {
          eventId: event.eventId,
          direction: "VBL_TO_PORTAL",
          eventType: event.eventType,
          payload: event,
          payloadHash: hashPayload(event),
          status: "PROCESSING",
        },
      });

  try {
    await routeVblEvent(db, event);
    await db.integrationEvent.update({ where: { id: ledgerRow.id }, data: { status: "RECEIVED", processedAt: new Date(), lastError: null } });
    return { status: 200, body: { status: "ok" } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.integrationEvent.update({ where: { id: ledgerRow.id }, data: { status: "FAILED", lastError: message } });
    // Logged, not swallowed — an ICT admin needs to be able to find this on the dashboard.
    // eslint-disable-next-line no-console
    console.error("VBL webhook processing failed", { eventId: event.eventId, err });
    // 5xx so the sender keeps the event queued and retries it (see the retry note above).
    return { status: 500, body: { status: "processing_failed" } };
  }
}

// VBI035 — Student Progress Synchronization (portal-side half): records that
// this student has now reached COMPETENT on every competency an admin has
// mapped for this unit (VBI028) — an audit-trail note, not something sent
// back to VBL (VBL already knows; see maybeEmitSimulationCompleted's VBL-side
// counterpart in vbl/services/assessment.py for the actual VBI030 event,
// which correctly originates from VBL since it alone has the authoritative,
// complete competency list for a unit).
async function maybeRecordUnitProgressComplete(db: Db, result: { studentId: string; unitId: string }, outcome: string) {
  if (outcome !== "COMPETENT") return;
  const mappedCodes = await db.integrationCompetencyMapping.findMany({
    where: { unitId: result.unitId },
    select: { labCompetencyCode: true },
  });
  if (mappedCodes.length === 0) return; // nothing mapped yet — no basis to claim completeness

  const achieved = await db.virtualLabAssessmentResult.findMany({
    where: { studentId: result.studentId, unitId: result.unitId, outcome: "COMPETENT", competencyCode: { in: mappedCodes.map((m: { labCompetencyCode: string }) => m.labCompetencyCode) } },
    select: { competencyCode: true },
    distinct: ["competencyCode"],
  });
  const achievedCodes = new Set(achieved.map((a: { competencyCode: string }) => a.competencyCode));
  if (!mappedCodes.every((m: { labCompetencyCode: string }) => achievedCodes.has(m.labCompetencyCode))) return;

  await db.auditLog.create({
    data: {
      userId: null,
      action: "VBL_STUDENT_UNIT_COMPETENCIES_COMPLETE",
      entityType: "Student",
      entityId: result.studentId,
      metadata: { unitId: result.unitId, competenciesCompleted: mappedCodes.length },
    },
  }).catch((err: unknown) => console.error("Failed to record unit-progress-complete audit entry", err));
}

export async function routeVblEvent(db: Db, event: {
  eventType: string;
  registrationNumber?: string;
  portalStudentId?: string;
  unitId?: string;
  externalAssessmentId?: string;
  competencyCode?: string;
  outcome?: string;
  feedback?: string;
  assessorLabUserId?: string;
  decidedAt?: string;
  eventId: string;
  attemptNo?: number;
  previousExternalAssessmentId?: string | null;
  evidence?: { evidenceId?: string; version?: number; sourceType?: string; sourceRef?: string; contentHash?: string };
  competenciesCompleted?: number;
  criteria?: unknown; // VBI027 — optional per-criterion verdicts, validated by parseLabCriteria
  activityType?: string;
  activityEntityType?: string;
  activityRef?: string;
  activitySummary?: string;
  activityData?: Record<string, unknown>;
  occurredAt?: string;
}) {
  switch (event.eventType) {
    case "assessment.decided": {
      const student = event.portalStudentId
        ? await db.student.findUnique({ where: { id: event.portalStudentId } })
        : event.registrationNumber
        ? await db.student.findUnique({ where: { studentNumber: event.registrationNumber } })
        : null;
      if (!student) throw new Error(`No matching student for assessment.decided (eventId=${event.eventId})`);
      if (!event.unitId || !event.externalAssessmentId || !event.outcome || !event.decidedAt) {
        throw new Error(`assessment.decided is missing required fields (eventId=${event.eventId})`);
      }
      // VBI023 — if this is a resubmission, link it to the (immutable)
      // result it supersedes rather than losing the connection between
      // them. A missing predecessor (not yet synced, or genuinely the
      // first attempt) is not an error — supersedesResultId is simply null.
      const predecessor = event.previousExternalAssessmentId
        ? await db.virtualLabAssessmentResult.findUnique({ where: { externalAssessmentId: event.previousExternalAssessmentId } })
        : null;
      // VBI029 — resolve the Lab's raw competencyCode to a real portal
      // LearningOutcome via whatever an admin has mapped so far (VBI028).
      // No mapping yet is not an error — learningOutcomeId is simply null,
      // same "sync what's mappable, don't block on what isn't" pattern as
      // the gradebook mapping above.
      const competencyMapping = event.competencyCode
        ? await db.integrationCompetencyMapping.findUnique({
            where: { unitId_labCompetencyCode: { unitId: event.unitId, labCompetencyCode: event.competencyCode } },
          })
        : null;
      const created = await db.virtualLabAssessmentResult.upsert({
        where: { externalAssessmentId: event.externalAssessmentId },
        create: {
          studentId: student.id,
          unitId: event.unitId,
          externalAssessmentId: event.externalAssessmentId,
          competencyCode: event.competencyCode,
          outcome: event.outcome,
          feedback: event.feedback,
          assessorLabUserId: event.assessorLabUserId,
          decidedAt: new Date(event.decidedAt),
          sourceEventId: event.eventId,
          evidenceId: event.evidence?.evidenceId,
          evidenceVersion: event.evidence?.version,
          evidenceSourceType: event.evidence?.sourceType,
          evidenceSourceRef: event.evidence?.sourceRef,
          evidenceContentHash: event.evidence?.contentHash,
          supersedesResultId: predecessor?.id,
          learningOutcomeId: competencyMapping?.learningOutcomeId,
          criteria: parseLabCriteria(event.criteria).length ? parseLabCriteria(event.criteria) : undefined,
        },
        update: {}, // an already-recorded attempt is immutable here; a genuine correction of THIS SAME attempt is not supported — only a new attempt (handled above) or an approval reversal (VBI024) below
      });
      // VBI030/035 — a derived "simulation complete" signal: when this
      // decision is COMPETENT and it was the student's last remaining
      // required competency for the unit, note it in the audit trail
      // (VBL is the one that actually emits the VBI030 event to us, since
      // it alone has the authoritative complete competency list).
      await maybeRecordUnitProgressComplete(db, created, event.outcome);
      return;
    }
    case "simulation.completed": {
      // VBI030 — VBL telling us a student finished the whole practical
      // component for a unit (its own authoritative view, distinct from
      // the portal's own best-effort inference above, which only covers
      // whatever competencies an admin happened to map). Recorded for
      // visibility; does not itself change any grade or status.
      await db.auditLog.create({
        data: {
          userId: null,
          action: "VBL_SIMULATION_COMPLETED",
          entityType: "Student",
          entityId: event.portalStudentId ?? "unknown",
          metadata: { unitId: event.unitId, competenciesCompleted: event.competenciesCompleted },
        },
      });
      return;
    }
    case "activity.logged": {
      // VBI036 — Lab Activity Synchronization. Every activity type the Lab reports (evidence
      // capture, scenario/company/transaction activity, ...) is stored as a queryable
      // VirtualLabActivity row, idempotent on the source eventId. Unknown activity types are stored
      // verbatim rather than dropped. An event for a student we cannot identify fails (FAILED ->
      // retried) exactly like assessment.decided, instead of being silently discarded.
      const student = event.portalStudentId
        ? await db.student.findUnique({ where: { id: event.portalStudentId } })
        : event.registrationNumber
        ? await db.student.findUnique({ where: { studentNumber: event.registrationNumber } })
        : null;
      if (!student) throw new Error(`No matching student for activity.logged (eventId=${event.eventId})`);
      if (!event.activityType) throw new Error(`activity.logged is missing activityType (eventId=${event.eventId})`);
      const occurred = event.occurredAt ? new Date(event.occurredAt) : new Date();
      await db.virtualLabActivity.upsert({
        where: { sourceEventId: event.eventId },
        create: {
          studentId: student.id,
          unitId: event.unitId ?? null,
          activityType: event.activityType,
          entityType: event.activityEntityType,
          entityRef: event.activityRef,
          summary: event.activitySummary?.slice(0, 500),
          data: event.activityData,
          occurredAt: Number.isNaN(occurred.getTime()) ? new Date() : occurred,
          sourceEventId: event.eventId,
        },
        update: {}, // redelivery of the same event changes nothing
      });
      return;
    }
    default:
      // Recognised-but-unhandled event types are logged (ledger row above) but need no app-side action yet.
      return;
  }
}
