import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { bucketDates, bucketAmounts } from "../lib/analytics-buckets.js";

// ---------------------------------------------------------------------------
// AD037 — Institutional analytics. Command Centre (AD001) gives a
// point-in-time snapshot ("today"); this gives real month-over-month
// trends across academics, finance, compliance, integrity and research —
// computed directly from timestamps already on real records, no
// simulated series. Bucketing logic lives in lib/analytics-buckets.ts so
// it's unit-tested without a database (see tests/analytics-buckets.test.ts).
// ---------------------------------------------------------------------------
export const institutionalAnalyticsRouter = Router();

const MONTHS_BACK = 6;

institutionalAnalyticsRouter.get(
  "/institutional",
  requireAuth,
  requireRole("PRINCIPAL", "DEPUTY_PRINCIPAL", "REGISTRAR", "FINANCE_OFFICER", "QA_OFFICER", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const since = new Date();
    since.setMonth(since.getMonth() - (MONTHS_BACK - 1));
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const [
      students,
      applications,
      payments,
      integrityCases,
      researchProjects,
      complianceItems,
      complaints,
      totalStudents,
      totalTrainers,
      invoiceTotals,
    ] = await Promise.all([
      prisma.student.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.application.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, status: true } }),
      prisma.payment.findMany({ where: { paidAt: { gte: since }, reversedAt: null }, select: { paidAt: true, amount: true } }),
      prisma.integrityCase.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.researchProject.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, status: true } }),
      prisma.complianceRequirement.findMany({ select: { status: true, mandatory: true } }),
      prisma.complaint.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, status: true } }),
      prisma.student.count(),
      prisma.trainer.count(),
      prisma.invoice.aggregate({ _sum: { amountDue: true, amountPaid: true } }),
    ]);

    const mandatoryTotal = complianceItems.filter((c) => c.mandatory).length;
    const mandatoryMet = complianceItems.filter((c) => c.mandatory && c.status === "met").length;

    const amountDue = Number(invoiceTotals._sum.amountDue ?? 0);
    const amountPaid = Number(invoiceTotals._sum.amountPaid ?? 0);

    res.json({
      windowMonths: MONTHS_BACK,
      enrollmentTrend: bucketDates(students.map((s) => s.createdAt), MONTHS_BACK),
      applicationsTrend: bucketDates(applications.map((a) => a.createdAt), MONTHS_BACK),
      applicationsByStatus: applications.reduce<Record<string, number>>((acc, a) => {
        acc[a.status] = (acc[a.status] ?? 0) + 1;
        return acc;
      }, {}),
      revenueTrend: bucketAmounts(payments.map((p) => ({ date: p.paidAt, amount: Number(p.amount) })), MONTHS_BACK),
      integrityCaseTrend: bucketDates(integrityCases.map((c) => c.createdAt), MONTHS_BACK),
      researchOutputTrend: bucketDates(researchProjects.map((r) => r.createdAt), MONTHS_BACK),
      complaintsTrend: bucketDates(complaints.map((c) => c.createdAt), MONTHS_BACK),
      complianceRate: {
        mandatoryTotal,
        mandatoryMet,
        percentMet: mandatoryTotal === 0 ? 0 : Math.round((mandatoryMet / mandatoryTotal) * 1000) / 10,
      },
      institutionSnapshot: {
        totalStudents,
        totalTrainers,
        studentTrainerRatio: totalTrainers === 0 ? null : Math.round((totalStudents / totalTrainers) * 10) / 10,
        feeCollectionRate: amountDue === 0 ? 0 : Math.round((amountPaid / amountDue) * 1000) / 10,
      },
    });
  }
);
