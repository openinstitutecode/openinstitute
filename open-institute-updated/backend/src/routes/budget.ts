import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const budgetRouter = Router();

// ---------------------------------------------------------------------------
// FN025/026 — budgets and budget approval. draft -> submitted ->
// approved/rejected, matching dev rule 21 (human approval for high-impact
// financial decisions): the person who submits a budget can never also be
// the one who approves it.
// ---------------------------------------------------------------------------

const budgetSchema = z.object({
  department: z.string().min(2),
  category: z.string().min(2),
  fiscalPeriod: z.string().min(4),
  allocatedAmount: z.number().positive(),
  justification: z.string().optional(),
});

budgetRouter.get(
  "/",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const budgets = await prisma.budget.findMany({ orderBy: { createdAt: "desc" } });
    res.json(budgets);
  }
);

budgetRouter.post(
  "/",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = budgetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide department, category, fiscalPeriod, and allocatedAmount." });
    const budget = await prisma.budget.create({ data: parsed.data });
    res.status(201).json(budget);
  }
);

budgetRouter.patch(
  "/:id/submit",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const budget = await prisma.budget.findUnique({ where: { id: req.params.id } });
    if (!budget) return res.status(404).json({ message: "Budget not found." });
    if (budget.status !== "draft") return res.status(409).json({ message: "Only a draft budget can be submitted." });

    const updated = await prisma.budget.update({
      where: { id: req.params.id },
      data: { status: "submitted", submittedById: req.user!.id, submittedAt: new Date() },
    });
    res.json(updated);
  }
);

const budgetDecisionSchema = z.object({ decision: z.enum(["approved", "rejected"]), decisionNote: z.string().optional() });

budgetRouter.patch(
  "/:id/decide",
  requireAuth,
  requireRole("PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = budgetDecisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Choose approved or rejected." });

    const budget = await prisma.budget.findUnique({ where: { id: req.params.id } });
    if (!budget) return res.status(404).json({ message: "Budget not found." });
    if (budget.status !== "submitted") return res.status(409).json({ message: "Only a submitted budget can be decided." });
    if (budget.submittedById === req.user!.id) {
      return res.status(403).json({ message: "The submitter cannot also approve their own budget." });
    }

    const updated = await prisma.budget.update({
      where: { id: req.params.id },
      data: { status: parsed.data.decision, approvedById: req.user!.id, approvedAt: new Date(), decisionNote: parsed.data.decisionNote },
    });
    res.json(updated);
  }
);
