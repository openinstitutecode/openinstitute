import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { idempotent } from "../lib/idempotency.js";

export const supportRouter = Router();

const ticketSchema = z.object({
  subject: z.string().min(2).max(200),
  body: z.string().min(2).max(5000),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
});

supportRouter.post("/tickets", requireAuth, idempotent(), async (req: AuthedRequest, res) => {
  const parsed = ticketSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Fill in a subject and details." });

  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });

  const ticket = await prisma.helpdeskTicket.create({
    data: {
      raisedById: req.user!.id,
      studentId: student?.id,
      subject: parsed.data.subject,
      body: parsed.data.body,
      // KFEAT-077 — students can flag urgency; only staff can re-prioritise or assign (PATCH below).
      priority: parsed.data.priority === "urgent" ? "high" : parsed.data.priority ?? "normal",
    },
  });

  res.status(201).json(ticket);
});

// KFEAT-006 — a person's own cases and their current state.
supportRouter.get("/tickets/mine", requireAuth, async (req: AuthedRequest, res) => {
  const tickets = await prisma.helpdeskTicket.findMany({
    where: { raisedById: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, subject: true, status: true, priority: true, createdAt: true, resolvedAt: true, rating: true },
  });
  res.json(tickets);
});

// KFEAT-088 — the person who raised a RESOLVED ticket rates it once (1-5).
const ratingSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(1000).optional() });
supportRouter.post("/tickets/:id/rating", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = ratingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Rating must be a whole number from 1 to 5.", code: "BAD_REQUEST" });
  const t = await prisma.helpdeskTicket.findFirst({ where: { id: req.params.id, raisedById: req.user!.id } }); // someone else's id == missing
  if (!t) return res.status(404).json({ message: "Ticket not found.", code: "NOT_FOUND" });
  if (t.status !== "resolved") return res.status(409).json({ message: "You can rate a ticket once it is resolved.", code: "CONFLICT" });
  if (t.rating !== null) return res.status(409).json({ message: "This ticket has already been rated.", code: "CONFLICT" });
  const updated = await prisma.helpdeskTicket.update({ where: { id: t.id }, data: { rating: parsed.data.rating, ratingComment: parsed.data.comment, ratedAt: new Date() }, select: { id: true, rating: true } });
  res.json(updated);
});

supportRouter.get(
  "/tickets",
  requireAuth,
  requireRole("COUNSELLOR", "REGISTRAR", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const tickets = await prisma.helpdeskTicket.findMany({
      orderBy: { createdAt: "desc" },
      include: { student: true },
      take: 200,
    });
    res.json(tickets);
  }
);

const updateSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "escalated"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assignedToId: z.string().nullable().optional(),
}).refine((v) => v.status || v.priority || v.assignedToId !== undefined, "Nothing to update.");

supportRouter.patch(
  "/tickets/:id",
  requireAuth,
  requireRole("COUNSELLOR", "REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid update.", code: "BAD_REQUEST" });
    const existing = await prisma.helpdeskTicket.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Ticket not found.", code: "NOT_FOUND" });
    const { status, priority, assignedToId } = parsed.data;
    if (assignedToId) {
      const staff = await prisma.user.findFirst({ where: { id: assignedToId, isActive: true, role: { in: ["COUNSELLOR", "REGISTRAR", "SUPER_ADMIN", "ICT_ADMIN", "QA_OFFICER"] } }, select: { id: true } });
      if (!staff) return res.status(400).json({ message: "That user cannot be assigned tickets.", code: "BAD_REQUEST" });
    }
    const ticket = await prisma.helpdeskTicket.update({
      where: { id: existing.id },
      data: {
        ...(status ? { status, resolvedAt: status === "resolved" ? existing.resolvedAt ?? new Date() : null } : {}), // KFEAT-089: reopening clears the clock
        ...(priority ? { priority } : {}),
        ...(assignedToId !== undefined ? { assignedToId } : {}),
      },
    });
    res.json(ticket);
  }
);
