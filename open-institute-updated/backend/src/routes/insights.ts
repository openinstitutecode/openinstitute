// Batch 68 — staff dashboards, reports and reminder runs built on existing tables (no schema change).
//   KFEAT-051 /finance-dashboard   KFEAT-060 /retention   KFEAT-061 /course-performance   KFEAT-108 /attachments
//   KFEAT-089 /support             KFEAT-124 /awards      KDATA-010 /pseudonymised-results
//   KFEAT-050 POST /reminders/fees KFEAT-115 POST /reminders/logbooks
// Batch 71 adds /notifications /integrations /ai /assessments /verifications (monitoring + history).
// Batch 70 adds /assessment/:id/analytics /security /operations /data-requests.
// Batch 69 adds /kpis /library /jobs /reconcile-invoices /retention/purge /library/check-links; roles come from lib/insight-roles.ts.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, AuthedRequest, JWT_SECRET } from "../middleware/auth.js";
import { classifyInvoice, retentionSummary, pseudonymise } from "../lib/quickwins.js";
import { parsePaging, pageMeta } from "../lib/pagination.js";
import { requireInsight } from "../lib/insight-roles.js";
import { resolvePseudonymSecret } from "../lib/pseudonym-secret.js";
import { runJob } from "../lib/job-runner.js";
import { feeReminders, logbookReminders, retentionPurge } from "../lib/reminder-jobs.js";
import { ticketStats } from "../lib/ticket-stats.js";
import { planInvoiceFix } from "../lib/invoice-reconcile.js";
import { evaluateKpis } from "../lib/kpis.js";
import { getSetting } from "../lib/settings.js";
import { scoreStats } from "../lib/score-stats.js";
import { requestUrgency } from "../lib/data-requests.js";
import { canTeachCourse } from "../lib/course-access.js";
import { checkUrl, checkLinks } from "../lib/link-check.js";
import { assertSafeOutboundUrl } from "../lib/ssrf-guard.js";
import { TtlCache } from "../lib/ttl-cache.js";
import { callMoodle, isMoodleConfigured } from "../moodle/client.js";
import { agingBuckets, toCsv, STATUS_TRANSITIONS } from "../lib/batch72.js";

export const insightsRouter = Router();

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const lastMonths = (n: number) => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - (n - 1 - i)); return monthKey(d); });

insightsRouter.get("/finance-dashboard", requireAuth, requireInsight("finance"), async (_req, res) => {
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const [totals, open, byMethod, recent, holds] = await Promise.all([
    prisma.invoice.aggregate({ _sum: { amountDue: true, amountPaid: true }, _count: { _all: true } }),
    prisma.invoice.findMany({ where: { status: { not: "paid" } }, select: { amountDue: true, amountPaid: true, dueDate: true }, take: 20000 }),
    prisma.payment.groupBy({ by: ["method"], where: { reversedAt: null }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.payment.findMany({ where: { reversedAt: null, paidAt: { gte: since } }, select: { amount: true, paidAt: true } }),
    prisma.financialHold.count({ where: { releasedAt: null } }),
  ]);
  const buckets = { overdue: { count: 0, amount: 0 }, due_soon: { count: 0, amount: 0 }, upcoming: { count: 0, amount: 0 } };
  for (const inv of open) { const c = classifyInvoice(inv, now); if (c.bucket !== "settled") { buckets[c.bucket].count++; buckets[c.bucket].amount += c.outstanding; } }
  const monthly: Record<string, number> = Object.fromEntries(lastMonths(6).map((m) => [m, 0]));
  for (const p of recent) { const k = monthKey(p.paidAt); if (k in monthly) monthly[k] += Number(p.amount); }
  const due = Number(totals._sum.amountDue ?? 0), paid = Number(totals._sum.amountPaid ?? 0);
  res.json({
    invoices: totals._count._all, totalBilled: due, totalCollected: paid, collectionRatePercent: due ? Math.round((paid / due) * 1000) / 10 : 0,
    outstandingBuckets: buckets, activeHolds: holds,
    byMethod: byMethod.map((m) => ({ method: m.method, payments: m._count._all, amount: Number(m._sum.amount ?? 0) })),
    monthlyCollections: Object.entries(monthly).map(([month, amount]) => ({ month, amount })),
    truncated: open.length >= 20000,
  });
});

insightsRouter.get("/retention", requireAuth, requireInsight("academic"), async (_req, res) => {
  const rows = await prisma.student.groupBy({ by: ["programmeId", "intake", "academicStatus"], _count: { _all: true } });
  const progs = await prisma.programme.findMany({ select: { id: true, name: true } });
  const name = new Map(progs.map((p) => [p.id, p.name]));
  const groups = new Map<string, Record<string, number>>();
  const overall: Record<string, number> = {};
  for (const r of rows) {
    const key = `${r.programmeId}|${r.intake}`;
    const g = groups.get(key) ?? {};
    g[r.academicStatus] = (g[r.academicStatus] ?? 0) + r._count._all;
    groups.set(key, g);
    overall[r.academicStatus] = (overall[r.academicStatus] ?? 0) + r._count._all;
  }
  res.json({
    overall: { counts: overall, ...retentionSummary(overall) },
    cohorts: [...groups.entries()].map(([key, counts]) => { const [pid, intake] = key.split("|"); return { programme: name.get(pid) ?? pid, intake, counts, ...retentionSummary(counts) }; })
      .sort((a, b) => b.attritionPercent - a.attritionPercent),
  });
});

insightsRouter.get("/course-performance", requireAuth, requireInsight("academic"), async (_req, res) => {
  const { passMarkPercent: defaultPass } = await getSetting("academic.rules");
  const [assessments, subs] = await Promise.all([
    prisma.assessment.findMany({ where: { isDraft: false }, select: { id: true, title: true, totalMarks: true, passMarkPercent: true, course: { select: { id: true, title: true } } } }),
    prisma.submission.findMany({ where: { assessmentId: { not: null }, score: { not: null } }, select: { assessmentId: true, score: true }, take: 50000 }),
  ]);
  const byA = new Map(assessments.map((a) => [a.id, a]));
  const courses = new Map<string, { course: string; attempts: number; passed: number; percentSum: number; assessments: Set<string> }>();
  for (const s of subs) {
    const a = byA.get(s.assessmentId!); if (!a || !a.totalMarks) continue;
    const pct = ((s.score as number) / a.totalMarks) * 100;
    const c = courses.get(a.course.id) ?? { course: a.course.title, attempts: 0, passed: 0, percentSum: 0, assessments: new Set<string>() };
    c.attempts++; c.percentSum += pct; c.assessments.add(a.id);
    if (pct >= (a.passMarkPercent ?? defaultPass)) c.passed++;
    courses.set(a.course.id, c);
  }
  res.json({
    courses: [...courses.entries()].map(([courseId, c]) => ({ courseId, course: c.course, assessments: c.assessments.size, scoredSubmissions: c.attempts,
      averagePercent: Math.round((c.percentSum / c.attempts) * 10) / 10, passRatePercent: Math.round((c.passed / c.attempts) * 1000) / 10 })).sort((a, b) => a.passRatePercent - b.passRatePercent),
    note: "Only graded submissions with a score are counted; pass mark is the assessment's own or the institutional default.",
  });
});

insightsRouter.get("/attachments", requireAuth, requireInsight("attachments"), async (_req, res) => {
  const now = new Date();
  const [byStatus, active, totalEntries, signed] = await Promise.all([
    prisma.attachmentPlacement.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.attachmentPlacement.findMany({ where: { status: "active" }, include: { student: { select: { fullName: true, studentNumber: true } }, employer: { select: { id: true } }, logbookEntries: { select: { submittedAt: true }, orderBy: { submittedAt: "desc" }, take: 1 } } }),
    prisma.logbookEntry.count(),
    prisma.logbookEntry.count({ where: { supervisorSignOff: true } }),
  ]);
  const stale = active.filter((placement) => {
    const latestEntry = placement.logbookEntries[0]?.submittedAt;
    return !latestEntry || latestEntry.getTime() < now.getTime() - 14 * 86_400_000;
  });
  res.json({
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
    logbook: { entries: totalEntries, signedOff: signed, signOffPercent: totalEntries ? Math.round((signed / totalEntries) * 1000) / 10 : 0 },
    endingWithin14Days: active.filter((p) => p.endDate.getTime() - now.getTime() <= 14 * 86_400_000 && p.endDate >= now).length,
    staleLogbooks: stale.map((p) => ({ placementId: p.id, student: p.student.fullName, studentNumber: p.student.studentNumber, lastEntry: p.logbookEntries[0]?.submittedAt ?? null })),
  });
});

insightsRouter.get("/support", requireAuth, requireInsight("support"), async (_req, res) => {
  const since = new Date(Date.now() - 8 * 7 * 86_400_000);
  const [byStatus, byPriority, ai, total, recent, resolved] = await Promise.all([
    prisma.helpdeskTicket.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.helpdeskTicket.groupBy({ by: ["priority"], where: { status: { not: "resolved" } }, _count: { _all: true } }),
    prisma.helpdeskTicket.count({ where: { handledByAi: true } }),
    prisma.helpdeskTicket.count(),
    prisma.helpdeskTicket.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.helpdeskTicket.findMany({ where: { OR: [{ resolvedAt: { not: null } }, { rating: { not: null } }] }, select: { createdAt: true, resolvedAt: true, rating: true }, take: 20000 }),
  ]);
  const weekly: Record<string, number> = {};
  for (const t of recent) { const k = Math.floor((Date.now() - t.createdAt.getTime()) / (7 * 86_400_000)); weekly[k] = (weekly[k] ?? 0) + 1; }
  const open = byStatus.filter((s) => s.status !== "resolved").reduce((a, s) => a + s._count._all, 0);
  const { maxOpenTickets } = await getSetting("kpi.targets");
  res.json({
    total, open, aiHandledPercent: total ? Math.round((ai / total) * 1000) / 10 : 0,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
    openByPriority: Object.fromEntries(byPriority.map((s) => [s.priority, s._count._all])),
    ...ticketStats(resolved),
    weeklyVolume: Object.entries(weekly).map(([weeksAgo, tickets]) => ({ weeksAgo: Number(weeksAgo), tickets })).sort((a, b) => a.weeksAgo - b.weeksAgo),
    alert: open > maxOpenTickets ? `More than ${maxOpenTickets} unresolved tickets.` : null,
    note: "Resolution time counts tickets resolved since batch 69 (older tickets have no resolved-at time).",
  });
});

insightsRouter.get("/awards", requireAuth, requireInsight("awards"), async (_req, res) => {
  const certs = await prisma.certificate.findMany({ select: { qualification: true, issuedAt: true, revoked: true } });
  const byQual: Record<string, { issued: number; revoked: number }> = {};
  const monthly: Record<string, number> = Object.fromEntries(lastMonths(12).map((m) => [m, 0]));
  for (const c of certs) {
    const q = (byQual[c.qualification] ??= { issued: 0, revoked: 0 });
    q.issued++; if (c.revoked) q.revoked++;
    const k = monthKey(c.issuedAt); if (k in monthly) monthly[k]++;
  }
  res.json({ totalIssued: certs.length, totalRevoked: certs.filter((c) => c.revoked).length,
    byQualification: Object.entries(byQual).map(([qualification, v]) => ({ qualification, ...v })).sort((a, b) => b.issued - a.issued),
    monthlyIssued: Object.entries(monthly).map(([month, issued]) => ({ month, issued })) });
});

// Research/analytics export with student identity replaced by a keyed hash. Every call is audit-logged.
insightsRouter.get("/pseudonymised-results", requireAuth, requireInsight("analytics"), async (req: AuthedRequest, res) => {
  const { secret, problem } = resolvePseudonymSecret(process.env, JWT_SECRET);
  if (!secret) return res.status(503).json({ message: problem, code: "NOT_CONFIGURED" });
  const p = parsePaging(req.query, { pageSize: 500, maxPageSize: 2000 });
  const where = { assessmentId: { not: null }, score: { not: null } };
  const [total, rows] = await Promise.all([
    prisma.submission.count({ where }),
    prisma.submission.findMany({ where, orderBy: { id: "asc" }, skip: p.skip, take: p.take, select: { assessmentId: true, studentUserId: true, score: true, submittedAt: true, assessment: { select: { totalMarks: true, type: true } } } }),
  ]);
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: "PSEUDONYMISED_EXPORT", entityType: "Submission", entityId: "bulk", metadata: { page: p.page, rows: rows.length } } });
  res.json({ ...pageMeta(total, p), rows: rows.map((r) => ({ subject: pseudonymise(r.studentUserId, secret), assessmentId: r.assessmentId, assessmentType: r.assessment?.type, score: r.score, totalMarks: r.assessment?.totalMarks, submittedMonth: r.submittedAt.toISOString().slice(0, 7) })) });
});

async function manual<T extends object>(req: AuthedRequest, res: import("express").Response, name: string, fn: () => Promise<T>) {
  const r = await runJob(name, fn, "manual");
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: `JOB_${name.toUpperCase().replace(/-/g, "_")}`, entityType: "ScheduledJobRun", entityId: name, metadata: r as object } });
  if (!r.ran) return res.status(409).json({ message: "That job is already running.", code: "CONFLICT" });
  if (!r.ok) return res.status(500).json({ message: r.error, code: "JOB_FAILED" });
  res.json(r.summary);
}
insightsRouter.post("/reminders/fees", requireAuth, requireInsight("finance"), (req: AuthedRequest, res) => manual(req, res, "fee-reminders", feeReminders));
insightsRouter.post("/reminders/logbooks", requireAuth, requireInsight("attachments"), (req: AuthedRequest, res) => manual(req, res, "logbook-reminders", logbookReminders));

// KDATA-003 — preview by default; ?apply=true deletes expired operational rows (login attempts, reset tokens, read notifications).
insightsRouter.post("/retention/purge", requireAuth, requireInsight("jobs"), (req: AuthedRequest, res) => {
  const apply = req.query.apply === "true";
  return apply ? manual(req, res, "retention-purge", () => retentionPurge(true)) : retentionPurge(false).then((r) => res.json(r));
});

insightsRouter.get("/jobs", requireAuth, requireInsight("jobs"), async (_req, res) => {
  const runs = await prisma.scheduledJobRun.findMany({ orderBy: { startedAt: "desc" }, take: 50 });
  const latest: Record<string, (typeof runs)[number]> = {};
  for (const r of runs) latest[r.job] ??= r;
  res.json({ schedulerEnabled: process.env.REMINDER_SCHEDULER_ENABLED === "true", latest: Object.values(latest), recent: runs });
});

// KFEAT-059 — KPIs vs targets from Settings ("kpi.targets").
insightsRouter.get("/kpis", requireAuth, requireInsight("kpis"), async (_req, res) => {
  const [targets, totals, statuses, subs, assessments, open] = await Promise.all([
    getSetting("kpi.targets"),
    prisma.invoice.aggregate({ _sum: { amountDue: true, amountPaid: true } }),
    prisma.student.groupBy({ by: ["academicStatus"], _count: { _all: true } }),
    prisma.submission.findMany({ where: { assessmentId: { not: null }, score: { not: null } }, select: { assessmentId: true, score: true }, take: 50000 }),
    prisma.assessment.findMany({ where: { isDraft: false }, select: { id: true, totalMarks: true, passMarkPercent: true } }),
    prisma.helpdeskTicket.count({ where: { status: { not: "resolved" } } }),
  ]);
  const { passMarkPercent: defaultPass } = await getSetting("academic.rules");
  const a = new Map(assessments.map((x) => [x.id, x]));
  let scored = 0, passed = 0;
  for (const s of subs) { const x = a.get(s.assessmentId!); if (!x?.totalMarks) continue; scored++; if (((s.score as number) / x.totalMarks) * 100 >= (x.passMarkPercent ?? defaultPass)) passed++; }
  const counts = Object.fromEntries(statuses.map((s) => [s.academicStatus, s._count._all]));
  const due = Number(totals._sum.amountDue ?? 0);
  const values = {
    collectionRatePercent: due ? Math.round((Number(totals._sum.amountPaid ?? 0) / due) * 1000) / 10 : null,
    retentionPercent: retentionSummary(counts).total ? retentionSummary(counts).retentionPercent : null,
    passRatePercent: scored ? Math.round((passed / scored) * 1000) / 10 : null,
    maxOpenTickets: open,
  };
  res.json({ kpis: evaluateKpis(values, targets), note: "Targets are editable under Settings → kpi.targets. 'unknown' means there is no data yet." });
});

// KDATA / KFEAT-100 — library usage analytics.
insightsRouter.get("/library", requireAuth, requireInsight("library"), async (_req, res) => {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const [byAction, top, resources, broken] = await Promise.all([
    prisma.libraryUsageEvent.groupBy({ by: ["action"], where: { occurredAt: { gte: since } }, _count: { _all: true } }),
    prisma.libraryUsageEvent.groupBy({ by: ["resourceId"], where: { occurredAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { resourceId: "desc" } }, take: 10 }),
    prisma.libraryResource.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.libraryResource.findMany({ where: { externalUrl: { not: null } }, select: { id: true, title: true, externalUrl: true, metadata: true }, take: 5000 }),
  ]);
  const titles = await prisma.libraryResource.findMany({ where: { id: { in: top.map((t) => t.resourceId) } }, select: { id: true, title: true, type: true } });
  const t = new Map(titles.map((x) => [x.id, x]));
  const linkState = (m: unknown) => (m as { linkCheck?: { ok: boolean; checkedAt: string; status?: number; error?: string } } | null)?.linkCheck;
  res.json({
    windowDays: 90,
    events: Object.fromEntries(byAction.map((a) => [a.action, a._count._all])),
    resourcesByType: Object.fromEntries(resources.map((r) => [r.type, r._count._all])),
    topResources: top.map((x) => ({ resourceId: x.resourceId, title: t.get(x.resourceId)?.title ?? "(deleted)", type: t.get(x.resourceId)?.type, events: x._count._all })),
    links: { withExternalUrl: broken.length, checked: broken.filter((b) => linkState(b.metadata)).length, broken: broken.filter((b) => linkState(b.metadata)?.ok === false).map((b) => ({ id: b.id, title: b.title, url: b.externalUrl, ...linkState(b.metadata) })) },
  });
});

// KFEAT-098 — checks the 40 least-recently-checked external links per call (SSRF-guarded, 5 at a time).
insightsRouter.post("/library/check-links", requireAuth, requireInsight("library"), async (req: AuthedRequest, res) => {
  const rows = await prisma.libraryResource.findMany({ where: { externalUrl: { not: null } }, select: { id: true, externalUrl: true, metadata: true }, take: 2000 });
  const at = (m: unknown) => (m as { linkCheck?: { checkedAt?: string } } | null)?.linkCheck?.checkedAt ?? "";
  const batch = rows.sort((x, y) => at(x.metadata).localeCompare(at(y.metadata))).slice(0, 40);
  const results = await checkLinks(batch.map((b) => ({ id: b.id, url: b.externalUrl! })), (u) => checkUrl(u, { guard: (x) => assertSafeOutboundUrl(x) }));
  const checkedAt = new Date().toISOString();
  for (const r of results) {
    const meta = (batch.find((b) => b.id === r.id)?.metadata ?? {}) as Record<string, unknown>;
    await prisma.libraryResource.update({ where: { id: r.id }, data: { metadata: { ...meta, linkCheck: { ok: r.ok, status: r.status, error: r.error, checkedAt } } as object } });
  }
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: "LIBRARY_LINK_CHECK", entityType: "LibraryResource", entityId: "bulk", metadata: { checked: results.length, broken: results.filter((r) => !r.ok).length } } });
  res.json({ checked: results.length, broken: results.filter((r) => !r.ok).length, remaining: Math.max(0, rows.length - results.length) });
});

// KFX-026 / KFEAT-044 — recompute invoice paid amount + status from non-reversed payments. Preview unless ?apply=true.
insightsRouter.post("/reconcile-invoices", requireAuth, requireInsight("reconcile"), async (req: AuthedRequest, res) => {
  const apply = req.query.apply === "true";
  const invoices = await prisma.invoice.findMany({ include: { payments: { select: { amount: true, reversedAt: true } } }, take: 20000 });
  const fixes = invoices.flatMap((inv) => { const f = planInvoiceFix(inv, inv.payments); return f ? [{ invoiceId: inv.id, ...f }] : []; });
  if (apply && fixes.length) {
    await prisma.$transaction([
      ...fixes.map((f) => prisma.invoice.update({ where: { id: f.invoiceId }, data: { amountPaid: f.amountPaid, status: f.status } })),
      prisma.auditLog.create({ data: { userId: req.user!.id, action: "INVOICES_RECONCILED", entityType: "Invoice", entityId: "bulk", metadata: { fixed: fixes.length, sample: fixes.slice(0, 20) } } }),
    ]);
  }
  res.json({ applied: apply, scanned: invoices.length, mismatches: fixes.length, fixes: fixes.slice(0, 200), truncated: invoices.length >= 20000 });
});

// KFEAT-030 — score distribution for one assessment. Trainers see only assessments in courses they teach.
insightsRouter.get("/assessment/:id/analytics", requireAuth, requireInsight("academic"), async (req: AuthedRequest, res) => {
  const a = await prisma.assessment.findUnique({ where: { id: req.params.id }, select: { id: true, title: true, totalMarks: true, passMarkPercent: true, courseId: true, course: { select: { title: true } } } });
  if (!a || (req.user!.role === "TRAINER" && !(await canTeachCourse(req.user!, a.courseId)))) return res.status(404).json({ message: "Assessment not found.", code: "NOT_FOUND" });
  const { passMarkPercent: defaultPass } = await getSetting("academic.rules");
  const pass = a.passMarkPercent ?? defaultPass;
  const subs = await prisma.submission.findMany({ where: { assessmentId: a.id, score: { not: null } }, select: { score: true }, take: 20000 });
  res.json({ assessment: { id: a.id, title: a.title, course: a.course.title, totalMarks: a.totalMarks, passMarkPercent: pass }, ...scoreStats(a.totalMarks ? subs.map((x) => ((x.score as number) / a.totalMarks) * 100) : [], pass) });
});

// KFEAT-067 / KSEC-030 — sign-in failures and privileged actions, last 14 days. Counts and patterns only: no passwords, tokens or bodies.
insightsRouter.get("/security", requireAuth, requireInsight("security"), async (_req, res) => {
  const since = new Date(Date.now() - 14 * 86_400_000);
  const [fails, byReason, topEmails, topIps, audit] = await Promise.all([
    prisma.failedLoginAttempt.findMany({ where: { attemptedAt: { gte: since } }, select: { attemptedAt: true }, take: 50000 }),
    prisma.failedLoginAttempt.groupBy({ by: ["reason"], where: { attemptedAt: { gte: since } }, _count: { _all: true } }),
    prisma.failedLoginAttempt.groupBy({ by: ["email"], where: { attemptedAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { email: "desc" } }, take: 5 }),
    prisma.failedLoginAttempt.groupBy({ by: ["ipAddress"], where: { attemptedAt: { gte: since }, ipAddress: { not: null } }, _count: { _all: true }, orderBy: { _count: { ipAddress: "desc" } }, take: 5 }),
    prisma.auditLog.groupBy({ by: ["action"], where: { createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { action: "desc" } }, take: 25 }),
  ]);
  const perDay: Record<string, number> = {};
  for (const f of fails) { const k = f.attemptedAt.toISOString().slice(0, 10); perDay[k] = (perDay[k] ?? 0) + 1; }
  const mask = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");
  res.json({
    windowDays: 14, failedLogins: fails.length,
    perDay: Object.entries(perDay).sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count })),
    byReason: Object.fromEntries(byReason.map((r) => [r.reason, r._count._all])),
    topTargets: topEmails.map((e) => ({ account: mask(e.email), attempts: e._count._all })),
    topSources: topIps.map((i) => ({ ip: i.ipAddress, attempts: i._count._all })),
    auditActions: audit.map((a) => ({ action: a.action, count: a._count._all })),
    note: "Counts come from FailedLoginAttempt (kept 90 days by default) and AuditLog. Accounts are masked.",
  });
});

// KFEAT-056 — one-screen queue of things waiting for a person. Each count is a plain status count, nothing inferred.
insightsRouter.get("/operations", requireAuth, requireInsight("operations"), async (_req, res) => {
  const now = new Date();
  const [apps, refunds, amendments, transfers, counselling, tickets, overdueTasks, dataReqs, overdueInvoices, holds] = await Promise.all([
    prisma.application.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    prisma.refundRequest.count({ where: { status: "pending" } }),
    prisma.resultsAmendmentRequest.count({ where: { status: "pending" } }),
    prisma.creditTransferRequest.count({ where: { status: "pending" } }),
    prisma.counsellingRequest.count({ where: { status: "requested" } }),
    prisma.helpdeskTicket.count({ where: { status: { not: "resolved" } } }),
    prisma.task.count({ where: { status: { not: "done" }, dueDate: { lt: now } } }),
    prisma.dataRequest.count({ where: { status: { in: ["received", "in_progress"] } } }),
    prisma.invoice.count({ where: { status: { in: ["unpaid", "partial", "overdue"] }, dueDate: { lt: now } } }),
    prisma.financialHold.count({ where: { releasedAt: null } }),
  ]);
  res.json({ queues: [
    { key: "applications", label: "Applications awaiting review", count: apps, link: "/admin/applications" },
    { key: "refunds", label: "Refund requests pending", count: refunds },
    { key: "amendments", label: "Results amendments pending", count: amendments },
    { key: "creditTransfers", label: "Credit transfers pending", count: transfers },
    { key: "counselling", label: "Counselling requests waiting", count: counselling },
    { key: "tickets", label: "Unresolved support tickets", count: tickets },
    { key: "overdueTasks", label: "Overdue staff tasks", count: overdueTasks },
    { key: "dataRequests", label: "Open data requests", count: dataReqs },
    { key: "overdueInvoices", label: "Invoices past due", count: overdueInvoices },
    { key: "holds", label: "Active financial holds", count: holds },
  ] });
});

// KDATA-007 — staff side of data-subject requests.
insightsRouter.get("/data-requests", requireAuth, requireInsight("privacy"), async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = await prisma.dataRequest.findMany({ where: status ? { status } : {}, orderBy: [{ dueAt: "asc" }], take: 200, include: { user: { select: { email: true, role: true } } } });
  const now = new Date();
  res.json(rows.map((r) => ({ id: r.id, type: r.type, details: r.details, status: r.status, createdAt: r.createdAt, dueAt: r.dueAt, urgency: requestUrgency(r, now), requester: r.user.email, requesterRole: r.user.role, resolutionNote: r.resolutionNote })));
});
const dataRequestUpdate = z.object({ status: z.enum(["in_progress", "completed", "rejected"]), resolutionNote: z.string().min(3).max(2000).optional() })
  .refine((v) => v.status === "in_progress" || !!v.resolutionNote, { message: "Say what was done (or why it was refused)." });
insightsRouter.patch("/data-requests/:id", requireAuth, requireInsight("privacy"), async (req: AuthedRequest, res) => {
  const parsed = dataRequestUpdate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid update.", code: "BAD_REQUEST" });
  const existing = await prisma.dataRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ message: "Request not found.", code: "NOT_FOUND" });
  if (existing.status === "completed" || existing.status === "rejected") return res.status(409).json({ message: "This request is already closed.", code: "CONFLICT" });
  const closing = parsed.data.status !== "in_progress";
  const updated = await prisma.dataRequest.update({ where: { id: existing.id }, data: { status: parsed.data.status, handledById: req.user!.id, resolutionNote: parsed.data.resolutionNote, completedAt: closing ? new Date() : null } });
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: "DATA_REQUEST_UPDATED", entityType: "DataRequest", entityId: existing.id, metadata: { type: existing.type, from: existing.status, to: parsed.data.status } } });
  if (closing) await prisma.notification.create({ data: { userId: existing.userId, channel: "in_app", title: `Your data request was ${parsed.data.status}`, body: parsed.data.resolutionNote ?? "", sentAt: new Date() } });
  res.json({ id: updated.id, status: updated.status });
});

// KOBS-008 / KFX-012 — did notifications actually go out? "Unsent" = created but never marked sent (the email/SMS gateways are still stubs, so expect email/SMS here until they are wired).
insightsRouter.get("/notifications", requireAuth, requireInsight("jobs"), async (_req, res) => {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [total, sent, unsentOld, byChannel, unsentByChannel] = await Promise.all([
    prisma.notification.count({ where: { createdAt: { gte: since } } }),
    prisma.notification.count({ where: { createdAt: { gte: since }, sentAt: { not: null } } }),
    prisma.notification.count({ where: { createdAt: { lt: new Date(Date.now() - 3_600_000), gte: since }, sentAt: null } }),
    prisma.notification.groupBy({ by: ["channel"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.notification.groupBy({ by: ["channel"], where: { createdAt: { gte: since }, sentAt: null }, _count: { _all: true } }),
  ]);
  const unsent = new Map(unsentByChannel.map((u) => [u.channel, u._count._all]));
  res.json({
    windowDays: 7, total, sent, deliveredPercent: total ? Math.round((sent / total) * 1000) / 10 : null, unsentOlderThanOneHour: unsentOld,
    byChannel: byChannel.map((c) => ({ channel: c.channel, created: c._count._all, unsent: unsent.get(c.channel) ?? 0 })),
    note: "'Sent' means the app marked the notification dispatched. There is no bounce or read-receipt feedback from email/SMS providers.",
  });
});

// KOBS-006 / KINT-010 — integration outbox/inbox health, from IntegrationEvent (the same table the VBL scheduler works through).
insightsRouter.get("/integrations", requireAuth, requireInsight("jobs"), async (_req, res) => {
  const day = new Date(Date.now() - 86_400_000);
  const [byStatus, oldestPending, deadLetters, lastOk, recentFailures] = await Promise.all([
    prisma.integrationEvent.groupBy({ by: ["direction", "status"], _count: { _all: true } }),
    prisma.integrationEvent.findFirst({ where: { status: { in: ["PENDING", "FAILED"] } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.integrationEvent.count({ where: { status: "DEAD_LETTER" } }),
    prisma.integrationEvent.findFirst({ where: { status: { in: ["SENT", "RECEIVED"] } }, orderBy: { processedAt: "desc" }, select: { processedAt: true } }),
    prisma.integrationEvent.findMany({ where: { status: { in: ["FAILED", "DEAD_LETTER"] }, updatedAt: { gte: day } }, orderBy: { updatedAt: "desc" }, take: 10, select: { id: true, eventType: true, direction: true, status: true, attempts: true, lastError: true, updatedAt: true } }),
  ]);
  const backlogMinutes = oldestPending ? Math.round((Date.now() - oldestPending.createdAt.getTime()) / 60_000) : 0;
  res.json({
    counts: byStatus.map((b) => ({ direction: b.direction, status: b.status, count: b._count._all })),
    backlogMinutes, deadLetters, lastSuccessAt: lastOk?.processedAt ?? null,
    healthy: deadLetters === 0 && backlogMinutes < 60,
    recentFailures: recentFailures.map((f) => ({ ...f, lastError: f.lastError?.slice(0, 160) ?? null })),
    note: "Covers the Virtual Business Lab event table only. Moodle grade/completion sync has no equivalent record yet (KINT-018/019).",
  });
});

// KOBS-007 / KAI-017 — AI provider health from AiUsageLog, last 24 h and 7 days.
insightsRouter.get("/ai", requireAuth, requireInsight("jobs"), async (_req, res) => {
  const now = Date.now();
  const rows = await prisma.aiUsageLog.findMany({ where: { createdAt: { gte: new Date(now - 7 * 86_400_000) } }, select: { feature: true, success: true, blockedBySafety: true, errorReason: true, latencyMs: true, createdAt: true }, take: 50000 });
  const sum = (list: typeof rows) => {
    const ok = list.filter((r) => r.success), lat = ok.map((r) => r.latencyMs).sort((a, b) => a - b);
    return { requests: list.length, failed: list.filter((r) => !r.success && !r.blockedBySafety).length, blockedBySafety: list.filter((r) => r.blockedBySafety).length,
      errorRatePercent: list.length ? Math.round((list.filter((r) => !r.success && !r.blockedBySafety).length / list.length) * 1000) / 10 : null, p50LatencyMs: lat.length ? lat[Math.floor((lat.length - 1) * 0.5)] : null, p95LatencyMs: lat.length ? lat[Math.floor((lat.length - 1) * 0.95)] : null };
  };
  const errors: Record<string, number> = {};
  for (const r of rows) if (!r.success && !r.blockedBySafety) errors[r.errorReason ?? "unknown"] = (errors[r.errorReason ?? "unknown"] ?? 0) + 1;
  const feats: Record<string, typeof rows> = {};
  for (const r of rows) (feats[r.feature] ??= []).push(r);
  res.json({ last24h: sum(rows.filter((r) => r.createdAt.getTime() >= now - 86_400_000)), last7d: sum(rows), errorReasons: errors,
    byFeature: Object.entries(feats).map(([feature, l]) => ({ feature, ...sum(l) })).sort((a, b) => b.requests - a.requests).slice(0, 12) });
});

// KFEAT-030 — picker for the assessment analytics screen (trainers see only their own courses).
insightsRouter.get("/assessments", requireAuth, requireInsight("academic"), async (req: AuthedRequest, res) => {
  const trainer = req.user!.role === "TRAINER" ? await prisma.trainer.findUnique({ where: { userId: req.user!.id }, select: { id: true } }) : null;
  if (req.user!.role === "TRAINER" && !trainer) return res.json([]);
  const rows = await prisma.assessment.findMany({ where: { isDraft: false, ...(trainer ? { course: { trainerId: trainer.id } } : {}) }, orderBy: { title: "asc" }, take: 150, select: { id: true, title: true, type: true, totalMarks: true, course: { select: { title: true } }, _count: { select: { submissions: true } } } });
  res.json(rows.map((a) => ({ id: a.id, title: a.title, type: a.type, course: a.course.title, submissions: a._count.submissions })));
});

// KFEAT-125 — who looked up which document, and how often (IPs are keyed hashes).
insightsRouter.get("/verifications", requireAuth, requireInsight("awards"), async (_req, res) => {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [total, notFound, revoked, top, recent] = await Promise.all([
    prisma.credentialVerification.count({ where: { createdAt: { gte: since } } }),
    prisma.credentialVerification.count({ where: { createdAt: { gte: since }, found: false } }),
    prisma.credentialVerification.count({ where: { createdAt: { gte: since }, revoked: true } }),
    prisma.credentialVerification.groupBy({ by: ["documentId"], where: { createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { documentId: "desc" } }, take: 10 }),
    prisma.credentialVerification.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 20, select: { documentId: true, found: true, revoked: true, createdAt: true } }),
  ]);
  res.json({ windowDays: 30, lookups: total, notFound, revokedShown: revoked, mostChecked: top.map((t) => ({ documentId: t.documentId, lookups: t._count._all })), recent,
    note: "A cluster of not-found lookups can mean guessed IDs or forged documents being checked." });
});

// ---- Batch 72 ------------------------------------------------------------------------------------------
// KFEAT-049 /finance-report (+ ?format=csv, cached 60 s: KPERF-005) · KFEAT-036 /competency · KFEAT-040 /competency.csv
// KFEAT-027 /exam-incidents · KFEAT-005 /status-lifecycle
const financeReportCache = new TtlCache<object>(60_000, 5);
insightsRouter.get("/finance-report", requireAuth, requireInsight("finance"), async (req, res) => {
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const data = await financeReportCache.getOrLoad("finance-report", async () => {
    const [invoices, payments, refunds] = await Promise.all([
      prisma.invoice.findMany({ select: { amountDue: true, amountPaid: true, dueDate: true } }),
      prisma.payment.findMany({ where: { reversedAt: null, paidAt: { gte: since } }, select: { amount: true, method: true, paidAt: true } }),
      prisma.refundRequest.groupBy({ by: ["status"], _count: { _all: true }, _sum: { amount: true } }),
    ]);
    const byMethod: Record<string, number> = {}; const byMonth: Record<string, number> = {};
    for (const p of payments) { byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount); const k = monthKey(p.paidAt); byMonth[k] = (byMonth[k] ?? 0) + Number(p.amount); }
    return { windowMonths: 6, aging: agingBuckets(invoices, now), collectedByMethod: byMethod, collectedByMonth: byMonth,
      refunds: refunds.map((r) => ({ status: r.status, count: r._count._all, amount: Number(r._sum.amount ?? 0) })) };
  });
  if (req.query.format === "csv") {
    const d = data as { aging: Record<string, number> };
    res.type("text/csv").send(toCsv(["bucket", "outstanding_kes"], Object.entries(d.aging)));
    return;
  }
  res.json(data);
});

insightsRouter.get("/competency", requireAuth, requireInsight("academic"), async (_req, res) => {
  const [comps, rows] = await Promise.all([
    prisma.competency.findMany({ select: { id: true, name: true, programme: { select: { name: true } } } }),
    prisma.competencyRecord.groupBy({ by: ["competencyId", "level"], _count: { _all: true } }),
  ]);
  const out = comps.map((c) => {
    const lv = { developing: 0, competent: 0, advanced: 0 } as Record<string, number>;
    for (const r of rows.filter((x) => x.competencyId === c.id)) lv[r.level] = (lv[r.level] ?? 0) + r._count._all;
    const total = Object.values(lv).reduce((a, b) => a + b, 0);
    return { competencyId: c.id, competency: c.name, programme: c.programme.name, ...lv, total, achievedPercent: total ? Math.round(((lv.competent + lv.advanced) / total) * 100) : null };
  });
  res.json(out);
});
insightsRouter.get("/competency.csv", requireAuth, requireInsight("academic"), async (_req, res) => {
  const recs = await prisma.competencyRecord.findMany({ take: 5000, orderBy: { createdAt: "desc" }, include: { competency: { select: { name: true } }, student: { select: { studentNumber: true } } } });
  res.type("text/csv").send(toCsv(["student_number", "competency", "level", "assessment_score", "achieved_at"], recs.map((r) => [r.student.studentNumber, r.competency.name, r.level, r.assessmentScore, r.achievedAt?.toISOString() ?? ""])));
});

insightsRouter.get("/exam-incidents", requireAuth, requireInsight("academic"), async (_req, res) => {
  const [byStatus, recent] = await Promise.all([
    prisma.examIncident.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.examIncident.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: { id: true, assessmentId: true, status: true, createdAt: true, description: true } }),
  ]);
  res.json({ byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])), recent });
});

insightsRouter.get("/status-lifecycle", requireAuth, requireInsight("academic"), async (_req, res) => {
  const counts = await prisma.student.groupBy({ by: ["academicStatus"], _count: { _all: true } });
  res.json({ transitions: STATUS_TRANSITIONS, students: Object.fromEntries(counts.map((c) => [c.academicStatus, c._count._all])), note: "Rules only: status changes still go through the registry's record-change workflow." });
});

// KAI-020 — how students rate AI answers (last 30 days).
insightsRouter.get("/ai-feedback", requireAuth, requireInsight("analytics"), async (_req, res) => {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await prisma.auditLog.findMany({ where: { action: "AI_RESPONSE_FEEDBACK", createdAt: { gte: since } }, select: { metadata: true }, take: 5000 });
  const counts: Record<string, number> = {};
  for (const r of rows) { const k = (r.metadata as { rating?: string } | null)?.rating ?? "unknown"; counts[k] = (counts[k] ?? 0) + 1; }
  res.json({ windowDays: 30, total: rows.length, counts, helpfulPercent: rows.length ? Math.round(((counts.helpful ?? 0) / rows.length) * 100) : null });
});

// ---- Batch 74 ------------------------------------------------------------------------------------------
// KINT-020 /moodle-health (live probe, 5 s timeout) · KDATA-006 /record-access (who opened student records, 30 days)
insightsRouter.get("/moodle-health", requireAuth, requireInsight("jobs"), async (_req, res) => {
  if (!isMoodleConfigured()) return res.json({ configured: false, ok: false, note: "MOODLE_BASE_URL / MOODLE_WS_TOKEN are not set." });
  const t0 = Date.now();
  try {
    const info = await callMoodle<{ sitename?: string; release?: string }>("core_webservice_get_site_info", {}, { retry: false, timeoutMs: 5000 });
    res.json({ configured: true, ok: true, latencyMs: Date.now() - t0, site: info.sitename ?? null, release: info.release ?? null });
  } catch (e) {
    res.json({ configured: true, ok: false, latencyMs: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 200) : "Unknown error" });
  }
});

insightsRouter.get("/record-access", requireAuth, requireInsight("security"), async (_req, res) => {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await prisma.auditLog.findMany({ where: { action: "STUDENT_RECORD_VIEWED", createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 5000, select: { userId: true, entityId: true, metadata: true, createdAt: true } });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))] } }, select: { id: true, email: true, role: true } });
  const who = new Map(users.map((u) => [u.id, u]));
  const perUser = new Map<string, { email: string; role: string; views: number; distinctStudents: Set<string> }>();
  for (const r of rows) {
    const u = r.userId ? who.get(r.userId) : undefined; if (!u) continue;
    const e = perUser.get(u.id) ?? { email: u.email, role: u.role, views: 0, distinctStudents: new Set<string>() };
    e.views++; if (r.entityId !== "list") e.distinctStudents.add(r.entityId); perUser.set(u.id, e);
  }
  res.json({ windowDays: 30, total: rows.length, byUser: [...perUser.values()].map((e) => ({ email: e.email, role: e.role, views: e.views, distinctStudents: e.distinctStudents.size })).sort((a, b) => b.views - a.views).slice(0, 25),
    note: "Covers registry record reads and the student list only; other student-data endpoints are not yet logged." });
});

// ---- Batch 75 ------------------------------------------------------------------------------------------
// KFEAT-120 /issuance-register (+.csv) · KFEAT-058 /student-register.csv · KFEAT-110 /attachment-completion
insightsRouter.get("/issuance-register", requireAuth, requireInsight("awards"), async (req, res) => {
  const since = req.query.since ? new Date(String(req.query.since)) : new Date(Date.now() - 365 * 86_400_000);
  if (Number.isNaN(since.getTime())) return res.status(400).json({ message: "since must be a date, e.g. 2026-01-01." });
  const where = { issuedAt: { gte: since } };
  const [certs, trans, letters] = await Promise.all([
    prisma.certificate.findMany({ where, take: 2000, orderBy: { issuedAt: "desc" }, select: { documentId: true, issuedAt: true, revoked: true, revokedReason: true, qualification: true, student: { select: { studentNumber: true } } } }),
    prisma.transcript.findMany({ where, take: 2000, orderBy: { issuedAt: "desc" }, select: { documentId: true, issuedAt: true, revoked: true, revokedReason: true, student: { select: { studentNumber: true } } } }),
    prisma.generatedLetter.findMany({ where, take: 2000, orderBy: { issuedAt: "desc" }, select: { documentId: true, issuedAt: true, revoked: true, revokedReason: true, type: true, student: { select: { studentNumber: true } } } }),
  ]);
  const rows = [
    ...certs.map((c) => ({ kind: "certificate", detail: c.qualification, ...c })),
    ...trans.map((c) => ({ kind: "transcript", detail: "", ...c })),
    ...letters.map((c) => ({ kind: "letter", detail: c.type, ...c })),
  ].sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime());
  if (String(req.query.format) === "csv") {
    res.type("text/csv").send(toCsv(["kind", "document_id", "student_number", "detail", "issued_at", "status", "revoked_reason"], rows.map((r) => [r.kind, r.documentId, r.student.studentNumber, r.detail, r.issuedAt.toISOString(), r.revoked ? "revoked" : "valid", r.revokedReason ?? ""])));
    return;
  }
  res.json({ since, total: rows.length, revoked: rows.filter((r) => r.revoked).length, byKind: { certificate: certs.length, transcript: trans.length, letter: letters.length }, recent: rows.slice(0, 50).map((r) => ({ kind: r.kind, documentId: r.documentId, studentNumber: r.student.studentNumber, detail: r.detail, issuedAt: r.issuedAt, revoked: r.revoked })) });
});

insightsRouter.get("/student-register.csv", requireAuth, requireInsight("academic"), async (_req, res) => {
  const rows = await prisma.student.findMany({ take: 5000, orderBy: { studentNumber: "asc" }, select: { studentNumber: true, fullName: true, intake: true, studyMode: true, academicStatus: true, programme: { select: { name: true } } } });
  res.type("text/csv").send(toCsv(["student_number", "full_name", "programme", "intake", "study_mode", "academic_status"], rows.map((s) => [s.studentNumber, s.fullName, s.programme.name, s.intake, s.studyMode, s.academicStatus])));
});

insightsRouter.get("/attachment-completion", requireAuth, requireInsight("attachments"), async (_req, res) => {
  const placements = await prisma.attachmentPlacement.findMany({ take: 3000, select: { id: true, status: true, startDate: true, endDate: true, logbookEntries: { select: { supervisorSignOff: true } } } });
  const byStatus: Record<string, number> = {};
  let weeksExpected = 0, weeksLogged = 0, weeksSigned = 0, overdueOpen = 0;
  const now = new Date();
  for (const p of placements) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    weeksExpected += Math.max(1, Math.ceil((p.endDate.getTime() - p.startDate.getTime()) / (7 * 86_400_000)));
    weeksLogged += p.logbookEntries.length; weeksSigned += p.logbookEntries.filter((l) => l.supervisorSignOff).length;
    if (p.status === "active" && p.endDate < now) overdueOpen++;
  }
  res.json({ placements: placements.length, byStatus, logbook: { weeksExpected, weeksLogged, weeksSigned, loggedPercent: weeksExpected ? Math.round((weeksLogged / weeksExpected) * 100) : null, signedPercent: weeksLogged ? Math.round((weeksSigned / weeksLogged) * 100) : null }, activePastEndDate: overdueOpen });
});
