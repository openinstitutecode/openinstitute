import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const cpdRouter = Router();

cpdRouter.get("/mine", requireAuth, async (req: AuthedRequest, res) => {
  const trainer = await prisma.trainer.findUnique({ where: { userId: req.user!.id } });
  if (!trainer) return res.status(404).json({ message: "No trainer record for this account." });

  const activities = await prisma.cpdActivity.findMany({
    where: { trainerId: trainer.id },
    orderBy: { completedAt: "desc" },
  });
  res.json(activities);
});

const cpdSchema = z.object({
  title: z.string().min(2),
  provider: z.string().optional(),
  hours: z.number().positive(),
  completedAt: z.string().datetime(),
  evidenceUrl: z.string().url().optional(),
});

cpdRouter.post("/mine", requireAuth, requireRole("TRAINER"), async (req: AuthedRequest, res) => {
  const parsed = cpdSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid CPD record." });

  const trainer = await prisma.trainer.findUnique({ where: { userId: req.user!.id } });
  if (!trainer) return res.status(404).json({ message: "No trainer record for this account." });

  const activity = await prisma.cpdActivity.create({
    data: {
      trainerId: trainer.id,
      title: parsed.data.title,
      provider: parsed.data.provider,
      hours: parsed.data.hours,
      completedAt: new Date(parsed.data.completedAt),
      evidenceUrl: parsed.data.evidenceUrl,
    },
  });
  res.status(201).json(activity);
});

export const interventionsRouter = Router();

const noteSchema = z.object({ studentId: z.string(), note: z.string().min(3), actionTaken: z.string().optional() });

interventionsRouter.post(
  "/",
  requireAuth,
  requireRole("TRAINER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = noteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Write a note." });

    const trainer = await prisma.trainer.findUnique({ where: { userId: req.user!.id } });
    if (!trainer) return res.status(404).json({ message: "No trainer record for this account." });

    const note = await prisma.interventionNote.create({
      data: { ...parsed.data, trainerId: trainer.id },
    });
    res.status(201).json(note);
  }
);

interventionsRouter.get(
  "/student/:studentId",
  requireAuth,
  requireRole("TRAINER", "COUNSELLOR", "REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const notes = await prisma.interventionNote.findMany({
      where: { studentId: req.params.studentId },
      include: { trainer: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(notes);
  }
);
