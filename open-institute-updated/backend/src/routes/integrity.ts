import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const integrityRouter = Router();

const caseSchema = z.object({
  studentId: z.string(),
  submissionId: z.string().optional(),
  raisedBy: z.enum(["AI_FLAG", "TRAINER", "EXAMINER"]),
  description: z.string().min(5),
});

// Note: an AI_FLAG case is opened for human review — it is never itself a
// finding. Nothing in this route auto-applies a sanction.
integrityRouter.post(
  "/cases",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = caseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid case details." });
    const integrityCase = await prisma.integrityCase.create({ data: parsed.data });
    res.status(201).json(integrityCase);
  }
);

integrityRouter.get(
  "/cases",
  requireAuth,
  requireRole("REGISTRAR", "EXAMINATION_OFFICER", "QA_OFFICER", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const cases = await prisma.integrityCase.findMany({
      include: { student: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(cases);
  }
);

const decisionSchema = z.object({
  status: z.enum(["dismissed", "upheld", "appealed"]),
  sanction: z.string().optional(),
});

// A decision always requires a named human decider — status can never move
// to "upheld" without one.
integrityRouter.patch(
  "/cases/:id/decision",
  requireAuth,
  requireRole("REGISTRAR", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid decision." });

    const updated = await prisma.integrityCase.update({
      where: { id: req.params.id },
      data: {
        status: parsed.data.status,
        sanction: parsed.data.sanction,
        decidedById: req.user!.id,
        decidedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: `INTEGRITY_CASE_${parsed.data.status.toUpperCase()}`,
        entityType: "IntegrityCase",
        entityId: updated.id,
      },
    });

    res.json(updated);
  }
);
