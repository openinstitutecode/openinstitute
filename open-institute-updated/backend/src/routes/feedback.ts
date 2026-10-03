import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const feedbackRouter = Router();

const feedbackSchema = z.object({
  courseId: z.string(),
  type: z.enum(["course", "trainer"]),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

// LMS031/QA032 — course surveys. One submission per student per course per
// type, so a student can rate the course once and the trainer once, but
// can't flood either.
feedbackRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Rate from 1 to 5." });

  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const existing = await prisma.courseFeedback.findFirst({
    where: { courseId: parsed.data.courseId, studentId: student.id, type: parsed.data.type },
  });
  if (existing) return res.status(409).json({ message: "You've already submitted this feedback." });

  const feedback = await prisma.courseFeedback.create({
    data: { ...parsed.data, studentId: student.id },
  });
  res.status(201).json(feedback);
});

// QA033/QA034 — a browsable list of every course that has at least one
// feedback submission, so QA/programme staff can find a course to inspect
// without already knowing its ID. The per-course summary route below
// existed with zero way to reach it from an admin UI; this is the missing
// entry point. Counts are cheap aggregates only — no rating averages here,
// so a low count is never mistaken for a low score at a glance.
feedbackRouter.get(
  "/courses-with-feedback",
  requireAuth,
  requireRole("QA_OFFICER", "PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const grouped = await prisma.courseFeedback.groupBy({
      by: ["courseId", "type"],
      _count: { _all: true },
    });
    const courseIds = [...new Set(grouped.map((g) => g.courseId))];
    const courses = await prisma.course.findMany({
      where: { id: { in: courseIds } },
      include: { unit: { select: { code: true } }, trainer: { select: { fullName: true } } },
    });

    const rows = courses.map((c) => {
      const courseCount = grouped.find((g) => g.courseId === c.id && g.type === "course")?._count._all ?? 0;
      const trainerCount = grouped.find((g) => g.courseId === c.id && g.type === "trainer")?._count._all ?? 0;
      return {
        id: c.id,
        title: c.title,
        unitCode: c.unit.code,
        trainerName: c.trainer?.fullName ?? null,
        courseFeedbackCount: courseCount,
        trainerFeedbackCount: trainerCount,
      };
    });
    res.json(rows);
  }
);

// QA033/QA034 — aggregated, anonymized view for QA/programme staff. Never
// exposes which student gave which rating.
feedbackRouter.get(
  "/course/:courseId/summary",
  requireAuth,
  requireRole("QA_OFFICER", "PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const feedback = await prisma.courseFeedback.findMany({ where: { courseId: req.params.courseId } });

    function summarize(type: "course" | "trainer") {
      const rows = feedback.filter((f) => f.type === type);
      const average = rows.length > 0 ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : null;
      return { count: rows.length, average, comments: rows.map((r) => r.comment).filter(Boolean) };
    }

    res.json({ course: summarize("course"), trainer: summarize("trainer") });
  }
);
