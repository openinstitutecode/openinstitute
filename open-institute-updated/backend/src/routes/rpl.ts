import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const rplRouter = Router();

const applySchema = z.object({
  applicantName: z.string().min(2),
  applicantEmail: z.string().email(),
  programmeSlug: z.string(),
  experienceSummary: z.string().min(10),
});

// Public — someone applying for RPL doesn't need an account yet. This
// mirrors the flow TVETA's RPL guidance describes: evidence in, portfolio
// requested, assessor review, then a recorded decision — never an
// automatic credit award.
rplRouter.post("/apply", async (req, res) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Please complete all fields." });

  const programme = await prisma.programme.findUnique({ where: { slug: parsed.data.programmeSlug } });
  if (!programme) return res.status(400).json({ message: "Unknown programme." });

  const application = await prisma.rplApplication.create({
    data: {
      applicantName: parsed.data.applicantName,
      applicantEmail: parsed.data.applicantEmail,
      programmeId: programme.id,
      experienceSummary: parsed.data.experienceSummary,
    },
  });
  res.status(201).json({ id: application.id, status: application.status });
});

rplRouter.get(
  "/applications",
  requireAuth,
  requireRole("REGISTRAR", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const applications = await prisma.rplApplication.findMany({
      include: { programme: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(applications);
  }
);

const stageSchema = z.object({
  status: z.enum(["portfolio_requested", "assessing"]),
});

rplRouter.patch(
  "/applications/:id/stage",
  requireAuth,
  requireRole("REGISTRAR", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = stageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid stage." });
    const application = await prisma.rplApplication.update({
      where: { id: req.params.id },
      data: { status: parsed.data.status, assessorId: req.user!.id },
    });
    res.json(application);
  }
);

const decisionSchema = z.object({
  decision: z.enum(["full_credit", "partial_credit", "denied"]),
  creditedUnits: z.array(z.string()).default([]),
});

// A decision always requires a named assessor — RPL credit is never
// awarded by the system on its own.
rplRouter.patch(
  "/applications/:id/decision",
  requireAuth,
  requireRole("PROGRAMME_COORDINATOR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid decision." });

    const application = await prisma.rplApplication.update({
      where: { id: req.params.id },
      data: {
        status: "decided",
        decision: parsed.data.decision,
        creditedUnits: parsed.data.creditedUnits,
        assessorId: req.user!.id,
        decidedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: `RPL_${parsed.data.decision.toUpperCase()}`,
        entityType: "RplApplication",
        entityId: application.id,
      },
    });

    res.json(application);
  }
);
