import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const wellbeingRouter = Router();

const counsellingSchema = z.object({
  reason: z.string().min(3),
  preferredMode: z.enum(["video_call", "phone", "in_app_chat"]).default("video_call"),
});

wellbeingRouter.post("/counselling", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = counsellingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Tell us briefly what this is about." });

  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const request = await prisma.counsellingRequest.create({
    data: { studentId: student.id, ...parsed.data },
  });
  res.status(201).json(request);
});

wellbeingRouter.get(
  "/counselling",
  requireAuth,
  requireRole("COUNSELLOR", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const requests = await prisma.counsellingRequest.findMany({
      include: { student: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(requests);
  }
);

const accommodationSchema = z.object({
  needDescription: z.string().min(3),
});

wellbeingRouter.post("/accommodations", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = accommodationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Describe the accommodation you need." });

  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const request = await prisma.accommodationRequest.create({
    data: { studentId: student.id, needDescription: parsed.data.needDescription },
  });
  res.status(201).json(request);
});

wellbeingRouter.get(
  "/accommodations",
  requireAuth,
  requireRole("COUNSELLOR", "REGISTRAR", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const requests = await prisma.accommodationRequest.findMany({
      include: { student: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(requests);
  }
);

const decisionSchema = z.object({ status: z.enum(["approved", "in_place", "denied"]) });

wellbeingRouter.patch(
  "/accommodations/:id",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid status." });
    const request = await prisma.accommodationRequest.update({
      where: { id: req.params.id },
      data: { status: parsed.data.status, reviewedById: req.user!.id },
    });
    res.json(request);
  }
);
