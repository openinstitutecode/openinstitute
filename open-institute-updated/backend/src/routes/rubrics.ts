import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const rubricsRouter = Router();

const criterionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  maxMarks: z.number().positive(),
});

const rubricSchema = z.object({
  assessmentId: z.string(),
  criteria: z.array(criterionSchema).min(1),
});

rubricsRouter.post(
  "/",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = rubricSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid rubric." });

    const totalCriteriaMarks = parsed.data.criteria.reduce((s, c) => s + c.maxMarks, 0);
    const assessment = await prisma.assessment.findUnique({ where: { id: parsed.data.assessmentId } });
    if (!assessment) return res.status(404).json({ message: "Assessment not found." });
    if (totalCriteriaMarks !== assessment.totalMarks) {
      return res.status(400).json({
        message: `Rubric criteria total ${totalCriteriaMarks} marks but the assessment is out of ${assessment.totalMarks}.`,
      });
    }

    const rubric = await prisma.rubric.upsert({
      where: { assessmentId: parsed.data.assessmentId },
      update: { criteria: parsed.data.criteria },
      create: {
        assessmentId: parsed.data.assessmentId,
        criteria: parsed.data.criteria,
        createdById: req.user!.id,
      },
    });
    res.status(201).json(rubric);
  }
);

rubricsRouter.get("/:assessmentId", requireAuth, async (req, res) => {
  const rubric = await prisma.rubric.findUnique({ where: { assessmentId: req.params.assessmentId } });
  if (!rubric) return res.status(404).json({ message: "No rubric set for this assessment yet." });
  res.json(rubric);
});
