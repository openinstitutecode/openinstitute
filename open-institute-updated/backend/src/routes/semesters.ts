// LMS003 — Semester Management: full CRUD for configuring semesters per programme
import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { isEightWeekTerm } from "../lib/term-registration.js";

const router = Router();

const termSettingsSchema = z.object({
  maxCreditsPerTerm: z.coerce.number().int().min(24).max(36).default(24),
  creditRate: z.coerce.number().int().min(300).max(500).default(300),
});

const createTermSchema = z.object({
  programmeId: z.string().min(1),
  semesterNumber: z.coerce.number().int().positive(),
  academicYear: z.string().min(4),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  registrationOpen: z.coerce.date(),
  registrationClose: z.coerce.date(),
  assessmentStart: z.coerce.date(),
  assessmentEnd: z.coerce.date(),
  resultsDueDate: z.coerce.date(),
  maxCreditsPerTerm: termSettingsSchema.shape.maxCreditsPerTerm,
  creditRate: termSettingsSchema.shape.creditRate,
});

// GET /api/semesters — list all semesters (admin/registrar filtered)
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { programmeId, isActive } = req.query;
  
  try {
    const filter: any = {};
    if (programmeId) filter.programmeId = programmeId;
    if (isActive !== undefined) filter.isActive = isActive === "true";
    
    const semesters = await prisma.semesterConfig.findMany({
      where: filter,
      include: {
        programme: { select: { id: true, name: true, slug: true } },
        createdByUser: { select: { id: true, email: true } }
      },
      orderBy: [{ programmeId: "asc" }, { academicYear: "desc" }, { semesterNumber: "asc" }]
    });
    
    res.json(semesters);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch semesters" });
  }
});

// GET /api/semesters/:id — fetch one semester
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const semester = await prisma.semesterConfig.findUnique({
      where: { id: req.params.id },
      include: {
        programme: true,
        createdByUser: { select: { id: true, email: true } }
      }
    });
    
    if (!semester) return res.status(404).json({ error: "Semester not found" });
    res.json(semester);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch semester" });
  }
});

// POST /api/semesters — create new semester (REGISTRAR only)
router.post("/", requireAuth, async (req: Request, res: Response) => {
  const parsed = createTermSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Provide valid term details, a maximum of 24-36 credits, and a rate of KES 300-500 per credit." });
  }
  const { programmeId, semesterNumber, academicYear, startDate, endDate, registrationOpen, registrationClose, assessmentStart, assessmentEnd, resultsDueDate, maxCreditsPerTerm, creditRate } = parsed.data;
  if (!isEightWeekTerm(startDate, endDate)) {
    return res.status(400).json({ error: "A continuous term must be exactly 8 weeks (56 calendar days, including the start and end dates)." });
  }
  if (registrationClose < registrationOpen || assessmentEnd < assessmentStart) {
    return res.status(400).json({ error: "Registration and assessment end dates must be on or after their start dates." });
  }
  
  // Verify user is registrar/admin
  const user = await prisma.user.findUnique({ where: { id: (req as any).user?.id || "" }, select: { role: true } });
  if (user?.role !== "REGISTRAR" && user?.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "Only registrars can create semesters" });
  }
  
  try {
    // Check programme exists
    const programme = await prisma.programme.findUnique({ where: { id: programmeId } });
    if (!programme) return res.status(404).json({ error: "Programme not found" });
    
    // Check unique semester per programme+year
    const existing = await prisma.semesterConfig.findUnique({
      where: {
        programmeId_semesterNumber_academicYear: {
          programmeId,
          semesterNumber,
          academicYear
        }
      }
    });
    if (existing) return res.status(400).json({ error: "Semester already exists for this programme+year" });
    
    const semester = await prisma.semesterConfig.create({
      data: {
        programmeId,
        semesterNumber,
        academicYear,
        startDate,
        endDate,
        registrationOpen,
        registrationClose,
        assessmentStart,
        assessmentEnd,
        resultsDueDate,
        termWeeks: 8,
        maxCreditsPerTerm,
        creditRate,
        adminFee: 1000,
        createdBy: (req as any).user?.id || ""
      },
      include: { programme: true }
    });
    
    res.status(201).json(semester);
  } catch (error) {
    res.status(500).json({ error: "Failed to create semester" });
  }
});

// PATCH /api/semesters/:id — update semester (REGISTRAR)
router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: (req as any).user?.id || "" }, select: { role: true } });
  if (user?.role !== "REGISTRAR" && user?.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "Only registrars can update semesters" });
  }
  
  const parsed = z.object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    registrationOpen: z.coerce.date().optional(),
    registrationClose: z.coerce.date().optional(),
    assessmentStart: z.coerce.date().optional(),
    assessmentEnd: z.coerce.date().optional(),
    resultsDueDate: z.coerce.date().optional(),
    isActive: z.boolean().optional(),
    maxCreditsPerTerm: z.coerce.number().int().min(24).max(36).optional(),
    creditRate: z.coerce.number().int().min(300).max(500).optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid term update. Maximum credits must be 24-36 and the per-credit rate must be KES 300-500." });
  }

  try {
    const existing = await prisma.semesterConfig.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Semester not found" });
    const changesPricingOrCalendar =
      parsed.data.startDate !== undefined ||
      parsed.data.endDate !== undefined ||
      parsed.data.maxCreditsPerTerm !== undefined ||
      parsed.data.creditRate !== undefined;
    if (changesPricingOrCalendar) {
      const invoices = await prisma.invoice.count({ where: { termConfigId: existing.id } });
      if (invoices > 0) {
        return res.status(409).json({ error: "Term dates, credit limits, and rates cannot be changed after student registration has created an invoice." });
      }
    }
    const startDate = parsed.data.startDate ?? existing.startDate;
    const endDate = parsed.data.endDate ?? existing.endDate;
    if ((parsed.data.startDate || parsed.data.endDate) && !isEightWeekTerm(startDate, endDate)) {
      return res.status(400).json({ error: "A continuous term must be exactly 8 weeks (56 calendar days, including the start and end dates)." });
    }
    const registrationOpen = parsed.data.registrationOpen ?? existing.registrationOpen;
    const registrationClose = parsed.data.registrationClose ?? existing.registrationClose;
    const assessmentStart = parsed.data.assessmentStart ?? existing.assessmentStart;
    const assessmentEnd = parsed.data.assessmentEnd ?? existing.assessmentEnd;
    if (registrationClose < registrationOpen || assessmentEnd < assessmentStart) {
      return res.status(400).json({ error: "Registration and assessment end dates must be on or after their start dates." });
    }
    const semester = await prisma.semesterConfig.update({
      where: { id: req.params.id },
      data: parsed.data,
      include: { programme: true }
    });
    
    res.json(semester);
  } catch (error) {
    res.status(500).json({ error: "Failed to update semester" });
  }
});

// POST /api/semesters/:id/activate — set this semester as active (only one per programme can be active)
router.post("/:id/activate", requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: (req as any).user?.id || "" }, select: { role: true } });
  if (user?.role !== "REGISTRAR" && user?.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "Only registrars can activate semesters" });
  }
  
  try {
    const semester = await prisma.semesterConfig.findUnique({
      where: { id: req.params.id },
      select: { programmeId: true }
    });
    if (!semester) return res.status(404).json({ error: "Semester not found" });
    
    // Deactivate all others for this programme
    await prisma.semesterConfig.updateMany({
      where: { programmeId: semester.programmeId, id: { not: req.params.id } },
      data: { isActive: false }
    });
    
    // Activate this one
    const updated = await prisma.semesterConfig.update({
      where: { id: req.params.id },
      data: { isActive: true },
      include: { programme: true }
    });
    
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Failed to activate semester" });
  }
});

// DELETE /api/semesters/:id — delete semester (must have no enrollments)
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: (req as any).user?.id || "" }, select: { role: true } });
  if (user?.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "Only super admins can delete semesters" });
  }
  
  try {
    const term = await prisma.semesterConfig.findUnique({
      where: { id: req.params.id },
      select: { id: true, programmeId: true, academicYear: true, semesterNumber: true },
    });
    if (!term) return res.status(404).json({ error: "Semester not found" });
    const label = `${term.academicYear} Term ${term.semesterNumber}`;
    const [invoiceCount, enrollmentCount] = await Promise.all([
      prisma.invoice.count({ where: { termConfigId: term.id } }),
      prisma.enrollment.count({ where: { semester: label, unit: { programmeId: term.programmeId } } }),
    ]);
    if (invoiceCount || enrollmentCount) {
      return res.status(409).json({ error: "A term with student registrations or invoices cannot be deleted." });
    }
    await prisma.semesterConfig.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete semester (may have dependent records)" });
  }
});

export default router;
