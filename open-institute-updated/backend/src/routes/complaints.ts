import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { Role } from "@prisma/client";

export const complaintsRouter = Router();

const categoryToRole: Record<string, Role> = {
  academic: Role.REGISTRAR,
  financial: Role.FINANCE_OFFICER,
  conduct: Role.COUNSELLOR,
  platform: Role.ICT_ADMIN,
  other: Role.PRINCIPAL,
};

const complaintSchema = z.object({
  category: z.enum(["academic", "financial", "conduct", "platform", "other"]),
  description: z.string().min(5),
  email: z.string().email().optional().or(z.literal("")),
});

// Public — no login required, so a prospective student or a member of the
// public can raise a concern too.
complaintsRouter.post("/", async (req, res) => {
  const parsed = complaintSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Please describe the issue." });

  const complaint = await prisma.complaint.create({
    data: {
      category: parsed.data.category,
      description: parsed.data.description,
      email: parsed.data.email || undefined,
      assignedRole: categoryToRole[parsed.data.category],
    },
  });

  res.status(201).json({ id: complaint.id });
});

complaintsRouter.get(
  "/",
  requireAuth,
  requireRole("REGISTRAR", "FINANCE_OFFICER", "COUNSELLOR", "ICT_ADMIN", "PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    // Staff see complaints routed to their own role, unless they're a super admin.
    const where = req.user!.role === "SUPER_ADMIN" ? {} : { assignedRole: req.user!.role as Role };
    const complaints = await prisma.complaint.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(complaints);
  }
);

const statusSchema = z.object({ status: z.enum(["open", "in_progress", "resolved"]) });

complaintsRouter.patch(
  "/:id",
  requireAuth,
  requireRole("REGISTRAR", "FINANCE_OFFICER", "COUNSELLOR", "ICT_ADMIN", "PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid status." });
    const complaint = await prisma.complaint.update({
      where: { id: req.params.id },
      data: { status: parsed.data.status },
    });
    res.json(complaint);
  }
);
