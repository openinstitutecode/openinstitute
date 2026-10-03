import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { canTeachCourse, canViewCourseAsStaff } from "../lib/course-access.js";
import { computeOverallOutcome, ChecklistValidationError } from "../lib/practical-checklist.js";

const router = Router();

// EX018 — exam-specific accessibility accommodations.
// Only the assessment's own trainer, or oversight staff, may grant one —
// same rule as everywhere else a trainer acts on their own course's
// assessments (see canTeachCourse in lib/course-access.ts).

const accommodationSchema = z.object({
  studentUserId: z.string().min(1),
  extraTimeMinutes: z.number().int().min(0).max(600),
  notes: z.string().max(2000).optional(),
});

async function assessmentCourseId(assessmentId: string) {
  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId }, select: { courseId: true } });
  return assessment?.courseId ?? null;
}

router.post("/assessments/:assessmentId/accommodations", requireAuth, async (req: AuthedRequest, res: Response) => {
  const parsed = accommodationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Provide studentUserId and extraTimeMinutes (0-600)." });
  }
  const courseId = await assessmentCourseId(req.params.assessmentId);
  if (!courseId) return res.status(404).json({ message: "Assessment not found." });
  if (!(await canViewCourseAsStaff(req.user!, courseId)) && !(await canTeachCourse(req.user!, courseId))) {
    return res.status(403).json({ message: "You don't have permission to set accommodations for this assessment." });
  }

  const accommodation = await prisma.examAccommodation.upsert({
    where: { assessmentId_studentUserId: { assessmentId: req.params.assessmentId, studentUserId: parsed.data.studentUserId } },
    create: {
      assessmentId: req.params.assessmentId,
      studentUserId: parsed.data.studentUserId,
      extraTimeMinutes: parsed.data.extraTimeMinutes,
      notes: parsed.data.notes,
      grantedById: req.user!.id,
      status: "approved",
    },
    update: {
      extraTimeMinutes: parsed.data.extraTimeMinutes,
      notes: parsed.data.notes,
      grantedById: req.user!.id,
      status: "approved",
    },
  });
  res.status(201).json(accommodation);
});

router.get("/assessments/:assessmentId/accommodations", requireAuth, async (req: AuthedRequest, res: Response) => {
  const courseId = await assessmentCourseId(req.params.assessmentId);
  if (!courseId) return res.status(404).json({ message: "Assessment not found." });
  if (!(await canViewCourseAsStaff(req.user!, courseId)) && !(await canTeachCourse(req.user!, courseId))) {
    return res.status(403).json({ message: "You don't have permission to view accommodations for this assessment." });
  }
  const accommodations = await prisma.examAccommodation.findMany({
    where: { assessmentId: req.params.assessmentId },
    orderBy: { createdAt: "desc" },
  });
  res.json(accommodations);
});

router.patch("/accommodations/:id/revoke", requireAuth, async (req: AuthedRequest, res: Response) => {
  const accommodation = await prisma.examAccommodation.findUnique({ where: { id: req.params.id } });
  if (!accommodation) return res.status(404).json({ message: "Accommodation not found." });
  const courseId = await assessmentCourseId(accommodation.assessmentId);
  if (!courseId || (!(await canViewCourseAsStaff(req.user!, courseId)) && !(await canTeachCourse(req.user!, courseId)))) {
    return res.status(403).json({ message: "You don't have permission to revoke this accommodation." });
  }
  const updated = await prisma.examAccommodation.update({ where: { id: req.params.id }, data: { status: "revoked" } });
  res.json(updated);
});

// EX034 — practical/competency (CBET-style) checklists.
// One checklist per assessment; students are scored per-criterion as
// competent/not-yet-competent, never by marks. See
// lib/practical-checklist.ts for the pure outcome computation.

const checklistCriteriaSchema = z.array(
  z.object({ name: z.string().min(1).max(200), description: z.string().max(1000).optional(), mandatory: z.boolean() })
);

router.post("/assessments/:assessmentId/practical-checklist", requireAuth, async (req: AuthedRequest, res: Response) => {
  const parsedCriteria = checklistCriteriaSchema.safeParse(req.body.criteria);
  if (!parsedCriteria.success || parsedCriteria.data.length === 0) {
    return res.status(400).json({ message: "Provide at least one criterion: { name, mandatory }." });
  }
  const courseId = await assessmentCourseId(req.params.assessmentId);
  if (!courseId) return res.status(404).json({ message: "Assessment not found." });
  if (!(await canTeachCourse(req.user!, courseId)) && !(await canViewCourseAsStaff(req.user!, courseId))) {
    return res.status(403).json({ message: "You don't have permission to build a checklist for this assessment." });
  }

  const checklist = await prisma.practicalChecklist.upsert({
    where: { assessmentId: req.params.assessmentId },
    create: { assessmentId: req.params.assessmentId, criteria: parsedCriteria.data, createdById: req.user!.id },
    update: { criteria: parsedCriteria.data },
  });
  res.status(201).json(checklist);
});

router.get("/assessments/:assessmentId/practical-checklist", requireAuth, async (req: AuthedRequest, res: Response) => {
  const checklist = await prisma.practicalChecklist.findUnique({
    where: { assessmentId: req.params.assessmentId },
    include: { results: true },
  });
  if (!checklist) return res.status(404).json({ message: "No checklist has been built for this assessment yet." });
  res.json(checklist);
});

const scoreSchema = z.object({
  submissionId: z.string().min(1),
  criteriaCalls: z.array(z.object({ name: z.string().min(1), competent: z.boolean(), comment: z.string().max(1000).optional() })),
});

router.post("/assessments/:assessmentId/practical-checklist/score", requireAuth, async (req: AuthedRequest, res: Response) => {
  const parsed = scoreSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Provide submissionId and criteriaCalls: [{ name, competent }]." });
  }
  const courseId = await assessmentCourseId(req.params.assessmentId);
  if (!courseId) return res.status(404).json({ message: "Assessment not found." });
  if (!(await canTeachCourse(req.user!, courseId)) && !(await canViewCourseAsStaff(req.user!, courseId))) {
    return res.status(403).json({ message: "You don't have permission to score this checklist." });
  }

  const checklist = await prisma.practicalChecklist.findUnique({ where: { assessmentId: req.params.assessmentId } });
  if (!checklist) return res.status(404).json({ message: "No checklist has been built for this assessment yet." });

  const submission = await prisma.submission.findUnique({ where: { id: parsed.data.submissionId } });
  if (!submission || submission.assessmentId !== req.params.assessmentId) {
    return res.status(400).json({ message: "That submission doesn't belong to this assessment." });
  }

  let outcome: "competent" | "not_yet_competent";
  try {
    outcome = computeOverallOutcome(checklist.criteria as any, parsed.data.criteriaCalls);
  } catch (err) {
    if (err instanceof ChecklistValidationError) {
      return res.status(400).json({ message: err.message });
    }
    throw err;
  }

  // A CBET outcome is binary, so it's recorded on Submission as full marks
  // (competent) or zero (not yet competent) rather than inventing a
  // separate "outcome" column on Submission that every other report
  // (gradebook, results slip, analytics) would need to special-case.
  const assessment = await prisma.assessment.findUnique({ where: { id: req.params.assessmentId }, select: { totalMarks: true } });
  const score = outcome === "competent" ? assessment?.totalMarks ?? 0 : 0;

  // The checklist result and the submission's own score move together in
  // one transaction: a competency outcome that never reached Submission
  // would be exactly the "oral-exam scores never reach Submission" class of
  // bug already fixed elsewhere in this project.
  const [result] = await prisma.$transaction([
    prisma.practicalChecklistResult.upsert({
      where: { submissionId: parsed.data.submissionId },
      create: {
        checklistId: checklist.id,
        submissionId: parsed.data.submissionId,
        criteriaCalls: parsed.data.criteriaCalls,
        overallOutcome: outcome,
        assessedById: req.user!.id,
      },
      update: {
        criteriaCalls: parsed.data.criteriaCalls,
        overallOutcome: outcome,
        assessedById: req.user!.id,
        assessedAt: new Date(),
      },
    }),
    prisma.submission.update({
      where: { id: parsed.data.submissionId },
      data: {
        score,
        gradedAt: new Date(),
        gradedById: req.user!.id,
      },
    }),
  ]);

  res.status(201).json(result);
});

export default router;
