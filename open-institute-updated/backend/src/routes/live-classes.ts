// TP026 — Live teaching for CUSTOM-engine courses.
//
// A session runs in one of two ways:
//   * provider "BBB"      — the built-in BigBlueButton room (needs
//                           BBB_SERVER_URL + BBB_SHARED_SECRET on the backend);
//   * provider "EXTERNAL" — any meeting link the trainer already uses (Google
//                           Meet, Zoom, Teams). Needs NO server-side
//                           infrastructure, so live teaching works on every
//                           deployment, including one with no BBB server.
// Either way the session is scheduled here, enrolled students are notified,
// joins are recorded server-side (who actually opened the link), attendance
// can be saved from those joins, and the trainer can attach the recording.
//
// Independent of the Moodle-only bigbluebuttonbn reader in moodle/liveClasses.ts.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import {
  BbbNotConfiguredError,
  buildJoinUrl,
  createMeeting,
  endMeeting,
  generateMeetingId,
  generatePassword,
  isBbbConfigured,
  isMeetingRunning,
} from "../lib/bigbluebutton.js";
import { isHttpUrl } from "../lib/lesson-blocks.js";
import { isStaleLive, joinOpensAt, sessionDay } from "../lib/live-class-utils.js";
import { canTeachCourse, canViewCourseAsStaff } from "../lib/course-access.js";

const router = Router();

const httpUrl = z.string().max(2048).refine(isHttpUrl, "Must be an http(s) link.");

const scheduleSchema = z
  .object({
    courseId: z.string(),
    title: z.string().min(2).max(200),
    description: z.string().max(2000).optional(),
    scheduledAt: z.string().datetime(),
    durationMinutes: z.number().int().min(5).max(600).default(60),
    provider: z.enum(["BBB", "EXTERNAL"]).default("BBB"),
    externalUrl: httpUrl.optional(),
  })
  .refine((d) => d.provider !== "EXTERNAL" || !!d.externalUrl, { message: "Paste the meeting link for an external session.", path: ["externalUrl"] });

const editSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(5).max(600).optional(),
  externalUrl: httpUrl.optional(),
});

const strip = <T extends Record<string, unknown>>(s: T) => {
  const { moderatorPassword: _m, attendeePassword: _a, ...rest } = s as T & { moderatorPassword?: string; attendeePassword?: string };
  return rest; // passwords never leave the server — /join resolves the right one
};

async function enrolledStudents(unitId: string) {
  return prisma.enrollment.findMany({
    where: { unitId, status: "in_progress" },
    include: { student: { select: { id: true, userId: true, fullName: true } } },
  });
}

async function notifyEnrolled(unitId: string, title: string, body: string) {
  const enrolled = await enrolledStudents(unitId);
  if (enrolled.length === 0) return 0;
  await prisma.notification.createMany({
    data: enrolled.map((e: { student: { userId: string } }) => ({ userId: e.student.userId, channel: "in_app", title, body, sentAt: new Date() })),
  });
  return enrolled.length;
}

const when = (d: Date) => d.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: process.env.INSTITUTION_TZ ?? "Africa/Nairobi" });

/** Marks sessions the host never ended as ENDED, so they don't show as live forever. */
async function reconcile<T extends { id: string; status: string; scheduledAt: Date; durationMinutes: number }>(sessions: T[]): Promise<T[]> {
  const stale = sessions.filter((s) => isStaleLive(s.status, s.scheduledAt, s.durationMinutes));
  if (stale.length === 0) return sessions;
  await prisma.liveClassSession.updateMany({ where: { id: { in: stale.map((s) => s.id) } }, data: { status: "ENDED", endedAt: new Date() } });
  const ids = new Set(stale.map((s) => s.id));
  return sessions.map((s) => (ids.has(s.id) ? { ...s, status: "ENDED" } : s));
}

async function loadHosted(req: AuthedRequest, res: { status: (n: number) => { json: (b: unknown) => unknown } }, id: string) {
  const session = await prisma.liveClassSession.findUnique({ where: { id }, include: { course: true } });
  if (!session) {
    res.status(404).json({ message: "Live class not found." });
    return null;
  }
  if (session.hostUserId !== req.user!.id && req.user!.role !== "SUPER_ADMIN") {
    res.status(403).json({ message: "Only the host can do that." });
    return null;
  }
  return session;
}

// Lets the UI default to the right provider on this deployment.
router.get("/config", requireAuth, (_req, res) => {
  res.json({ bbbConfigured: isBbbConfigured() });
});

// Everything this trainer hosts, across courses.
router.get("/mine", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const sessions = await prisma.liveClassSession.findMany({
    where: { hostUserId: req.user!.id },
    include: { course: { select: { id: true, title: true } }, _count: { select: { attendees: true } } },
    orderBy: { scheduledAt: "desc" },
    take: 200,
  });
  const fresh = await reconcile(sessions);
  res.json(fresh.map((s: any) => ({ ...strip(s), attendeeCount: s._count.attendees })));
});

router.post("/", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues?.[0]?.message ?? "Provide a course, title, and start time." });
  }
  const d = parsed.data;

  if (!(await canTeachCourse(req.user!, d.courseId))) return res.status(404).json({ message: "Course not found, or you don't teach it." });
  const course = await prisma.course.findUnique({ where: { id: d.courseId } });
  if (!course) return res.status(404).json({ message: "Course not found, or you don't teach it." });
  if (course.lmsEngine !== "CUSTOM") {
    return res.status(400).json({ message: "This course is delivered through Moodle — schedule its live classes there." });
  }
  const startsAt = new Date(d.scheduledAt);
  if (startsAt.getTime() < Date.now() - 5 * 60_000) return res.status(400).json({ message: "The start time is in the past." });

  const meetingId = generateMeetingId(course.id);
  const moderatorPassword = generatePassword();
  const attendeePassword = generatePassword();

  const session = await prisma.liveClassSession.create({
    data: {
      courseId: course.id,
      title: d.title,
      description: d.description ?? null,
      hostUserId: req.user!.id,
      meetingId,
      moderatorPassword,
      attendeePassword,
      scheduledAt: startsAt,
      durationMinutes: d.durationMinutes,
      provider: d.provider,
      externalUrl: d.provider === "EXTERNAL" ? d.externalUrl : null,
    },
  });

  // BBB "create" is attempted opportunistically; it's retried on the host's first join.
  if (d.provider === "BBB" && isBbbConfigured()) {
    await createMeeting({ meetingId, title: d.title, moderatorPassword, attendeePassword, durationMinutes: d.durationMinutes }).catch(() => undefined);
  }

  const notified = await notifyEnrolled(course.unitId, `Live class scheduled: ${d.title}`, `${course.title} — ${when(startsAt)} (${d.durationMinutes} min). Join from your course page.`);
  res.status(201).json({ ...strip(session), bbbConfigured: isBbbConfigured(), studentsNotified: notified });
});

// Reschedule / edit a session that hasn't started.
router.patch("/:id", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = editSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues?.[0]?.message ?? "Invalid update." });
  const session = await loadHosted(req, res, req.params.id);
  if (!session) return;
  if (session.status !== "SCHEDULED") return res.status(409).json({ message: "Only a not-yet-started session can be edited." });
  if (parsed.data.externalUrl !== undefined && session.provider !== "EXTERNAL") {
    return res.status(400).json({ message: "Only an external-link session has a meeting link." });
  }
  const newStart = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;
  if (newStart && newStart.getTime() < Date.now() - 5 * 60_000) return res.status(400).json({ message: "The start time is in the past." });

  const updated = await prisma.liveClassSession.update({
    where: { id: session.id },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(newStart ? { scheduledAt: newStart } : {}),
      ...(parsed.data.durationMinutes !== undefined ? { durationMinutes: parsed.data.durationMinutes } : {}),
      ...(parsed.data.externalUrl !== undefined ? { externalUrl: parsed.data.externalUrl } : {}),
    },
  });
  if (newStart && newStart.getTime() !== session.scheduledAt.getTime()) {
    await notifyEnrolled(session.course.unitId, `Live class rescheduled: ${updated.title}`, `${session.course.title} is now ${when(newStart)}.`);
  }
  res.json(strip(updated));
});

// List sessions for a course — its trainer/oversight staff, or an enrolled student.
router.get("/course/:courseId", requireAuth, async (req: AuthedRequest, res) => {
  const course = await prisma.course.findUnique({ where: { id: req.params.courseId } });
  if (!course) return res.status(404).json({ message: "Course not found." });

  const staff = await canViewCourseAsStaff(req.user!, course.id);
  if (!staff) {
    const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
    const enrolled =
      student &&
      (await prisma.enrollment.findFirst({ where: { studentId: student.id, unitId: course.unitId, status: "in_progress" } }));
    if (!enrolled) return res.status(403).json({ message: "You don't have access to this course's live classes." });
  }

  const sessions = await prisma.liveClassSession.findMany({
    where: { courseId: req.params.courseId },
    include: { _count: { select: { attendees: true } } },
    orderBy: { scheduledAt: "desc" },
  });
  const fresh = await reconcile(sessions);
  res.json(
    fresh.map((s: any) => {
      const base = { ...strip(s), attendeeCount: s._count.attendees };
      // Students only see the meeting link through /join, and a recording once the class is over.
      if (!staff) {
        const { externalUrl: _u, ...rest } = base as typeof base & { externalUrl?: string };
        return { ...rest, recordingUrl: s.status === "ENDED" ? s.recordingUrl : null };
      }
      return base;
    })
  );
});

// Resolves the join link for the caller: moderator if they're the host (or
// SUPER_ADMIN), attendee if they're enrolled in the unit. Records who joined.
router.post("/:id/join", requireAuth, async (req: AuthedRequest, res) => {
  const session = await prisma.liveClassSession.findUnique({ where: { id: req.params.id }, include: { course: true } });
  if (!session) return res.status(404).json({ message: "Live class not found." });
  if (session.status === "ENDED" || session.status === "CANCELLED") {
    return res.status(409).json({ message: "This session has ended." });
  }

  const isHost = session.hostUserId === req.user!.id || req.user!.role === "SUPER_ADMIN";
  let fullName: string;
  let password: string;

  if (isHost) {
    password = session.moderatorPassword;
    const trainer = await prisma.trainer.findUnique({ where: { userId: req.user!.id } });
    fullName = trainer?.fullName ?? "Trainer";
  } else {
    const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
    const enrolled =
      student &&
      (await prisma.enrollment.findFirst({
        where: { studentId: student.id, unitId: session.course.unitId, status: "in_progress" },
      }));
    if (!enrolled || !student) return res.status(403).json({ message: "You're not enrolled in this course." });
    if (session.status === "SCHEDULED" && Date.now() < joinOpensAt(session.scheduledAt).getTime()) {
      return res.status(409).json({ message: "This class hasn't opened yet — you can join 10 minutes before it starts." });
    }
    password = session.attendeePassword;
    fullName = student.fullName;
  }

  const recordJoin = () =>
    prisma.liveClassAttendee.upsert({
      where: { sessionId_userId: { sessionId: session.id, userId: req.user!.id } },
      update: {},
      create: { sessionId: session.id, userId: req.user!.id, role: isHost ? "host" : "attendee" },
    });
  const markLive = async () => {
    if (session.status === "SCHEDULED") {
      await prisma.liveClassSession.update({ where: { id: session.id }, data: { status: "LIVE", startedAt: new Date() } });
    }
  };

  // External meeting: just hand over the link (the host opening it starts the class).
  if (session.provider === "EXTERNAL") {
    if (!session.externalUrl) return res.status(409).json({ message: "This session has no meeting link yet." });
    if (isHost) await markLive();
    await recordJoin();
    return res.json({ joinUrl: session.externalUrl, provider: "EXTERNAL" });
  }

  try {
    if (!isBbbConfigured()) throw new BbbNotConfiguredError();
    const running = await isMeetingRunning(session.meetingId).catch(() => false);
    if (isHost) {
      // Lazily (re)create the room if it isn't already running.
      if (!running) {
        await createMeeting({
          meetingId: session.meetingId,
          title: session.title,
          moderatorPassword: session.moderatorPassword,
          attendeePassword: session.attendeePassword,
          durationMinutes: session.durationMinutes,
        });
      }
      await markLive();
    } else if (!running) {
      return res.status(409).json({ message: "Your trainer hasn't started this class yet. Try again in a moment." });
    }
    const joinUrl = buildJoinUrl({ meetingId: session.meetingId, fullName, password });
    await recordJoin();
    res.json({ joinUrl, provider: "BBB" });
  } catch (err) {
    if (err instanceof BbbNotConfiguredError) {
      return res.status(503).json({ message: "The built-in video server isn't set up on this system. Ask your trainer to use a meeting link instead." });
    }
    res.status(502).json({ message: "Could not reach the video conferencing server. Try again shortly." });
  }
});

router.get("/:id/status", requireAuth, async (req: AuthedRequest, res) => {
  const session = await prisma.liveClassSession.findUnique({ where: { id: req.params.id } });
  if (!session) return res.status(404).json({ message: "Live class not found." });
  if (session.provider === "EXTERNAL" || !isBbbConfigured()) {
    return res.json({ status: session.status, live: session.status === "LIVE", configured: session.provider === "EXTERNAL" ? true : false });
  }
  const live = await isMeetingRunning(session.meetingId).catch(() => false);
  res.json({ status: session.status, live, configured: true });
});

// Host ends the session for everyone.
router.patch("/:id/end", requireAuth, async (req: AuthedRequest, res) => {
  const session = await loadHosted(req, res, req.params.id);
  if (!session) return;
  if (session.provider === "BBB" && isBbbConfigured()) {
    await endMeeting(session.meetingId, session.moderatorPassword).catch(() => undefined);
  }
  const updated = await prisma.liveClassSession.update({
    where: { id: session.id },
    data: { status: "ENDED", endedAt: new Date() },
  });
  res.json(strip(updated));
});

// Cancel a session that hasn't started yet, and tell the class.
router.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const session = await loadHosted(req, res, req.params.id);
  if (!session) return;
  if (session.status !== "SCHEDULED") {
    return res.status(409).json({ message: "Only a not-yet-started session can be cancelled." });
  }
  const updated = await prisma.liveClassSession.update({ where: { id: session.id }, data: { status: "CANCELLED" } });
  await notifyEnrolled(session.course.unitId, `Live class cancelled: ${session.title}`, `${session.course.title} — the session planned for ${when(session.scheduledAt)} was cancelled.`);
  res.json(strip(updated));
});

// ---- attendance from real joins ---------------------------------------------------
// The roster with who opened the join link pre-marked. The trainer reviews it
// (an external meeting can be entered without going through this page) and saves.
router.get("/:id/attendance", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const session = await loadHosted(req, res, req.params.id);
  if (!session) return;
  const day = sessionDay(session.scheduledAt);
  const [enrolled, joins, existing] = await Promise.all([
    enrolledStudents(session.course.unitId),
    prisma.liveClassAttendee.findMany({ where: { sessionId: session.id } }),
    prisma.attendanceRecord.findMany({ where: { courseId: session.courseId, sessionDate: day } }),
  ]);
  const joinByUser = new Map<string, Date>(joins.map((j: { userId: string; joinedAt: Date }) => [j.userId, j.joinedAt]));
  const recorded = new Map<string, boolean>(existing.map((r: { studentId: string; present: boolean }) => [r.studentId, r.present]));
  res.json({
    session: {
      id: session.id,
      title: session.title,
      status: session.status,
      provider: session.provider,
      scheduledAt: session.scheduledAt,
      attendanceDate: day.toISOString(),
      attendanceSyncedAt: session.attendanceSyncedAt,
    },
    roster: enrolled
      .map((e: { student: { id: string; userId: string; fullName: string } }) => ({
        studentId: e.student.id,
        fullName: e.student.fullName,
        joined: joinByUser.has(e.student.userId),
        joinedAt: joinByUser.get(e.student.userId) ?? null,
        recordedPresent: recorded.has(e.student.id) ? recorded.get(e.student.id)! : null,
      }))
      .sort((a: { fullName: string }, b: { fullName: string }) => a.fullName.localeCompare(b.fullName)),
  });
});

router.post("/:id/attendance", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = z.object({ records: z.array(z.object({ studentId: z.string(), present: z.boolean() })).min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide the attendance list." });
  const session = await loadHosted(req, res, req.params.id);
  if (!session) return;

  const enrolled = await enrolledStudents(session.course.unitId);
  const ok = new Set<string>(enrolled.map((e: { student: { id: string } }) => e.student.id));
  if (parsed.data.records.some((r) => !ok.has(r.studentId))) return res.status(400).json({ message: "One or more students aren't enrolled in this course." });

  const day = sessionDay(session.scheduledAt);
  await prisma.$transaction([
    ...parsed.data.records.map((r) =>
      prisma.attendanceRecord.upsert({
        where: { studentId_courseId_sessionDate: { studentId: r.studentId, courseId: session.courseId, sessionDate: day } },
        update: { present: r.present, recordedById: req.user!.id },
        create: { studentId: r.studentId, courseId: session.courseId, sessionDate: day, present: r.present, recordedById: req.user!.id },
      })
    ),
    prisma.liveClassSession.update({ where: { id: session.id }, data: { attendanceSyncedAt: new Date() } }),
  ]);
  res.status(201).json({ count: parsed.data.records.length });
});

// Attach a recording link (e.g. from BBB's recordings or the external tool) for students to watch afterwards.
router.patch("/:id/recording", requireAuth, requireRole("TRAINER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = z.object({ recordingUrl: httpUrl.nullable() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Paste a valid http(s) link." });
  const session = await loadHosted(req, res, req.params.id);
  if (!session) return;
  const updated = await prisma.liveClassSession.update({ where: { id: session.id }, data: { recordingUrl: parsed.data.recordingUrl } });
  res.json(strip(updated));
});

export default router;
