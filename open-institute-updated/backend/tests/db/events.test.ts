// VBI012/013/014/017/019/020/021/023/027/029/030/035/036 — the inbound VBL -> portal processor,
// against REAL Postgres (Batch 66: replaces the in-memory fake of tests/integration-vbl-events).
import assert from "node:assert/strict";
import { dbTest, useDb, resetDb, seedFixture, type Fixture } from "../helpers/db.js";
import { processVblWebhook } from "../../src/integration/vbl-events.js";
import { signPayload } from "../../src/integration/signing.js";

const SECRET = "vbl-secret";
const prisma = await useDb();
let f: Fixture;

async function setup() {
  process.env.VBL_WEBHOOK_SECRET = SECRET;
  await resetDb(prisma);
  f = await seedFixture(prisma);
}

const decided = (over: Record<string, unknown> = {}) => ({
  eventId: "evt_1", eventType: "assessment.decided", portalStudentId: f.studentId, registrationNumber: f.studentNumber, unitId: f.unitId,
  externalAssessmentId: "att1", competencyCode: "C-1", outcome: "COMPETENT", feedback: "good", assessorLabUserId: "lab-a",
  decidedAt: "2026-09-28T10:00:00+00:00", attemptNo: 1, previousExternalAssessmentId: null,
  evidence: { evidenceId: "ev1", version: 2, sourceType: "SCENARIO_ACTIVITY", sourceRef: "scenario:x", contentHash: "h1" }, ...over,
});

async function send(event: unknown, o: { secret?: string; ts?: string; raw?: string } = {}) {
  const raw = o.raw ?? JSON.stringify(event);
  const ts = o.ts ?? String(Math.floor(Date.now() / 1000));
  return processVblWebhook({ timestamp: ts, signature: signPayload(o.secret ?? SECRET, Number(ts), raw), rawBody: raw }, prisma);
}
const counts = async () => ({
  ledger: await prisma.integrationEvent.count(),
  results: await prisma.virtualLabAssessmentResult.count(),
});

dbTest("a valid assessment.decided is recorded as PENDING_APPROVAL with its evidence reference, and the ledger says RECEIVED", async () => {
  await setup();
  const out = await send(decided());
  assert.deepEqual(out, { status: 200, body: { status: "ok" } });
  const r = await prisma.virtualLabAssessmentResult.findFirstOrThrow();
  assert.equal(r.status, "PENDING_APPROVAL");
  assert.equal(r.outcome, "COMPETENT");
  assert.equal(r.studentId, f.studentId);
  assert.equal(r.evidenceId, "ev1");
  assert.equal(r.evidenceVersion, 2);
  assert.equal(r.evidenceContentHash, "h1");
  const led = await prisma.integrationEvent.findFirstOrThrow();
  assert.equal(led.status, "RECEIVED");
  assert.equal(led.direction, "VBL_TO_PORTAL");
});

dbTest("a bad signature, a wrong secret, and a tampered body are all rejected with 401 and write nothing", async () => {
  await setup();
  assert.equal((await send(decided(), { secret: "wrong" })).status, 401);
  const raw = JSON.stringify(decided());
  const ts = String(Math.floor(Date.now() / 1000));
  const tampered = await processVblWebhook({ timestamp: ts, signature: signPayload(SECRET, Number(ts), raw), rawBody: raw.replace("COMPETENT", "NOT_YET_COMPETENT") }, prisma);
  assert.equal(tampered.status, 401);
  assert.equal((await processVblWebhook({ timestamp: ts, rawBody: raw }, prisma)).status, 401);
  assert.deepEqual(await counts(), { ledger: 0, results: 0 });
});

dbTest("a correctly signed but stale delivery is rejected (replay window)", async () => {
  await setup();
  const old = String(Math.floor(Date.now() / 1000) - 3600);
  assert.equal((await send(decided(), { ts: old })).status, 401);
  assert.equal((await counts()).results, 0);
});

dbTest("malformed JSON and missing eventId are 400s", async () => {
  await setup();
  assert.equal((await send(null, { raw: "{not json" })).status, 400);
  assert.equal((await send({ eventType: "assessment.decided" })).status, 400);
});

dbTest("VBI014: redelivering an already-RECEIVED eventId is acknowledged and NOT processed twice", async () => {
  await setup();
  await send(decided());
  const again = await send(decided());
  assert.deepEqual(again.body, { status: "duplicate_ignored" });
  assert.deepEqual(await counts(), { ledger: 1, results: 1 });
});

dbTest("retry-after-failure: an event that FAILED is reprocessed on redelivery instead of being swallowed as a duplicate", async () => {
  await setup();
  const event = decided({ portalStudentId: undefined, registrationNumber: "NOPE/1/2026" }); // student not synced yet
  const first = await send(event);
  assert.equal(first.status, 500);
  const failed = await prisma.integrationEvent.findFirstOrThrow();
  assert.equal(failed.status, "FAILED");
  assert.match(failed.lastError ?? "", /No matching student/);
  assert.equal((await counts()).results, 0);

  // A minute later the student exists; the Lab redelivers the SAME eventId (same body => same student ref).
  await prisma.student.update({ where: { id: f.studentId }, data: { studentNumber: "NOPE/1/2026" } });
  const second = await send(event);
  assert.deepEqual(second, { status: 200, body: { status: "ok" } });
  assert.deepEqual(await counts(), { ledger: 1, results: 1 }); // same ledger row reused
  const led = await prisma.integrationEvent.findFirstOrThrow();
  assert.equal(led.status, "RECEIVED");
  assert.equal(led.attempts, 1);
  assert.equal(led.lastError, null);
});

dbTest("a decided event missing required fields fails loudly (500 + FAILED) rather than storing a half-record", async () => {
  await setup();
  const out = await send(decided({ outcome: undefined }));
  assert.equal(out.status, 500);
  assert.match((await prisma.integrationEvent.findFirstOrThrow()).lastError ?? "", /missing required fields/);
  assert.equal((await counts()).results, 0);
});

dbTest("the student can be found by registration number when portalStudentId is absent", async () => {
  await setup();
  assert.equal((await send(decided({ portalStudentId: undefined }))).status, 200);
  assert.equal((await prisma.virtualLabAssessmentResult.findFirstOrThrow()).studentId, f.studentId);
});

dbTest("VBI023: a resubmission links to the attempt it supersedes", async () => {
  await setup();
  await send(decided({ eventId: "evt_a1", externalAssessmentId: "att1", outcome: "NOT_YET_COMPETENT", attemptNo: 1 }));
  await send(decided({ eventId: "evt_a2", externalAssessmentId: "att2", outcome: "COMPETENT", attemptNo: 2, previousExternalAssessmentId: "att1" }));
  const a1 = await prisma.virtualLabAssessmentResult.findUniqueOrThrow({ where: { externalAssessmentId: "att1" } });
  const a2 = await prisma.virtualLabAssessmentResult.findUniqueOrThrow({ where: { externalAssessmentId: "att2" } });
  assert.equal(a2.supersedesResultId, a1.id);
  assert.equal(a1.supersedesResultId, null);
});

dbTest("a predecessor the portal has never seen is not an error", async () => {
  await setup();
  assert.equal((await send(decided({ previousExternalAssessmentId: "unknown-attempt" }))).status, 200);
  assert.equal((await prisma.virtualLabAssessmentResult.findFirstOrThrow()).supersedesResultId, null);
});

dbTest("an already-recorded attempt is immutable: a different eventId for the same externalAssessmentId does not overwrite it", async () => {
  await setup();
  await send(decided({ eventId: "evt_x1", outcome: "NOT_YET_COMPETENT" }));
  await send(decided({ eventId: "evt_x2", outcome: "COMPETENT" }));
  const rows = await prisma.virtualLabAssessmentResult.findMany();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].outcome, "NOT_YET_COMPETENT");
});

dbTest("VBI029: the Lab competency code is resolved to a LearningOutcome when mapped, and left empty when not", async () => {
  await setup();
  await prisma.integrationCompetencyMapping.create({ data: { unitId: f.unitId, labCompetencyCode: "C-1", learningOutcomeId: f.loId, createdById: f.admin.id } });
  await send(decided({ eventId: "e1", externalAssessmentId: "a1", competencyCode: "C-1" }));
  await send(decided({ eventId: "e2", externalAssessmentId: "a2", competencyCode: "C-UNMAPPED" }));
  assert.equal((await prisma.virtualLabAssessmentResult.findUniqueOrThrow({ where: { externalAssessmentId: "a1" } })).learningOutcomeId, f.loId);
  assert.equal((await prisma.virtualLabAssessmentResult.findUniqueOrThrow({ where: { externalAssessmentId: "a2" } })).learningOutcomeId, null);
});

dbTest("VBI035: an audit note is written only once EVERY mapped competency has a COMPETENT result", async () => {
  await setup();
  const lo2 = await prisma.learningOutcome.create({ data: { unitId: f.unitId, code: "LO-2", description: "Reconcile" } });
  await prisma.integrationCompetencyMapping.createMany({
    data: [
      { unitId: f.unitId, labCompetencyCode: "C-1", learningOutcomeId: f.loId, createdById: f.admin.id },
      { unitId: f.unitId, labCompetencyCode: "C-2", learningOutcomeId: lo2.id, createdById: f.admin.id },
    ],
  });
  const done = () => prisma.auditLog.count({ where: { action: "VBL_STUDENT_UNIT_COMPETENCIES_COMPLETE" } });
  await send(decided({ eventId: "p1", externalAssessmentId: "pa1", competencyCode: "C-1" }));
  assert.equal(await done(), 0);
  await send(decided({ eventId: "p2", externalAssessmentId: "pa2", competencyCode: "C-2", outcome: "NOT_YET_COMPETENT" }));
  assert.equal(await done(), 0);
  await send(decided({ eventId: "p3", externalAssessmentId: "pa3", competencyCode: "C-2" }));
  assert.equal(await done(), 1);
  const note = await prisma.auditLog.findFirstOrThrow({ where: { action: "VBL_STUDENT_UNIT_COMPETENCIES_COMPLETE" } });
  assert.equal((note.metadata as { competenciesCompleted: number }).competenciesCompleted, 2);
});

dbTest("with no competencies mapped, the portal makes no completeness claim", async () => {
  await setup();
  await send(decided());
  assert.equal(await prisma.auditLog.count({ where: { action: "VBL_STUDENT_UNIT_COMPETENCIES_COMPLETE" } }), 0);
});

dbTest("VBI027: Lab per-criterion verdicts are stored on the result; malformed entries are dropped", async () => {
  await setup();
  await send(decided({ criteria: [{ code: "CR-1", met: true }, { code: "CR-2", met: false, comment: "late" }, { code: 5 }, { met: true }] }));
  const r = await prisma.virtualLabAssessmentResult.findFirstOrThrow();
  assert.deepEqual(r.criteria, [{ code: "CR-1", met: true }, { code: "CR-2", met: false, comment: "late" }]);
});

dbTest("VBI030: simulation.completed is recorded in the audit trail", async () => {
  await setup();
  await send({ eventId: "s1", eventType: "simulation.completed", portalStudentId: f.studentId, unitId: f.unitId, competenciesCompleted: 3 });
  const sim = await prisma.auditLog.findFirstOrThrow({ where: { action: "VBL_SIMULATION_COMPLETED" } });
  assert.equal(sim.entityId, f.studentId);
  assert.equal((sim.metadata as { competenciesCompleted: number }).competenciesCompleted, 3);
});

dbTest("VBI036: activity.logged is stored as a queryable row, idempotent on the event id; unknown types are kept", async () => {
  await setup();
  const ev = { eventId: "act1", eventType: "activity.logged", portalStudentId: f.studentId, unitId: f.unitId, activityType: "scenario.started", activityEntityType: "Scenario", activityRef: "scenario:invoice-run", activitySummary: "Started invoice run", activityData: { step: 1 }, occurredAt: "2026-09-28T10:00:00+00:00" };
  assert.equal((await send(ev)).status, 200);
  assert.equal((await send({ ...ev, eventId: "act2", activityType: "brand.new.kind" })).status, 200);
  const rows = await prisma.virtualLabActivity.findMany({ orderBy: { sourceEventId: "asc" } });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].activityType, "scenario.started");
  assert.equal(rows[0].entityRef, "scenario:invoice-run");
  assert.deepEqual(rows[0].data, { step: 1 });
  assert.equal(rows[0].occurredAt.toISOString(), "2026-09-28T10:00:00.000Z");
  assert.equal(rows[1].activityType, "brand.new.kind");
  assert.equal((await send(ev)).body.status, "duplicate_ignored");
  assert.equal(await prisma.virtualLabActivity.count(), 2);
});

dbTest("activity.logged for an unknown student fails (FAILED, retried) instead of being dropped", async () => {
  await setup();
  const out = await send({ eventId: "act9", eventType: "activity.logged", portalStudentId: "ghost", activityType: "evidence.capture" });
  assert.equal(out.status, 500);
  assert.equal((await prisma.integrationEvent.findFirstOrThrow()).status, "FAILED");
  assert.equal(await prisma.virtualLabActivity.count(), 0);
});

dbTest("an unrecognised event type is accepted and ledgered without side effects", async () => {
  await setup();
  const out = await send({ eventId: "u1", eventType: "something.new", portalStudentId: f.studentId });
  assert.equal(out.status, 200);
  assert.equal((await prisma.integrationEvent.findFirstOrThrow()).status, "RECEIVED");
  assert.deepEqual(await counts(), { ledger: 1, results: 0 });
  assert.equal(await prisma.virtualLabActivity.count(), 0);
});
