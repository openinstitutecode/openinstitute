import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const curriculumRouter = Router();

curriculumRouter.get(
  "/programmes",
  requireAuth,
  requireRole("PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "QA_OFFICER", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const programmes = await prisma.programme.findMany({
      include: { units: true, awardingBody: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    res.json(programmes);
  }
);

// ---------------------------------------------------------------------------
// AD010 — Programme management. Before this, the only way a Programme row
// came into existence was a hand-seeded database — nothing in the app could
// create one, and AdminCurriculum.tsx could only edit a Unit's title/
// outcomes inside a programme that already existed. This is the actual
// programme-level CRUD: create a new programme, edit its core fields
// (name, qualification level, duration, delivery mode, awarding body), and
// add units to it. Every write still bumps `version` and writes the same
// CURRICULUM_UNIT_CHANGED-style audit trail the existing unit-edit route
// uses, so a QA reviewer sees programme-level changes in the same history.
// ---------------------------------------------------------------------------
const programmeCreateSchema = z.object({
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only."),
  name: z.string().min(2),
  qualificationLevel: z.string().min(2),
  durationSemesters: z.number().int().positive(),
  deliveryMode: z.string().min(2),
  requiresAttachment: z.boolean().default(false),
  awardingBodyId: z.string().optional(),
});

curriculumRouter.post(
  "/programmes",
  requireAuth,
  requireRole("PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = programmeCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid programme — check every required field." });

    const programme = await prisma.programme.create({ data: parsed.data }).catch(() => null);
    if (!programme) return res.status(409).json({ message: "A programme with that slug already exists." });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "PROGRAMME_CREATED",
        entityType: "Programme",
        entityId: programme.id,
        metadata: { name: programme.name, qualificationLevel: programme.qualificationLevel },
      },
    });

    res.status(201).json(programme);
  }
);

const programmeUpdateSchema = programmeCreateSchema
  .omit({ slug: true })
  .partial()
  .extend({ approvalStatus: z.enum(["pending", "accredited", "withdrawn"]).optional() });

curriculumRouter.patch(
  "/programmes/:id",
  requireAuth,
  requireRole("PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = programmeUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid update." });
    if (Object.keys(parsed.data).length === 0) return res.status(400).json({ message: "Nothing to update." });

    const programme = await prisma.programme
      .update({ where: { id: req.params.id }, data: { ...parsed.data, version: { increment: 1 } } })
      .catch(() => null);
    if (!programme) return res.status(404).json({ message: "Programme not found." });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "PROGRAMME_CHANGED",
        entityType: "Programme",
        entityId: programme.id,
        metadata: { programmeNewVersion: programme.version, changes: parsed.data },
      },
    });

    res.json(programme);
  }
);

// AD010 x AD025 — an optional real multi-stage approval instead of a
// single approvalStatus flip. Starts a real WorkflowInstance against this
// programme; the programme's approvalStatus only changes when that
// instance is actually approved through every defined stage (see
// POST /workflows/instances/:id/act). A programme can still be flipped
// directly via PATCH /programmes/:id for institutions that don't want the
// extra ceremony — this is additive, not a replacement.
const routeForApprovalSchema = z.object({ definitionId: z.string() });

curriculumRouter.post(
  "/programmes/:id/route-for-approval",
  requireAuth,
  requireRole("PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = routeForApprovalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide definitionId." });

    const programme = await prisma.programme.findUnique({ where: { id: req.params.id } });
    if (!programme) return res.status(404).json({ message: "Programme not found." });

    const definition = await prisma.workflowDefinition.findUnique({
      where: { id: parsed.data.definitionId },
      include: { stages: true },
    });
    if (!definition || !definition.isActive || definition.stages.length === 0) {
      return res.status(400).json({ message: "That workflow definition is not usable — check it has active stages." });
    }

    const instance = await prisma.workflowInstance.create({
      data: {
        definitionId: definition.id,
        title: `Programme approval: ${programme.name}`,
        entityType: "programme",
        entityId: programme.id,
        startedById: req.user!.id,
      },
      include: { definition: { include: { stages: { orderBy: { order: "asc" } } } } },
    });
    res.status(201).json(instance);
  }
);

// New unit creation — previously only PATCH /units/:id existed (editing a
// unit that already existed); there was no way to add one to a programme
// at all short of a manual DB insert.
const unitCreateSchema = z.object({
  programmeId: z.string(),
  code: z.string().min(2),
  title: z.string().min(2),
  semester: z.number().int().positive(),
  creditHours: z.number().int().positive().default(3),
  learningOutcomes: z.array(z.string()).default([]),
});

curriculumRouter.post(
  "/units",
  requireAuth,
  requireRole("PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = unitCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid unit — check every required field." });

    const unit = await prisma.unit.create({ data: parsed.data }).catch(() => null);
    if (!unit) return res.status(404).json({ message: "That programme doesn't exist." });

    const programme = await prisma.programme.update({
      where: { id: parsed.data.programmeId },
      data: { version: { increment: 1 } },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "CURRICULUM_UNIT_ADDED",
        entityType: "Unit",
        entityId: unit.id,
        metadata: { programmeNewVersion: programme.version, code: unit.code, title: unit.title },
      },
    });

    res.status(201).json({ unit, programmeVersion: programme.version });
  }
);

const unitChangeSchema = z.object({
  title: z.string().optional(),
  learningOutcomes: z.array(z.string()).optional(),
});

// Any curriculum edit bumps the whole programme's version and is logged —
// so a QA reviewer or inspector can see exactly what changed and when,
// rather than curriculum silently drifting.
curriculumRouter.patch(
  "/units/:id",
  requireAuth,
  requireRole("PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = unitChangeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid unit change." });

    const unit = await prisma.unit.update({
      where: { id: req.params.id },
      data: parsed.data,
    });

    const programme = await prisma.programme.update({
      where: { id: unit.programmeId },
      data: { version: { increment: 1 } },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "CURRICULUM_UNIT_CHANGED",
        entityType: "Unit",
        entityId: unit.id,
        metadata: { programmeNewVersion: programme.version, changes: parsed.data },
      },
    });

    res.json({ unit, programmeVersion: programme.version });
  }
);

// QA013 — curriculum compliance: a QA reviewer needs the change history for
// ONE programme (did this curriculum change since it was last reviewed?),
// not a global feed of every programme's edits. AuditLog has no direct
// programmeId column, so this joins through: direct Programme-entity log
// rows for that id, plus Unit-entity log rows for units that belong to it.
curriculumRouter.get(
  "/programmes/:id/history",
  requireAuth,
  requireRole("QA_OFFICER", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const programme = await prisma.programme.findUnique({
      where: { id: req.params.id },
      select: { units: { select: { id: true } } },
    });
    if (!programme) return res.status(404).json({ message: "Programme not found." });

    const unitIds = programme.units.map((u) => u.id);
    const logs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: "Programme", entityId: req.params.id },
          { entityType: "Unit", entityId: { in: unitIds } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(logs);
  }
);

// QA013 — curriculum compliance check: pulls together the signals that
// actually determine whether a programme's curriculum is regulator-ready —
// does it have units, does every unit have learning outcomes (EX004), is
// there an exam blueprint (EX007), and has it been reviewed recently
// (QA035 ProgrammeReview) — into one pass/fail-per-signal view instead of
// a QA officer checking four separate screens by hand.
curriculumRouter.get(
  "/programmes/:id/compliance-check",
  requireAuth,
  requireRole("QA_OFFICER", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const programme = await prisma.programme.findUnique({
      where: { id: req.params.id },
      include: {
        units: { include: { formalLearningOutcomes: true } },
        examBlueprints: true,
      },
    });
    if (!programme) return res.status(404).json({ message: "Programme not found." });

    const lastReview = await prisma.programmeReview.findFirst({
      where: { programmeId: req.params.id },
      orderBy: { reviewDate: "desc" },
    });

    const unitsWithoutOutcomes = programme.units.filter((u) => u.formalLearningOutcomes.length === 0);
    const oneYearAgo = new Date(Date.now() - 365 * 86400000);

    res.json({
      programmeId: programme.id,
      programmeVersion: programme.version,
      approvalStatus: programme.approvalStatus,
      hasUnits: programme.units.length > 0,
      unitCount: programme.units.length,
      unitsMissingLearningOutcomes: unitsWithoutOutcomes.map((u) => ({ id: u.id, code: u.code, title: u.title })),
      hasExamBlueprint: programme.examBlueprints.length > 0,
      lastProgrammeReviewDate: lastReview?.reviewDate ?? null,
      programmeReviewStale: !lastReview || lastReview.reviewDate < oneYearAgo,
      compliant:
        programme.units.length > 0 &&
        unitsWithoutOutcomes.length === 0 &&
        programme.examBlueprints.length > 0 &&
        !!lastReview &&
        lastReview.reviewDate >= oneYearAgo,
    });
  }
);
