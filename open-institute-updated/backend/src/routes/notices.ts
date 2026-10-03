// Batch 71 — KOBS-013/017/018: service incidents + maintenance notices.
//   GET /active (public, so a login page can show it) · staff: GET / · POST / · PATCH /:id
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { isVisibleNotice, availabilityPercent, majorOutageMinutes } from "../lib/service-notices.js";

export const noticesRouter = Router();
const STAFF = ["SUPER_ADMIN", "ICT_ADMIN", "PRINCIPAL"] as const;

noticesRouter.get("/active", async (_req, res) => {
  const rows = await prisma.serviceNotice.findMany({ where: { status: "active" }, orderBy: { startsAt: "asc" }, take: 20 });
  const now = new Date();
  res.json(rows.filter((n) => isVisibleNotice(n, now)).map((n) => ({ id: n.id, kind: n.kind, severity: n.severity, title: n.title, message: n.message, startsAt: n.startsAt, endsAt: n.endsAt, updates: n.updates })));
});

noticesRouter.get("/", requireAuth, requireRole(...STAFF), async (_req, res) => {
  const rows = await prisma.serviceNotice.findMany({ orderBy: { startsAt: "desc" }, take: 100 });
  const window = 30;
  res.json({ windowDays: window, availabilityPercent: availabilityPercent(rows, window), majorOutageMinutes: majorOutageMinutes(rows, window), notices: rows,
    note: "Availability counts only incidents you mark 'major', from start to resolved. It is a manual record, not synthetic monitoring." });
});

const createSchema = z.object({
  kind: z.enum(["incident", "maintenance"]), severity: z.enum(["minor", "major"]).default("minor"),
  title: z.string().min(3).max(120), message: z.string().min(3).max(1000),
  startsAt: z.coerce.date().optional(), endsAt: z.coerce.date().optional(),
}).refine((v) => v.kind !== "maintenance" || (v.startsAt && v.endsAt), { message: "Maintenance needs a start and an end." })
  .refine((v) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt, { message: "The end must be after the start." });

noticesRouter.post("/", requireAuth, requireRole(...STAFF), async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid notice.", code: "BAD_REQUEST" });
  const d = parsed.data;
  const n = await prisma.serviceNotice.create({ data: { kind: d.kind, severity: d.kind === "maintenance" ? "minor" : d.severity, title: d.title, message: d.message, startsAt: d.startsAt ?? new Date(), endsAt: d.kind === "maintenance" ? d.endsAt : null, createdById: req.user!.id } });
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: "SERVICE_NOTICE_CREATED", entityType: "ServiceNotice", entityId: n.id, metadata: { kind: n.kind, severity: n.severity } } });
  res.status(201).json(n);
});

const updateSchema = z.object({ action: z.enum(["update", "resolve", "cancel"]), text: z.string().min(3).max(1000).optional() })
  .refine((v) => v.action === "cancel" || !!v.text, { message: "Add a short update text." });
noticesRouter.patch("/:id", requireAuth, requireRole(...STAFF), async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid update.", code: "BAD_REQUEST" });
  const n = await prisma.serviceNotice.findUnique({ where: { id: req.params.id } });
  if (!n) return res.status(404).json({ message: "Notice not found.", code: "NOT_FOUND" });
  if (n.status !== "active") return res.status(409).json({ message: "This notice is already closed.", code: "CONFLICT" });
  const { action, text } = parsed.data;
  const entry = text ? [...(n.updates as object[]), { at: new Date().toISOString(), by: req.user!.id, text }] : (n.updates as object[]);
  const u = await prisma.serviceNotice.update({ where: { id: n.id }, data: { updates: entry as object[], ...(action === "resolve" ? { status: "resolved", endsAt: new Date() } : action === "cancel" ? { status: "cancelled" } : {}) } });
  await prisma.auditLog.create({ data: { userId: req.user!.id, action: `SERVICE_NOTICE_${action.toUpperCase()}`, entityType: "ServiceNotice", entityId: n.id } });
  res.json(u);
});
