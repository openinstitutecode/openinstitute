// LMS003 — Semester Management: full CRUD for configuring semesters per programme
import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

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
  const { programmeId, semesterNumber, academicYear, startDate, endDate, registrationOpen, registrationClose, assessmentStart, assessmentEnd, resultsDueDate } = req.body;
  
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
          semesterNumber: parseInt(semesterNumber),
          academicYear
        }
      }
    });
    if (existing) return res.status(400).json({ error: "Semester already exists for this programme+year" });
    
    const semester = await prisma.semesterConfig.create({
      data: {
        programmeId,
        semesterNumber: parseInt(semesterNumber),
        academicYear,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        registrationOpen: new Date(registrationOpen),
        registrationClose: new Date(registrationClose),
        assessmentStart: new Date(assessmentStart),
        assessmentEnd: new Date(assessmentEnd),
        resultsDueDate: new Date(resultsDueDate),
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
  
  try {
    const semester = await prisma.semesterConfig.update({
      where: { id: req.params.id },
      data: {
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
        registrationOpen: req.body.registrationOpen ? new Date(req.body.registrationOpen) : undefined,
        registrationClose: req.body.registrationClose ? new Date(req.body.registrationClose) : undefined,
        assessmentStart: req.body.assessmentStart ? new Date(req.body.assessmentStart) : undefined,
        assessmentEnd: req.body.assessmentEnd ? new Date(req.body.assessmentEnd) : undefined,
        resultsDueDate: req.body.resultsDueDate ? new Date(req.body.resultsDueDate) : undefined,
        isActive: req.body.isActive
      },
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
    await prisma.semesterConfig.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete semester (may have dependent records)" });
  }
});

export default router;
