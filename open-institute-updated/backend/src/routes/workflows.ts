import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

// ---------------------------------------------------------------------------
// AD025 — generic workflow engine. See the schema comment above
// WorkflowDefinition for the honest scope note: this is a real, reusable
// engine wired into real new callers (programme approval, executive
// decisions) — existing hardcoded chains are not migrated onto it.
// ---------------------------------------------------------------------------
export const workflowsRouter = Router();

const ADMIN_ROLES = ["PRINCIPAL", "DEPUTY_PRINCIPAL", "SUPER_ADMIN"] as const;

// Kept in sync with the `Role` enum in schema.prisma — validated here so a
// typo in a stage's approverRole fails at definition-creation time, not
// silently at act-time when nobody can ever satisfy it.
const ROLE_VALUES = [
  "SUPER_ADMIN", "BOARD_MEMBER", "PRINCIPAL", "DEPUTY_PRINCIPAL", "REGISTRAR",
  "FINANCE_OFFICER", "ACCOUNTANT", "HR_OFFICER", "QA_OFFICER", "ICT_ADMIN",
  "LIBRARIAN", "ADMISSIONS_OFFICER", "EXAMINATION_OFFICER", "DEPARTMENT_HEAD",
  "PROGRAMME_COORDINATOR", "TRAINER", "COUNSELLOR", "CAREER_OFFICER",
  "ATTACHMENT_OFFICER", "STUDENT", "APPLICANT", "ALUMNUS", "EXTERNAL_EXAMINER",
  "EMPLOYER", "AUDITOR", "REGULATORY_INSPECTOR",
] as const;

const stageSchema = z.object({
  name: z.string().min(2),
  approverRole: z.enum(ROLE_VALUES),
});

const definitionSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  category: z.string().min(1).default("general"),
  stages: z.array(stageSchema).min(1),
});

// Create a reusable workflow template: ordered stages, each gated to a role.
workflowsRouter.post(
  "/definitions",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  async (req: AuthedRequest, res) => {
    const parsed = definitionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Provide a name, category, and at least one stage." });
    }
    const { stages, ...rest } = parsed.data;
    const definition = await prisma.workflowDefinition.create({
      data: {
        ...rest,
        createdById: req.user!.id,
        stages: {
          create: stages.map((s, i) => ({ order: i + 1, name: s.name, approverRole: s.approverRole })),
        },
      },
      include: { stages: { orderBy: { order: "asc" } } },
    });
    res.status(201).json(definition);
  }
);

workflowsRouter.get("/definitions", requireAuth, async (_req: AuthedRequest, res) => {
  const definitions = await prisma.workflowDefinition.findMany({
    include: { stages: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(definitions);
});

workflowsRouter.patch(
  "/definitions/:id/active",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  async (req: AuthedRequest, res) => {
    const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide isActive." });
    const definition = await prisma.workflowDefinition.update({
      where: { id: req.params.id },
      data: { isActive: parsed.data.isActive },
    });
    res.json(definition);
  }
);

// ---------------------------------------------------------------------------
// Instances — a real run of a definition, tracking a real entity through it.
// ---------------------------------------------------------------------------
const startInstanceSchema = z.object({
  definitionId: z.string(),
  title: z.string().min(2),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
});

workflowsRouter.post("/instances", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = startInstanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide definitionId and title." });

  const definition = await prisma.workflowDefinition.findUnique({
    where: { id: parsed.data.definitionId },
    include: { stages: { orderBy: { order: "asc" } } },
  });
  if (!definition || !definition.isActive) {
    return res.status(404).json({ message: "Workflow definition not found or inactive." });
  }
  if (definition.stages.length === 0) {
    return res.status(400).json({ message: "This workflow has no stages defined." });
  }

  const instance = await prisma.workflowInstance.create({
    data: {
      definitionId: definition.id,
      title: parsed.data.title,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      startedById: req.user!.id,
    },
    include: { definition: { include: { stages: { orderBy: { order: "asc" } } } }, actions: true },
  });
  res.status(201).json(instance);
});

workflowsRouter.get("/instances", requireAuth, async (req: AuthedRequest, res) => {
  const { status, entityType, entityId, definitionId } = req.query as Record<string, string | undefined>;
  const instances = await prisma.workflowInstance.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(definitionId ? { definitionId } : {}),
    },
    include: { definition: { include: { stages: { orderBy: { order: "asc" } } } }, actions: { orderBy: { actedAt: "asc" } } },
    orderBy: { startedAt: "desc" },
    take: 200,
  });
  res.json(instances);
});

// Instances currently sitting at a stage the requesting user's role can act
// on — the real "my approvals" queue, computed from live data.
workflowsRouter.get("/instances/mine-to-act", requireAuth, async (req: AuthedRequest, res) => {
  const openInstances = await prisma.workflowInstance.findMany({
    where: { status: "in_progress" },
    include: { definition: { include: { stages: { orderBy: { order: "asc" } } } } },
    orderBy: { startedAt: "asc" },
  });
  const mine = openInstances.filter((inst) => {
    const stage = inst.definition.stages.find((s) => s.order === inst.currentStageOrder);
    return stage && ((stage.approverRole as string) === req.user!.role || req.user!.role === "SUPER_ADMIN");
  });
  res.json(mine);
});

const actSchema = z.object({
  action: z.enum(["approve", "reject", "comment"]),
  comment: z.string().optional(),
});

workflowsRouter.post("/instances/:id/act", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = actSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide a valid action." });

  const instance = await prisma.workflowInstance.findUnique({
    where: { id: req.params.id },
    include: { definition: { include: { stages: { orderBy: { order: "asc" } } } } },
  });
  if (!instance) return res.status(404).json({ message: "Workflow instance not found." });
  if (instance.status !== "in_progress") {
    return res.status(400).json({ message: `This workflow is already ${instance.status}.` });
  }

  const currentStage = instance.definition.stages.find((s) => s.order === instance.currentStageOrder);
  if (!currentStage) return res.status(400).json({ message: "This workflow has no current stage." });

  const canAct = (currentStage.approverRole as string) === req.user!.role || req.user!.role === "SUPER_ADMIN";
  if (!canAct) {
    return res.status(403).json({
      message: `Only ${currentStage.approverRole} (or SUPER_ADMIN) can act on the "${currentStage.name}" stage right now.`,
    });
  }

  await prisma.workflowStageAction.create({
    data: {
      instanceId: instance.id,
      stageOrder: instance.currentStageOrder,
      action: parsed.data.action,
      actedById: req.user!.id,
      comment: parsed.data.comment,
    },
  });

  let updated = instance;
  if (parsed.data.action === "reject") {
    updated = await prisma.workflowInstance.update({
      where: { id: instance.id },
      data: { status: "rejected", completedAt: new Date() },
      include: { definition: { include: { stages: { orderBy: { order: "asc" } } } } },
    });
  } else if (parsed.data.action === "approve") {
    const isFinalStage = currentStage.order === instance.definition.stages.length;
    updated = await prisma.workflowInstance.update({
      where: { id: instance.id },
      data: isFinalStage
        ? { status: "approved", completedAt: new Date() }
        : { currentStageOrder: instance.currentStageOrder + 1 },
      include: { definition: { include: { stages: { orderBy: { order: "asc" } } } } },
    });
  }
  // "comment" leaves status/stage untouched — a note on the record, not a decision.

  // If this instance drives an Executive Decision (AD040), reflect a final
  // outcome back onto it — the decision is only as resolved as its workflow.
  if (updated.status === "approved" || updated.status === "rejected") {
    await prisma.executiveDecision.updateMany({
      where: { workflowInstanceId: instance.id },
      data: {
        status: updated.status === "approved" ? "resolved" : "dismissed",
        resolvedAt: new Date(),
        outcome: updated.status === "approved" ? "Approved via workflow." : "Rejected via workflow.",
      },
    });
  }

  // If this instance is routing a Programme through approval (AD010), a
  // final "approved" here is what actually flips the real record — not a
  // second, separate click. Rejection leaves the programme exactly as it
  // was (still "pending"), with the reason on the workflow's own history.
  if (updated.status === "approved" && instance.entityType === "programme" && instance.entityId) {
    const programme = await prisma.programme
      .update({ where: { id: instance.entityId }, data: { approvalStatus: "accredited", version: { increment: 1 } } })
      .catch(() => null);
    if (programme) {
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "PROGRAMME_CHANGED",
          entityType: "Programme",
          entityId: programme.id,
          metadata: { programmeNewVersion: programme.version, changes: { approvalStatus: "accredited" }, viaWorkflowInstanceId: instance.id },
        },
      });
    }
  }

  const actions = await prisma.workflowStageAction.findMany({
    where: { instanceId: instance.id },
    orderBy: { actedAt: "asc" },
  });
  res.json({ ...updated, actions });
});
