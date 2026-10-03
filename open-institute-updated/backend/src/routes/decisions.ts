import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

// ---------------------------------------------------------------------------
// AD040 — Executive Decision Centre. Command Centre (AD001) already
// surfaces real alerts computed from live data; this turns a chosen alert
// into a real, owned, trackable record instead of a banner that vanishes
// on refresh — with an optional real WorkflowInstance (AD025) behind it
// for anything that needs cross-functional sign-off before it can close.
// ---------------------------------------------------------------------------
export const decisionsRouter = Router();

const EXEC_ROLES = ["PRINCIPAL", "DEPUTY_PRINCIPAL", "SUPER_ADMIN"] as const;

const createSchema = z.object({
  title: z.string().min(2),
  sourceAlert: z.string().min(2),
  rationale: z.string().optional(),
  ownerId: z.string().min(1),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  dueDate: z.string().datetime().optional(),
  workflowDefinitionId: z.string().optional(),
});

decisionsRouter.post("/", requireAuth, requireRole(...EXEC_ROLES), async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Provide title, sourceAlert, ownerId, and a valid priority." });
  }
  const { workflowDefinitionId, dueDate, ...rest } = parsed.data;

  let workflowInstanceId: string | undefined;
  if (workflowDefinitionId) {
    const definition = await prisma.workflowDefinition.findUnique({
      where: { id: workflowDefinitionId },
      include: { stages: true },
    });
    if (!definition || !definition.isActive || definition.stages.length === 0) {
      return res.status(400).json({ message: "That workflow definition is not usable — check it has active stages." });
    }
    const instance = await prisma.workflowInstance.create({
      data: {
        definitionId: definition.id,
        title: `Decision: ${parsed.data.title}`,
        entityType: "executive_decision",
        startedById: req.user!.id,
      },
    });
    workflowInstanceId = instance.id;
  }

  const decision = await prisma.executiveDecision.create({
    data: {
      ...rest,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      status: workflowInstanceId ? "in_progress" : "open",
      workflowInstanceId,
      createdById: req.user!.id,
    },
  });

  // Backfill the instance's entityId now that the decision it belongs to
  // actually exists — keeps GET /workflows/instances?entityType=executive_decision
  // usable for cross-referencing, same as the programme-approval hookup.
  if (workflowInstanceId) {
    await prisma.workflowInstance.update({
      where: { id: workflowInstanceId },
      data: { entityId: decision.id },
    });
  }

  res.status(201).json(decision);
});

decisionsRouter.get("/", requireAuth, requireRole(...EXEC_ROLES), async (req: AuthedRequest, res) => {
  const { status } = req.query as Record<string, string | undefined>;
  const decisions = await prisma.executiveDecision.findMany({
    where: status ? { status } : {},
    include: {
      workflowInstance: {
        include: { definition: { include: { stages: { orderBy: { order: "asc" } } } } },
      },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });
  res.json(decisions);
});

const updateSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "dismissed"]).optional(),
  outcome: z.string().optional(),
});

// Manual close/update for decisions that never needed a workflow behind
// them — real editorial control, not everything forced through the engine.
decisionsRouter.patch("/:id", requireAuth, requireRole(...EXEC_ROLES), async (req: AuthedRequest, res) => {
  const existing = await prisma.executiveDecision.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ message: "Decision not found." });
  if (existing.workflowInstanceId) {
    return res.status(400).json({
      message: "This decision is driven by a workflow — act on the workflow instance instead of editing status directly.",
    });
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide a valid status or outcome." });

  const isResolving = parsed.data.status === "resolved" || parsed.data.status === "dismissed";
  const decision = await prisma.executiveDecision.update({
    where: { id: req.params.id },
    data: { ...parsed.data, resolvedAt: isResolving ? new Date() : undefined },
  });
  res.json(decision);
});
