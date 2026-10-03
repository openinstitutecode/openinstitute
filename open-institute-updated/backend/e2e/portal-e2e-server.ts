// Cross-system E2E: the REAL portal integration modules (webhook processing, review workflow,
// gradebook posting, outbound dispatch) behind a tiny HTTP server, running against a REAL Postgres
// (Batch 66 — the in-memory stand-in for Prisma is gone). Driven by e2e/run_e2e.py, which plays the
// Virtual Business Lab. Not production code: it TRUNCATES the database it is pointed at on start,
// so it refuses any database whose name does not contain "e2e" or "test".
import http from "node:http";
import { prisma } from "../src/lib/prisma.js";
import { processVblWebhook } from "../src/integration/vbl-events.js";
import { approveLabResult, reverseLabResult } from "../src/integration/lab-results.js";
import { dispatchPendingEvents, emitPortalEvent } from "../src/integration/events.js";

const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname;
if (!/e2e|test/i.test(dbName)) {
  console.error(`Refusing to run the E2E server against database "${dbName}" — its name must contain "e2e" or "test".`);
  process.exit(2);
}

const deps = { db: prisma, emit: (e: Parameters<typeof emitPortalEvent>[0]) => emitPortalEvent(e, prisma) };
let seq = 0;

async function seed() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "User", "Programme", "IntegrationEvent", "IntegrationCredential", "IntegrationRateLimitBucket", "VirtualLabActivity", "AuditLog" RESTART IDENTITY CASCADE`
  );
  await prisma.user.createMany({
    data: [
      { id: "admin_1", email: "admin@e2e.test", passwordHash: "x", role: "ICT_ADMIN" },
      { id: "trainer_1", email: "trainer@e2e.test", passwordHash: "x", role: "TRAINER" },
      { id: "user_1", email: "e2e.student@portal.test", passwordHash: "x", role: "STUDENT" },
    ],
  });
  await prisma.programme.create({ data: { id: "prog_1", slug: "bm5", name: "Business Management", qualificationLevel: "TVET Level 5", durationSemesters: 4, deliveryMode: "FULL_TIME" } });
  await prisma.unit.create({ data: { id: "u1", programmeId: "prog_1", code: "BM501", title: "Accounting", semester: 1, vblEnabled: true } });
  await prisma.trainer.create({ data: { id: "t1", userId: "trainer_1", fullName: "E2E Trainer", qualifications: [] } });
  await prisma.course.create({ data: { id: "c1", unitId: "u1", trainerId: "t1", title: "Accounting" } });
  await prisma.student.create({
    data: { id: "stu_1", userId: "user_1", studentNumber: "2026/BM5/000001", admissionNumber: "ADM-E2E-1", fullName: "E2E Student", programmeId: "prog_1", intake: "2026-Sep", studyMode: "FULL_TIME" },
  });
  await prisma.assessment.create({ data: { id: "a1", courseId: "c1", title: "Lab practical", type: "PRACTICAL", totalMarks: 100 } });
  await prisma.learningOutcome.create({ data: { id: "lo-1", unitId: "u1", code: "LO-1", description: "Reconcile a bank statement" } });
  await prisma.integrationCompetencyMapping.create({ data: { unitId: "u1", labCompetencyCode: "C-AC052", learningOutcomeId: "lo-1", createdById: "admin_1" } });
  await prisma.integrationGradebookMapping.create({ data: { unitId: "u1", assessmentId: "a1", competentScorePercent: 100, notYetCompetentScorePercent: 0, rubricNote: "Lab rubric", createdById: "admin_1" } });
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => { let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => resolve(raw)); });
}
const send = (res: http.ServerResponse, status: number, body: unknown) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); };

const server = http.createServer(async (req, res) => {
  try {
    const raw = await readBody(req);
    if (req.method === "POST" && req.url === "/webhooks/vbl") {
      const out = await processVblWebhook({
        timestamp: req.headers["x-vbl-timestamp"] as string, signature: req.headers["x-vbl-signature"] as string,
        keyId: req.headers["x-vbl-key-id"] as string, rawBody: raw,
      }, prisma);
      return send(res, out.status, out.body);
    }
    const body = raw ? JSON.parse(raw) : {};
    if (req.method === "POST" && req.url === "/admin/enroll") {
      await emitPortalEvent({ eventType: "enrollment.created", entityType: "Enrollment", entityId: `enr_${++seq}`, payload: {
        portalStudentId: "stu_1", registrationNumber: "2026/BM5/000001", fullName: "E2E Student", email: "e2e.student@portal.test",
        unitId: body.unitId ?? "u1", unitCode: "BM501", semester: "2026/1" } }, prisma);
      return send(res, 201, { queued: true });
    }
    if (req.method === "POST" && req.url === "/admin/dispatch") return send(res, 200, await dispatchPendingEvents(25, prisma));
    if (req.method === "POST" && req.url === "/admin/approve") { const o = await approveLabResult(body.resultId, { id: "trainer_1", role: "TRAINER" }, body.note, deps); return send(res, o.status, o.body); }
    if (req.method === "POST" && req.url === "/admin/reverse") { const o = await reverseLabResult(body.resultId, { id: "admin_1", role: "ICT_ADMIN" }, body.reason, deps); return send(res, o.status, o.body); }
    if (req.method === "POST" && req.url === "/admin/add-student") {
      await prisma.user.create({ data: { id: `user_${body.id}`, email: `${body.id}@e2e.test`, passwordHash: "x", role: "STUDENT" } });
      await prisma.student.create({ data: { id: body.id, userId: `user_${body.id}`, studentNumber: body.studentNumber, admissionNumber: `ADM-${body.id}`, fullName: "Late Student", programmeId: "prog_1", intake: "2026-Sep", studyMode: "FULL_TIME" } });
      return send(res, 201, {});
    }
    // "Fast-forward the clock": every outbound event that is waiting out a backoff becomes due now.
    if (req.method === "POST" && req.url === "/admin/backdate") { await prisma.integrationEvent.updateMany({ data: { nextAttemptAt: null } }); return send(res, 200, {}); }
    if (req.method === "GET" && req.url === "/state") {
      const [ledger, results, submissions, audits, activities] = await Promise.all([
        prisma.integrationEvent.findMany({ orderBy: { createdAt: "asc" } }),
        prisma.virtualLabAssessmentResult.findMany({ orderBy: { createdAt: "asc" } }),
        prisma.submission.findMany({ orderBy: { id: "asc" } }),
        prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } }),
        prisma.virtualLabActivity.findMany({ orderBy: { createdAt: "asc" } }),
      ]);
      return send(res, 200, { ledger, results, submissions, audits, activities });
    }
    send(res, 404, { message: "not found" });
  } catch (err) {
    send(res, 500, { message: String(err) });
  }
});

await seed();
server.listen(Number(process.env.PORT ?? 0), "127.0.0.1", () => {
  console.log(`READY ${(server.address() as { port: number }).port}`);
});
