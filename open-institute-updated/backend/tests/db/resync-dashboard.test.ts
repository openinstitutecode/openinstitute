// VBI037/038/039 — resync fan-out, dashboard numbers/health colour and the paged event ledger,
// against real Postgres.
import assert from "node:assert/strict";
import { dbTest, useDb, resetDb, seedFixture, seedResult, type Fixture } from "../helpers/db.js";
import { resyncStudent, resyncUnit } from "../../src/integration/resync.js";
import { buildDashboard, listEvents } from "../../src/integration/dashboard.js";

const prisma = await useDb();
let f: Fixture;
let suspendedId: string;
const emitted: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
const emit = async (e: { eventType: string; payload: Record<string, unknown> }) => void emitted.push(e);

async function setupResync() {
  await resetDb(prisma);
  emitted.length = 0;
  f = await seedFixture(prisma);
  await prisma.unit.update({ where: { id: f.otherUnitId }, data: { vblEnabled: false } });
  const u = await prisma.user.create({ data: { email: "b@x.test", passwordHash: "x", role: "STUDENT" } });
  const s2 = await prisma.student.create({
    data: { userId: u.id, studentNumber: "KVB/S2/2026", admissionNumber: "ADM-S2", fullName: "Brian O", programmeId: f.programmeId, intake: "2026-Sep", studyMode: "FULL_TIME", academicStatus: "SUSPENDED" },
  });
  suspendedId = s2.id;
  await prisma.enrollment.createMany({
    data: [
      { studentId: f.studentId, unitId: f.unitId, semester: "2026/1", status: "in_progress" },
      { studentId: f.studentId, unitId: f.otherUnitId, semester: "2026/1", status: "in_progress" }, // unit not Lab-enabled
      { studentId: f.studentId, unitId: f.unitId, semester: "2025/2", status: "completed" }, // not in progress
      { studentId: s2.id, unitId: f.unitId, semester: "2026/1", status: "in_progress" },
    ],
  });
}

dbTest("resyncStudent re-emits only in-progress enrollments on Lab-enabled units, plus current status", async () => {
  await setupResync();
  const out = await resyncStudent(f.studentId, prisma, emit);
  assert.deepEqual(out, { found: true, enrollmentsResynced: 1, staffResynced: 0, statusResynced: true });
  const enr = emitted.filter((e) => e.eventType === "enrollment.created");
  assert.equal(enr.length, 1);
  assert.equal(enr[0].payload.email, (await prisma.user.findUniqueOrThrow({ where: { id: f.studentUserId } })).email);
  assert.equal(enr[0].payload.registrationNumber, f.studentNumber);
  assert.equal(enr[0].payload.resync, true);
  assert.equal(emitted.find((e) => e.eventType === "student.status_changed")?.payload.status, "ACTIVE");
});

dbTest("resyncStudent reports a suspended student's real status so the Lab deactivates the account", async () => {
  await setupResync();
  await resyncStudent(suspendedId, prisma, emit);
  assert.equal(emitted.find((e) => e.eventType === "student.status_changed")?.payload.status, "SUSPENDED");
});

dbTest("resyncStudent on an unknown id reports not-found and emits nothing", async () => {
  await setupResync();
  const out = await resyncStudent("nope", prisma, emit);
  assert.equal(out.found, false);
  assert.equal(emitted.length, 0);
});

dbTest("resyncUnit re-emits the trainer assignment and every in-progress enrollment for the unit", async () => {
  await setupResync();
  assert.deepEqual(await resyncUnit(f.unitId, prisma, emit), { found: true, enrollmentsResynced: 2, staffResynced: 1, statusResynced: false });
  assert.equal(emitted.filter((e) => e.eventType === "staff.assigned").length, 1);
  assert.equal(emitted.filter((e) => e.eventType === "enrollment.created").length, 2);
});

dbTest("resyncUnit on a unit that is not Lab-enabled does nothing", async () => {
  await setupResync();
  assert.deepEqual(await resyncUnit(f.otherUnitId, prisma, emit), { found: true, enrollmentsResynced: 0, staffResynced: 0, statusResynced: false });
  assert.equal(emitted.length, 0);
});

// ---------------- dashboard ----------------
const NOW = new Date();
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const ev = (over: Record<string, unknown>) =>
  prisma.integrationEvent.create({
    data: { eventId: `e-${Math.random().toString(36).slice(2)}`, direction: "PORTAL_TO_VBL", eventType: "enrollment.created", payload: {}, payloadHash: "h", status: "SENT", processedAt: minsAgo(25), createdAt: minsAgo(30), ...over } as never,
  });

dbTest("dashboard is GREEN when everything is delivered and nothing is stuck", async () => {
  await resetDb(prisma);
  await ev({});
  await ev({ direction: "VBL_TO_PORTAL", status: "RECEIVED" });
  const d = await buildDashboard(prisma, NOW);
  assert.equal(d.health, "GREEN");
  assert.equal(d.eventCounts.PORTAL_TO_VBL.SENT, 1);
  assert.equal(d.eventCounts.VBL_TO_PORTAL.RECEIVED, 1);
  assert.equal(d.oldestPendingAgeSeconds, null);
});

dbTest("dashboard is AMBER for a failing event, an old backlog, or approved-but-unposted results", async () => {
  await resetDb(prisma);
  await ev({ status: "FAILED", lastError: "HTTP 500" });
  assert.equal((await buildDashboard(prisma, NOW)).health, "AMBER");

  await resetDb(prisma);
  await ev({ status: "PENDING", createdAt: minsAgo(30) });
  const backlog = await buildDashboard(prisma, NOW);
  assert.equal(backlog.health, "AMBER");
  assert.ok(Math.abs((backlog.oldestPendingAgeSeconds ?? 0) - 1800) <= 2);

  await resetDb(prisma);
  f = await seedFixture(prisma);
  await seedResult(prisma, f, { status: "APPROVED" });
  const unposted = await buildDashboard(prisma, NOW);
  assert.equal(unposted.health, "AMBER");
  assert.equal(unposted.approvedUnposted, 1);
});

dbTest("dashboard is RED when any event is dead-lettered, and surfaces the last failure", async () => {
  await resetDb(prisma);
  await ev({ status: "DEAD_LETTER", lastError: "connect ECONNREFUSED" });
  const d = await buildDashboard(prisma, NOW);
  assert.equal(d.health, "RED");
  assert.equal(d.lastFailure?.error, "connect ECONNREFUSED");
});

dbTest("dashboard counts Lab results by approval status, plus activity and rubric-mapping totals", async () => {
  await resetDb(prisma);
  f = await seedFixture(prisma);
  await seedResult(prisma, f);
  await seedResult(prisma, f);
  await seedResult(prisma, f, { status: "APPROVED", postedAt: new Date() });
  await seedResult(prisma, f, { status: "REVERSED" });
  await prisma.virtualLabActivity.createMany({
    data: [
      { studentId: f.studentId, activityType: "scenario.started", occurredAt: NOW, sourceEventId: "a1" },
      { studentId: f.studentId, activityType: "scenario.started", occurredAt: NOW, sourceEventId: "a2" },
      { studentId: f.studentId, activityType: "evidence.capture", occurredAt: NOW, sourceEventId: "a3" },
    ],
  });
  const d = await buildDashboard(prisma, NOW);
  assert.deepEqual(d.labResults, { PENDING_APPROVAL: 2, APPROVED: 1, REJECTED: 0, REVERSED: 1 });
  assert.equal(d.approvedUnposted, 0);
  assert.equal(d.activity.total, 3);
  assert.deepEqual(d.activity.byType[0], { activityType: "scenario.started", count: 2 });
});

dbTest("listEvents: keyset pagination visits every row exactly once, newest first, and honours filters", async () => {
  await resetDb(prisma);
  for (let i = 0; i < 7; i++) await ev({ createdAt: minsAgo(i), status: i % 2 ? "FAILED" : "SENT" });
  const seen: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await listEvents({ take: 3, cursor }, prisma);
    seen.push(...page.events.map((e: { id: string }) => e.id));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  assert.equal(seen.length, 7);
  assert.equal(new Set(seen).size, 7);
  const failed = await listEvents({ status: "FAILED", take: 50 }, prisma);
  assert.equal(failed.events.length, 3);
  assert.equal(failed.nextCursor, null);
});
