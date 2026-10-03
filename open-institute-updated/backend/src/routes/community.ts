import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const communityRouter = Router();

communityRouter.get("/events", requireAuth, async (_req, res) => {
  const events = await prisma.event.findMany({
    where: { startsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
    take: 50,
  });
  res.json(events);
});

const eventSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  startsAt: z.string().datetime(),
  location: z.string().optional(),
});

communityRouter.post(
  "/events",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid event." });
    const event = await prisma.event.create({
      data: { ...parsed.data, startsAt: new Date(parsed.data.startsAt) },
    });
    res.status(201).json(event);
  }
);

communityRouter.get("/clubs", requireAuth, async (_req, res) => {
  const clubs = await prisma.club.findMany({
    include: { _count: { select: { memberships: true } } },
  });
  res.json(clubs);
});

communityRouter.post("/clubs/:id/join", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const membership = await prisma.clubMembership.upsert({
    where: { clubId_studentId: { clubId: req.params.id, studentId: student.id } },
    update: {},
    create: { clubId: req.params.id, studentId: student.id },
  });
  res.status(201).json(membership);
});
