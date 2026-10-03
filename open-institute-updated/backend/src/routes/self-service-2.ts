// Batch 72 — more student self-service, read-mostly, no schema change. Mounted at /api/self.
//   KFEAT-001 /profile · 003 /documents · 004 /services · 008 /transcript · 010 /alerts · 079 /announcements
//   KDATA-005 /privacy-notice · KFEAT-093/096 /reading-lists, /bookmarks
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { badRequest, notFound } from "../middleware/error-handler.js";
import { buildTranscript, progressionAlerts, SELF_SERVICES, RATING_VALUES } from "../lib/batch72.js";
import { classifyInvoice } from "../lib/quickwins.js";
import { getSetting } from "../lib/settings.js";

export const selfService2Router = Router();

async function me(req: AuthedRequest) {
  const s = await prisma.student.findUnique({ where: { userId: req.user!.id }, include: { programme: { select: { name: true, qualificationLevel: true } } } });
  if (!s) throw notFound("No student record for this account.");
  return s;
}

// KFEAT-001 — one profile view over everything the student already has.
selfService2Router.get("/profile", requireAuth, async (req: AuthedRequest, res) => {
  const s = await me(req);
  const [enrol, invoices, holds, tickets, placements, competent, certs] = await Promise.all([
    prisma.enrollment.groupBy({ by: ["status"], where: { studentId: s.id }, _count: { _all: true } }),
    prisma.invoice.findMany({ where: { studentId: s.id }, select: { amountDue: true, amountPaid: true, dueDate: true } }),
    prisma.financialHold.count({ where: { studentId: s.id, releasedAt: null } }),
    prisma.helpdeskTicket.count({ where: { studentId: s.id, status: { in: ["open", "in_progress", "escalated"] } } }),
    prisma.attachmentPlacement.count({ where: { studentId: s.id, status: "active" } }),
    prisma.competencyRecord.count({ where: { studentId: s.id, level: { in: ["competent", "advanced"] } } }),
    prisma.certificate.count({ where: { studentId: s.id, revoked: false } }),
  ]);
  const outstanding = invoices.reduce((a, i) => a + classifyInvoice(i).outstanding, 0);
  res.json({
    studentNumber: s.studentNumber, admissionNumber: s.admissionNumber, fullName: s.fullName, intake: s.intake, studyMode: s.studyMode, academicStatus: s.academicStatus,
    programme: s.programme, emergencyContact: s.emergencyContactName ? { name: s.emergencyContactName, phone: s.emergencyContactPhone } : null,
    enrolments: Object.fromEntries(enrol.map((e) => [e.status, e._count._all])),
    feesOutstanding: Math.round(outstanding * 100) / 100, activeHolds: holds, openTickets: tickets, activePlacements: placements, competenciesAchieved: competent, certificates: certs,
  });
});

// KFEAT-003 — everything issued to or uploaded by the student, one list.
selfService2Router.get("/documents", requireAuth, async (req: AuthedRequest, res) => {
  const s = await me(req);
  const [uploads, transcripts, certs, letters] = await Promise.all([
    prisma.document.findMany({ where: { ownerUserId: req.user!.id }, orderBy: { uploadedAt: "desc" }, take: 100 }),
    prisma.transcript.findMany({ where: { studentId: s.id }, orderBy: { issuedAt: "desc" } }),
    prisma.certificate.findMany({ where: { studentId: s.id }, orderBy: { issuedAt: "desc" } }),
    prisma.generatedLetter.findMany({ where: { studentId: s.id }, orderBy: { issuedAt: "desc" } }),
  ]);
  const items = [
    ...uploads.map((d) => ({ kind: "upload", id: d.id, label: d.category, date: d.uploadedAt, status: d.verified ? "verified" : "unverified", version: d.version })),
    ...transcripts.map((d) => ({ kind: "transcript", id: d.id, label: "Transcript", date: d.issuedAt, status: d.revoked ? "revoked" : "valid", verificationUrl: d.verificationUrl })),
    ...certs.map((d) => ({ kind: "certificate", id: d.id, label: d.qualification, date: d.issuedAt, status: d.revoked ? "revoked" : "valid", verificationUrl: d.verificationUrl })),
    ...letters.map((d) => ({ kind: "letter", id: d.id, label: d.type, date: d.issuedAt, status: d.revoked ? "revoked" : "valid", verificationUrl: d.verificationUrl })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());
  res.json({ total: items.length, items });
});

// KFEAT-004 — self-service centre: what can I do, and what needs my attention.
selfService2Router.get("/services", requireAuth, async (req: AuthedRequest, res) => {
  const s = await me(req);
  const [unread, openTickets, pendingRequests] = await Promise.all([
    prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
    prisma.helpdeskTicket.count({ where: { studentId: s.id, status: { in: ["open", "in_progress", "escalated"] } } }),
    prisma.dataRequest.count({ where: { userId: req.user!.id, status: { in: ["received", "in_progress"] } } }),
  ]);
  res.json({ needsAttention: { unreadNotifications: unread, openTickets, openDataRequests: pendingRequests }, services: SELF_SERVICES });
});

// KFEAT-008 — computed (unofficial) transcript + the officially issued, verifiable ones.
selfService2Router.get("/transcript", requireAuth, async (req: AuthedRequest, res) => {
  const s = await me(req);
  const [rows, issued] = await Promise.all([
    prisma.enrollment.findMany({ where: { studentId: s.id }, include: { unit: { select: { code: true, title: true, creditHours: true } } } }),
    prisma.transcript.findMany({ where: { studentId: s.id, revoked: false }, orderBy: { issuedAt: "desc" }, select: { id: true, issuedAt: true, verificationUrl: true } }),
  ]);
  res.json({ ...buildTranscript(rows), issued, note: "Computed from your unit results (credit-weighted, A=4 … E=0). Only an issued transcript is official." });
});

// KFEAT-010 — progression alerts.
selfService2Router.get("/alerts", requireAuth, async (req: AuthedRequest, res) => {
  const s = await me(req);
  const [enrollments, attendance, invoices, holds] = await Promise.all([
    prisma.enrollment.findMany({ where: { studentId: s.id }, select: { status: true, unit: { select: { code: true } } } }),
    prisma.attendanceRecord.findMany({ where: { studentId: s.id }, select: { present: true } }),
    prisma.invoice.findMany({ where: { studentId: s.id }, select: { amountDue: true, amountPaid: true, dueDate: true } }),
    prisma.financialHold.count({ where: { studentId: s.id, releasedAt: null } }),
  ]);
  const alerts = progressionAlerts({ enrollments, attendance, invoices, holds });
  res.json({ count: alerts.length, alerts });
});

// KFEAT-079 — announcements from the courses of the units the student is enrolled in (pinned first).
selfService2Router.get("/announcements", requireAuth, async (req: AuthedRequest, res) => {
  const s = await me(req);
  const units = await prisma.enrollment.findMany({ where: { studentId: s.id, status: "in_progress" }, select: { unitId: true } });
  const rows = await prisma.courseAnnouncement.findMany({
    where: { course: { unitId: { in: units.map((u) => u.unitId) } } },
    include: { course: { select: { id: true, unit: { select: { code: true, title: true } } } } }, orderBy: { createdAt: "desc" }, take: 50,
  });
  const now = Date.now();
  const list = rows.map((a) => ({ id: a.id, title: a.title, content: a.content, importance: a.importance, pinned: !!a.pinnedUntil && a.pinnedUntil.getTime() > now, createdAt: a.createdAt, unit: a.course.unit }));
  list.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  res.json(list);
});

// KDATA-005 — acknowledge the current privacy notice version; history is the audit log.
selfService2Router.get("/privacy-notice", requireAuth, async (req: AuthedRequest, res) => {
  const notice = await getSetting("privacy.notice");
  const last = await prisma.auditLog.findFirst({ where: { userId: req.user!.id, action: "PRIVACY_NOTICE_ACK" }, orderBy: { createdAt: "desc" } });
  const ackVersion = (last?.metadata as { version?: string } | null)?.version ?? null;
  res.json({ notice, acknowledgedVersion: ackVersion, acknowledgedAt: last?.createdAt ?? null, needsAcknowledgement: notice.version !== "0" && ackVersion !== notice.version });
});
selfService2Router.post("/privacy-notice/acknowledge", requireAuth, async (req: AuthedRequest, res) => {
  const notice = await getSetting("privacy.notice");
  if (notice.version === "0") throw badRequest("No privacy notice has been published yet.");
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: "PRIVACY_NOTICE_ACK", entityType: "PrivacyNotice", entityId: notice.version, metadata: { version: notice.version } } });
  res.status(201).json({ acknowledgedVersion: notice.version });
});

// KFEAT-096 — my bookmarks (create/delete already live under /api/library/bookmarks/:id).
selfService2Router.get("/bookmarks", requireAuth, async (req: AuthedRequest, res) => {
  const rows = await prisma.libraryBookmark.findMany({ where: { userId: req.user!.id }, include: { resource: { select: { id: true, title: true, author: true, type: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  res.json(rows.map((b) => ({ resource: b.resource, note: b.note, savedAt: b.createdAt })));
});

// KFEAT-093 — personal reading lists (owner-only).
selfService2Router.get("/reading-lists", requireAuth, async (req: AuthedRequest, res) => {
  const lists = await prisma.readingList.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" }, include: { items: { include: { resource: { select: { id: true, title: true, author: true, type: true } } }, orderBy: { addedAt: "asc" } } } });
  res.json(lists.map((l) => ({ id: l.id, title: l.title, items: l.items.map((i) => i.resource) })));
});
selfService2Router.post("/reading-lists", requireAuth, async (req: AuthedRequest, res) => {
  const p = z.object({ title: z.string().min(2).max(120) }).safeParse(req.body);
  if (!p.success) throw badRequest("A title of 2–120 characters is required.");
  res.status(201).json(await prisma.readingList.create({ data: { userId: req.user!.id, title: p.data.title } }));
});
selfService2Router.post("/reading-lists/:id/items", requireAuth, async (req: AuthedRequest, res) => {
  const p = z.object({ resourceId: z.string().min(1) }).safeParse(req.body);
  if (!p.success) throw badRequest("resourceId is required.");
  const list = await prisma.readingList.findFirst({ where: { id: req.params.id, userId: req.user!.id }, include: { items: { select: { resourceId: true } } } });
  if (!list) throw notFound("Reading list not found.");
  if (list.items.some((i) => i.resourceId === p.data.resourceId)) return res.json({ added: false, reason: "already in list" });
  if (!(await prisma.libraryResource.findUnique({ where: { id: p.data.resourceId }, select: { id: true } }))) throw notFound("Resource not found.");
  await prisma.readingListItem.create({ data: { readingListId: list.id, resourceId: p.data.resourceId } });
  res.status(201).json({ added: true });
});
selfService2Router.delete("/reading-lists/:id/items/:resourceId", requireAuth, async (req: AuthedRequest, res) => {
  const list = await prisma.readingList.findFirst({ where: { id: req.params.id, userId: req.user!.id }, select: { id: true } });
  if (!list) throw notFound("Reading list not found.");
  await prisma.readingListItem.deleteMany({ where: { readingListId: list.id, resourceId: req.params.resourceId } });
  res.status(204).end();
});

// KAI-020 — rate an AI answer. Stored in the audit log (no schema change); staff summary: GET /api/insights/ai-feedback.
selfService2Router.post("/ai-feedback", requireAuth, async (req: AuthedRequest, res) => {
  const p = z.object({ messageId: z.string().min(1), rating: z.enum(RATING_VALUES), comment: z.string().max(500).optional() }).safeParse(req.body);
  if (!p.success) throw badRequest("messageId and a rating (helpful, not_helpful, wrong, unsafe) are required.");
  const msg = await prisma.aiMessage.findFirst({ where: { id: p.data.messageId, role: "assistant", conversation: { userId: req.user!.id } }, select: { id: true } });
  if (!msg) throw notFound("That AI answer was not found in your conversations.");
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: "AI_RESPONSE_FEEDBACK", entityType: "AiMessage", entityId: msg.id, metadata: { rating: p.data.rating, comment: p.data.comment ?? null } } });
  res.status(201).json({ recorded: true });
});
