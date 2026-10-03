import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// EX004 — Learning-outcome mapping: CRUD for formal learning outcomes per unit
// and blueprint-based exam generation (EX007)

// Create learning outcome
router.post("/:unitId/learning-outcomes", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req, res) => {
  try {
    const { unitId } = req.params;
    const { code, description, level } = req.body;

    const unit = await prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) return res.status(404).json({ error: "Unit not found" });

    const outcome = await prisma.learningOutcome.create({
      data: {
        unitId,
        code,
        description,
        level: level || "understand",
      },
    });

    res.json(outcome);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get learning outcomes for a unit
router.get("/:unitId/learning-outcomes", requireAuth, async (req, res) => {
  try {
    const { unitId } = req.params;

    const outcomes = await prisma.learningOutcome.findMany({
      where: { unitId },
      orderBy: { code: "asc" },
    });

    res.json(outcomes);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update learning outcome
router.patch("/learning-outcomes/:outcomeId", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req, res) => {
  try {
    const { outcomeId } = req.params;
    const { description, level } = req.body;

    const outcome = await prisma.learningOutcome.update({
      where: { id: outcomeId },
      data: { ...(description && { description }), ...(level && { level }) },
    });

    res.json(outcome);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Delete learning outcome
router.delete("/learning-outcomes/:outcomeId", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req, res) => {
  try {
    const { outcomeId } = req.params;

    await prisma.learningOutcome.delete({
      where: { id: outcomeId },
    });

    res.json({ message: "Learning outcome deleted" });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Map question to learning outcome
router.patch("/questions/:questionId/map-outcome", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req, res) => {
  try {
    const { questionId } = req.params;
    const { learningOutcomeId } = req.body;

    const question = await prisma.question.update({
      where: { id: questionId },
      data: { learningOutcomeId },
      include: { learningOutcome: true },
    });

    res.json(question);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get questions by learning outcome
router.get("/learning-outcomes/:outcomeId/questions", requireAuth, async (req, res) => {
  try {
    const { outcomeId } = req.params;

    const questions = await prisma.question.findMany({
      where: { learningOutcomeId: outcomeId },
    });

    res.json(questions);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Exam blueprints — GET/POST/PATCH
// Create blueprint
router.post("/programmes/:programmeId/blueprints", requireAuth, requireRole("EXAMINATION_OFFICER", "SUPER_ADMIN"), async (req, res) => {
  try {
    const { programmeId } = req.params;
    const {
      name,
      description,
      totalMarks,
      durationMinutes,
      passMarks,
      rememberCount,
      understandCount,
      applyCount,
      analyzeCount,
      evaluateCount,
    } = req.body;

    const blueprint = await prisma.examBlueprint.create({
      data: {
        programmeId,
        name,
        description,
        totalMarks: totalMarks || 100,
        durationMinutes: durationMinutes || 120,
        passMarks: passMarks || 50,
        rememberCount: rememberCount || 5,
        understandCount: understandCount || 10,
        applyCount: applyCount || 8,
        analyzeCount: analyzeCount || 5,
        evaluateCount: evaluateCount || 2,
      },
    });

    res.json(blueprint);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get blueprints for programme
router.get("/programmes/:programmeId/blueprints", requireAuth, async (req, res) => {
  try {
    const { programmeId } = req.params;

    const blueprints = await prisma.examBlueprint.findMany({
      where: { programmeId },
    });

    res.json(blueprints);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update blueprint
router.patch("/blueprints/:blueprintId", requireAuth, requireRole("EXAMINATION_OFFICER", "SUPER_ADMIN"), async (req, res) => {
  try {
    const { blueprintId } = req.params;
    const data = req.body;

    const blueprint = await prisma.examBlueprint.update({
      where: { id: blueprintId },
      data,
    });

    res.json(blueprint);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Delete blueprint
router.delete("/blueprints/:blueprintId", requireAuth, requireRole("EXAMINATION_OFFICER", "SUPER_ADMIN"), async (req, res) => {
  try {
    const { blueprintId } = req.params;

    await prisma.examBlueprint.delete({
      where: { id: blueprintId },
    });

    res.json({ message: "Blueprint deleted" });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
