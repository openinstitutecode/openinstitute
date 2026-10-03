// LMS021 — Learning paths. A programme coordinator (or super admin) defines
// a real, ordered sequence of units for a programme — a recommended (or, at
// the UI's discretion, suggested-not-required) route through the curriculum.
// This is distinct from LMS020's hard prerequisite gate (Unit.prerequisiteUnitIds,
// enforced server-side at registration): a path can recommend an order
// without blocking a student who registers out of sequence.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const learningPathsRouter = Router();

const COORDINATOR_ROLES = ["PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"];

const stepSchema = z.object({ unitId: z.string(), isOptional: z.boolean().default(false), note: z.string().max(500).nullable().optional() });
const pathSchema = z.object({
  programmeId: z.string(),
  title: z.string().min(2).max(200),
  description: z.string().max(2000).nullable().optional(),
  steps: z.array(stepSchema).min(1).max(60),
});

learningPathsRouter.post("/", requireAuth, requireRole(...COORDINATOR_ROLES), async (req: AuthedRequest, res) => {
  const parsed = pathSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid learning path.", issues: parsed.error.issues?.slice(0, 3) });
  const d = parsed.data;

  const units = await prisma.unit.findMany({ where: { id: { in: d.steps.map((s) => s.unitId) }, programmeId: d.programmeId }, select: { id: true } });
  if (units.length !== new Set(d.steps.map((s) => s.unitId)).size) {
    return res.status(400).json({ message: "Every step must be a unit that belongs to this programme, with no duplicates." });
  }

  const path = await prisma.$transaction(async (tx) => {
    const p = await tx.learningPath.create({
      data: { programmeId: d.programmeId, title: d.title, description: d.description ?? null, createdById: req.user!.id },
    });
    await tx.learningPathStep.createMany({
      data: d.steps.map((s, i) => ({ pathId: p.id, unitId: s.unitId, order: i + 1, isOptional: s.isOptional, note: s.note ?? null })),
    });
    return p;
  });
  res.status(201).json(path);
});

learningPathsRouter.get("/programme/:programmeId", requireAuth, async (req: AuthedRequest, res) => {
  const staff = req.user!.role !== "STUDENT" && req.user!.role !== "APPLICANT" && req.user!.role !== "ALUMNUS";
  const paths = await prisma.learningPath.findMany({
    where: { programmeId: req.params.programmeId, ...(staff ? {} : { isPublished: true }) },
    include: { steps: { include: { unit: { select: { id: true, code: true, title: true, semester: true } } }, orderBy: { order: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(paths);
});

learningPathsRouter.get("/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id }, select: { id: true, programmeId: true } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const paths = await prisma.learningPath.findMany({
    where: { programmeId: student.programmeId, isPublished: true },
    include: { steps: { include: { unit: { select: { id: true, code: true, title: true } } }, orderBy: { order: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  if (paths.length === 0) return res.json([]);

  const allUnitIds = paths.flatMap((p) => p.steps.map((s) => s.unitId));
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: student.id, unitId: { in: allUnitIds } },
    select: { unitId: true, status: true },
  });
  const statusByUnit = new Map(enrollments.map((e) => [e.unitId, e.status]));

  res.json(
    paths.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      steps: p.steps.map((s) => ({
        unitId: s.unitId,
        code: s.unit.code,
        title: s.unit.title,
        order: s.order,
        isOptional: s.isOptional,
        status: statusByUnit.get(s.unitId) ?? "not_registered",
      })),
    }))
  );
});

learningPathsRouter.get("/:id", requireAuth, async (req, res) => {
  const path = await prisma.learningPath.findUnique({
    where: { id: req.params.id },
    include: { steps: { include: { unit: { select: { id: true, code: true, title: true, semester: true } } }, orderBy: { order: "asc" } } },
  });
  if (!path) return res.status(404).json({ message: "Learning path not found." });
  res.json(path);
});

learningPathsRouter.patch("/:id/publish", requireAuth, requireRole(...COORDINATOR_ROLES), async (req, res) => {
  const parsed = z.object({ isPublished: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid." });
  const path = await prisma.learningPath.update({ where: { id: req.params.id }, data: { isPublished: parsed.data.isPublished } }).catch(() => null);
  if (!path) return res.status(404).json({ message: "Learning path not found." });
  res.json(path);
});

learningPathsRouter.delete("/:id", requireAuth, requireRole(...COORDINATOR_ROLES), async (req, res) => {
  await prisma.learningPath.delete({ where: { id: req.params.id } }).catch(() => undefined);
  res.status(204).send();
});

// A student's own progress against a path: which of its units they've
// completed (Enrollment.status = "completed"), so the UI can show "3 of 6".
learningPathsRouter.get("/:id/my-progress", requireAuth, async (req: AuthedRequest, res) => {
  const path = await prisma.learningPath.findUnique({
    where: { id: req.params.id },
    include: { steps: { include: { unit: { select: { id: true, code: true, title: true } } }, orderBy: { order: "asc" } } },
  });
  if (!path) return res.status(404).json({ message: "Learning path not found." });

  const student = await prisma.student.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: student.id, unitId: { in: path.steps.map((s) => s.unitId) } },
    select: { unitId: true, status: true },
  });
  const statusByUnit = new Map(enrollments.map((e) => [e.unitId, e.status]));

  res.json({
    path: { id: path.id, title: path.title },
    steps: path.steps.map((s) => ({
      unitId: s.unitId,
      code: s.unit.code,
      title: s.unit.title,
      order: s.order,
      isOptional: s.isOptional,
      status: statusByUnit.get(s.unitId) ?? "not_registered",
    })),
  });
});
