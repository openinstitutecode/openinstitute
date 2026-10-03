// VBI022/024/033 — the review state machine against real Postgres, including the concurrency
// guarantee (two reviewers, one winner) and trainer unit-scoping introduced in Batch 66.
import assert from "node:assert/strict";
import { dbTest, useDb, resetDb, seedFixture, seedResult, type Fixture } from "../helpers/db.js";
import { approveLabResult, rejectLabResult, reverseLabResult } from "../../src/integration/lab-results.js";
import { trainerUnitIds, canReviewUnit } from "../../src/integration/scope.js";

const prisma = await useDb();
let f: Fixture;
const emitted: Array<{ eventType: string }> = [];
const deps = () => ({ db: prisma, emit: async (e: { eventType: string }) => void emitted.push(e) });
const flush = () => new Promise((r) => setTimeout(r, 20)); // fire-and-forget emits

async function setup() {
  await resetDb(prisma);
  emitted.length = 0;
  f = await seedFixture(prisma);
  await prisma.integrationGradebookMapping.create({ data: { unitId: f.unitId, assessmentId: f.assessmentId, createdById: f.admin.id } });
}

dbTest("approve: PENDING -> APPROVED, audited, confirmed back to the Lab, and posted to the gradebook", async () => {
  await setup();
  const r = await seedResult(prisma, f);
  const out = await approveLabResult(r.id, f.trainerUser, "well done", deps());
  await flush();
  assert.equal(out.status, 200);
  const row = await prisma.virtualLabAssessmentResult.findUniqueOrThrow({ where: { id: r.id } });
  assert.equal(row.status, "APPROVED");
  assert.equal(row.reviewedById, f.trainerUser.id);
  assert.equal(row.reviewNote, "well done");
  assert.ok(row.postedAt);
  assert.equal(await prisma.auditLog.count({ where: { action: "VBL_LAB_RESULT_APPROVE", entityId: r.id } }), 1);
  assert.deepEqual(emitted.map((e) => e.eventType).sort(), ["assessment.approved", "grade.posted"]);
  assert.equal(await prisma.submission.count(), 1);
});

dbTest("approve without a gradebook mapping still approves and says the grade was not posted", async () => {
  await setup();
  await prisma.integrationGradebookMapping.delete({ where: { unitId: f.unitId } });
  const r = await seedResult(prisma, f);
  const out = await approveLabResult(r.id, f.admin, undefined, deps());
  assert.equal(out.status, 200);
  assert.equal((out.body.gradebook as { posted: boolean }).posted, false);
  assert.equal((await prisma.virtualLabAssessmentResult.findUniqueOrThrow({ where: { id: r.id } })).status, "APPROVED");
});

dbTest("a result can only be reviewed once: approve/reject on a non-pending result is 409, unknown is 404", async () => {
  await setup();
  const r = await seedResult(prisma, f);
  await approveLabResult(r.id, f.admin, undefined, deps());
  assert.equal((await approveLabResult(r.id, f.admin, undefined, deps())).status, 409);
  assert.equal((await rejectLabResult(r.id, f.admin, undefined, deps())).status, 409);
  assert.equal((await approveLabResult("nope", f.admin, undefined, deps())).status, 404);
  assert.equal((await rejectLabResult("nope", f.admin, undefined, deps())).status, 404);
});

dbTest("reject: PENDING -> REJECTED, tells the Lab, and never touches the gradebook", async () => {
  await setup();
  const r = await seedResult(prisma, f);
  const out = await rejectLabResult(r.id, f.admin, "insufficient evidence", deps());
  await flush();
  assert.equal(out.status, 200);
  assert.equal((await prisma.virtualLabAssessmentResult.findUniqueOrThrow({ where: { id: r.id } })).status, "REJECTED");
  assert.deepEqual(emitted.map((e) => e.eventType), ["assessment.rejected"]);
  assert.equal(await prisma.submission.count(), 0);
});

dbTest("reverse needs a reason and an APPROVED result", async () => {
  await setup();
  const r = await seedResult(prisma, f);
  assert.equal((await reverseLabResult(r.id, f.admin, "", deps())).status, 400);
  assert.equal((await reverseLabResult(r.id, f.admin, "oops", deps())).status, 409); // still pending
  assert.equal((await reverseLabResult("nope", f.admin, "oops", deps())).status, 404);
});

dbTest("full lifecycle: approve, post grade, then reverse — grade zeroed and annotated, approval history preserved", async () => {
  await setup();
  const r = await seedResult(prisma, f);
  await approveLabResult(r.id, f.trainerUser, "ok", deps());
  const out = await reverseLabResult(r.id, f.admin, "Entered against wrong unit", deps());
  assert.equal(out.status, 200);
  const row = await prisma.virtualLabAssessmentResult.findUniqueOrThrow({ where: { id: r.id } });
  assert.equal(row.status, "REVERSED");
  assert.equal(row.reviewedById, f.trainerUser.id); // original approval untouched
  assert.equal(row.reversedById, f.admin.id);
  const sub = await prisma.submission.findFirstOrThrow();
  assert.equal(sub.score, 0);
  assert.match(sub.feedback ?? "", /REVERSED/);
});

dbTest("CONCURRENCY: two reviewers approving the same result at once — exactly one wins, one grade is posted", async () => {
  await setup();
  const r = await seedResult(prisma, f);
  const outs = await Promise.all([approveLabResult(r.id, f.trainerUser, "a", deps()), approveLabResult(r.id, f.admin, "b", deps())]);
  assert.deepEqual(outs.map((o) => o.status).sort(), [200, 409]);
  assert.equal(await prisma.auditLog.count({ where: { action: "VBL_LAB_RESULT_APPROVE" } }), 1);
  assert.equal(await prisma.submission.count(), 1);
});

dbTest("CONCURRENCY: approve racing reject — one winner, the loser gets 409", async () => {
  await setup();
  const r = await seedResult(prisma, f);
  const outs = await Promise.all([approveLabResult(r.id, f.admin, undefined, deps()), rejectLabResult(r.id, f.admin, undefined, deps())]);
  assert.deepEqual(outs.map((o) => o.status).sort(), [200, 409]);
});

dbTest("SCOPE: a trainer can review only units they teach; admins can review anything", async () => {
  await setup();
  const mine = await seedResult(prisma, f, { unitId: f.unitId });
  const notMine = await seedResult(prisma, f, { unitId: f.otherUnitId });
  assert.equal((await approveLabResult(notMine.id, f.trainerUser, undefined, deps())).status, 403);
  assert.equal((await rejectLabResult(notMine.id, f.trainerUser, undefined, deps())).status, 403);
  assert.equal((await prisma.virtualLabAssessmentResult.findUniqueOrThrow({ where: { id: notMine.id } })).status, "PENDING_APPROVAL");
  assert.equal((await approveLabResult(mine.id, f.trainerUser, undefined, deps())).status, 200);
  assert.equal((await approveLabResult(notMine.id, f.admin, undefined, deps())).status, 200);
});

dbTest("SCOPE: trainerUnitIds / canReviewUnit reflect Course.trainerId, and non-trainers get nothing", async () => {
  await setup();
  assert.deepEqual(await trainerUnitIds(f.trainerUser.id, prisma), [f.unitId]);
  assert.deepEqual(await trainerUnitIds(f.otherTrainerUser.id, prisma), [f.otherUnitId]);
  assert.deepEqual(await trainerUnitIds(f.admin.id, prisma), []);
  assert.equal(await canReviewUnit(f.trainerUser, f.otherUnitId, prisma), false);
  assert.equal(await canReviewUnit({ id: "x", role: "STUDENT" }, f.unitId, prisma), false);
  assert.equal(await canReviewUnit(f.admin, f.otherUnitId, prisma), true);
});
