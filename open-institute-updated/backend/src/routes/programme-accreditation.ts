import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

// QA009 — Programme Accreditation workflow

// Get accreditation status for all programmes
router.get(
  "/status",
  requireAuth,
  requireRole("QA_OFFICER", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const programmes = await prisma.programme.findMany({
        select: {
          id: true,
          name: true,
          approvalStatus: true,
          accreditationReviews: {
            orderBy: { reviewDate: "desc" },
            take: 1,
          },
        },
      });
      
      res.json(programmes);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Get accreditation history for a programme
router.get(
  "/:programmeId/history",
  requireAuth,
  requireRole("QA_OFFICER", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const { programmeId } = req.params;
      
      const reviews = await prisma.accreditationReview.findMany({
        where: { programmeId },
        include: {
          reviewer: { select: { id: true, email: true } },
        },
        orderBy: { reviewDate: "desc" },
      });
      
      res.json(reviews);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Submit programme for accreditation review
router.post(
  "/:programmeId/submit",
  requireAuth,
  requireRole("PROGRAMME_COORDINATOR", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const { programmeId } = req.params;
      
      const programme = await prisma.programme.findUnique({
        where: { id: programmeId },
      });
      
      if (!programme) {
        return res.status(404).json({ error: "Programme not found" });
      }
      
      // Update programme status to pending review
      await prisma.programme.update({
        where: { id: programmeId },
        data: { approvalStatus: "pending" },
      });
      
      await prisma.auditLog.create({
        data: {
          userId: (req as any).user?.id,
          action: "PROGRAMME_SUBMITTED_FOR_ACCREDITATION",
          entityType: "Programme",
          entityId: programmeId,
          metadata: { detail: `${programme.name} submitted for accreditation review` },
        },
      });
      
      res.json({ message: "Programme submitted for review" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// QA officer records accreditation decision
router.post(
  "/:programmeId/decision",
  requireAuth,
  requireRole("QA_OFFICER", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const { programmeId } = req.params;
      const { decision, feedbackSummary, conditions, validUntil } = req.body;
      
      if (!["accredited", "conditional", "rejected"].includes(decision)) {
        return res.status(400).json({ error: "Invalid decision" });
      }
      
      const programme = await prisma.programme.findUnique({
        where: { id: programmeId },
      });
      
      if (!programme) {
        return res.status(404).json({ error: "Programme not found" });
      }
      
      // Create accreditation review record
      const review = await prisma.accreditationReview.create({
        data: {
          programmeId,
          reviewerId: (req as any).user?.id,
          decision,
          feedbackSummary,
          conditions,
          validUntil: validUntil ? new Date(validUntil) : null,
        },
      });
      
      // Update programme approval status
      let newStatus = "withdrawn";
      if (decision === "accredited") {
        newStatus = "accredited";
      } else if (decision === "conditional") {
        newStatus = "accredited"; // accredited with conditions
      }
      // rejected stays as "pending"
      
      if (decision !== "rejected") {
        await prisma.programme.update({
          where: { id: programmeId },
          data: { approvalStatus: newStatus },
        });
      }
      
      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: (req as any).user?.id,
          action: "PROGRAMME_ACCREDITATION_DECISION",
          entityType: "Programme",
          entityId: programmeId,
          metadata: { decision, conditions: conditions ?? null, detail: `${programme.name}: ${decision}${conditions ? ` with conditions: ${conditions}` : ""}` },
        },
      });
      
      res.json(review);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

export default router;
