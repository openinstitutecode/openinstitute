// Batch 69 — reminder + retention jobs, shared by the manual buttons (insights.ts) and the daily scheduler.
import { prisma } from "./prisma.js";
import { runJob } from "./job-runner.js";
import { classifyInvoice, staleLogbooks } from "./quickwins.js";
import { taskEscalations, subscriptionDue } from "./task-escalation.js";
import { runSavedReport } from "./report-runner.js";
import { REPORT_ROLES } from "./access.js";

type Item = { userId: string; title: string; body: string };
// Honours NotificationPreference: in-app switched off, or the category muted, means no reminder for that user.
export async function notifyOnce(items: Item[], category: string, withinDays = 7) {
  if (!items.length) return { created: 0, skipped: 0, muted: 0 };
  const ids = [...new Set(items.map((i) => i.userId))];
  const prefs = await prisma.notificationPreference.findMany({ where: { userId: { in: ids } } });
  const off = new Set(prefs.filter((p) => !p.inApp || p.mutedCategories.includes(category)).map((p) => p.userId));
  const wanted = items.filter((i) => !off.has(i.userId));
  const since = new Date(Date.now() - withinDays * 86_400_000);
  const existing = wanted.length ? await prisma.notification.findMany({ where: { userId: { in: ids }, createdAt: { gte: since }, title: { in: [...new Set(wanted.map((i) => i.title))] } }, select: { userId: true, title: true } }) : [];
  const seen = new Set(existing.map((e) => `${e.userId}|${e.title}`));
  const fresh = wanted.filter((i) => !seen.has(`${i.userId}|${i.title}`));
  if (fresh.length) await prisma.notification.createMany({ data: fresh.map((i) => ({ ...i, channel: "in_app", sentAt: new Date() })) });
  return { created: fresh.length, skipped: wanted.length - fresh.length, muted: items.length - wanted.length };
}

export async function feeReminders() {
  const now = new Date();
  const inv = await prisma.invoice.findMany({ where: { status: { not: "paid" }, student: { academicStatus: "ACTIVE" } }, include: { student: { select: { userId: true } } }, take: 20000 });
  const items: Item[] = [];
  for (const i of inv) {
    const c = classifyInvoice(i, now);
    if (c.bucket === "overdue") items.push({ userId: i.student.userId, title: "Fee balance overdue", body: `KES ${c.outstanding.toLocaleString("en-KE")} for ${i.semester} is ${c.daysOverdue} day(s) overdue. Please pay or ask about an instalment plan.` });
    else if (c.bucket === "due_soon") items.push({ userId: i.student.userId, title: "Fee payment due soon", body: `KES ${c.outstanding.toLocaleString("en-KE")} for ${i.semester} is due in ${c.daysUntilDue} day(s).` });
  }
  return { candidates: items.length, ...(await notifyOnce(items, "fees")) };
}

export async function logbookReminders() {
  const active = await prisma.attachmentPlacement.findMany({ where: { status: "active" }, include: { student: { select: { userId: true } }, logbookEntries: { select: { submittedAt: true } } } });
  const stale = staleLogbooks(active);
  return { candidates: stale.length, ...(await notifyOnce(stale.map((p) => ({ userId: p.student.userId, title: "Logbook entry due", body: "You have not submitted an attachment logbook entry in over a week. Please add this week's entry." })), "logbook")) };
}

// KDATA-003 / KDB-008 — operational data only. Academic, financial and audit records are never touched here.
export function retentionCutoffs(env: NodeJS.ProcessEnv = process.env, now = new Date()) {
  const d = (k: string, dflt: number) => { const n = Number(env[k]); return new Date(now.getTime() - (Number.isFinite(n) && n >= 1 ? n : dflt) * 86_400_000); };
  return { failedLogins: d("RETENTION_FAILED_LOGIN_DAYS", 90), resetTokens: d("RETENTION_RESET_TOKEN_DAYS", 30), readNotifications: d("RETENTION_READ_NOTIFICATION_DAYS", 365) };
}
export async function retentionPurge(apply: boolean) {
  const c = retentionCutoffs();
  const where = {
    failedLogins: { attemptedAt: { lt: c.failedLogins } },
    resetTokens: { OR: [{ expiresAt: { lt: c.resetTokens } }, { usedAt: { lt: c.resetTokens } }] },
    readNotifications: { readAt: { not: null }, createdAt: { lt: c.readNotifications } },
    idempotency: { createdAt: { lt: new Date(Date.now() - 2 * 86_400_000) } }, // replay window is 2 days
  };
  if (!apply) {
    const [a, b, n, k] = await Promise.all([prisma.failedLoginAttempt.count({ where: where.failedLogins }), prisma.passwordResetToken.count({ where: where.resetTokens }), prisma.notification.count({ where: where.readNotifications }), prisma.idempotencyRecord.count({ where: where.idempotency })]);
    return { applied: false, failedLoginAttempts: a, passwordResetTokens: b, readNotifications: n, idempotencyRecords: k };
  }
  const [a, b, n, k] = await Promise.all([prisma.failedLoginAttempt.deleteMany({ where: where.failedLogins }), prisma.passwordResetToken.deleteMany({ where: where.resetTokens }), prisma.notification.deleteMany({ where: where.readNotifications }), prisma.idempotencyRecord.deleteMany({ where: where.idempotency })]);
  return { applied: true, failedLoginAttempts: a.count, passwordResetTokens: b.count, readNotifications: n.count, idempotencyRecords: k.count };
}

// KFEAT-062 — overdue tasks nudge the assignee, then (a week late) whoever assigned them. Re-sent at most every 3 days.
export async function taskEscalationJob() {
  const tasks = await prisma.task.findMany({ where: { status: { not: "done" }, dueDate: { lt: new Date() } }, take: 5000 });
  const items = taskEscalations(tasks);
  return { overdueTasks: tasks.length, ...(await notifyOnce(items, "tasks", 3)) };
}

// KFEAT-074 — scheduled reports: each due subscription gets an in-app "ready" notice with the current row count.
// The data itself is NOT put in the notification; the recipient opens the report (where the role check applies again).
export async function scheduledReportsJob() {
  const subs = await prisma.scheduledReportSubscription.findMany({ include: { report: { select: { name: true, entity: true } } }, take: 2000 });
  const due = subs.filter((s) => subscriptionDue(s.frequency, s.lastRunAt));
  const users = await prisma.user.findMany({ where: { id: { in: due.map((d) => d.recipientId) }, isActive: true }, select: { id: true, role: true } });
  const role = new Map(users.map((u) => [u.id, u.role as string]));
  const counts = new Map<string, number>();
  let sent = 0, skipped = 0;
  for (const s of due) {
    if (!REPORT_ROLES.includes(role.get(s.recipientId) ?? "")) { skipped++; continue; } // lost access, or inactive
    if (!counts.has(s.report.entity)) counts.set(s.report.entity, (await runSavedReport(s.report.entity)).length);
    const r = await notifyOnce([{ userId: s.recipientId, title: `Scheduled report ready: ${s.report.name}`.slice(0, 120), body: `${counts.get(s.report.entity)} row(s) as of ${new Date().toISOString().slice(0, 10)}. Open Reports to view it.` }], "reports", 1);
    sent += r.created;
    await prisma.scheduledReportSubscription.update({ where: { id: s.id }, data: { lastRunAt: new Date() } });
  }
  return { subscriptions: subs.length, due: due.length, sent, skipped };
}

// Batch 77 — ASG/COM018: students who haven't handed in an assignment due within 48 hours (extensions respected), and
// trainers with work waiting to be marked for more than 3 days.
export async function assignmentReminders() {
  const now = new Date(), soon = new Date(now.getTime() + 48 * 3_600_000), stale = new Date(now.getTime() - 3 * 86_400_000);
  const due = await prisma.assignment.findMany({ where: { status: "PUBLISHED", dueAt: { gt: now, lte: soon }, OR: [{ releaseAt: null }, { releaseAt: { lte: now } }] }, include: { course: { select: { title: true, unitId: true } }, extensions: { where: { status: "APPROVED" } } } });
  const items: Item[] = [];
  for (const a of due) {
    const [roster, subs] = await Promise.all([
      prisma.enrollment.findMany({ where: { unitId: a.course.unitId, status: "in_progress" }, select: { student: { select: { userId: true } } } }),
      prisma.submission.findMany({ where: { assignmentId: a.id, isDraft: false }, select: { studentUserId: true } }),
    ]);
    const done = new Set(subs.map((s) => s.studentUserId));
    const extended = new Set(a.extensions.filter((e) => e.grantedDueAt && e.grantedDueAt > soon).map((e) => e.studentUserId));
    for (const r of roster) if (!done.has(r.student.userId) && !extended.has(r.student.userId)) items.push({ userId: r.student.userId, title: `Due soon: ${a.title}`.slice(0, 120), body: `${a.course.title} — due ${a.dueAt.toISOString().slice(0, 16).replace("T", " ")} UTC. You haven't handed this in yet.` });
  }
  const waiting = await prisma.submission.groupBy({ by: ["assignmentId"], where: { isDraft: false, score: null, submittedAt: { lt: stale }, assignmentId: { not: null } }, _count: { _all: true } });
  const asgs = waiting.length ? await prisma.assignment.findMany({ where: { id: { in: waiting.map((w) => w.assignmentId as string) }, status: "PUBLISHED" }, select: { id: true, title: true, course: { select: { trainer: { select: { userId: true } } } } } }) : [];
  for (const a of asgs) {
    const n = waiting.find((w) => w.assignmentId === a.id)?._count._all ?? 0;
    const uid = a.course.trainer?.userId;
    if (uid) items.push({ userId: uid, title: `Marking waiting: ${a.title}`.slice(0, 120), body: `${n} submission(s) have been waiting more than 3 days.` });
  }
  return { assignmentsDueSoon: due.length, candidates: items.length, ...(await notifyOnce(items, "academic", 2)) };
}

// LMS-COM-021 — release scheduled course announcements on the first scheduler
// tick after their due time. The SENT status and notification de-duplication
// make retries safe if a worker stops part-way through delivery.
export async function scheduledCourseNoticesJob() {
  const due = await prisma.courseAnnouncement.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } }, include: { course: { select: { title: true, unitId: true } } }, orderBy: { scheduledAt: "asc" }, take: 500 });
  let delivered = 0;
  for (const notice of due) {
    const recipients = await prisma.enrollment.findMany({ where: { unitId: notice.course.unitId, status: { not: "withdrawn" } }, select: { student: { select: { userId: true } } } });
    await notifyOnce(recipients.map((r) => ({ userId: r.student.userId, title: `${notice.course.title}: ${notice.title}`.slice(0, 120), body: notice.content })), "announcement", 0.04);
    await prisma.courseAnnouncement.updateMany({ where: { id: notice.id, status: "SCHEDULED" }, data: { status: "SENT", sentAt: new Date() } });
    delivered++;
  }
  return { due: due.length, delivered };
}

export const JOBS = {
  "fee-reminders": feeReminders,
  "logbook-reminders": logbookReminders,
  "task-escalation": taskEscalationJob,
  "scheduled-reports": scheduledReportsJob,
  "retention-purge": () => retentionPurge(true),
  "assignment-reminders": assignmentReminders,
  "course-notices": scheduledCourseNoticesJob,
} as const;

// Daily scheduler. Off unless REMINDER_SCHEDULER_ENABLED=true. Runs each job once per day after REMINDER_HOUR_UTC (default 06 = 09:00 Nairobi);
// the job runner's advisory lock + "already succeeded in the last 20 h" check keep multiple instances from repeating it.
let timer: NodeJS.Timeout | null = null;
export function startReminderScheduler(): boolean {
  if (timer || process.env.REMINDER_SCHEDULER_ENABLED !== "true") return false;
  const hour = Math.min(23, Math.max(0, Number(process.env.REMINDER_HOUR_UTC ?? 6) || 6));
  const tick = async () => {
    // Scheduled course notices need a short cadence, independent of the
    // daily reminder window. The job's advisory lock prevents overlapping ticks.
    await runJob("course-notices", scheduledCourseNoticesJob, "scheduler");
    if (new Date().getUTCHours() < hour) return;
    // Other reminders keep their once-per-day cadence.
    for (const [name, fn] of Object.entries(JOBS)) {
      if (name === "course-notices") continue;
      const recent = await prisma.scheduledJobRun.findFirst({ where: { job: name, ok: true, startedAt: { gte: new Date(Date.now() - 20 * 3_600_000) } }, select: { id: true } });
      if (!recent) await runJob(name, fn as () => Promise<object>, "scheduler");
    }
  };
  timer = setInterval(() => void tick().catch((e) => console.error("[reminder-scheduler]", e)), 10 * 60_000);
  timer.unref?.();
  return true;
}
export function stopReminderScheduler() { if (timer) clearInterval(timer); timer = null; }
