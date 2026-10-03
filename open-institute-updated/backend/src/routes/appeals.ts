import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const appealsRouter = Router();

const appealSchema = z.object({
  type: z.enum(["grade", "disciplinary", "examination", "fee", "admission", "credit_transfer", "rpl"]),
  reason: z.string().min(10),
  evidenceUrl: z.string().url().optional(),
});

appealsRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = appealSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Describe your appeal and the reason for it." });

  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const appeal = await prisma.appeal.create({
    data: { studentId: student.id, ...parsed.data },
  });
  res.status(201).json(appeal);
});

appealsRouter.get("/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const appeals = await prisma.appeal.findMany({
    where: { studentId: student.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(appeals);
});

appealsRouter.get(
  "/",
  requireAuth,
  requireRole("REGISTRAR", "EXAMINATION_OFFICER", "FINANCE_OFFICER", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const appeals = await prisma.appeal.findMany({
      include: { student: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(appeals);
  }
);

const decisionSchema = z.object({ decision: z.string().min(2) });

appealsRouter.patch(
  "/:id/decision",
  requireAuth,
  requireRole("REGISTRAR", "EXAMINATION_OFFICER", "FINANCE_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide a decision." });

    const appeal = await prisma.appeal.update({
      where: { id: req.params.id },
      data: {
        status: "decided",
        decision: parsed.data.decision,
        decidedById: req.user!.id,
        decidedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "APPEAL_DECIDED",
        entityType: "Appeal",
        entityId: appeal.id,
      },
    });

    res.json(appeal);
  }
);
