import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { getCourseProcessingStatus, getCoursePassRate } from "../lib/results-processing.js";
import { emitPortalEvent } from "../integration/events.js";

export const governanceRouter = Router();

const meetingSchema = z.object({
  committee: z.enum(["Board", "Academic Board", "QA Committee", "Examination Board"]),
  title: z.string().min(2),
  scheduledAt: z.string().datetime(),
  agendaItems: z.array(z.string()).default([]),
});

governanceRouter.post(
  "/meetings",
  requireAuth,
  requireRole("PRINCIPAL", "REGISTRAR", "QA_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = meetingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid meeting details." });

    const meeting = await prisma.meeting.create({
      data: {
        committee: parsed.data.committee,
        title: parsed.data.title,
        scheduledAt: new Date(parsed.data.scheduledAt),
        agendaItems: {
          create: parsed.data.agendaItems.map((title, i) => ({ title, order: i })),
        },
      },
      include: { agendaItems: true },
    });
    res.status(201).json(meeting);
  }
);

governanceRouter.get(
  "/meetings",
  requireAuth,
  requireRole("PRINCIPAL", "REGISTRAR", "QA_OFFICER", "BOARD_MEMBER", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const meetings = await prisma.meeting.findMany({
      include: { agendaItems: true },
      orderBy: { scheduledAt: "desc" },
      take: 50,
    });
    res.json(meetings);
  }
);

const resolutionSchema = z.object({
  resolution: z.string().min(2),
  actionOwner: z.string().optional(),
  actionDueDate: z.string().datetime().optional(),
  status: z.enum(["open", "resolved", "deferred"]).default("resolved"),
});

governanceRouter.patch(
  "/agenda-items/:id",
  requireAuth,
  requireRole("PRINCIPAL", "REGISTRAR", "QA_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = resolutionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid resolution." });
    const { actionDueDate, ...rest } = parsed.data;
    const item = await prisma.agendaItem.update({
      where: { id: req.params.id },
      data: { ...rest, actionDueDate: actionDueDate ? new Date(actionDueDate) : undefined },
    });
    res.json(item);
  }
);

// AD023 — minutes management. Meeting.minutesText has existed on the model
// since it was first created, but no route ever set or read it — this is
// the real gap the audit flagged, not just a missing UI over existing data.
// Recording minutes also marks the meeting "held", since a meeting with
// minutes on file is, by definition, one that actually happened.
const minutesSchema = z.object({ minutesText: z.string().min(1) });

governanceRouter.patch(
  "/meetings/:id/minutes",
  requireAuth,
  requireRole("PRINCIPAL", "REGISTRAR", "QA_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = minutesSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide minutes text." });
    const meeting = await prisma.meeting.update({
      where: { id: req.params.id },
      data: { minutesText: parsed.data.minutesText, status: "held" },
    });
    res.json(meeting);
  }
);

// ---------------------------------------------------------------------------
// RG029 — Examination Board. Before this, "Examination Board" was only a
// value of Meeting.committee — a label on a generic agenda, with no actual
// board-specific workflow. This gives the board a real function: reviewing
// units whose results are either not yet finalized or have a low pass rate,
// and formally ratifying a unit's results once it has. Ratification is
// captured against the exact meeting and records the pass rate as it stood
// at that moment (see ExamBoardRatification in schema.prisma) so a later
// results amendment (RG026) can't quietly rewrite what the board actually
// signed off on.
// ---------------------------------------------------------------------------

const FLAG_PASS_RATE_THRESHOLD = 50; // a unit's pass rate below this % is flagged for board review

governanceRouter.get(
  "/examination-board/flagged-results",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "QA_OFFICER", "REGISTRAR", "PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const courses = await prisma.course.findMany({
      include: { unit: true, assessments: { where: { isDraft: false }, select: { id: true } } },
    });

    const flagged: Array<{
      courseId: string;
      unitCode: string;
      unitTitle: string;
      totalAssessments: number;
      approvedAssessments: number;
      readyToFinalize: boolean;
      studentsCovered: number;
      passRate: number | null;
      reason: "pending_finalization" | "low_pass_rate";
    }> = [];

    for (const c of courses) {
      if (c.assessments.length === 0) continue;

      const alreadyRatified = await prisma.examBoardRatification.findFirst({ where: { courseId: c.id } });
      if (alreadyRatified) continue; // the board has already dealt with this unit

      const status = await getCourseProcessingStatus(c.id);
      if (!status) continue;

      const { studentsCovered, passRate } = await getCoursePassRate(c.id);

      const base = {
        courseId: status.courseId,
        unitCode: status.unitCode,
        unitTitle: status.unitTitle,
        totalAssessments: status.totalAssessments,
        approvedAssessments: status.approvedAssessments,
        readyToFinalize: status.readyToFinalize,
        studentsCovered,
        passRate,
      };

      if (status.alreadyFinalizedCount === 0) {
        if (status.approvedAssessments > 0) {
          // Some, but not all, of this unit's assessments have approved
          // results — a unit stuck partway through the chain is exactly
          // what an exam board meeting should surface, not something that
          // silently waits forever.
          flagged.push({ ...base, reason: "pending_finalization" });
        }
        continue;
      }

      if (passRate !== null && passRate < FLAG_PASS_RATE_THRESHOLD) {
        flagged.push({ ...base, reason: "low_pass_rate" });
      }
    }

    res.json(flagged);
  }
);

const examBoardRatifySchema = z.object({
  meetingId: z.string(),
  courseId: z.string(),
  notes: z.string().optional(),
});

governanceRouter.post(
  "/examination-board/ratify",
  requireAuth,
  requireRole("PRINCIPAL", "REGISTRAR", "QA_OFFICER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = examBoardRatifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide meetingId and courseId." });

    const meeting = await prisma.meeting.findUnique({ where: { id: parsed.data.meetingId } });
    if (!meeting) return res.status(404).json({ message: "Meeting not found." });
    if (meeting.committee !== "Examination Board") {
      return res.status(400).json({ message: "This action can only be recorded against an Examination Board meeting." });
    }

    const course = await prisma.course.findUnique({ where: { id: parsed.data.courseId } });
    if (!course) return res.status(404).json({ message: "Course not found." });

    const { studentsCovered, passRate } = await getCoursePassRate(course.id);
    if (studentsCovered === 0) {
      return res.status(400).json({ message: "This unit has no finalized results yet — nothing for the board to ratify." });
    }

    const ratification = await prisma.examBoardRatification.upsert({
      where: { meetingId_courseId: { meetingId: parsed.data.meetingId, courseId: parsed.data.courseId } },
      create: {
        meetingId: parsed.data.meetingId,
        courseId: parsed.data.courseId,
        studentsCovered,
        passRate,
        notes: parsed.data.notes,
        ratifiedById: req.user!.id,
      },
      update: { studentsCovered, passRate, notes: parsed.data.notes, ratifiedById: req.user!.id, ratifiedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "EXAM_BOARD_RATIFIED_RESULTS",
        entityType: "Course",
        entityId: course.id,
        metadata: { meetingId: parsed.data.meetingId, passRate, studentsCovered },
      },
    });

    res.status(201).json(ratification);
  }
);

governanceRouter.get(
  "/examination-board/ratifications/:courseId",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "QA_OFFICER", "REGISTRAR", "PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const rows = await prisma.examBoardRatification.findMany({
      where: { courseId: req.params.courseId },
      include: { meeting: { select: { title: true, scheduledAt: true } } },
      orderBy: { ratifiedAt: "desc" },
    });
    res.json(rows);
  }
);

// ---------------------------------------------------------------------------
// RG030 — Academic Board. Ratifies the graduation decision for one student
// at one board meeting — the institutional sign-off that sits above
// GraduationClearance (RG017, the registrar's own live eligibility check —
// see graduation.ts). Deliberately one row per student rather than a single
// batch action, so a board deferring one student in a cohort never blocks
// ratifying the rest. Ratifying "graduate" is a real event, not just a
// record: it moves Student.academicStatus to GRADUATED.
// ---------------------------------------------------------------------------

const academicBoardRatifySchema = z.object({
  meetingId: z.string(),
  studentId: z.string(),
  decision: z.enum(["graduate", "defer", "withhold"]),
  notes: z.string().optional(),
});

governanceRouter.post(
  "/academic-board/ratify-graduation",
  requireAuth,
  requireRole("PRINCIPAL", "REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = academicBoardRatifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide meetingId, studentId, and decision." });

    const meeting = await prisma.meeting.findUnique({ where: { id: parsed.data.meetingId } });
    if (!meeting) return res.status(404).json({ message: "Meeting not found." });
    if (meeting.committee !== "Academic Board") {
      return res.status(400).json({ message: "This action can only be recorded against an Academic Board meeting." });
    }

    const student = await prisma.student.findUnique({ where: { id: parsed.data.studentId } });
    if (!student) return res.status(404).json({ message: "Student not found." });

    const ratification = await prisma.academicBoardRatification.upsert({
      where: { meetingId_studentId: { meetingId: parsed.data.meetingId, studentId: parsed.data.studentId } },
      create: {
        meetingId: parsed.data.meetingId,
        studentId: parsed.data.studentId,
        decision: parsed.data.decision,
        notes: parsed.data.notes,
        ratifiedById: req.user!.id,
      },
      update: {
        decision: parsed.data.decision,
        notes: parsed.data.notes,
        ratifiedById: req.user!.id,
        ratifiedAt: new Date(),
      },
    });

    if (parsed.data.decision === "graduate") {
      await prisma.student.update({ where: { id: student.id }, data: { academicStatus: "GRADUATED" } });
      // Batch 65 — VBI006: graduation is a status change like any other —
      // tell the Lab so a graduated student's account is deactivated there too.
      emitPortalEvent({
        eventType: "student.status_changed",
        entityType: "Student",
        entityId: student.id,
        payload: { portalStudentId: student.id, status: "GRADUATED" },
      }).catch((err) => console.error("Failed to queue student.status_changed for VBL sync", err));
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: `ACADEMIC_BOARD_${parsed.data.decision.toUpperCase()}`,
        entityType: "Student",
        entityId: student.id,
        metadata: { meetingId: parsed.data.meetingId },
      },
    });

    res.status(201).json(ratification);
  }
);

governanceRouter.get(
  "/academic-board/ratifications/:studentId",
  requireAuth,
  requireRole("PRINCIPAL", "REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const rows = await prisma.academicBoardRatification.findMany({
      where: { studentId: req.params.studentId },
      include: { meeting: { select: { title: true, scheduledAt: true } } },
      orderBy: { ratifiedAt: "desc" },
    });
    res.json(rows);
  }
);
