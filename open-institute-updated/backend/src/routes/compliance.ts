import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { dispatchNotification } from "../lib/notify.js";

export const complianceRouter = Router();

// Public: what we're allowed to say about our own accreditation status —
// deliberately minimal, sourced from the same table staff maintain.
complianceRouter.get("/public-status", async (_req, res) => {
  const rows = await prisma.complianceRequirement.findMany({
    where: { mandatory: true },
    select: { regulator: true, requirement: true, status: true },
    orderBy: { regulator: "asc" },
  });
  res.json(rows);
});

// Staff: full evidence vault.
complianceRouter.get(
  "/",
  requireAuth,
  requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN", "REGULATORY_INSPECTOR"),
  async (_req: AuthedRequest, res) => {
    const rows = await prisma.complianceRequirement.findMany({
      orderBy: [{ regulator: "asc" }, { nextReviewDue: "asc" }],
    });
    res.json(rows);
  }
);

const upsertSchema = z.object({
  regulator: z.string(),
  requirement: z.string(),
  mandatory: z.boolean().default(true),
  status: z.enum(["pending", "in_progress", "met", "expired"]),
  responsibleRole: z.string().optional(),
  evidenceDocUrl: z.string().url().optional(),
  nextReviewDue: z.string().datetime().optional(),
});

complianceRouter.post(
  "/",
  requireAuth,
  requireRole("QA_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid compliance record." });
    }
    const { responsibleRole, nextReviewDue, ...rest } = parsed.data;
    const record = await prisma.complianceRequirement.create({
      data: {
        ...rest,
        responsibleRole: responsibleRole as never,
        nextReviewDue: nextReviewDue ? new Date(nextReviewDue) : undefined,
        lastReviewedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "COMPLIANCE_RECORD_CREATED",
        entityType: "ComplianceRequirement",
        entityId: record.id,
      },
    });

    res.status(201).json(record);
  }
);

// QA026/QA027 — corrective actions, tracked to resolution.
const correctiveActionSchema = z.object({
  complianceRequirementId: z.string().optional(),
  description: z.string().min(3),
  assignedToId: z.string(),
  dueDate: z.string().datetime().optional(),
});

complianceRouter.post(
  "/corrective-actions",
  requireAuth,
  requireRole("QA_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = correctiveActionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid corrective action." });
    const { dueDate, ...rest } = parsed.data;
    const action = await prisma.correctiveAction.create({
      data: { ...rest, dueDate: dueDate ? new Date(dueDate) : undefined, createdById: req.user!.id },
    });
    res.status(201).json(action);
  }
);

complianceRouter.get(
  "/corrective-actions",
  requireAuth,
  requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const actions = await prisma.correctiveAction.findMany({
      include: { requirement: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(actions);
  }
);

const actionStatusSchema = z.object({ status: z.enum(["in_progress", "verified", "closed"]), evidenceUrl: z.string().url().optional() });

complianceRouter.patch(
  "/corrective-actions/:id",
  requireAuth,
  requireRole("QA_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = actionStatusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid update." });
    const action = await prisma.correctiveAction.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    res.json(action);
  }
);

// QA002 — policy documents.
const policySchema = z.object({
  title: z.string().min(2),
  category: z.enum(["academic", "financial", "hr", "it", "safeguarding", "other"]),
  documentUrl: z.string().url(),
  effectiveDate: z.string().datetime().optional(),
});

complianceRouter.post("/policies", requireAuth, requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = policySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid policy." });
  const { effectiveDate, ...rest } = parsed.data;
  const policy = await prisma.policyDocument.create({
    data: { ...rest, effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined, approvedById: req.user!.id },
  });
  res.status(201).json(policy);
});

complianceRouter.get("/policies", requireAuth, async (_req, res) => {
  const policies = await prisma.policyDocument.findMany({ orderBy: { title: "asc" } });
  res.json(policies);
});

// QA037 — risk register.
const riskSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(2),
  category: z.enum(["regulatory", "financial", "academic", "operational", "reputational"]),
  likelihood: z.enum(["low", "medium", "high"]),
  impact: z.enum(["low", "medium", "high"]),
  mitigation: z.string().optional(),
  ownerId: z.string(),
});

complianceRouter.post("/risks", requireAuth, requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"), async (req, res) => {
  const parsed = riskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid risk entry." });
  const risk = await prisma.riskRegisterEntry.create({ data: parsed.data });
  res.status(201).json(risk);
});

complianceRouter.get("/risks", requireAuth, requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"), async (_req, res) => {
  const risks = await prisma.riskRegisterEntry.findMany({ orderBy: { createdAt: "desc" } });
  res.json(risks);
});

const riskStatusSchema = z.object({ status: z.enum(["mitigated", "closed"]) });

complianceRouter.patch("/risks/:id", requireAuth, requireRole("QA_OFFICER", "SUPER_ADMIN"), async (req, res) => {
  const parsed = riskStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid status." });
  const risk = await prisma.riskRegisterEntry.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(risk);
});

// QA028/QA029/QA030 — internal audits and findings.
const auditSchema = z.object({ title: z.string().min(2), scope: z.string().min(2), scheduledAt: z.string().datetime() });

complianceRouter.post("/audits", requireAuth, requireRole("QA_OFFICER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = auditSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid audit." });
  const audit = await prisma.internalAudit.create({
    data: { ...parsed.data, scheduledAt: new Date(parsed.data.scheduledAt), auditorId: req.user!.id },
  });
  res.status(201).json(audit);
});

complianceRouter.get("/audits", requireAuth, requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"), async (_req, res) => {
  const audits = await prisma.internalAudit.findMany({ include: { findings: true }, orderBy: { scheduledAt: "desc" } });
  res.json(audits);
});

const findingSchema = z.object({ description: z.string().min(3), severity: z.enum(["minor", "major", "critical"]), evidenceUrl: z.string().url().optional() });

complianceRouter.post("/audits/:id/findings", requireAuth, requireRole("QA_OFFICER", "SUPER_ADMIN"), async (req, res) => {
  const parsed = findingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid finding." });
  const finding = await prisma.auditFinding.create({ data: { ...parsed.data, auditId: req.params.id } });
  res.status(201).json(finding);
});

// QA028 — audit status transitions: planned/in_progress/completed had a
// default value and nothing that ever moved it, so every audit stayed
// "planned" forever regardless of what actually happened.
const auditStatusSchema = z.object({ status: z.enum(["in_progress", "completed"]) });

complianceRouter.patch("/audits/:id", requireAuth, requireRole("QA_OFFICER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = auditStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Status must be in_progress or completed." });
  const audit = await prisma.internalAudit.update({ where: { id: req.params.id }, data: parsed.data }).catch(() => null);
  if (!audit) return res.status(404).json({ message: "Audit not found." });
  res.json(audit);
});

// QA030 — audit evidence: a finding's evidenceUrl field existed with no
// way to attach it after creation and no way to mark a finding resolved
// once evidence was on file — the field was write-once-at-creation only.
// This lets a QA officer attach/replace evidence on an existing finding
// and separately record who actually resolved it and when, the same
// resolved-by/resolved-at discipline as CorrectiveAction.
const findingUpdateSchema = z.object({
  evidenceUrl: z.string().url().optional(),
  status: z.enum(["open", "resolved"]).optional(),
}).refine((v) => v.evidenceUrl !== undefined || v.status !== undefined, { message: "Provide evidenceUrl and/or status." });

complianceRouter.patch("/audits/findings/:id", requireAuth, requireRole("QA_OFFICER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = findingUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid update." });

  const data: Record<string, unknown> = {};
  if (parsed.data.evidenceUrl !== undefined) data.evidenceUrl = parsed.data.evidenceUrl;
  if (parsed.data.status === "resolved") {
    data.status = "resolved";
    data.resolvedById = req.user!.id;
    data.resolvedAt = new Date();
  } else if (parsed.data.status === "open") {
    data.status = "open";
    data.resolvedById = null;
    data.resolvedAt = null;
  }

  const finding = await prisma.auditFinding.update({ where: { id: req.params.id }, data }).catch(() => null);
  if (!finding) return res.status(404).json({ message: "Finding not found." });
  res.json(finding);
});

// QA025 — gap analysis: mandatory requirements not yet met, grouped by
// regulator, computed live from ComplianceRequirement.
complianceRouter.get("/gap-analysis", requireAuth, requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"), async (_req, res) => {
  const gaps = await prisma.complianceRequirement.findMany({
    where: { mandatory: true, status: { not: "met" } },
  });
  const byRegulator = gaps.reduce<Record<string, number>>((acc, g) => {
    acc[g.regulator] = (acc[g.regulator] ?? 0) + 1;
    return acc;
  }, {});
  res.json({ totalGaps: gaps.length, byRegulator, items: gaps });
});

// QA036 — complaints analytics: real aggregation over the Complaint table.
complianceRouter.get("/complaints-analytics", requireAuth, requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"), async (_req, res) => {
  const complaints = await prisma.complaint.findMany();
  const byCategory = complaints.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + 1;
    return acc;
  }, {});
  const byStatus = complaints.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});
  res.json({ total: complaints.length, byCategory, byStatus });
});

// ---------------------------------------------------------------------------
// QA008/015-019 — category-tagged compliance requirements (ODeL, facility,
// ICT, learner support, assessment, course material). Reuses the existing
// ComplianceRequirement model with a new category field, rather than a
// separate model per category — one real requirement table, filterable
// by category, not six parallel tracking systems that could drift apart.
// ---------------------------------------------------------------------------
complianceRouter.get(
  "/requirements/by-category/:category",
  requireAuth,
  requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const requirements = await prisma.complianceRequirement.findMany({
      where: { category: req.params.category },
      orderBy: { createdAt: "desc" },
    });
    res.json(requirements);
  }
);

// QA021 — evidence versioning: replacing evidenceDocUrl now keeps the
// previous value as a real version row instead of silently overwriting it.
const evidenceUpdateSchema = z.object({ url: z.string().url() });

complianceRouter.post(
  "/requirements/:id/evidence",
  requireAuth,
  requireRole("QA_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = evidenceUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide a valid evidence URL." });

    const version = await prisma.$transaction(async (tx) => {
      const v = await tx.evidenceVersion.create({
        data: { requirementId: req.params.id, url: parsed.data.url, uploadedById: req.user!.id },
      });
      await tx.complianceRequirement.update({
        where: { id: req.params.id },
        data: { evidenceDocUrl: parsed.data.url, lastReviewedAt: new Date() },
      });
      return v;
    });
    res.status(201).json(version);
  }
);

complianceRouter.get(
  "/requirements/:id/evidence-history",
  requireAuth,
  requireRole("QA_OFFICER", "SUPER_ADMIN", "AUDITOR"),
  async (req: AuthedRequest, res) => {
    const versions = await prisma.evidenceVersion.findMany({
      where: { requirementId: req.params.id },
      orderBy: { uploadedAt: "asc" },
    });
    res.json(versions.map((v, i) => ({ ...v, version: i + 1 })));
  }
);

// ---------------------------------------------------------------------------
// QA005 — quality standards registry.
// ---------------------------------------------------------------------------
const standardSchema = z.object({ name: z.string().min(2), description: z.string().min(2), category: z.string().optional() });

complianceRouter.get("/quality-standards", requireAuth, requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"), async (_req, res) => {
  const standards = await prisma.qualityStandard.findMany({ orderBy: { createdAt: "desc" } });
  res.json(standards);
});

complianceRouter.post("/quality-standards", requireAuth, requireRole("QA_OFFICER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = standardSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide name and description." });
  const standard = await prisma.qualityStandard.create({ data: parsed.data });
  res.status(201).json(standard);
});

// ---------------------------------------------------------------------------
// QA003 — IQA (internal quality assurance) management: real self-review
// records, distinct from the more formal InternalAudit.
// ---------------------------------------------------------------------------
const iqaSchema = z.object({ scope: z.string().min(2), findings: z.string().min(2), actionsRequired: z.string().optional() });

complianceRouter.get("/iqa-reviews", requireAuth, requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"), async (_req, res) => {
  const reviews = await prisma.iqaReview.findMany({ orderBy: { reviewDate: "desc" } });
  res.json(reviews);
});

complianceRouter.post("/iqa-reviews", requireAuth, requireRole("QA_OFFICER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = iqaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide scope and findings." });
  const review = await prisma.iqaReview.create({ data: { ...parsed.data, reviewedById: req.user!.id } });
  res.status(201).json(review);
});

// ---------------------------------------------------------------------------
// QA031 — management review of the QMS as a whole.
// ---------------------------------------------------------------------------
const managementReviewSchema = z.object({ meetingId: z.string().optional(), inputsSummary: z.string().min(2), decisionsSummary: z.string().min(2) });

complianceRouter.get("/management-reviews", requireAuth, requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"), async (_req, res) => {
  const reviews = await prisma.managementReview.findMany({ orderBy: { reviewDate: "desc" } });
  res.json(reviews);
});

complianceRouter.post("/management-reviews", requireAuth, requireRole("PRINCIPAL", "QA_OFFICER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = managementReviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide inputsSummary and decisionsSummary." });
  const review = await prisma.managementReview.create({ data: { ...parsed.data, conductedById: req.user!.id } });
  res.status(201).json(review);
});

// ---------------------------------------------------------------------------
// QA035 — programme-specific quality review.
// ---------------------------------------------------------------------------
const programmeReviewSchema = z.object({
  programmeId: z.string(),
  findings: z.string().min(2),
  recommendedActions: z.string().optional(),
  nextReviewDue: z.string().datetime().optional(),
});

complianceRouter.get("/programme-reviews/:programmeId", requireAuth, requireRole("QA_OFFICER", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"), async (req, res) => {
  const reviews = await prisma.programmeReview.findMany({
    where: { programmeId: req.params.programmeId },
    orderBy: { reviewDate: "desc" },
  });
  res.json(reviews);
});

complianceRouter.post("/programme-reviews", requireAuth, requireRole("QA_OFFICER", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = programmeReviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide programmeId and findings." });
  const review = await prisma.programmeReview.create({
    data: {
      ...parsed.data,
      nextReviewDue: parsed.data.nextReviewDue ? new Date(parsed.data.nextReviewDue) : undefined,
      reviewedById: req.user!.id,
    },
  });
  res.status(201).json(review);
});

// ---------------------------------------------------------------------------
// AD020 — institutional records: policy documents (a model that existed
// with zero routes touching it before this batch) plus a real aggregated
// view combining them with meeting minutes and calendar events — one
// real browsable archive, not three separate half-visible systems.
// ---------------------------------------------------------------------------
const policyDocSchema = z.object({
  title: z.string().min(2),
  category: z.enum(["academic", "financial", "hr", "it", "safeguarding", "other"]),
  documentUrl: z.string().url(),
  effectiveDate: z.string().datetime().optional(),
});

complianceRouter.post("/policy-documents", requireAuth, requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = policyDocSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide title, category, and documentUrl." });
  const doc = await prisma.policyDocument.create({
    data: { ...parsed.data, approvedById: req.user!.id, effectiveDate: parsed.data.effectiveDate ? new Date(parsed.data.effectiveDate) : undefined },
  });
  res.status(201).json(doc);
});

// Replacing a policy document's URL bumps its real version number rather
// than silently overwriting — the same discipline as QA021's evidence
// versioning, applied here to policy documents specifically.
complianceRouter.patch("/policy-documents/:id", requireAuth, requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = z.object({ documentUrl: z.string().url() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide a new documentUrl." });
  const doc = await prisma.policyDocument.update({
    where: { id: req.params.id },
    data: { documentUrl: parsed.data.documentUrl, version: { increment: 1 } },
  });
  res.json(doc);
});

complianceRouter.get("/policy-documents", requireAuth, async (_req, res) => {
  const docs = await prisma.policyDocument.findMany({ orderBy: { createdAt: "desc" } });
  res.json(docs);
});

complianceRouter.get(
  "/institutional-records",
  requireAuth,
  requireRole("PRINCIPAL", "REGISTRAR", "QA_OFFICER", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const [policies, meetings, calendarEvents] = await Promise.all([
      prisma.policyDocument.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.meeting.findMany({ where: { minutesText: { not: null } }, orderBy: { scheduledAt: "desc" }, take: 50 }),
      prisma.academicCalendarEvent.findMany({ orderBy: { startDate: "desc" }, take: 50 }),
    ]);

    res.json({
      policyDocuments: policies.map((p) => ({ id: p.id, title: p.title, category: p.category, version: p.version, documentUrl: p.documentUrl })),
      meetingMinutes: meetings.map((m) => ({ id: m.id, committee: m.committee, title: m.title, scheduledAt: m.scheduledAt })),
      calendarEvents: calendarEvents.map((c) => ({ id: c.id, title: c.title, type: c.type, startDate: c.startDate })),
    });
  }
);

// ---------------------------------------------------------------------------
// QA012 — trainer licence expiry alerts + QA022 — compliance evidence
// expiry alerts. Honest about what this actually is, same precedent as
// FN020 (payment reminders) and AD036 (scheduled reports): this sandbox
// has no cron/scheduler, so this is an on-demand, admin-triggered scan
// that creates real Notification rows for real people with a real
// upcoming or passed expiry — never claimed to run automatically. A real
// deployment would put this exact query behind an actual scheduled job.
// ---------------------------------------------------------------------------
complianceRouter.post(
  "/expiry-alerts/run",
  requireAuth,
  requireRole("QA_OFFICER", "HR_OFFICER", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 86400000);

    const expiringTrainers = await prisma.trainer.findMany({
      where: { licenceExpiry: { lte: in30Days } },
      include: { user: true },
    });
    const expiringRequirements = await prisma.complianceRequirement.findMany({
      where: { nextReviewDue: { lte: in30Days } },
    });

    let created = 0;
    for (const t of expiringTrainers) {
      const isExpired = t.licenceExpiry! < now;
      await prisma.notification.create({
        data: {
          userId: t.userId,
          channel: "in_app",
          title: isExpired ? "Trainer licence has expired" : "Trainer licence expiring soon",
          body: `Your TVETA licence ${t.tvetaLicenceNumber ?? ""} ${isExpired ? "expired" : "expires"} on ${t.licenceExpiry!.toLocaleDateString()}.`,
        },
      });
      await dispatchNotification({ channel: "email", to: t.user.email, title: "Licence expiry", body: `Licence expiry: ${t.licenceExpiry}` });
      created++;
    }

    // Compliance requirements have no single "owner" user column beyond an
    // optional Role — notify every real active user holding that role,
    // rather than guessing at one specific person.
    for (const r of expiringRequirements) {
      if (!r.responsibleRole) continue;
      const owners = await prisma.user.findMany({ where: { role: r.responsibleRole, isActive: true } });
      for (const owner of owners) {
        await prisma.notification.create({
          data: {
            userId: owner.id,
            channel: "in_app",
            title: r.nextReviewDue! < now ? "Compliance review overdue" : "Compliance review due soon",
            body: `${r.regulator} requirement "${r.requirement}" review is due ${r.nextReviewDue!.toLocaleDateString()}.`,
          },
        });
        created++;
      }
    }

    res.json({ notificationsCreated: created, expiringTrainerCount: expiringTrainers.length, expiringRequirementCount: expiringRequirements.length });
  }
);

// ---------------------------------------------------------------------------
// QA001 — institutional QMS overview: before this, "the QMS" was ten
// separate models (ComplianceRequirement, CorrectiveAction, RiskRegisterEntry,
// InternalAudit, ManagementReview, PolicyDocument, QualityStandard,
// IqaReview...) with no single view tying them together — a QMS is the
// system that connects them, not any one of them alone. This is one real
// aggregate read across all of them, not a new model (a QMS doesn't need
// its own table; it needs its parts visibly wired together).
// ---------------------------------------------------------------------------
complianceRouter.get(
  "/qms-overview",
  requireAuth,
  requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN", "REGULATORY_INSPECTOR"),
  async (_req: AuthedRequest, res) => {
    const now = new Date();
    const [
      requirementsTotal,
      requirementsMet,
      openCorrectiveActions,
      openRisks,
      plannedAudits,
      lastManagementReview,
      lastIqaReview,
      policyCount,
      standardCount,
    ] = await Promise.all([
      prisma.complianceRequirement.count(),
      prisma.complianceRequirement.count({ where: { status: "met" } }),
      prisma.correctiveAction.count({ where: { status: { in: ["open", "in_progress"] } } }),
      prisma.riskRegisterEntry.count({ where: { status: "open" } }),
      prisma.internalAudit.count({ where: { status: { in: ["planned", "in_progress"] } } }),
      prisma.managementReview.findFirst({ orderBy: { reviewDate: "desc" } }),
      prisma.iqaReview.findFirst({ orderBy: { reviewDate: "desc" } }),
      prisma.policyDocument.count(),
      prisma.qualityStandard.count(),
    ]);

    // A QMS review cycle is generally annual — flag if the last
    // management review is missing or over a year old, same "is this
    // stale" logic already used for compliance-requirement expiry.
    const oneYearAgo = new Date(now.getTime() - 365 * 86400000);
    const managementReviewStale = !lastManagementReview || lastManagementReview.reviewDate < oneYearAgo;

    res.json({
      requirementsTotal,
      requirementsMet,
      requirementsMetPct: requirementsTotal === 0 ? null : Math.round((requirementsMet / requirementsTotal) * 100),
      openCorrectiveActions,
      openRisks,
      auditsInProgressOrPlanned: plannedAudits,
      policyDocumentCount: policyCount,
      qualityStandardCount: standardCount,
      lastManagementReviewDate: lastManagementReview?.reviewDate ?? null,
      managementReviewStale,
      lastIqaReviewDate: lastIqaReview?.reviewDate ?? null,
    });
  }
);

// ---------------------------------------------------------------------------
// QA039 — inspection preparation pack: a regulator inspection asks for the
// same handful of things every time (unmet mandatory requirements, open
// corrective actions, audit findings still open, risk items, evidence on
// file). Previously an inspector had to open five separate screens; this
// assembles the actual pack from live data in one call.
// ---------------------------------------------------------------------------
complianceRouter.get(
  "/inspection-pack",
  requireAuth,
  requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN", "REGULATORY_INSPECTOR"),
  async (req: AuthedRequest, res) => {
    const regulator = typeof req.query.regulator === "string" ? req.query.regulator : undefined;

    const [unmetRequirements, openCorrectiveActions, openFindings, openRisks, recentAudits] = await Promise.all([
      prisma.complianceRequirement.findMany({
        where: { mandatory: true, status: { not: "met" }, ...(regulator ? { regulator } : {}) },
        orderBy: { nextReviewDue: "asc" },
      }),
      prisma.correctiveAction.findMany({
        where: { status: { in: ["open", "in_progress"] } },
        include: { requirement: true },
        orderBy: { dueDate: "asc" },
      }),
      prisma.auditFinding.findMany({
        where: { status: "open" },
        include: { audit: { select: { title: true, scope: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.riskRegisterEntry.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" } }),
      prisma.internalAudit.findMany({ orderBy: { scheduledAt: "desc" }, take: 10, include: { findings: true } }),
    ]);

    res.json({
      generatedAt: new Date(),
      regulatorFilter: regulator ?? "all",
      unmetMandatoryRequirements: unmetRequirements,
      openCorrectiveActions,
      openAuditFindings: openFindings,
      openRisks,
      recentAudits,
      readinessSummary: {
        unmetMandatoryCount: unmetRequirements.length,
        openCorrectiveActionCount: openCorrectiveActions.length,
        openFindingCount: openFindings.length,
        openRiskCount: openRisks.length,
      },
    });
  }
);

// ---------------------------------------------------------------------------
// QA010 — institutional accreditation: the institution-wide status with a
// regulator, distinct from QA009's per-programme AccreditationReview.
// ---------------------------------------------------------------------------
const institutionalAccreditationSchema = z.object({
  regulator: z.string().min(2),
  status: z.enum(["pending", "accredited", "conditional", "withdrawn", "expired"]).default("pending"),
  certificateUrl: z.string().url().optional(),
  conditions: z.string().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
});

complianceRouter.get(
  "/institutional-accreditation",
  requireAuth,
  requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN", "REGULATORY_INSPECTOR"),
  async (_req: AuthedRequest, res) => {
    const records = await prisma.institutionalAccreditation.findMany({ orderBy: { createdAt: "desc" } });
    res.json(records);
  }
);

complianceRouter.post(
  "/institutional-accreditation",
  requireAuth,
  requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = institutionalAccreditationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide at least a regulator." });
    const { validFrom, validUntil, ...rest } = parsed.data;
    const record = await prisma.institutionalAccreditation.create({
      data: {
        ...rest,
        validFrom: validFrom ? new Date(validFrom) : undefined,
        validUntil: validUntil ? new Date(validUntil) : undefined,
        recordedById: req.user!.id,
      },
    });
    await prisma.auditLog.create({
      data: { userId: req.user!.id, action: "INSTITUTIONAL_ACCREDITATION_RECORDED", entityType: "InstitutionalAccreditation", entityId: record.id, metadata: { regulator: record.regulator, status: record.status } },
    });
    res.status(201).json(record);
  }
);

const institutionalAccreditationUpdateSchema = z.object({
  status: z.enum(["pending", "accredited", "conditional", "withdrawn", "expired"]).optional(),
  certificateUrl: z.string().url().optional(),
  conditions: z.string().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
});

complianceRouter.patch(
  "/institutional-accreditation/:id",
  requireAuth,
  requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = institutionalAccreditationUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid update." });
    const { validFrom, validUntil, ...rest } = parsed.data;
    const record = await prisma.institutionalAccreditation
      .update({
        where: { id: req.params.id },
        data: { ...rest, validFrom: validFrom ? new Date(validFrom) : undefined, validUntil: validUntil ? new Date(validUntil) : undefined },
      })
      .catch(() => null);
    if (!record) return res.status(404).json({ message: "Record not found." });
    res.json(record);
  }
);

// ---------------------------------------------------------------------------
// QA011 — trainer compliance beyond the licence: code-of-conduct sign-off,
// induction completion, and background-check clearance. Previously the
// only trainer-compliance signal in the whole app was the TVETA licence
// fields (TP039) — real, but only one of the four things an inspection
// actually checks per trainer.
// ---------------------------------------------------------------------------
complianceRouter.get(
  "/trainer-compliance",
  requireAuth,
  requireRole("QA_OFFICER", "HR_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const now = new Date();
    const trainers = await prisma.trainer.findMany({
      include: { user: { select: { email: true, isActive: true } } },
      orderBy: { fullName: "asc" },
    });

    const rows = trainers.map((t) => {
      const licenceOk = !!t.tvetaLicenceNumber && !!t.licenceVerified && (!t.licenceExpiry || t.licenceExpiry > now);
      const fullyCompliant = licenceOk && !!t.codeOfConductSignedAt && !!t.inductionCompletedAt && !!t.backgroundCheckClearedAt;
      return {
        trainerId: t.id,
        fullName: t.fullName,
        email: t.user.email,
        licenceOk,
        codeOfConductSigned: !!t.codeOfConductSignedAt,
        inductionCompleted: !!t.inductionCompletedAt,
        backgroundCheckCleared: !!t.backgroundCheckClearedAt,
        fullyCompliant,
      };
    });

    res.json({
      total: rows.length,
      fullyCompliantCount: rows.filter((r) => r.fullyCompliant).length,
      trainers: rows,
    });
  }
);

const trainerComplianceUpdateSchema = z.object({
  codeOfConductSigned: z.boolean().optional(),
  inductionCompleted: z.boolean().optional(),
  backgroundCheckCleared: z.boolean().optional(),
});

complianceRouter.patch(
  "/trainer-compliance/:trainerId",
  requireAuth,
  requireRole("QA_OFFICER", "HR_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = trainerComplianceUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid update." });
    if (Object.keys(parsed.data).length === 0) return res.status(400).json({ message: "Nothing to update." });

    const data: Record<string, unknown> = {};
    const now = new Date();
    if (parsed.data.codeOfConductSigned !== undefined) data.codeOfConductSignedAt = parsed.data.codeOfConductSigned ? now : null;
    if (parsed.data.inductionCompleted !== undefined) data.inductionCompletedAt = parsed.data.inductionCompleted ? now : null;
    if (parsed.data.backgroundCheckCleared !== undefined) {
      data.backgroundCheckClearedAt = parsed.data.backgroundCheckCleared ? now : null;
      data.backgroundCheckClearedById = parsed.data.backgroundCheckCleared ? req.user!.id : null;
    }

    const trainer = await prisma.trainer.update({ where: { id: req.params.trainerId }, data }).catch(() => null);
    if (!trainer) return res.status(404).json({ message: "Trainer not found." });

    await prisma.auditLog.create({
      data: { userId: req.user!.id, action: "TRAINER_COMPLIANCE_UPDATED", entityType: "Trainer", entityId: trainer.id, metadata: parsed.data },
    });

    res.json(trainer);
  }
);

// ---------------------------------------------------------------------------
// QA004 — QA committee: rather than inventing a parallel governance model
// (the same call already made for EX040/examination boards — not repeated
// here), this makes the generic Meeting/AgendaItem mechanism actually do
// something QA-specific: resolving a QA-committee agenda item can create a
// real, tracked CorrectiveAction in the same step, instead of the decision
// living only as free-text minutes with no follow-up trail.
// ---------------------------------------------------------------------------
complianceRouter.get(
  "/qa-committee/meetings",
  requireAuth,
  requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const meetings = await prisma.meeting.findMany({
      where: { committee: "QA Committee" },
      include: { agendaItems: { orderBy: { order: "asc" } } },
      orderBy: { scheduledAt: "desc" },
    });
    res.json(meetings);
  }
);

const committeeActionSchema = z.object({ description: z.string().min(3), assignedToId: z.string(), dueDate: z.string().datetime().optional() });

complianceRouter.post(
  "/qa-committee/agenda-items/:id/create-corrective-action",
  requireAuth,
  requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = committeeActionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide description and assignedToId." });

    const agendaItem = await prisma.agendaItem.findUnique({ where: { id: req.params.id } });
    if (!agendaItem) return res.status(404).json({ message: "Agenda item not found." });

    const { dueDate, ...rest } = parsed.data;
    const [action] = await prisma.$transaction([
      prisma.correctiveAction.create({
        data: { ...rest, dueDate: dueDate ? new Date(dueDate) : undefined, createdById: req.user!.id },
      }),
      prisma.agendaItem.update({
        where: { id: agendaItem.id },
        data: { status: "resolved", resolution: parsed.data.description, actionOwner: parsed.data.assignedToId, actionDueDate: dueDate ? new Date(dueDate) : undefined },
      }),
    ]);

    res.status(201).json(action);
  }
);

complianceRouter.get(
  "/expiry-alerts/preview",
  requireAuth,
  requireRole("QA_OFFICER", "HR_OFFICER", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 86400000);

    const trainers = await prisma.trainer.findMany({
      where: { licenceExpiry: { lte: in30Days } },
      select: { fullName: true, tvetaLicenceNumber: true, licenceExpiry: true },
    });
    const requirements = await prisma.complianceRequirement.findMany({
      where: { nextReviewDue: { lte: in30Days } },
      select: { regulator: true, requirement: true, nextReviewDue: true },
    });

    res.json({ trainers, requirements });
  }
);
