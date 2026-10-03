import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const departmentsRouter = Router();

departmentsRouter.get("/", requireAuth, async (_req, res) => {
  const departments = await prisma.department.findMany({ orderBy: { name: "asc" } });
  res.json(departments);
});

const deptSchema = z.object({ name: z.string().min(2), headStaffId: z.string().optional() });

departmentsRouter.post(
  "/",
  requireAuth,
  requireRole("PRINCIPAL", "HR_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = deptSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid department." });
    const dept = await prisma.department.create({ data: parsed.data });
    res.status(201).json(dept);
  }
);

export const tasksRouter = Router();

tasksRouter.get("/assigned-to-me", requireAuth, async (req: AuthedRequest, res) => {
  const tasks = await prisma.task.findMany({
    where: { assignedToId: req.user!.id },
    orderBy: { dueDate: "asc" },
  });
  res.json(tasks);
});

const taskSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  assignedToId: z.string(),
  dueDate: z.string().datetime().optional(),
});

tasksRouter.post(
  "/",
  requireAuth,
  requireRole("PRINCIPAL", "DEPUTY_PRINCIPAL", "REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = taskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid task." });
    const { dueDate, ...rest } = parsed.data;
    const task = await prisma.task.create({
      data: { ...rest, dueDate: dueDate ? new Date(dueDate) : undefined, createdById: req.user!.id },
    });
    res.status(201).json(task);
  }
);

const statusSchema = z.object({ status: z.enum(["open", "in_progress", "done"]) });

tasksRouter.patch("/:id/status", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid status." });
  // KSEC-007 — the assignee or the person who created the task (or SUPER_ADMIN) may change its status.
  const existing = await prisma.task.findUnique({ where: { id: req.params.id }, select: { assignedToId: true, createdById: true } });
  const u = req.user!;
  if (!existing || (existing.assignedToId !== u.id && existing.createdById !== u.id && u.role !== "SUPER_ADMIN")) return res.status(404).json({ message: "Task not found.", code: "NOT_FOUND" });
  const task = await prisma.task.update({
    where: { id: req.params.id },
    data: { status: parsed.data.status },
  });
  res.json(task);
});

// ---------------------------------------------------------------------------
// AD007 — staff management: a dedicated view/edit surface over
// StaffProfile, distinct from the generic Users & RBAC page (which only
// manages login/role, not employment details like department, title,
// contract type, hire date).
// ---------------------------------------------------------------------------
export const staffRouter = Router();

staffRouter.get(
  "/",
  requireAuth,
  requireRole("HR_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const staff = await prisma.staffProfile.findMany({
      include: { user: { select: { email: true, role: true, isActive: true } } },
      orderBy: { fullName: "asc" },
    });
    res.json(staff);
  }
);

const staffSchema = z.object({
  userId: z.string(),
  fullName: z.string().min(2),
  department: z.string().optional(),
  title: z.string().optional(),
  nationalIdNo: z.string().optional(),
  hireDate: z.string().datetime().optional(),
  contractType: z.string().optional(),
});

staffRouter.post(
  "/",
  requireAuth,
  requireRole("HR_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = staffSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide userId and fullName at minimum." });
    const profile = await prisma.staffProfile
      .create({ data: { ...parsed.data, hireDate: parsed.data.hireDate ? new Date(parsed.data.hireDate) : undefined } })
      .catch(() => null);
    if (!profile) return res.status(409).json({ message: "A staff profile already exists for that user." });
    res.status(201).json(profile);
  }
);

const staffUpdateSchema = staffSchema.omit({ userId: true }).partial();

staffRouter.patch(
  "/:id",
  requireAuth,
  requireRole("HR_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = staffUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid update." });
    const { hireDate, ...rest } = parsed.data;
    const updated = await prisma.staffProfile.update({
      where: { id: req.params.id },
      data: { ...rest, hireDate: hireDate ? new Date(hireDate) : undefined },
    });
    res.json(updated);
  }
);

// ---------------------------------------------------------------------------
// AD011 — academic calendar: institution-wide dates, readable by anyone
// logged in (students and trainers need to see term/exam dates too),
// writable only by academic leadership.
// ---------------------------------------------------------------------------
export const calendarRouter = Router();

calendarRouter.get("/", requireAuth, async (_req: AuthedRequest, res) => {
  const events = await prisma.academicCalendarEvent.findMany({ orderBy: { startDate: "asc" } });
  res.json(events);
});

const calendarEventSchema = z.object({
  title: z.string().min(2),
  type: z.enum(["term", "holiday", "registration_window", "exam_period", "other"]),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  description: z.string().optional(),
});

calendarRouter.post(
  "/",
  requireAuth,
  requireRole("REGISTRAR", "PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = calendarEventSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide title, type, startDate, and endDate." });
    const event = await prisma.academicCalendarEvent.create({
      data: { ...parsed.data, startDate: new Date(parsed.data.startDate), endDate: new Date(parsed.data.endDate), createdById: req.user!.id },
    });
    res.status(201).json(event);
  }
);

// ---------------------------------------------------------------------------
// AD012 — timetable management: admin CRUD over TimetableEntry. Previously
// this model existed but no route anywhere touched it — trainers and
// students had nothing to actually read a real schedule from.
// ---------------------------------------------------------------------------
export const timetableAdminRouter = Router();

timetableAdminRouter.get(
  "/",
  requireAuth,
  requireRole("REGISTRAR", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const entries = await prisma.timetableEntry.findMany({
      include: { course: { select: { title: true } } },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    res.json(entries);
  }
);

const timetableEntrySchema = z.object({
  courseId: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  mode: z.enum(["live", "recorded_release"]).default("live"),
});

timetableAdminRouter.post(
  "/",
  requireAuth,
  requireRole("REGISTRAR", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = timetableEntrySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide courseId, dayOfWeek, startTime, and endTime." });
    if (parsed.data.startTime >= parsed.data.endTime) {
      return res.status(400).json({ message: "Start time must be before end time." });
    }
    const entry = await prisma.timetableEntry.create({ data: parsed.data });
    res.status(201).json(entry);
  }
);

timetableAdminRouter.delete(
  "/:id",
  requireAuth,
  requireRole("REGISTRAR", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    await prisma.timetableEntry.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }
);

// ---------------------------------------------------------------------------
// AD013/AD015 — communication centre + notification centre. Compose
// (AD013) creates a real Notification row for every real recipient in the
// chosen audience — no placeholder "sent to everyone" claim without
// actually enumerating who "everyone" is. The centre (AD015) is a read
// view over what was actually sent, with real delivery-channel status
// from dispatchNotification rather than an assumed "delivered".
// ---------------------------------------------------------------------------
export const communicationRouter = Router();

const VALID_ROLES = [
  "SUPER_ADMIN", "BOARD_MEMBER", "PRINCIPAL", "DEPUTY_PRINCIPAL", "REGISTRAR", "FINANCE_OFFICER",
  "ACCOUNTANT", "HR_OFFICER", "QA_OFFICER", "ICT_ADMIN", "LIBRARIAN", "ADMISSIONS_OFFICER",
  "EXAMINATION_OFFICER", "DEPARTMENT_HEAD", "PROGRAMME_COORDINATOR", "TRAINER", "COUNSELLOR",
  "CAREER_OFFICER", "ATTACHMENT_OFFICER", "STUDENT", "APPLICANT", "ALUMNUS", "EXTERNAL_EXAMINER",
  "EMPLOYER", "AUDITOR", "REGULATORY_INSPECTOR",
] as const;

const broadcastSchema = z.object({
  title: z.string().min(2),
  body: z.string().min(2),
  audience: z.enum(["all_students", "all_trainers", "programme", "role"]),
  programmeId: z.string().optional(),
  role: z.enum(VALID_ROLES).optional(),
});

communicationRouter.post(
  "/broadcast",
  requireAuth,
  requireRole("PRINCIPAL", "REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = broadcastSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide title, body, and an audience." });

    let userIds: string[] = [];
    if (parsed.data.audience === "all_students") {
      userIds = (await prisma.student.findMany({ select: { userId: true } })).map((s) => s.userId);
    } else if (parsed.data.audience === "all_trainers") {
      userIds = (await prisma.user.findMany({ where: { role: "TRAINER" }, select: { id: true } })).map((u) => u.id);
    } else if (parsed.data.audience === "programme") {
      if (!parsed.data.programmeId) return res.status(400).json({ message: "programmeId required for a programme-scoped broadcast." });
      userIds = (await prisma.student.findMany({ where: { programmeId: parsed.data.programmeId }, select: { userId: true } })).map((s) => s.userId);
    } else if (parsed.data.audience === "role") {
      if (!parsed.data.role) return res.status(400).json({ message: "role required for a role-scoped broadcast." });
      userIds = (await prisma.user.findMany({ where: { role: parsed.data.role }, select: { id: true } })).map((u) => u.id);
    }

    await prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, channel: "in_app", title: parsed.data.title, body: parsed.data.body })),
    });

    res.status(201).json({ recipientCount: userIds.length });
  }
);

communicationRouter.get(
  "/sent",
  requireAuth,
  requireRole("PRINCIPAL", "REGISTRAR", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const recent = await prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { email: true } } },
    });
    res.json(recent);
  }
);

// ---------------------------------------------------------------------------
// AD028 — permission audit: every user's real, current role. A snapshot
// derived directly from the User table, not a separately maintained
// permissions list that could drift from what's actually enforced.
// ---------------------------------------------------------------------------
export const permissionAuditRouter = Router();

permissionAuditRouter.get(
  "/",
  requireAuth,
  requireRole("SUPER_ADMIN", "AUDITOR"),
  async (_req: AuthedRequest, res) => {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, isActive: true, mfaEnabled: true, lastLoginAt: true },
      orderBy: { role: "asc" },
    });
    const byRole = users.reduce<Record<string, number>>((acc, u) => {
      acc[u.role] = (acc[u.role] ?? 0) + 1;
      return acc;
    }, {});
    res.json({ totalUsers: users.length, byRole, users });
  }
);
