import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { canTeachCourse, canViewCourseAsStaff } from "../lib/course-access.js";

export const trainerSelfRouter = Router();

// Course-scoped data (rosters, at-risk lists, analytics) is for that course's
// own trainer or oversight staff — previously any logged-in user, students
// included, could read any course's roster by guessing its id.
async function staffGuard(req: AuthedRequest, res: { status: (n: number) => { json: (b: unknown) => unknown } }, courseId: string): Promise<boolean> {
  if (await canViewCourseAsStaff(req.user!, courseId)) return true;
  res.status(403).json({ message: "You don't teach this course." });
  return false;
}

trainerSelfRouter.get("/dashboard", requireAuth, async (req: AuthedRequest, res) => {
  const trainer = await prisma.trainer.findUnique({
    where: { userId: req.user!.id },
    include: {
      courses: {
        include: {
          assignments: { include: { submissions: true } },
          assessments: { include: { submissions: true } },
          unit: { include: { enrollments: true } },
        },
      },
    },
  });
  if (!trainer) return res.status(404).json({ message: "No trainer record for this account." });

  const courses = trainer.courses.map((c) => {
    const allSubmissions = [
      ...c.assignments.flatMap((a) => a.submissions),
      ...c.assessments.flatMap((a) => a.submissions),
    ];
    const ungraded = allSubmissions.filter((s) => s.score === null).length;
    return {
      courseId: c.id,
      title: c.title,
      studentCount: c.unit.enrollments.length,
      ungradedSubmissions: ungraded,
    };
  });

  res.json({
    trainerName: trainer.fullName,
    licenceExpiry: trainer.licenceExpiry,
    courses,
    totalUngraded: courses.reduce((s, c) => s + c.ungradedSubmissions, 0),
    totalStudents: courses.reduce((s, c) => s + c.studentCount, 0),
  });
});

trainerSelfRouter.get("/roster/:courseId", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await staffGuard(req, res, req.params.courseId))) return;
  const course = await prisma.course.findUnique({
    where: { id: req.params.courseId },
    include: { unit: { include: { enrollments: { include: { student: true } } } } },
  });
  if (!course) return res.status(404).json({ message: "Course not found." });

  res.json(
    course.unit.enrollments.map((e) => ({
      studentId: e.studentId,
      userId: e.student.userId,
      fullName: e.student.fullName,
      studentNumber: e.student.studentNumber,
      status: e.status,
    }))
  );
});

// The trainer's courses in the lightest useful shape — what every course /
// assessment / assignment dropdown in the portal needs, so no page ever asks a
// trainer to type or paste a database id. SUPER_ADMIN sees every course.
trainerSelfRouter.get("/course-options", requireAuth, async (req: AuthedRequest, res) => {
  let where: Record<string, unknown>;
  if (req.user!.role === "SUPER_ADMIN") {
    where = {};
  } else {
    const trainer = await prisma.trainer.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
    if (!trainer) return res.status(404).json({ message: "No trainer record for this account." });
    where = { trainerId: trainer.id };
  }
  const courses = await prisma.course.findMany({
    where,
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      lmsEngine: true,
      unit: { select: { id: true, title: true, code: true, programmeId: true } },
      assessments: { select: { id: true, title: true, type: true, totalMarks: true, isDraft: true }, orderBy: { title: "asc" } },
      assignments: { select: { id: true, title: true, totalMarks: true }, orderBy: { title: "asc" } },
    },
  });
  res.json(courses);
});

// Real course + module + lesson content for "My Courses" on the trainer side.
trainerSelfRouter.get("/courses", requireAuth, async (req: AuthedRequest, res) => {
  const trainer = await prisma.trainer.findUnique({
    where: { userId: req.user!.id },
    include: {
      courses: {
        include: {
          modules: { include: { lessons: true }, orderBy: { order: "asc" } },
          // TP034/035/036 — the AI assistant needs to ground a draft in a
          // real unit and know which unit/module to save into; this was
          // previously left out since nothing here needed it before.
          unit: { select: { id: true, title: true, code: true } },
        },
      },
    },
  });
  if (!trainer) return res.status(404).json({ message: "No trainer record for this account." });
  res.json(trainer.courses);
});

// Real, transparent at-risk signals — computed from actual data, not
// invented. Three independent checks, each individually labeled so a
// trainer can see exactly why a student was flagged:
//   1. No login in 12+ days (User.lastLoginAt)
//   2. An assignment deadline has passed with no submission
//   3. Score dropped between a student's two most recent graded
//      submissions in this course
trainerSelfRouter.get("/at-risk/:courseId", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await staffGuard(req, res, req.params.courseId))) return;
  const course = await prisma.course.findUnique({
    where: { id: req.params.courseId },
    include: {
      unit: { include: { enrollments: { include: { student: { include: { user: true } } } } } },
      assignments: { include: { submissions: true } },
      assessments: { include: { submissions: true } },
    },
  });
  if (!course) return res.status(404).json({ message: "Course not found." });

  const now = new Date();
  const twelveDaysAgo = new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000);

  const flags: { studentId: string; fullName: string; signal: string; detail: string }[] = [];

  for (const enrollment of course.unit.enrollments) {
    const student = enrollment.student;

    if (!student.user.lastLoginAt || student.user.lastLoginAt < twelveDaysAgo) {
      flags.push({
        studentId: student.id,
        fullName: student.fullName,
        signal: "no_login",
        detail: student.user.lastLoginAt
          ? `Last active ${student.user.lastLoginAt.toLocaleDateString()}`
          : "Never logged in",
      });
    }

    for (const assignment of course.assignments) {
      if (assignment.dueAt < now) {
        const submitted = assignment.submissions.some((s) => s.studentUserId === student.userId);
        if (!submitted) {
          flags.push({
            studentId: student.id,
            fullName: student.fullName,
            signal: "missed_deadline",
            detail: `${assignment.title} was due ${assignment.dueAt.toLocaleDateString()}`,
          });
        }
      }
    }

    const scoredSubmissions = course.assessments
      .flatMap((a) => a.submissions.filter((s) => s.studentUserId === student.userId && s.score !== null))
      .sort((a, b) => (a.gradedAt?.getTime() ?? 0) - (b.gradedAt?.getTime() ?? 0));
    if (scoredSubmissions.length >= 2) {
      const [prev, latest] = scoredSubmissions.slice(-2);
      if (latest.score! < prev.score! - 15) {
        flags.push({
          studentId: student.id,
          fullName: student.fullName,
          signal: "score_dropping",
          detail: `${prev.score}% → ${latest.score}%`,
        });
      }
    }
  }

  res.json(flags);
});

// TP022 — cohort analytics: aggregates real per-assessment analytics
// (identical mean/pass-rate math to GET /exams/assessments/:id/analytics)
// across every assessment in the course, so a trainer sees the whole
// cohort's performance in one place instead of assessment-by-assessment.
trainerSelfRouter.get("/cohort-analytics/:courseId", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await staffGuard(req, res, req.params.courseId))) return;
  const course = await prisma.course.findUnique({
    where: { id: req.params.courseId },
    include: { assessments: { include: { submissions: true } }, unit: { include: { enrollments: true } } },
  });
  if (!course) return res.status(404).json({ message: "Course not found." });

  const perAssessment = course.assessments.map((a) => {
    const scored = a.submissions.filter((s) => s.score !== null);
    if (scored.length === 0) {
      return { assessmentId: a.id, title: a.title, submissionCount: 0, mean: null, passRate: null };
    }
    const percentages = scored.map((s) => (s.score! / a.totalMarks) * 100);
    const mean = percentages.reduce((x, y) => x + y, 0) / percentages.length;
    const passRate = (percentages.filter((p) => p >= 50).length / percentages.length) * 100;
    return { assessmentId: a.id, title: a.title, submissionCount: scored.length, mean, passRate };
  });

  const withData = perAssessment.filter((a) => a.mean !== null);
  const cohortMean = withData.length > 0 ? withData.reduce((s, a) => s + a.mean!, 0) / withData.length : null;
  const cohortPassRate = withData.length > 0 ? withData.reduce((s, a) => s + a.passRate!, 0) / withData.length : null;

  res.json({
    courseTitle: course.title,
    enrolledCount: course.unit.enrollments.length,
    perAssessment,
    cohortMean,
    cohortPassRate,
  });
});

// TP021 — individual student performance within one course: every graded
// submission (assessment + assignment), attendance rate, and current
// enrollment status, all computed from real rows.
trainerSelfRouter.get("/student-performance/:courseId/:studentId", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await staffGuard(req, res, req.params.courseId))) return;
  const student = await prisma.student.findUnique({ where: { id: req.params.studentId } });
  if (!student) return res.status(404).json({ message: "Student not found." });

  const course = await prisma.course.findUnique({
    where: { id: req.params.courseId },
    include: { assessments: { include: { submissions: true } }, assignments: { include: { submissions: true } } },
  });
  if (!course) return res.status(404).json({ message: "Course not found." });

  const assessmentResults = course.assessments
    .map((a) => {
      const submission = a.submissions.find((s) => s.studentUserId === student.userId);
      return { title: a.title, totalMarks: a.totalMarks, score: submission?.score ?? null, submittedAt: submission?.submittedAt ?? null };
    })
    .filter((r) => r.submittedAt !== null);

  const assignmentResults = course.assignments
    .map((a) => {
      const submission = a.submissions.find((s) => s.studentUserId === student.userId);
      return { title: a.title, dueAt: a.dueAt, submitted: !!submission, score: submission?.score ?? null };
    });

  const attendanceRecords = await prisma.attendanceRecord.findMany({
    where: { studentId: student.id, courseId: course.id },
  });
  const attendanceRate =
    attendanceRecords.length > 0
      ? (attendanceRecords.filter((r) => r.present).length / attendanceRecords.length) * 100
      : null;

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId: student.id, unitId: course.unitId },
  });

  res.json({
    studentName: student.fullName,
    studentNumber: student.studentNumber,
    enrollmentStatus: enrollment?.status ?? null,
    assessmentResults,
    assignmentResults,
    attendanceRate,
  });
});

// TP040 — trainer performance profile: combines teaching workload, CPD,
// and student feedback into one real, computed view.
trainerSelfRouter.get("/performance-profile", requireAuth, async (req: AuthedRequest, res) => {
  const trainer = await prisma.trainer.findUnique({
    where: { userId: req.user!.id },
    include: {
      courses: true,
      cpdActivities: true,
    },
  });
  if (!trainer) return res.status(404).json({ message: "No trainer record for this account." });

  const courseIds = trainer.courses.map((c) => c.id);
  const feedback = await prisma.courseFeedback.findMany({
    where: { courseId: { in: courseIds }, type: "trainer" },
  });
  const averageRating = feedback.length > 0 ? feedback.reduce((s, f) => s + f.rating, 0) / feedback.length : null;
  const totalCpdHours = trainer.cpdActivities.reduce((s, a) => s + a.hours, 0);

  res.json({
    trainerName: trainer.fullName,
    coursesTaught: trainer.courses.length,
    licenceExpiry: trainer.licenceExpiry,
    totalCpdHours,
    studentFeedbackCount: feedback.length,
    averageStudentRating: averageRating,
  });
});

// ---------------------------------------------------------------------------
// TP029 — trainer announcements: course-scoped, distinct from the
// institution-wide broadcast (AD013). Reuses the shared Notification
// model — a real row for every real student actually enrolled in the
// course's unit, not an institution-wide blast for a course-specific
// message.
// ---------------------------------------------------------------------------
const announcementSchema = z.object({ courseId: z.string(), title: z.string().min(2), body: z.string().min(2) });

trainerSelfRouter.post("/announcements", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = announcementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide courseId, title, and body." });
  if (!(await canTeachCourse(req.user!, parsed.data.courseId))) return res.status(403).json({ message: "You don't teach this course." });

  const course = await prisma.course.findUnique({
    where: { id: parsed.data.courseId },
    include: { unit: { include: { enrollments: { include: { student: true } } } } },
  });
  if (!course) return res.status(404).json({ message: "Course not found." });

  const userIds = course.unit.enrollments.map((e) => e.student.userId);
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, channel: "in_app", title: parsed.data.title, body: parsed.data.body, sentAt: new Date() })),
  });

  res.status(201).json({ recipientCount: userIds.length });
});

// ---------------------------------------------------------------------------
// TP030 — student messaging: real, private one-to-one messages. Only the
// two participants in a thread can read it — never institution-wide, never
// visible to other students.
// ---------------------------------------------------------------------------
const messageSchema = z.object({ recipientId: z.string(), body: z.string().min(1) });

trainerSelfRouter.post("/messages", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide recipientId and body." });
  const message = await prisma.directMessage.create({
    data: { senderId: req.user!.id, recipientId: parsed.data.recipientId, body: parsed.data.body },
  });
  res.status(201).json(message);
});

trainerSelfRouter.get("/messages/thread/:otherUserId", requireAuth, async (req: AuthedRequest, res) => {
  const messages = await prisma.directMessage.findMany({
    where: {
      OR: [
        { senderId: req.user!.id, recipientId: req.params.otherUserId },
        { senderId: req.params.otherUserId, recipientId: req.user!.id },
      ],
    },
    orderBy: { sentAt: "asc" },
  });
  // Mark messages sent TO the current user as read now that they've opened the thread.
  await prisma.directMessage.updateMany({
    where: { senderId: req.params.otherUserId, recipientId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json(messages);
});

trainerSelfRouter.get("/messages/inbox", requireAuth, async (req: AuthedRequest, res) => {
  const messages = await prisma.directMessage.findMany({
    where: { OR: [{ senderId: req.user!.id }, { recipientId: req.user!.id }] },
    orderBy: { sentAt: "desc" },
    take: 100,
  });

  // Collapse into one row per conversation partner, showing the latest message.
  const byPartner = new Map<string, typeof messages[number]>();
  for (const m of messages) {
    const partner = m.senderId === req.user!.id ? m.recipientId : m.senderId;
    if (!byPartner.has(partner)) byPartner.set(partner, m);
  }
  res.json([...byPartner.entries()].map(([partnerId, lastMessage]) => ({ partnerId, lastMessage })));
});

// ---------------------------------------------------------------------------
// TP028 — virtual office hours: real published availability.
// ---------------------------------------------------------------------------
const officeHourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  link: z.string().url().optional(),
});

trainerSelfRouter.post("/office-hours", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = officeHourSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide dayOfWeek, startTime, and endTime." });
  const slot = await prisma.officeHourSlot.create({ data: { trainerId: req.user!.id, ...parsed.data } });
  res.status(201).json(slot);
});

trainerSelfRouter.get("/office-hours/mine", requireAuth, async (req: AuthedRequest, res) => {
  const slots = await prisma.officeHourSlot.findMany({
    where: { trainerId: req.user!.id },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
  res.json(slots);
});

trainerSelfRouter.get("/office-hours/:trainerId", requireAuth, async (req: AuthedRequest, res) => {
  const slots = await prisma.officeHourSlot.findMany({
    where: { trainerId: req.params.trainerId, active: true },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
  res.json(slots);
});

trainerSelfRouter.delete("/office-hours/:id", requireAuth, async (req: AuthedRequest, res) => {
  const removed = await prisma.officeHourSlot.deleteMany({ where: { id: req.params.id, trainerId: req.user!.id } });
  if (removed.count === 0) return res.status(404).json({ message: "Office-hour slot not found." });
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// TP033 — course analytics: completion and engagement, distinct from the
// per-assessment mean/pass-rate already covered by cohort-analytics
// (TP022, batch 23). Real completion rate (enrollment status) and real
// engagement (last login recency, assignment submission rate) — no
// invented "engagement score."
// ---------------------------------------------------------------------------
trainerSelfRouter.get("/course-engagement/:courseId", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await staffGuard(req, res, req.params.courseId))) return;
  const course = await prisma.course.findUnique({
    where: { id: req.params.courseId },
    include: {
      unit: { include: { enrollments: { include: { student: { include: { user: true } } } } } },
      assignments: { include: { submissions: true } },
    },
  });
  if (!course) return res.status(404).json({ message: "Course not found." });

  const enrollments = course.unit.enrollments;
  const completedCount = enrollments.filter((e) => e.status === "completed").length;
  const completionRate = enrollments.length > 0 ? (completedCount / enrollments.length) * 100 : null;

  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);
  const recentlyActiveCount = enrollments.filter(
    (e) => e.student.user.lastLoginAt && e.student.user.lastLoginAt >= fourteenDaysAgo
  ).length;
  const activeRate = enrollments.length > 0 ? (recentlyActiveCount / enrollments.length) * 100 : null;

  const totalPossibleSubmissions = enrollments.length * course.assignments.length;
  const actualSubmissions = course.assignments.reduce((s, a) => s + a.submissions.length, 0);
  const submissionRate = totalPossibleSubmissions > 0 ? (actualSubmissions / totalPossibleSubmissions) * 100 : null;

  res.json({
    courseTitle: course.title,
    enrolledCount: enrollments.length,
    completionRate,
    activeInLast14Days: recentlyActiveCount,
    activeRate,
    assignmentSubmissionRate: submissionRate,
  });
});
