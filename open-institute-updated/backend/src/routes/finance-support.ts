import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const feeStructureRouter = Router();

feeStructureRouter.get("/:programmeId", requireAuth, async (req, res) => {
  const items = await prisma.feeStructureItem.findMany({
    where: { programmeId: req.params.programmeId },
    orderBy: { semester: "asc" },
  });
  res.json(items);
});

const itemSchema = z.object({
  programmeId: z.string(),
  semester: z.number().int().positive(),
  item: z.string().min(2),
  amount: z.number().positive(),
});

feeStructureRouter.post(
  "/",
  requireAuth,
  requireRole("FINANCE_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid fee structure item." });
    const item = await prisma.feeStructureItem.create({ data: parsed.data });
    res.status(201).json(item);
  }
);

export const scholarshipsRouter = Router();

const scholarshipSchema = z.object({
  studentId: z.string(),
  sponsorName: z.string().min(2),
  type: z.enum(["scholarship", "sponsorship", "discount"]),
  amount: z.number().positive(),
  semester: z.string(),
});

scholarshipsRouter.post(
  "/",
  requireAuth,
  requireRole("FINANCE_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = scholarshipSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid scholarship record." });

    const scholarship = await prisma.scholarship.create({
      data: { ...parsed.data, approvedById: req.user!.id },
    });

    // Applying a scholarship reduces the balance the same way a payment
    // does — but is logged as a distinct Scholarship record so finance can
    // always see it was a waiver, not cash received.
    const openInvoice = await prisma.invoice.findFirst({
      where: { studentId: parsed.data.studentId, semester: parsed.data.semester, status: { not: "paid" } },
    });
    if (openInvoice) {
      await prisma.invoice.update({
        where: { id: openInvoice.id },
        data: { amountPaid: { increment: parsed.data.amount } },
      });
    }

    res.status(201).json(scholarship);
  }
);

scholarshipsRouter.get(
  "/",
  requireAuth,
  requireRole("FINANCE_OFFICER", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const scholarships = await prisma.scholarship.findMany({
      include: { student: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(scholarships);
  }
);

scholarshipsRouter.get("/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });
  const scholarships = await prisma.scholarship.findMany({ where: { studentId: student.id } });
  res.json(scholarships);
});
