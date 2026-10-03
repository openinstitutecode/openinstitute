// VBI025/026/027/034/039 — posting an APPROVED Lab result into the gradebook, against real Postgres.
import assert from "node:assert/strict";
import { dbTest, useDb, resetDb, seedFixture, seedResult, type Fixture } from "../helpers/db.js";
import { postApprovedResultToGradebook, unpostReversedResult, postPendingApprovedResults } from "../../src/integration/gradebook.js";

const prisma = await useDb();
let f: Fixture;
const emitted: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
const deps = () => ({ db: prisma, emit: async (e: { eventType: string; payload: Record<string, unknown> }) => void emitted.push(e) });

async function setup(mapping: Partial<{ competentScorePercent: number; notYetCompetentScorePercent: number; rubricNote: string }> | null = {}) {
  await resetDb(prisma);
  emitted.length = 0;
  f = await seedFixture(prisma);
  if (mapping) {
    await prisma.integrationGradebookMapping.create({ data: { unitId: f.unitId, assessmentId: f.assessmentId, createdById: f.admin.id, rubricNote: "Rubric R", ...mapping } });
  }
}

dbTest("COMPETENT posts full marks to the mapped assessment, in ONE transaction with postedAt, and emits grade.posted", async () => {
  await setup();
  const r = await seedResult(prisma, f, { status: "APPROVED" });
  const out = await postApprovedResultToGradebook(r.id, f.admin.id, deps());
  assert.equal(out.posted, true);
  const sub = await prisma.submission.findFirstOrThrow();
  assert.equal(sub.score, 100);
  assert.equal(sub.assessmentId, f.assessmentId);
  assert.equal(sub.studentUserId, f.studentUserId);
  assert.equal(sub.vblResultId, r.id);
  assert.match(sub.feedback ?? "", /Rubric note: Rubric R/);
  assert.ok((await prisma.virtualLabAssessmentResult.findUniqueOrThrow({ where: { id: r.id } })).postedAt instanceof Date);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].eventType, "grade.posted");
  assert.equal(emitted[0].payload.score, 100);
});

dbTest("NOT_YET_COMPETENT posts the configured percentage, and partial percentages round", async () => {
  await setup({ notYetCompetentScorePercent: 0 });
  const a = await seedResult(prisma, f, { status: "APPROVED", outcome: "NOT_YET_COMPETENT" });
  await postApprovedResultToGradebook(a.id, f.admin.id, deps());
  assert.equal((await prisma.submission.findFirstOrThrow()).score, 0);

  await setup({ notYetCompetentScorePercent: 37.5 });
  const b = await seedResult(prisma, f, { status: "APPROVED", outcome: "NOT_YET_COMPETENT" });
  await postApprovedResultToGradebook(b.id, f.admin.id, deps());
  assert.equal((await prisma.submission.findFirstOrThrow()).score, 38); // round(37.5% of 100)
});

dbTest("posting twice is idempotent — one Submission, updated in place", async () => {
  await setup();
  const r = await seedResult(prisma, f, { status: "APPROVED" });
  await postApprovedResultToGradebook(r.id, f.admin.id, deps());
  await postApprovedResultToGradebook(r.id, f.admin.id, deps());
  assert.equal(await prisma.submission.count(), 1);
});

dbTest("a result that is not APPROVED is never posted", async () => {
  await setup();
  for (const status of ["PENDING_APPROVAL", "REJECTED", "REVERSED"]) {
    const r = await seedResult(prisma, f, { status });
    const out = await postApprovedResultToGradebook(r.id, f.admin.id, deps());
    assert.equal(out.posted, false, status);
  }
  assert.equal(await prisma.submission.count(), 0);
});

dbTest("no gradebook mapping yet: not an error, result stays unposted", async () => {
  await setup(null);
  const r = await seedResult(prisma, f, { status: "APPROVED" });
  const out = await postApprovedResultToGradebook(r.id, f.admin.id, deps());
  assert.equal(out.posted, false);
  assert.match(out.reason ?? "", /No gradebook mapping/);
  assert.equal(await prisma.submission.count(), 0);
  assert.equal((await prisma.virtualLabAssessmentResult.findUniqueOrThrow({ where: { id: r.id } })).postedAt, null);
});

dbTest("reversal zeroes the posted score and annotates feedback instead of deleting the Submission", async () => {
  await setup();
  const r = await seedResult(prisma, f, { status: "APPROVED" });
  await postApprovedResultToGradebook(r.id, f.admin.id, deps());
  await prisma.virtualLabAssessmentResult.update({ where: { id: r.id }, data: { status: "REVERSED", reversalReason: "Entered against wrong unit" } });
  assert.equal((await unpostReversedResult(r.id, deps())).posted, true);
  const sub = await prisma.submission.findFirstOrThrow();
  assert.equal(sub.score, 0);
  assert.match(sub.feedback ?? "", /REVERSED.*Entered against wrong unit/s);
  assert.equal(await prisma.submission.count(), 1);
});

dbTest("unposting a result that was never posted reports that clearly", async () => {
  await setup();
  const r = await seedResult(prisma, f, { status: "APPROVED" });
  assert.equal((await unpostReversedResult(r.id, deps())).posted, false);
});

dbTest("backfill sweep posts every APPROVED-but-unposted result once a mapping exists, and skips posted ones", async () => {
  await setup();
  const r1 = await seedResult(prisma, f, { status: "APPROVED" });
  const r2 = await seedResult(prisma, f, { status: "APPROVED" });
  await seedResult(prisma, f, { status: "APPROVED", postedAt: new Date() });
  const swept = await postPendingApprovedResults(f.unitId, f.admin.id, deps());
  assert.deepEqual(swept.map((s) => s.resultId).sort(), [r1.id, r2.id].sort());
  assert.equal(await prisma.submission.count(), 2);
});

// ---- VBI027: criterion-level mapping ----
async function mapCriteria() {
  const gm = await prisma.integrationGradebookMapping.findUniqueOrThrow({ where: { unitId: f.unitId } });
  await prisma.integrationRubricCriterionMapping.createMany({
    data: [
      { gradebookMappingId: gm.id, labCriterionCode: "CR-1", rubricCriterionName: "Records", createdById: f.admin.id },
      { gradebookMappingId: gm.id, labCriterionCode: "CR-2", rubricCriterionName: "Reconciles", createdById: f.admin.id },
    ],
  });
}

dbTest("VBI027: mapped Lab criteria become Submission.criteriaScores, and the readable breakdown is in the feedback", async () => {
  await setup();
  await mapCriteria();
  const r = await seedResult(prisma, f, { status: "APPROVED", criteria: [{ code: "CR-1", met: true }, { code: "CR-2", met: false, comment: "late" }] });
  const out = await postApprovedResultToGradebook(r.id, f.admin.id, deps());
  assert.equal(out.criteriaScored, true);
  const sub = await prisma.submission.findFirstOrThrow();
  assert.deepEqual(sub.criteriaScores, [{ name: "Records", maxMarks: 50, score: 50 }, { name: "Reconciles", maxMarks: 50, score: 0 }]);
  assert.match(sub.feedback ?? "", /Lab criteria: CR-1 met; CR-2 NOT met \(late\)\./);
  assert.equal(sub.score, 100); // outcome-driven score is unchanged by the breakdown
});

dbTest("VBI027: an incomplete mapping withholds criteriaScores instead of guessing", async () => {
  await setup();
  await mapCriteria();
  const r = await seedResult(prisma, f, { status: "APPROVED", criteria: [{ code: "CR-1", met: true }] }); // no verdict for CR-2
  const out = await postApprovedResultToGradebook(r.id, f.admin.id, deps());
  assert.equal(out.posted, true);
  assert.equal(out.criteriaScored, false);
  assert.equal((await prisma.submission.findFirstOrThrow()).criteriaScores, null);
});

dbTest("VBI027: deleting the gradebook mapping cascades to its criterion mappings", async () => {
  await setup();
  await mapCriteria();
  await prisma.integrationGradebookMapping.delete({ where: { unitId: f.unitId } });
  assert.equal(await prisma.integrationRubricCriterionMapping.count(), 0);
});
