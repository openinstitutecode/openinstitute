// Batch 68 — student self-service quick wins (read-only, no schema change).
//   KFEAT-041 GET /fee-account   KFEAT-043 GET /statement   KFEAT-009 GET /calendar.ics   KFEAT-002 GET /progression
// Batch 69: KFEAT-007 GET /engagement   KFEAT-020 GET /workload   KDATA-007/009 GET /data-export
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { buildStatement, classifyInvoice, buildIcs, weekBuckets, mondayKey } from "../lib/quickwins.js";
import { notFound } from "../middleware/error-handler.js";
import { z } from "zod";
import { idempotent } from "../lib/idempotency.js";
import { DATA_REQUEST_TYPES, dueDateFor, requestUrgency } from "../lib/data-requests.js";

export const selfServiceRouter = Router();

async function me(req: AuthedRequest) {
  const s = await prisma.student.findUnique({ where: { userId: req.user!.id }, include: { programme: { select: { name: true } } } });
  if (!s) throw notFound("No student record for this account.");
  return s;
}

selfServiceRouter.get("/fee-account", requireAuth, async (req: AuthedRequest, res) => {
  const s = await me(req);
  const [invoices, holds] = await Promise.all([
    prisma.invoice.findMany({ where: { studentId: s.id }, orderBy: { dueDate: "asc" } }),
    prisma.financialHold.findMany({ where: { studentId: s.id, releasedAt: null } }),
  ]);
  const now = new Date();
  const rows = invoices.map((i) => ({ id: i.id, semester: i.semester, dueDate: i.dueDate, amountDue: Number(i.amountDue), amountPaid: Number(i.amountPaid), ...classifyInvoice(i, now) }));
  const outstanding = rows.reduce((a, r) => a + r.outstanding, 0);
  const next = rows.find((r) => r.bucket !== "settled") ?? null;
  res.json({
    outstanding: Math.round(outstanding * 100) / 100,
    overdueCount: rows.filter((r) => r.bucket === "overdue").length,
    nextDue: next && { invoiceId: next.id, semester: next.semester, dueDate: next.dueDate, outstanding: next.outstanding, bucket: next.bucket },
    activeHolds: holds.length,
    invoices: rows,
  });
});

selfServiceRouter.get("/statement", requireAuth, async (req: AuthedRequest, res) => {
  const s = await me(req);
  const invoices = await prisma.invoice.findMany({ where: { studentId: s.id }, include: { payments: true } });
  const st = buildStatement(invoices);
  if (req.query.format === "csv") {
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = ["Date,Type,Description,Debit,Credit,Balance", ...st.lines.map((l) => [l.date.slice(0, 10), l.type, q(l.description), l.debit, l.credit, l.balance].join(","))].join("\n");
    res.setHeader("Content-Disposition", `attachment; filename="statement-${s.studentNumber}.csv"`);
    return res.type("text/csv").send(csv);
  }
  res.json({ student: { name: s.fullName, studentNumber: s.studentNumber, programme: s.programme.name }, generatedAt: new Date().toISOString(), ...st });
});

selfServiceRouter.get("/calendar.ics", requireAuth, async (req: AuthedRequest, res) => {
  const s = await me(req);
  const now = new Date();
  const [enrolled, events] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId: s.id, status: "in_progress" },
      include: { unit: { include: { courses: { include: { timetableEntries: true } } } } },
    }),
    prisma.academicCalendarEvent.findMany({ where: { endDate: { gte: now } }, orderBy: { startDate: "asc" }, take: 100 }),
  ]);
  const timetable = enrolled.flatMap((e) => e.unit.courses.flatMap((c) => c.timetableEntries.map((t) => ({
    uid: t.id, title: `${e.unit.code} ${c.title}`, dayOfWeek: t.dayOfWeek, startTime: t.startTime, endTime: t.endTime, mode: t.mode,
  }))));
  const ics = buildIcs({ name: `${s.fullName} — Measur Business College`, timetable, events: events.map((e) => ({ uid: e.id, title: e.title, startDate: e.startDate, endDate: e.endDate, description: e.description })) });
  res.setHeader("Content-Disposition", 'attachment; filename="measur-business-college-calendar.ics"');
  res.type("text/calendar").send(ics);
});

selfServiceRouter.get("/progression", requireAuth, async (req: AuthedRequest, res) => {
  const s = await me(req);
  const enr = await prisma.enrollment.findMany({ where: { studentId: s.id }, include: { unit: { select: { code: true, title: true, creditHours: true, semester: true } } }, orderBy: { createdAt: "asc" } });
  const totalUnits = await prisma.unit.count({ where: { programmeId: s.programmeId } });
  const byStatus: Record<string, number> = {};
  const bySemester: Record<string, { completed: number; failed: number; inProgress: number; creditsEarned: number }> = {};
  let creditsEarned = 0;
  for (const e of enr) {
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
    const b = (bySemester[e.semester] ??= { completed: 0, failed: 0, inProgress: 0, creditsEarned: 0 });
    if (e.status === "completed") { b.completed++; b.creditsEarned += e.unit.creditHours; creditsEarned += e.unit.creditHours; }
    else if (e.status === "failed") b.failed++;
    else if (e.status === "in_progress") b.inProgress++;
  }
  const completedUnits = new Set(enr.filter((e) => e.status === "completed").map((e) => e.unitId)).size;
  res.json({
    programme: s.programme.name, academicStatus: s.academicStatus, totalUnitsInProgramme: totalUnits, completedUnits,
    percentComplete: totalUnits ? Math.round((completedUnits / totalUnits) * 100) : 0, creditsEarned, byStatus, bySemester,
    toRepeat: enr.filter((e) => e.status === "failed").map((e) => ({ code: e.unit.code, title: e.unit.title, semester: e.semester })),
  });
});

// KFEAT-007 — the student's own study time and lesson completions, last 8 weeks.
selfServiceRouter.get("/engagement", requireAuth, async (req: AuthedRequest, res) => {
  const s = await me(req);
  const since = new Date(Date.now() - 8 * 7 * 86_400_000);
  const [logs, done] = await Promise.all([
    prisma.lessonTimeLog.findMany({ where: { studentId: s.id, loggedAt: { gte: since } }, select: { seconds: true, loggedAt: true }, take: 50000 }),
    prisma.lessonProgress.findMany({ where: { studentId: s.id, completedAt: { gte: since } }, select: { completedAt: true }, take: 20000 }),
  ]);
  const minutes = weekBuckets(logs.map((l) => ({ at: l.loggedAt, value: l.seconds / 60 })), 8).map((w) => ({ ...w, total: Math.round(w.total) }));
  const lessons = weekBuckets(done.map((d) => ({ at: d.completedAt, value: 1 })), 8);
  const days = new Set(logs.map((l) => l.loggedAt.toISOString().slice(0, 10)));
  let streak = 0;
  for (let d = new Date(); streak < 60 && days.has(d.toISOString().slice(0, 10)); d = new Date(d.getTime() - 86_400_000)) streak++;
  res.json({ weeks: minutes.map((m, i) => ({ weekStart: m.weekStart, minutesStudied: m.total, lessonsCompleted: lessons[i].total })), activeDays: days.size, currentStreakDays: streak });
});

// KFEAT-020 — everything due in the next 3 weeks across all enrolled courses, grouped by week.
selfServiceRouter.get("/workload", requireAuth, async (req: AuthedRequest, res) => {
  const s = await me(req);
  const now = new Date(), until = new Date(now.getTime() + 21 * 86_400_000);
  const enr = await prisma.enrollment.findMany({ where: { studentId: s.id, status: "in_progress" }, select: { unit: { select: { courses: { select: { id: true, title: true } } } } } });
  const courses = enr.flatMap((e) => e.unit.courses);
  const ids = courses.map((c) => c.id);
  const title = new Map(courses.map((c) => [c.id, c.title]));
  const [assignments, assessments, mine] = await Promise.all([
    prisma.assignment.findMany({ where: { courseId: { in: ids }, status: "PUBLISHED", OR: [{ releaseAt: null }, { releaseAt: { lte: now } }], dueAt: { gte: now, lte: until } }, select: { id: true, courseId: true, title: true, dueAt: true, totalMarks: true } }),
    prisma.assessment.findMany({ where: { courseId: { in: ids }, isDraft: false, scheduledAt: { gte: now, lte: until } }, select: { id: true, courseId: true, title: true, scheduledAt: true, totalMarks: true, type: true } }),
    prisma.submission.findMany({ where: { studentUserId: req.user!.id, assignmentId: { not: null } }, select: { assignmentId: true } }),
  ]);
  const submitted = new Set(mine.map((m) => m.assignmentId));
  const items = [
    ...assignments.filter((a) => !submitted.has(a.id)).map((a) => ({ kind: "assignment", id: a.id, course: title.get(a.courseId), title: a.title, due: a.dueAt, marks: a.totalMarks })),
    ...assessments.map((a) => ({ kind: String(a.type).toLowerCase(), id: a.id, course: title.get(a.courseId), title: a.title, due: a.scheduledAt!, marks: a.totalMarks })),
  ].sort((a, b) => a.due.getTime() - b.due.getTime());
  const weeks: Record<string, typeof items> = {};
  for (const it of items) (weeks[mondayKey(it.due)] ??= []).push(it);
  res.json({ total: items.length, weeks: Object.entries(weeks).map(([weekStart, list]) => ({ weekStart, count: list.length, items: list })), heaviestWeek: Object.entries(weeks).sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? null });
});

// KDATA-007 / KDATA-009 — "give me my data". Explicit field lists only: no password hash, tokens or internal notes.
selfServiceRouter.get("/data-export", requireAuth, async (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const [user, student, notifications, tickets] = await Promise.all([
    prisma.user.findUnique({ where: { id: uid }, select: { id: true, email: true, phone: true, role: true, createdAt: true, lastLoginAt: true } }),
    prisma.student.findUnique({ where: { userId: uid }, select: { id: true, studentNumber: true, admissionNumber: true, fullName: true, intake: true, studyMode: true, academicStatus: true, emergencyContactName: true, emergencyContactPhone: true, createdAt: true, programme: { select: { name: true } } } }),
    prisma.notification.findMany({ where: { userId: uid }, orderBy: { createdAt: "desc" }, take: 500, select: { channel: true, title: true, body: true, createdAt: true, readAt: true } }),
    prisma.helpdeskTicket.findMany({ where: { raisedById: uid }, select: { subject: true, body: true, status: true, priority: true, createdAt: true, resolvedAt: true, rating: true } }),
  ]);
  const academic = student ? await Promise.all([
    prisma.enrollment.findMany({ where: { studentId: student.id }, select: { semester: true, status: true, finalGrade: true, unit: { select: { code: true, title: true } } } }),
    prisma.invoice.findMany({ where: { studentId: student.id }, select: { semester: true, amountDue: true, amountPaid: true, dueDate: true, status: true, payments: { select: { amount: true, method: true, reference: true, paidAt: true, reversedAt: true } } } }),
    prisma.submission.findMany({ where: { studentUserId: uid }, select: { submittedAt: true, score: true, feedback: true, gradedAt: true, assessment: { select: { title: true } }, assignment: { select: { title: true } } }, take: 2000 }),
    prisma.attendanceRecord.count({ where: { studentId: student.id } }),
  ]) : null;
  await prisma.auditLog.create({ data: { userId: uid, action: "DATA_EXPORT_SELF", entityType: "User", entityId: uid, metadata: { includesStudentRecord: Boolean(student) } } });
  res.setHeader("Content-Disposition", `attachment; filename="my-measur-business-college-data-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({
    generatedAt: new Date().toISOString(), account: user, studentRecord: student,
    enrollments: academic?.[0] ?? [], invoicesAndPayments: academic?.[1] ?? [], submissions: academic?.[2] ?? [], attendanceRecordCount: academic?.[3] ?? 0,
    notifications, supportTickets: tickets,
    note: "This is the personal data the portal holds for your account in these areas. Ask the registrar for records held outside the portal.",
  });
});

// KDATA-007 — raise and follow a data-subject request (access, correction, erasure, restriction, objection).
const dataRequestSchema = z.object({ type: z.enum(DATA_REQUEST_TYPES), details: z.string().max(2000).optional() });
selfServiceRouter.post("/data-requests", requireAuth, idempotent(), async (req: AuthedRequest, res) => {
  const parsed = dataRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Choose a request type.", code: "BAD_REQUEST" });
  const open = await prisma.dataRequest.findFirst({ where: { userId: req.user!.id, type: parsed.data.type, status: { in: ["received", "in_progress"] } }, select: { id: true } });
  if (open) return res.status(409).json({ message: "You already have an open request of this type.", code: "CONFLICT" });
  const now = new Date();
  const r = await prisma.dataRequest.create({ data: { userId: req.user!.id, type: parsed.data.type, details: parsed.data.details, dueAt: dueDateFor(now) } });
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: "DATA_REQUEST_RAISED", entityType: "DataRequest", entityId: r.id, metadata: { type: r.type } } });
  res.status(201).json({ id: r.id, type: r.type, status: r.status, dueAt: r.dueAt });
});
selfServiceRouter.get("/data-requests", requireAuth, async (req: AuthedRequest, res) => {
  const rows = await prisma.dataRequest.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, type: true, status: true, createdAt: true, dueAt: true, resolutionNote: true, completedAt: true } });
  res.json(rows.map((r) => ({ ...r, urgency: requestUrgency(r) })));
});
