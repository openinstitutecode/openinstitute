import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const commandCentreRouter = Router();

// Every number here is a real count against current data — nothing is
// simulated or hardcoded. On an empty database this correctly returns zeros.
commandCentreRouter.get(
  "/",
  requireAuth,
  requireRole("PRINCIPAL", "DEPUTY_PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const [
      activeStudents,
      pendingApplications,
      openComplianceItems,
      openIntegrityCases,
      openComplaints,
      overdueInvoiceCount,
      ungradedSubmissions,
      expiringLicences,
    ] = await Promise.all([
      prisma.student.count({ where: { academicStatus: "ACTIVE" } }),
      prisma.application.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
      prisma.complianceRequirement.count({ where: { mandatory: true, status: { not: "met" } } }),
      prisma.integrityCase.count({ where: { status: "under_review" } }),
      prisma.complaint.count({ where: { status: "open" } }),
      prisma.invoice.count({ where: { status: "overdue" } }),
      prisma.submission.count({ where: { score: null } }),
      prisma.trainer.count({
        where: { licenceExpiry: { lte: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) } },
      }),
    ]);

    // Simple, transparent at-risk heuristic: students who haven't submitted
    // work in over 12 days across any enrollment. Flagged for a human to
    // review — never an automated academic decision.
    const twelveDaysAgo = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000);
    const recentSubmitterIds = await prisma.submission.findMany({
      where: { submittedAt: { gte: twelveDaysAgo } },
      select: { studentUserId: true },
      distinct: ["studentUserId"],
    });
    const recentIds = new Set(recentSubmitterIds.map((s) => s.studentUserId));
    const allActiveStudents = await prisma.student.findMany({
      where: { academicStatus: "ACTIVE" },
      select: { userId: true },
    });
    const disengagedCount = allActiveStudents.filter((s) => !recentIds.has(s.userId)).length;

    res.json({
      today: {
        activeStudents,
        pendingApplications,
        overdueInvoices: overdueInvoiceCount,
        ungradedSubmissions,
      },
      alerts: [
        openComplianceItems > 0 && {
          level: "warn",
          message: `${openComplianceItems} mandatory compliance item(s) not yet met.`,
        },
        openIntegrityCases > 0 && {
          level: "warn",
          message: `${openIntegrityCases} academic integrity case(s) awaiting a decision.`,
        },
        openComplaints > 0 && {
          level: "neutral",
          message: `${openComplaints} open complaint(s) awaiting a response.`,
        },
        expiringLicences > 0 && {
          level: "danger",
          message: `${expiringLicences} trainer licence(s) expiring within 60 days.`,
        },
        disengagedCount > 0 && {
          level: "danger",
          message: `${disengagedCount} active student(s) with no submission in 12+ days — review before assuming withdrawal.`,
        },
      ].filter(Boolean),
    });
  }
);
