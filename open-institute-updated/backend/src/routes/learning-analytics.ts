// LMS029 — time-on-task: real per-lesson time samples from a heartbeat the
// lesson viewer sends every ~30s while a lesson is open and the tab is
// visible (not inferred from login/logout gaps, which this project has
// never had a reliable signal for).
//
// LMS028 — learning analytics: rolls up LessonProgress + LessonTimeLog into
// a real per-student and per-course view instead of that being an
// aspirational, unbuilt "analytics" label.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { canAccessCourseContent, canViewCourseAsStaff } from "../lib/course-access.js";
import { computeWeakTopics } from "../lib/weakness-detection.js";
import { predictMastery, type ScoredAttempt } from "../lib/mastery-prediction.js";

export const learningAnalyticsRouter = Router();

// Server-side cap: a single heartbeat can never claim more than 5 minutes,
// so a stale/backgrounded tab replaying missed beats can't inflate a
// student's time-on-task.
const MAX_HEARTBEAT_SECONDS = 300;

const heartbeatSchema = z.object({ lessonId: z.string(), seconds: z.number().int().positive().max(MAX_HEARTBEAT_SECONDS) });

learningAnalyticsRouter.post("/heartbeat", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = heartbeatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid heartbeat." });

  const student = await prisma.student.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const lesson = await prisma.lesson.findUnique({ where: { id: parsed.data.lessonId }, include: { module: { select: { courseId: true } } } });
  if (!lesson) return res.status(404).json({ message: "Lesson not found." });
  if (!(await canAccessCourseContent(req.user!, lesson.module.courseId))) return res.status(403).json({ message: "You don't have access to this lesson." });

  await prisma.lessonTimeLog.create({ data: { studentId: student.id, lessonId: lesson.id, seconds: parsed.data.seconds } });
  res.status(201).json({ ok: true });
});

// LMS028 — a student's own learning analytics: time-on-task by course over
// the last 30 days, plus overall completion, so the AI study planner and
// the student themselves can see real usage rather than nothing at all.
learningAnalyticsRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const logs = await prisma.lessonTimeLog.findMany({
    where: { studentId: student.id, loggedAt: { gte: since } },
    include: { lesson: { include: { module: { include: { course: { select: { id: true, title: true } } } } } } },
  });

  const byCourse = new Map<string, { courseId: string; courseTitle: string; seconds: number }>();
  for (const log of logs) {
    const c = log.lesson.module.course;
    const entry = byCourse.get(c.id) ?? { courseId: c.id, courseTitle: c.title, seconds: 0 };
    entry.seconds += log.seconds;
    byCourse.set(c.id, entry);
  }

  const totalCompleted = await prisma.lessonProgress.count({ where: { studentId: student.id } });

  res.json({
    since,
    totalSecondsLast30Days: logs.reduce((sum, l) => sum + l.seconds, 0),
    byCourse: [...byCourse.values()].sort((a, b) => b.seconds - a.seconds),
    lessonsCompletedTotal: totalCompleted,
  });
});

// LMS028 — trainer/oversight view: engagement across every student enrolled
// in one course — real time-on-task and completion, not a placeholder.
learningAnalyticsRouter.get("/course/:courseId", requireAuth, async (req: AuthedRequest, res) => {
  const { courseId } = req.params;
  if (!(await canViewCourseAsStaff(req.user!, courseId))) return res.status(403).json({ message: "Not permitted." });

  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { unitId: true } });
  if (!course) return res.status(404).json({ message: "Course not found." });

  const enrollments = await prisma.enrollment.findMany({
    where: { unitId: course.unitId },
    include: { student: { select: { id: true, fullName: true, studentNumber: true } } },
  });

  const lessons = await prisma.lesson.findMany({ where: { module: { courseId }, isPublished: true }, select: { id: true } });
  const lessonIds = lessons.map((l) => l.id);

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await Promise.all(
    enrollments.map(async (e) => {
      const [timeAgg, completedCount] = await Promise.all([
        prisma.lessonTimeLog.aggregate({ where: { studentId: e.student.id, lessonId: { in: lessonIds }, loggedAt: { gte: since } }, _sum: { seconds: true } }),
        lessonIds.length ? prisma.lessonProgress.count({ where: { studentId: e.student.id, lessonId: { in: lessonIds } } }) : Promise.resolve(0),
      ]);
      return {
        studentId: e.student.id,
        studentName: e.student.fullName,
        studentNumber: e.student.studentNumber,
        secondsLast30Days: timeAgg._sum.seconds ?? 0,
        lessonsCompleted: completedCount,
        totalLessons: lessonIds.length,
      };
    })
  );

  res.json({ courseId, totalLessons: lessonIds.length, students: rows.sort((a, b) => b.secondsLast30Days - a.secondsLast30Days) });
});

// AI026 — weakness detection: a student's own weak topics, computed from
// real graded QuestionResponse rows (see lib/weakness-detection.ts). This
// replaces command-centre.ts's institution-wide disengagement count as the
// answer to "does this system detect weaknesses" with a real, per-student,
// per-topic one.
learningAnalyticsRouter.get("/weakness/me", requireAuth, async (req: AuthedRequest, res) => {
  const responses = await prisma.questionResponse.findMany({
    where: { submission: { studentUserId: req.user!.id }, isCorrect: { not: null } },
    select: { isCorrect: true, question: { select: { topic: true } } },
  });
  const weakTopics = computeWeakTopics(responses.map((r) => ({ topic: r.question.topic, isCorrect: r.isCorrect })));
  res.json({ weakTopics });
});

// AI025 — mastery prediction. Pulls every graded Submission for a student
// (assessment- and assignment-based both have a real totalMarks to turn
// score into a comparable percent), groups by the unit the underlying
// course belongs to, and runs each unit's chronological score history
// through lib/mastery-prediction.ts's predictMastery() — a deterministic
// trend heuristic, not a trained model (see that module's own note on
// what this honestly is and isn't).
async function computeMasteryByUnit(studentUserId: string) {
  const [assessmentSubs, assignmentSubs] = await Promise.all([
    prisma.submission.findMany({
      where: { studentUserId, score: { not: null }, assessmentId: { not: null } },
      select: {
        score: true,
        gradedAt: true,
        submittedAt: true,
        assessment: { select: { totalMarks: true, course: { select: { unitId: true, unit: { select: { code: true, title: true } } } } } },
      },
    }),
    prisma.submission.findMany({
      where: { studentUserId, score: { not: null }, assignmentId: { not: null } },
      select: {
        score: true,
        gradedAt: true,
        submittedAt: true,
        assignment: { select: { totalMarks: true, course: { select: { unitId: true, unit: { select: { code: true, title: true } } } } } },
      },
    }),
  ]);

  const byUnit = new Map<string, { unitCode: string; unitTitle: string; attempts: ScoredAttempt[] }>();

  const record = (unitId: string, unitCode: string, unitTitle: string, score: number, totalMarks: number, at: Date) => {
    if (totalMarks <= 0) return;
    const entry = byUnit.get(unitId) ?? { unitCode, unitTitle, attempts: [] };
    entry.attempts.push({ percent: (score / totalMarks) * 100, at });
    byUnit.set(unitId, entry);
  };

  for (const r of assessmentSubs) {
    if (!r.assessment) continue;
    const { unitId, unit } = r.assessment.course;
    record(unitId, unit.code, unit.title, r.score!, r.assessment.totalMarks, r.gradedAt ?? r.submittedAt);
  }
  for (const r of assignmentSubs) {
    if (!r.assignment) continue;
    const { unitId, unit } = r.assignment.course;
    record(unitId, unit.code, unit.title, r.score!, r.assignment.totalMarks, r.gradedAt ?? r.submittedAt);
  }

  return [...byUnit.entries()]
    .map(([unitId, { unitCode, unitTitle, attempts }]) => ({ unitId, unitCode, unitTitle, ...predictMastery(attempts) }))
    .sort((a, b) => (a.predictedNextPercent ?? a.latestPercent ?? 100) - (b.predictedNextPercent ?? b.latestPercent ?? 100));
}

learningAnalyticsRouter.get("/mastery/me", requireAuth, async (req: AuthedRequest, res) => {
  const byUnit = await computeMasteryByUnit(req.user!.id);
  res.json({ byUnit });
});

// Trainer/staff view of one student's predicted mastery per unit — same
// permission set as the weakness/:studentId route below. No dedicated
// trainer-facing page exists to slot this into yet (same honest gap
// AI026's per-student trainer view has — see docs/feature-audit-400.md);
// the route itself is real and callable.
learningAnalyticsRouter.get("/mastery/:studentId", requireAuth, async (req: AuthedRequest, res) => {
  if (!["TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ message: "Not permitted." });
  }
  const student = await prisma.student.findUnique({ where: { id: req.params.studentId }, select: { userId: true, fullName: true } });
  if (!student) return res.status(404).json({ message: "Student not found." });
  const byUnit = await computeMasteryByUnit(student.userId);
  res.json({ studentName: student.fullName, byUnit });
});

// AI026 — trainer/staff view of one student's weak topics, for the same
// reason the /course/:courseId engagement view above exists: a trainer
// needs to see this about their own students, not just the student
// themselves.
learningAnalyticsRouter.get("/weakness/:studentId", requireAuth, async (req: AuthedRequest, res) => {
  if (!["TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ message: "Not permitted." });
  }
  const student = await prisma.student.findUnique({ where: { id: req.params.studentId }, select: { userId: true, fullName: true } });
  if (!student) return res.status(404).json({ message: "Student not found." });

  const responses = await prisma.questionResponse.findMany({
    where: { submission: { studentUserId: student.userId }, isCorrect: { not: null } },
    select: { isCorrect: true, question: { select: { topic: true } } },
  });
  const weakTopics = computeWeakTopics(responses.map((r) => ({ topic: r.question.topic, isCorrect: r.isCorrect })));
  res.json({ studentName: student.fullName, weakTopics });
});
