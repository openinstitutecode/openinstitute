import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const badgesRouter = Router();

badgesRouter.get("/", requireAuth, async (_req, res) => {
  const badges = await prisma.badge.findMany({ orderBy: { name: "asc" } });
  res.json(badges);
});

const badgeSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  iconEmoji: z.string().default("🏅"),
});

badgesRouter.post(
  "/",
  requireAuth,
  requireRole("PROGRAMME_COORDINATOR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = badgeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid badge." });
    const badge = await prisma.badge.create({ data: parsed.data });
    res.status(201).json(badge);
  }
);

const awardSchema = z.object({ studentId: z.string(), badgeId: z.string() });

badgesRouter.post(
  "/award",
  requireAuth,
  requireRole("TRAINER", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = awardSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Choose a student and badge." });

    const award = await prisma.studentBadge.upsert({
      where: { studentId_badgeId: { studentId: parsed.data.studentId, badgeId: parsed.data.badgeId } },
      update: {},
      create: { ...parsed.data, awardedById: req.user!.id },
    });
    res.status(201).json(award);
  }
);

badgesRouter.get("/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const awards = await prisma.studentBadge.findMany({
    where: { studentId: student.id },
    include: { badge: true },
    orderBy: { awardedAt: "desc" },
  });
  res.json(awards);
});
