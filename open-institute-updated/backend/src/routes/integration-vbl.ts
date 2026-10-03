// Batch 65 — Virtual Business Lab (VBL) integration API, namespace VBI.
// See docs/VBL_MAIN_PORTAL_INTEGRATION_API.md for the full contract and
// docs/VBL_MAIN_PORTAL_INTEGRATION_AUDIT.md for what this batch covers.
//
// Deliberately a SMALL surface (VBI010) — this is not the whole internal
// API, just what VBL needs: identity/course lookups, an inbound webhook,
// an outbox the sync worker drains, SSO assertion issuance, and the
// trainer/admin approval workflow that stands between a Lab result and the
// official gradebook (VBI022).
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { issueSsoAssertion } from "../integration/signing.js";
import { dispatchPendingEvents } from "../integration/events.js";
import { rateLimit } from "../integration/rate-limit.js";
import { versionNegotiation } from "../integration/versioning.js";
import { buildDashboard, listEvents } from "../integration/dashboard.js";
import { processVblWebhook } from "../integration/vbl-events.js";
import { approveLabResult, rejectLabResult, reverseLabResult } from "../integration/lab-results.js";
import { resyncStudent, resyncUnit } from "../integration/resync.js";
import { issueCredential, revokeCredential, listCredentials } from "../integration/credentials.js";
import { postPendingApprovedResults } from "../integration/gradebook.js";
import { hasGlobalLabAccess, trainerUnitIds } from "../integration/scope.js";
import { runSchedulerTick } from "../integration/scheduler.js";

export const integrationVblRouter = Router();

// ---------------------------------------------------------------------------
// VBI043 — Integration API Versioning (logic lives in integration/versioning.ts
// so it can be unit-tested on its own).
// ---------------------------------------------------------------------------
integrationVblRouter.use(versionNegotiation());

// VBI044 — the inbound VBL webhook is rate-limited by source IP since it
// has no per-caller identity until signature verification runs inside the
// handler. SSO issuance is rate-limited per-user instead (see its route
// below), so this router-level guard only needs to cover the webhook.
integrationVblRouter.use("/webhooks/vbl", rateLimit({ windowMs: 60_000, max: 120, scope: "vbl-webhook" }));
const ssoRateLimit = rateLimit({ windowMs: 60_000, max: 20, scope: "vbl-sso", keyFn: (req) => (req as AuthedRequest).user?.id ?? req.ip ?? "unknown" });

const configured = () =>
  Boolean(process.env.VBL_INTEGRATION_URL && process.env.PORTAL_WEBHOOK_SECRET && process.env.PORTAL_SSO_SECRET);

// ---------------------------------------------------------------------------
// VBI046/047 — health
// ---------------------------------------------------------------------------
integrationVblRouter.get("/health", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (_req, res) => {
  const [pending, failed, deadLetter, lastSent, lastReceived] = await Promise.all([
    prisma.integrationEvent.count({ where: { status: { in: ["PENDING"] } } }),
    prisma.integrationEvent.count({ where: { status: "FAILED" } }),
    prisma.integrationEvent.count({ where: { status: "DEAD_LETTER" } }),
    prisma.integrationEvent.findFirst({ where: { direction: "PORTAL_TO_VBL", status: "SENT" }, orderBy: { processedAt: "desc" } }),
    prisma.integrationEvent.findFirst({ where: { direction: "VBL_TO_PORTAL" }, orderBy: { createdAt: "desc" } }),
  ]);
  res.json({
    configured: configured(),
    schedulerEnabled: process.env.INTEGRATION_SCHEDULER_ENABLED ? process.env.INTEGRATION_SCHEDULER_ENABLED.toLowerCase() !== "false" : Boolean(process.env.VBL_INTEGRATION_URL),
    credentialEncryption: Boolean(process.env.INTEGRATION_SECRET_ENCRYPTION_KEY),
    pendingEvents: pending,
    failedEvents: failed,
    deadLetterEvents: deadLetter,
    lastSentToLab: lastSent?.processedAt ?? null,
    lastReceivedFromLab: lastReceived?.createdAt ?? null,
  });
});

// ---------------------------------------------------------------------------
// VBI038 — Synchronization Dashboard (read model; VBI039 manual resync
// endpoints are POST /outbox/dispatch and POST /students/:id/resync below)
// ---------------------------------------------------------------------------
integrationVblRouter.get("/dashboard", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (_req, res) => {
  const [dashboard, recentEvents] = await Promise.all([
    buildDashboard(),
    prisma.integrationEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  res.json({ ...dashboard, recentEvents });
});

// VBI039 — targeted manual resynchronization. Audit-logged: an admin deliberately re-sending
// a student's or a unit's Lab presence is exactly the kind of action worth having a record of.
integrationVblRouter.post("/students/:id/resync", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const summary = await resyncStudent(req.params.id);
  if (!summary.found) return res.status(404).json({ message: "Student not found." });
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: "VBL_RESYNC_STUDENT", entityType: "Student", entityId: req.params.id, metadata: { ...summary } } });
  res.json(summary);
});

integrationVblRouter.post("/units/:id/resync", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const summary = await resyncUnit(req.params.id);
  if (!summary.found) return res.status(404).json({ message: "Unit not found." });
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: "VBL_RESYNC_UNIT", entityType: "Unit", entityId: req.params.id, metadata: { ...summary } } });
  // Results already APPROVED but never posted may also be waiting on this unit's gradebook mapping.
  const backfilled = await postPendingApprovedResults(req.params.id, req.user!.id);
  res.json({ ...summary, gradebookBackfilled: backfilled.filter((b) => b.posted).length });
});

integrationVblRouter.post("/outbox/dispatch", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (_req, res) => {
  const result = await dispatchPendingEvents();
  res.json(result);
});

// VBI038 — paged ledger for the admin Synchronization Dashboard (keyset pagination).
integrationVblRouter.get("/events", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const q = req.query;
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  res.json(await listEvents({ direction: str(q.direction), status: str(q.status), eventType: str(q.eventType), cursor: str(q.cursor), take: q.take ? Number(q.take) : undefined }));
});

// Runs exactly what the background scheduler runs (dispatch + gradebook sweep + cleanup), once, now.
integrationVblRouter.post("/scheduler/run", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (_req, res) => {
  res.json(await runSchedulerTick());
});

// VBI050 — bulk form of requeue: every DEAD_LETTER outbound event back to PENDING in one statement.
integrationVblRouter.post("/outbox/requeue-dead-letter", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const out = await prisma.integrationEvent.updateMany({
    where: { direction: "PORTAL_TO_VBL", status: "DEAD_LETTER" },
    data: { status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: null },
  });
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: "VBL_REQUEUE_DEAD_LETTER_BULK", entityType: "IntegrationEvent", entityId: "bulk", metadata: { requeued: out.count } } });
  res.json({ requeued: out.count });
});

// VBI040 — Failed Event Recovery: pull one DEAD_LETTER outbound event back
// into PENDING so the next dispatch pass retries it.
integrationVblRouter.get("/outbox/dead-letter", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (_req, res) => {
  res.json(await prisma.integrationEvent.findMany({ where: { direction: "PORTAL_TO_VBL", status: "DEAD_LETTER" }, orderBy: { createdAt: "asc" } }));
});

integrationVblRouter.post("/outbox/:eventId/requeue", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const event = await prisma.integrationEvent.findUnique({ where: { eventId: req.params.eventId } });
  if (!event) return res.status(404).json({ message: "Event not found." });
  if (event.status !== "DEAD_LETTER") return res.status(409).json({ message: `Event is ${event.status}, not DEAD_LETTER.` });
  const updated = await prisma.integrationEvent.update({ where: { id: event.id }, data: { status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: null } });
  res.json(updated);
});

// ---------------------------------------------------------------------------
// VBI003 — course (Unit) mapping administration
// ---------------------------------------------------------------------------
const courseMappingSchema = z.object({
  unitId: z.string(),
  labProgrammeId: z.string().optional(),
  labCohortId: z.string().optional(),
  labCourseCode: z.string().optional(),
  vblEnabled: z.boolean().default(true),
});

integrationVblRouter.post("/courses", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const parsed = courseMappingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid course mapping." });
  const { unitId, vblEnabled, ...mapping } = parsed.data;
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) return res.status(404).json({ message: "Unit not found." });
  const [, saved] = await prisma.$transaction([
    prisma.unit.update({ where: { id: unitId }, data: { vblEnabled } }),
    prisma.integrationCourseMapping.upsert({
      where: { unitId },
      create: { unitId, ...mapping },
      update: mapping,
    }),
  ]);
  res.status(201).json(saved);
});

integrationVblRouter.get("/courses", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (_req, res) => {
  res.json(await prisma.integrationCourseMapping.findMany({ include: { unit: { select: { code: true, title: true } } } }));
});

// ---------------------------------------------------------------------------
// VBI025/026/027 — Gradebook Mapping admin CRUD. One Assessment component
// per VBL-enabled unit — see gradebook.ts for the full rationale.
// ---------------------------------------------------------------------------
const gradebookMappingSchema = z.object({
  unitId: z.string(),
  assessmentId: z.string(),
  competentScorePercent: z.number().min(0).max(100).default(100),
  notYetCompetentScorePercent: z.number().min(0).max(100).default(0),
  rubricNote: z.string().optional(),
});

integrationVblRouter.post("/gradebook-mapping", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = gradebookMappingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid gradebook mapping.", issues: parsed.error.issues });
  const { unitId, assessmentId, ...rest } = parsed.data;
  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId }, include: { course: true } });
  if (!assessment) return res.status(404).json({ message: "Assessment not found." });
  if (assessment.course.unitId !== unitId) return res.status(400).json({ message: "That Assessment does not belong to a course on this unit." });
  const mapping = await prisma.integrationGradebookMapping.upsert({
    where: { unitId },
    create: { unitId, assessmentId, createdById: req.user!.id, ...rest },
    update: { assessmentId, ...rest },
  });
  // VBI039 — a batch of results may already be APPROVED-but-unposted,
  // waiting on exactly this mapping to exist. Sweep them now.
  const posted = await postPendingApprovedResults(unitId, req.user!.id);
  res.status(201).json({ mapping, backfilled: posted });
});

integrationVblRouter.get("/gradebook-mapping", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (_req, res) => {
  res.json(await prisma.integrationGradebookMapping.findMany({ include: { unit: { select: { code: true } }, assessment: { select: { title: true, totalMarks: true } } } }));
});

// ---------------------------------------------------------------------------
// VBI028/029 — Competency Mapping admin CRUD: which portal LearningOutcome
// a given Lab competency code (scoped to a unit) represents.
// ---------------------------------------------------------------------------
const competencyMappingSchema = z.object({
  unitId: z.string(),
  labCompetencyCode: z.string(),
  learningOutcomeId: z.string(),
});

integrationVblRouter.post("/competency-mapping", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = competencyMappingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "unitId, labCompetencyCode and learningOutcomeId are required." });
  const outcome = await prisma.learningOutcome.findUnique({ where: { id: parsed.data.learningOutcomeId } });
  if (!outcome || outcome.unitId !== parsed.data.unitId) return res.status(400).json({ message: "That LearningOutcome does not belong to this unit." });
  const mapping = await prisma.integrationCompetencyMapping.upsert({
    where: { unitId_labCompetencyCode: { unitId: parsed.data.unitId, labCompetencyCode: parsed.data.labCompetencyCode } },
    create: { ...parsed.data, createdById: req.user!.id },
    update: { learningOutcomeId: parsed.data.learningOutcomeId },
  });
  res.status(201).json(mapping);
});

integrationVblRouter.get("/competency-mapping", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const unitId = typeof req.query.unitId === "string" ? req.query.unitId : undefined;
  res.json(await prisma.integrationCompetencyMapping.findMany({ where: unitId ? { unitId } : undefined, include: { learningOutcome: { select: { code: true, description: true } } } }));
});

// ---------------------------------------------------------------------------
// VBI010/045 — rotating webhook credentials. The secret is returned ONLY
// from the issue call, never from list — same one-time-reveal UX as any
// cloud provider's API-key console.
// ---------------------------------------------------------------------------
const credentialSchema = z.object({
  direction: z.enum(["PORTAL_TO_VBL", "VBL_TO_PORTAL"]),
  notes: z.string().optional(),
});

integrationVblRouter.post("/credentials", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = credentialSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "direction must be PORTAL_TO_VBL or VBL_TO_PORTAL." });
  const credential = await issueCredential(parsed.data.direction, req.user!.id, parsed.data.notes);
  res.status(201).json(credential);
});

integrationVblRouter.get("/credentials", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const direction = typeof req.query.direction === "string" ? (req.query.direction as "PORTAL_TO_VBL" | "VBL_TO_PORTAL") : undefined;
  res.json(await listCredentials(direction));
});

integrationVblRouter.post("/credentials/:id/revoke", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  await revokeCredential(req.params.id, req.user!.id);
  res.json({ status: "revoked" });
});

// ---------------------------------------------------------------------------
// VBI008/009 — SSO assertion issuance. Any authenticated student or trainer
// with a Lab-enabled unit can request one; VBL validates and JIT-provisions.
// ---------------------------------------------------------------------------
integrationVblRouter.post("/sso/assertion", requireAuth, ssoRateLimit, async (req: AuthedRequest, res) => {
  const secret = process.env.PORTAL_SSO_SECRET;
  if (!secret) return res.status(503).json({ message: "Virtual Business Lab SSO is not configured." });

  const user = req.user!;
  const student = await prisma.student.findUnique({ where: { userId: user.id } });
  const trainer = student ? null : await prisma.trainer.findUnique({ where: { userId: user.id } });

  if (!student && !trainer) {
    return res.status(403).json({ message: "Only students and trainers can open the Virtual Business Lab." });
  }

  const { assertion, expiresAt } = issueSsoAssertion(secret, {
    sub: user.id,
    portalUserId: user.id,
    portalStudentId: student?.id,
    portalTrainerId: trainer?.id,
    registrationNumber: student?.studentNumber,
    roles: [user.role],
  });

  res.json({ assertion, expiresAt, labUrl: process.env.VBL_PUBLIC_URL ?? null });
});

// ---------------------------------------------------------------------------
// VBI012 — Lab-to-Portal webhooks. Inbound events from VBL: assessment
// decisions (which double as competency results — see the audit doc on why
// VBL has no separate "approve" step of its own) and Lab-side acks.
// ---------------------------------------------------------------------------
integrationVblRouter.post("/webhooks/vbl", async (req, res) => {
  // express.raw() is registered for this path in index.ts (same pattern as the card-gateway
  // webhook), so req.body is the exact bytes the sender signed — never a re-serialisation.
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body);
  const result = await processVblWebhook({
    timestamp: req.header("x-vbl-timestamp"),
    signature: req.header("x-vbl-signature"),
    keyId: req.header("x-vbl-key-id"),
    rawBody,
  });
  res.status(result.status).json(result.body);
});


// ---------------------------------------------------------------------------
// VBI022 — Grade Approval Workflow. A PENDING_APPROVAL Lab result becomes
// visible to the gradebook only once a trainer/admin approves it; approval then posts into the
// unit's mapped gradebook component (VBI025/026 — see integration/gradebook.ts). Trainers are
// limited to units they teach (integration/scope.ts).
// ---------------------------------------------------------------------------
integrationVblRouter.get("/lab-results", requireAuth, requireRole("TRAINER", "ICT_ADMIN", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "PENDING_APPROVAL";
  // Batch 66 — a TRAINER only sees results for units they teach; admins see everything.
  const scopeUnits = hasGlobalLabAccess(req.user!) ? undefined : await trainerUnitIds(req.user!.id);
  res.json(
    await prisma.virtualLabAssessmentResult.findMany({
      where: { status: status as never, ...(scopeUnits ? { unitId: { in: scopeUnits } } : {}) },
      include: { student: { select: { fullName: true, studentNumber: true } }, unit: { select: { code: true, title: true } } },
      orderBy: { decidedAt: "desc" },
    })
  );
});

integrationVblRouter.get("/me/lab-results", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });
  res.json(
    await prisma.virtualLabAssessmentResult.findMany({
      where: { studentId: student.id },
      include: { unit: { select: { code: true, title: true } } },
      orderBy: { decidedAt: "desc" },
    })
  );
});

const decisionSchema = z.object({ note: z.string().optional() });
// VBI024 — reversal needs a reason; the state machine itself lives in integration/lab-results.ts.
const reversalSchema = z.object({ reason: z.string().min(1, "A reason is required to reverse an approved result.") });

integrationVblRouter.post("/lab-results/:id/approve", requireAuth, requireRole("TRAINER", "ICT_ADMIN", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = decisionSchema.safeParse(req.body ?? {});
  const out = await approveLabResult(req.params.id, req.user!, parsed.success ? parsed.data.note : undefined);
  res.status(out.status).json(out.body);
});

integrationVblRouter.post("/lab-results/:id/reject", requireAuth, requireRole("TRAINER", "ICT_ADMIN", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = decisionSchema.safeParse(req.body ?? {});
  const out = await rejectLabResult(req.params.id, req.user!, parsed.success ? parsed.data.note : undefined);
  res.status(out.status).json(out.body);
});

integrationVblRouter.post("/lab-results/:id/reverse", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = reversalSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request." });
  const out = await reverseLabResult(req.params.id, req.user!, parsed.data.reason);
  res.status(out.status).json(out.body);
});

// ---------------------------------------------------------------------------
// VBI036 — Lab activity feed (Batch 66). Trainers see activity for units they teach; a student
// sees only their own.
// ---------------------------------------------------------------------------
integrationVblRouter.get("/activity", requireAuth, requireRole("TRAINER", "ICT_ADMIN", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const scopeUnits = hasGlobalLabAccess(req.user!) ? undefined : await trainerUnitIds(req.user!.id);
  const unitId = str(req.query.unitId);
  if (scopeUnits && unitId && !scopeUnits.includes(unitId)) return res.status(403).json({ message: "You can only view Virtual Lab activity for units you teach." });
  const take = Math.min(Math.max(Number(req.query.take ?? 100) || 100, 1), 500);
  res.json(
    await prisma.virtualLabActivity.findMany({
      where: {
        ...(str(req.query.studentId) ? { studentId: str(req.query.studentId) } : {}),
        ...(str(req.query.activityType) ? { activityType: str(req.query.activityType) } : {}),
        ...(unitId ? { unitId } : scopeUnits ? { unitId: { in: scopeUnits } } : {}),
      },
      include: { student: { select: { fullName: true, studentNumber: true } }, unit: { select: { code: true, title: true } } },
      orderBy: { occurredAt: "desc" },
      take,
    })
  );
});

integrationVblRouter.get("/me/lab-activity", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });
  res.json(
    await prisma.virtualLabActivity.findMany({
      where: { studentId: student.id },
      select: { id: true, activityType: true, summary: true, occurredAt: true, unit: { select: { code: true, title: true } } },
      orderBy: { occurredAt: "desc" },
      take: 100,
    })
  );
});

// ---------------------------------------------------------------------------
// VBI027 — criterion-level Rubric Mapping admin CRUD (Batch 66). Maps a Lab criterion code onto
// the name of a criterion in the unit's mapped Assessment's Rubric.
// ---------------------------------------------------------------------------
const rubricMappingSchema = z.object({
  unitId: z.string(),
  labCriterionCode: z.string().min(1),
  rubricCriterionName: z.string().min(1),
});

integrationVblRouter.post("/rubric-mapping", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = rubricMappingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "unitId, labCriterionCode and rubricCriterionName are required." });
  const gm = await prisma.integrationGradebookMapping.findUnique({ where: { unitId: parsed.data.unitId } });
  if (!gm) return res.status(400).json({ message: "Create the unit's gradebook mapping first (POST /gradebook-mapping)." });
  const rubric = await prisma.rubric.findUnique({ where: { assessmentId: gm.assessmentId } });
  if (!rubric) return res.status(400).json({ message: "The mapped Assessment has no Rubric to map criteria onto." });
  const names = (Array.isArray(rubric.criteria) ? rubric.criteria : []).map((c) => (c as { name?: string }).name);
  if (!names.includes(parsed.data.rubricCriterionName)) {
    return res.status(400).json({ message: `The Rubric has no criterion named "${parsed.data.rubricCriterionName}".`, available: names });
  }
  const mapping = await prisma.integrationRubricCriterionMapping.upsert({
    where: { gradebookMappingId_labCriterionCode: { gradebookMappingId: gm.id, labCriterionCode: parsed.data.labCriterionCode } },
    create: { gradebookMappingId: gm.id, labCriterionCode: parsed.data.labCriterionCode, rubricCriterionName: parsed.data.rubricCriterionName, createdById: req.user!.id },
    update: { rubricCriterionName: parsed.data.rubricCriterionName },
  });
  res.status(201).json(mapping);
});

integrationVblRouter.get("/rubric-mapping", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const unitId = typeof req.query.unitId === "string" ? req.query.unitId : undefined;
  res.json(
    await prisma.integrationRubricCriterionMapping.findMany({
      where: unitId ? { gradebookMapping: { unitId } } : undefined,
      include: { gradebookMapping: { select: { unitId: true, unit: { select: { code: true } } } } },
      orderBy: { createdAt: "asc" },
    })
  );
});

integrationVblRouter.delete("/rubric-mapping/:id", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const found = await prisma.integrationRubricCriterionMapping.findUnique({ where: { id: req.params.id } });
  if (!found) return res.status(404).json({ message: "Mapping not found." });
  await prisma.integrationRubricCriterionMapping.delete({ where: { id: req.params.id } });
  res.json({ status: "deleted" });
});

// ---------------------------------------------------------------------------
// Mapping CRUD completion (Batch 66): the create/list endpoints above had no way to remove a
// mapping. Deleting never touches already-posted grades or already-recorded results.
// ---------------------------------------------------------------------------
integrationVblRouter.delete("/gradebook-mapping/:unitId", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const found = await prisma.integrationGradebookMapping.findUnique({ where: { unitId: req.params.unitId } });
  if (!found) return res.status(404).json({ message: "No gradebook mapping for that unit." });
  await prisma.integrationGradebookMapping.delete({ where: { unitId: req.params.unitId } }); // criterion mappings cascade
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: "VBL_GRADEBOOK_MAPPING_DELETE", entityType: "Unit", entityId: req.params.unitId } });
  res.json({ status: "deleted" });
});

integrationVblRouter.delete("/competency-mapping/:id", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const found = await prisma.integrationCompetencyMapping.findUnique({ where: { id: req.params.id } });
  if (!found) return res.status(404).json({ message: "Mapping not found." });
  await prisma.integrationCompetencyMapping.delete({ where: { id: req.params.id } });
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: "VBL_COMPETENCY_MAPPING_DELETE", entityType: "IntegrationCompetencyMapping", entityId: req.params.id } });
  res.json({ status: "deleted" });
});

// Turning a unit's Lab integration OFF. Keeps history: only the mapping row and the vblEnabled
// flag change, so results/activity already recorded stay queryable.
integrationVblRouter.delete("/courses/:unitId", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const found = await prisma.integrationCourseMapping.findUnique({ where: { unitId: req.params.unitId } });
  if (!found) return res.status(404).json({ message: "That unit has no Lab course mapping." });
  await prisma.$transaction([
    prisma.integrationCourseMapping.delete({ where: { unitId: req.params.unitId } }),
    prisma.unit.update({ where: { id: req.params.unitId }, data: { vblEnabled: false } }),
    prisma.auditLog.create({ data: { userId: req.user!.id, action: "VBL_COURSE_MAPPING_DELETE", entityType: "Unit", entityId: req.params.unitId } }),
  ]);
  res.json({ status: "deleted" });
});

// ---------------------------------------------------------------------------
// Lookups that let the admin screen build its pickers without touching unrelated routers.
// ---------------------------------------------------------------------------
integrationVblRouter.get("/lookups/units", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (_req, res) => {
  res.json(await prisma.unit.findMany({ select: { id: true, code: true, title: true, vblEnabled: true }, orderBy: { code: "asc" } }));
});

integrationVblRouter.get("/lookups/units/:unitId", requireAuth, requireRole("ICT_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const [assessments, learningOutcomes] = await Promise.all([
    prisma.assessment.findMany({
      where: { course: { unitId: req.params.unitId } },
      select: { id: true, title: true, totalMarks: true, rubric: { select: { criteria: true } } },
      orderBy: { title: "asc" },
    }),
    prisma.learningOutcome.findMany({ where: { unitId: req.params.unitId }, select: { id: true, code: true, description: true }, orderBy: { code: "asc" } }),
  ]);
  res.json({ assessments, learningOutcomes });
});
