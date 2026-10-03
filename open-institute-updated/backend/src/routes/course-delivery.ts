import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { canTeachCourse, canAccessCourseContent } from "../lib/course-access.js";
import { callAiModel } from "../lib/ai-gateway.js";
import { distributeLessonsEvenly } from "../lib/course-pacing.js";

// ---------------------------------------------------------------------------
// AI014 — "AI Teacher (full course)". The audit correctly refused to close
// this as a small wiring gap: an agent that autonomously teaches a whole
// syllabus is a real, separate scope this project has never claimed. What
// *is* real and buildable without new infrastructure is the specific thing
// the row names — "sequencing and pacing a whole syllabus" — grounded in
// the course's own real Lesson rows, never invented content. The AI drafts
// a week-by-week pacing plan; a trainer edits and explicitly publishes it;
// only a published plan is ever shown to students. Same operating
// principle as every other AI feature here: draft -> human review ->
// authorized decision.
// ---------------------------------------------------------------------------

export const courseDeliveryRouter = Router();

const generateSchema = z.object({ totalWeeks: z.number().int().min(1).max(52) });

async function loadCourseWithLessons(courseId: string) {
  return prisma.course.findUnique({
    where: { id: courseId },
    include: {
      unit: { select: { title: true } },
      modules: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" } } } },
    },
  });
}

// Deterministic fallback: distribute the course's real lessons evenly
// across the requested weeks, in their existing order (see
// lib/course-pacing.ts). Used whenever no AI model is configured, or the
// model's response can't be parsed as the expected structure — never
// silently returns an empty plan.

courseDeliveryRouter.post("/:courseId/generate", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await canTeachCourse(req.user!, req.params.courseId))) {
    return res.status(403).json({ message: "Only this course's trainer (or a super admin) can generate a delivery plan." });
  }
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide totalWeeks (1-52)." });

  const course = await loadCourseWithLessons(req.params.courseId);
  if (!course) return res.status(404).json({ message: "Course not found." });

  const lessons = course.modules.flatMap((m) => m.lessons.map((l) => ({ id: l.id, title: l.title, module: m.title })));
  const lessonList = lessons.map((l, i) => `${i + 1}. [${l.module}] ${l.title}`).join("\n") || "(no lessons yet)";

  let items = distributeLessonsEvenly(lessons, parsed.data.totalWeeks);

  const result = await callAiModel({
    feature: "trainer-assist",
    userId: req.user!.id,
    role: req.user!.role,
    maxTokens: 900,
    system:
      `You are helping a trainer pace a ${parsed.data.totalWeeks}-week delivery schedule for the unit "${course.unit.title}". ` +
      `You are given the course's REAL lesson list below, in order. Assign each lesson (by its exact number) to a week ` +
      `(1-${parsed.data.totalWeeks}), grouping related lessons together and leaving no lesson unassigned. ` +
      `Never invent a lesson that isn't in the list. Respond with ONLY a JSON array, no prose, no markdown fences, ` +
      `shaped exactly as: [{"week": 1, "lessonNumbers": [1,2], "objective": "..."}]. ` +
      `"objective" is one short sentence describing that week's learning goal, in your own words.\n\nLessons:\n${lessonList}`,
    messages: [{ role: "user", content: "Generate the pacing plan now." }],
  });

  if (result.ok) {
    try {
      const cleaned = result.text.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
      const parsedPlan: { week: number; lessonNumbers: number[]; objective: string }[] = JSON.parse(cleaned);
      const aiItems: typeof items = [];
      const seen = new Set<number>();
      for (const w of parsedPlan) {
        for (const n of w.lessonNumbers ?? []) {
          const lesson = lessons[n - 1];
          if (!lesson || seen.has(n)) continue; // never invent or duplicate a lesson
          seen.add(n);
          aiItems.push({
            weekNumber: Math.min(Math.max(1, w.week), parsed.data.totalWeeks),
            lessonId: lesson.id,
            title: lesson.title,
            objective: w.objective || `Cover: ${lesson.title}`,
          });
        }
      }
      // Any real lesson the model's response left out still gets a slot,
      // appended to the final week, so a parsing gap on the model's side
      // never silently drops content from the plan.
      lessons.forEach((lesson, idx) => {
        if (!seen.has(idx + 1)) {
          aiItems.push({ weekNumber: parsed.data.totalWeeks, lessonId: lesson.id, title: lesson.title, objective: `Cover: ${lesson.title}` });
        }
      });
      if (aiItems.length > 0) items = aiItems;
    } catch {
      // Fall through to the deterministic distribution already computed above.
    }
  }

  const plan = await prisma.$transaction(async (tx) => {
    await tx.courseDeliveryPlanItem.deleteMany({ where: { plan: { courseId: req.params.courseId } } });
    const existing = await tx.courseDeliveryPlan.findUnique({ where: { courseId: req.params.courseId } });
    const p = existing
      ? await tx.courseDeliveryPlan.update({
          where: { courseId: req.params.courseId },
          data: { totalWeeks: parsed.data.totalWeeks, generatedAt: new Date(), publishedAt: null, publishedById: null },
        })
      : await tx.courseDeliveryPlan.create({ data: { courseId: req.params.courseId, totalWeeks: parsed.data.totalWeeks } });
    await tx.courseDeliveryPlanItem.createMany({
      data: items.map((it, order) => ({ planId: p.id, weekNumber: it.weekNumber, lessonId: it.lessonId, title: it.title, objective: it.objective, order })),
    });
    return tx.courseDeliveryPlan.findUnique({ where: { id: p.id }, include: { items: { orderBy: [{ weekNumber: "asc" }, { order: "asc" }] } } });
  });

  res.status(201).json({ ...plan, aiGenerated: result.ok });
});

const itemUpdateSchema = z.object({
  weekNumber: z.number().int().min(1).optional(),
  title: z.string().min(1).optional(),
  objective: z.string().min(1).optional(),
});

courseDeliveryRouter.patch("/:courseId/items/:itemId", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await canTeachCourse(req.user!, req.params.courseId))) {
    return res.status(403).json({ message: "Not permitted." });
  }
  const parsed = itemUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid update." });
  const item = await prisma.courseDeliveryPlanItem.findUnique({ where: { id: req.params.itemId }, include: { plan: true } });
  if (!item || item.plan.courseId !== req.params.courseId) return res.status(404).json({ message: "Item not found." });
  const updated = await prisma.courseDeliveryPlanItem.update({ where: { id: item.id }, data: parsed.data });
  res.json(updated);
});

courseDeliveryRouter.patch("/:courseId/publish", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await canTeachCourse(req.user!, req.params.courseId))) {
    return res.status(403).json({ message: "Not permitted." });
  }
  const plan = await prisma.courseDeliveryPlan.findUnique({ where: { courseId: req.params.courseId } });
  if (!plan) return res.status(404).json({ message: "Generate a plan before publishing it." });
  const updated = await prisma.courseDeliveryPlan.update({
    where: { id: plan.id },
    data: { publishedAt: new Date(), publishedById: req.user!.id },
  });
  res.json(updated);
});

courseDeliveryRouter.get("/:courseId", requireAuth, async (req: AuthedRequest, res) => {
  const isStaff = await canTeachCourse(req.user!, req.params.courseId);
  if (!isStaff && !(await canAccessCourseContent(req.user!, req.params.courseId))) {
    return res.status(403).json({ message: "Not permitted." });
  }
  const plan = await prisma.courseDeliveryPlan.findUnique({
    where: { courseId: req.params.courseId },
    include: { items: { orderBy: [{ weekNumber: "asc" }, { order: "asc" }] } },
  });
  if (!plan) return res.status(404).json({ message: "No delivery plan yet for this course." });
  // A learner only ever sees a published plan — a draft stays trainer-side
  // until explicitly published, same human-decides principle as everywhere
  // else in this codebase.
  if (!isStaff && !plan.publishedAt) return res.status(404).json({ message: "No published delivery plan yet for this course." });
  res.json(plan);
});
