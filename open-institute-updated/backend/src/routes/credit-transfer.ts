import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

// RG008 — Credit transfer request workflow

// Student creates credit transfer request
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const studentId = (req as any).user?.id;
    const { fromUnitId, fromUnitName, toUnitId } = req.body;
    
    if (!fromUnitId || !fromUnitName || !toUnitId) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    // Verify toUnit exists and belongs to student's programme
    const toUnit = await prisma.unit.findUnique({
      where: { id: toUnitId },
      include: { programme: true },
    });
    
    if (!toUnit) {
      return res.status(404).json({ error: "Target unit not found" });
    }
    
    // Verify student's programme matches
    const student = await prisma.student.findUnique({
      where: { userId: studentId },
    });
    
    if (!student || student.programmeId !== toUnit.programmeId) {
      return res.status(403).json({ error: "Unit does not belong to your programme" });
    }
    
    // Create request
    const request = await prisma.creditTransferRequest.create({
      data: {
        studentId,
        fromUnitId,
        fromUnitName,
        toUnitId,
      },
      include: { toUnit: true, student: { select: { id: true, email: true, student: { select: { fullName: true, studentNumber: true } } } } },
    });
    
    res.json(request);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get student's credit transfer requests
router.get("/mine", requireAuth, async (req: Request, res: Response) => {
  try {
    const studentId = (req as any).user?.id;
    
    const requests = await prisma.creditTransferRequest.findMany({
      where: { studentId },
      include: {
        toUnit: { include: { programme: true } },
        reviewedBy: { select: { id: true, email: true } },
      },
      orderBy: { requestedAt: "desc" },
    });
    
    res.json(requests);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin/Registrar views pending requests
router.get(
  "/pending",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const requests = await prisma.creditTransferRequest.findMany({
        where: { status: "pending" },
        include: {
        student: { select: { id: true, email: true, student: { select: { fullName: true, studentNumber: true, programme: true } } } },
          toUnit: { include: { programme: true } },
        },
        orderBy: { requestedAt: "asc" },
      });
      
      res.json(requests);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Admin approves/rejects credit transfer
router.patch(
  "/:requestId",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const { requestId } = req.params;
      const { status, adminFeedback, prerequisiteCheck } = req.body;
      
      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      
      const request = await prisma.creditTransferRequest.update({
        where: { id: requestId },
        data: {
          status,
          adminFeedback,
          prerequisiteCheck: prerequisiteCheck || false,
          reviewedById: (req as any).user?.id,
          reviewedAt: new Date(),
        },
        include: {
          student: { select: { id: true, email: true, student: { select: { fullName: true, studentNumber: true } } } },
          toUnit: true,
        },
      });

      // RG008 — an approval used to only flip `status` and write an
      // AuditLog line; nothing downstream (transcript, academic history,
      // standing computation) ever reflected it, so the credit didn't
      // actually count toward the student's record. Now it writes the
      // same AcademicRecordChange (type: "exemption") the RG010 exemption
      // path uses — the single real source registry.ts's academic-history
      // and standing views already read from — AND creates a completed
      // Enrollment for the target unit so the unit shows up as satisfied
      // everywhere a normal completed unit would (transcripts, progression
      // checks), grade recorded as "CR" (credit) rather than a numeric
      // score, matching how a transferred/exempted unit is conventionally
      // marked on a transcript.
      if (status === "approved") {
        const studentRecord = await prisma.student.findUnique({ where: { userId: request.studentId } });
        if (studentRecord) {
          const activeSemesterConfig = await prisma.semesterConfig.findFirst({
            where: { programmeId: studentRecord.programmeId },
            orderBy: [{ academicYear: "desc" }, { semesterNumber: "desc" }],
          });
          const currentSemester = activeSemesterConfig
            ? `${activeSemesterConfig.academicYear} Semester ${activeSemesterConfig.semesterNumber}`
            : "unspecified";

          await prisma.$transaction([
            prisma.academicRecordChange.create({
              data: {
                studentId: studentRecord.id,
                type: "exemption",
                detail: `Credit transfer: ${request.fromUnitName} → ${request.toUnit.title} (${request.toUnit.code})${prerequisiteCheck ? "" : " — approved without a prerequisite-equivalence confirmation on file"}`,
                effectiveDate: new Date(),
                approvedById: (req as any).user?.id,
              },
            }),
            prisma.enrollment.upsert({
              where: { studentId_unitId_semester: { studentId: studentRecord.id, unitId: request.toUnitId, semester: currentSemester } },
              update: { status: "completed", finalGrade: "CR" },
              create: {
                studentId: studentRecord.id,
                unitId: request.toUnitId,
                semester: currentSemester,
                status: "completed",
                finalGrade: "CR",
              },
            }),
            prisma.auditLog.create({
              data: {
                userId: (req as any).user?.id,
                action: "CREDIT_TRANSFER_APPROVED",
                entityType: "CreditTransferRequest",
                entityId: requestId,
                metadata: { detail: `Credit transfer approved: ${request.fromUnitName} → ${request.toUnit.title} — real Enrollment (grade CR) + AcademicRecordChange written` },
              },
            }),
          ]);
        }
      }

      res.json(request);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

export default router;
