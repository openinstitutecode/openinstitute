import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { dispatchNotification } from "../lib/notify.js";
import { parsePaging, pageMeta } from "../lib/pagination.js";

export const notificationsRouter = Router();

notificationsRouter.get("/mine", requireAuth, async (req: AuthedRequest, res) => {
  const unreadOnly = req.query.unread === "true";
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id, ...(unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(notifications);
});

// KFX-051 (KFX-014) — the unread badge had no source of truth; clients counted the 50 most recent rows.
notificationsRouter.get("/mine/unread-count", requireAuth, async (req: AuthedRequest, res) => {
  const unread = await prisma.notification.count({ where: { userId: req.user!.id, readAt: null } });
  res.json({ unread });
});

// KFEAT-086 / KFX-023 — paged history with channel + read filters.
notificationsRouter.get("/history", requireAuth, async (req: AuthedRequest, res) => {
  const p = parsePaging(req.query, { pageSize: 25, maxPageSize: 100 });
  const where = {
    userId: req.user!.id,
    ...(typeof req.query.channel === "string" && ["email", "sms", "push", "in_app"].includes(req.query.channel) ? { channel: req.query.channel } : {}),
    ...(req.query.unread === "true" ? { readAt: null } : {}),
  };
  const [total, items] = await Promise.all([prisma.notification.count({ where }), prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: p.skip, take: p.take })]);
  res.json({ ...pageMeta(total, p), items });
});

// KFEAT-082 / KFX-017 — channels and muted categories. Reminder jobs honour these (lib/reminder-jobs.ts).
const CATEGORIES = ["fees", "logbook", "announcement", "academic", "tasks", "reports"] as const;
const prefSchema = z.object({ inApp: z.boolean(), email: z.boolean(), sms: z.boolean(), mutedCategories: z.array(z.enum(CATEGORIES)).max(CATEGORIES.length) });
notificationsRouter.get("/preferences", requireAuth, async (req: AuthedRequest, res) => {
  const p = await prisma.notificationPreference.findUnique({ where: { userId: req.user!.id } });
  res.json({ inApp: p?.inApp ?? true, email: p?.email ?? true, sms: p?.sms ?? false, mutedCategories: p?.mutedCategories ?? [], categories: CATEGORIES });
});
notificationsRouter.put("/preferences", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = prefSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid preferences.", code: "BAD_REQUEST" });
  const data = { ...parsed.data, mutedCategories: [...new Set(parsed.data.mutedCategories)] };
  const saved = await prisma.notificationPreference.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id, ...data }, update: data });
  res.json({ inApp: saved.inApp, email: saved.email, sms: saved.sms, mutedCategories: saved.mutedCategories });
});

notificationsRouter.post("/mine/read-all", requireAuth, async (req: AuthedRequest, res) => {
  const { count } = await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ marked: count });
});

// KFX-050 / KSEC-008 — this used to update ANY notification by id (an IDOR: any signed-in user could
// mark another user's notifications read) and threw a 500 when the id did not exist. Scoped to the
// caller; someone else's id is indistinguishable from a missing one (404).
notificationsRouter.patch("/:id/read", requireAuth, async (req: AuthedRequest, res) => {
  const { count } = await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  const notification = await prisma.notification.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!notification) return res.status(404).json({ message: "Notification not found.", code: "NOT_FOUND" });
  res.json({ ...notification, changed: count > 0 });
});

const broadcastSchema = z.object({
  userIds: z.array(z.string()).min(1),
  channel: z.enum(["email", "sms", "push", "in_app"]),
  title: z.string().min(1),
  body: z.string().min(1),
});

// Staff broadcast — e.g. registrar announcing a deadline to a cohort.
notificationsRouter.post(
  "/broadcast",
  requireAuth,
  requireRole("REGISTRAR", "ADMISSIONS_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = broadcastSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid broadcast." });

    const everyone = await prisma.user.findMany({
      where: { id: { in: parsed.data.userIds } },
      include: { notificationPreference: true },
    });
    // KFEAT-082 — respect each person's channel switch and muted "announcement" category.
    const chanKey = { email: "email", sms: "sms", in_app: "inApp", push: "inApp" } as const;
    const recipients = everyone.filter((u) => {
      const pref = u.notificationPreference;
      return !pref || (pref[chanKey[parsed.data.channel]] && !pref.mutedCategories.includes("announcement"));
    });
    const skippedByPreference = everyone.length - recipients.length;

    const results = await Promise.all(
      recipients.map(async (u) => {
        const dispatch = await dispatchNotification({
          channel: parsed.data.channel,
          to: parsed.data.channel === "email" ? u.email : u.phone ?? u.email,
          title: parsed.data.title,
          body: parsed.data.body,
        });
        const notification = await prisma.notification.create({
          data: {
            userId: u.id,
            channel: parsed.data.channel,
            title: parsed.data.title,
            body: parsed.data.body,
            sentAt: dispatch.sent ? new Date() : undefined,
          },
        });
        return { userId: u.id, ...dispatch, notificationId: notification.id };
      })
    );

    res.status(201).json({ results, skippedByPreference });
  }
);
