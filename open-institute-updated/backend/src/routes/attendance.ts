import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { canTeachCourse, canViewCourseAsStaff } from "../lib/course-access.js";

export const attendanceRouter = Router();

const markSchema = z.object({
  courseId: z.string(),
  sessionDate: z.string().datetime(),
  records: z.array(z.object({ studentId: z.string(), present: z.boolean() })),
});

// Trainer marks a whole class in one call — upserts so re-marking the same
// session just corrects it rather than creating duplicates.
attendanceRouter.post(
  "/mark",
  requireAuth,
  requireRole("TRAINER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = markSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid attendance payload." });

    if (!(await canTeachCourse(req.user!, parsed.data.courseId))) {
      return res.status(403).json({ message: "You don't teach this course." });
    }
    // Only students actually enrolled in the course's unit can be marked.
    const course = await prisma.course.findUnique({ where: { id: parsed.data.courseId }, select: { unitId: true } });
    if (!course) return res.status(404).json({ message: "Course not found." });
    const enrolled = await prisma.enrollment.findMany({
      where: { unitId: course.unitId, studentId: { in: parsed.data.records.map((r) => r.studentId) } },
      select: { studentId: true },
    });
    const enrolledIds = new Set(enrolled.map((e: { studentId: string }) => e.studentId));
    if (parsed.data.records.some((r) => !enrolledIds.has(r.studentId))) {
      return res.status(400).json({ message: "One or more students aren't enrolled in this course." });
    }

    const sessionDate = new Date(parsed.data.sessionDate);
    const results = await Promise.all(
      parsed.data.records.map((r) =>
        prisma.attendanceRecord.upsert({
          where: {
            studentId_courseId_sessionDate: {
              studentId: r.studentId,
              courseId: parsed.data.courseId,
              sessionDate,
            },
          },
          update: { present: r.present },
          create: {
            studentId: r.studentId,
            courseId: parsed.data.courseId,
            sessionDate,
            present: r.present,
            recordedById: req.user!.id,
          },
        })
      )
    );
    res.status(201).json({ count: results.length });
  }
);

attendanceRouter.get("/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const records = await prisma.attendanceRecord.findMany({
    where: { studentId: student.id },
    include: { course: true },
    orderBy: { sessionDate: "desc" },
    take: 100,
  });
  res.json(records);
});

attendanceRouter.get(
  "/course/:courseId",
  requireAuth,
  requireRole("TRAINER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    if (!(await canViewCourseAsStaff(req.user!, req.params.courseId))) {
      return res.status(403).json({ message: "You don't teach this course." });
    }
    const records = await prisma.attendanceRecord.findMany({
      where: { courseId: req.params.courseId },
      include: { student: true },
      orderBy: { sessionDate: "desc" },
      take: 200,
    });
    res.json(records);
  }
);

export const timetableRouter = Router();

timetableRouter.get("/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({
    where: { userId: req.user!.id },
    include: { enrollments: { include: { unit: { include: { courses: true } } } } },
  });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const courseIds = student.enrollments.flatMap((e) => e.unit.courses.map((c) => c.id));
  const entries = await prisma.timetableEntry.findMany({
    where: { courseId: { in: courseIds } },
    include: { course: true },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
  res.json(entries);
});

const entrySchema = z.object({
  courseId: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
  mode: z.enum(["live", "recorded_release"]).default("live"),
});

timetableRouter.post(
  "/",
  requireAuth,
  requireRole("REGISTRAR", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = entrySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid timetable entry." });
    const entry = await prisma.timetableEntry.create({ data: parsed.data });
    res.status(201).json(entry);
  }
);
