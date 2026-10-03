import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const graduationRouter = Router();

// Computes eligibility live from actual records rather than storing a
// separate "eligible" flag that could drift out of sync — a registrar should
// always see the current state of the real data. Shared by both the
// single-student audit and the whole-programme graduation list so the two
// views can never silently disagree.
//
// Three-tier result, matching the FINAL PRODUCT STANDARD spec: academic
// clearance and disciplinary clearance are hard gates (fail either and the
// student is simply "not eligible" — no amount of paid fees changes that).
// Finance and attachment clearance are conditions that can still be met
// later, so failing only those puts a student in "conditionally eligible"
// with an explanation of exactly what's outstanding.
async function computeEligibility(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      programme: { include: { units: true } },
      enrollments: true,
      feeInvoices: true,
      attachments: true,
      integrityCases: true,
    },
  });
  if (!student) return null;

  const requiredUnitCount = student.programme.units.length;
  const completedUnits = student.enrollments.filter((e) => e.status === "completed").length;
  const academicClearance = completedUnits >= requiredUnitCount;

  const feeBalance = student.feeInvoices.reduce(
    (sum, inv) => sum + Number(inv.amountDue) - Number(inv.amountPaid),
    0
  );
  const financeClearance = feeBalance <= 0;

  const attachmentClearance =
    !student.programme.requiresAttachment ||
    student.attachments.some((a) => a.status === "completed");

  const disciplinaryClearance = !student.integrityCases.some((c) => c.status === "upheld");

  const checks = {
    academicClearance: { met: academicClearance, completedUnits, requiredUnitCount },
    financeClearance: { met: financeClearance, feeBalance },
    attachmentClearance: { met: attachmentClearance, required: student.programme.requiresAttachment },
    disciplinaryClearance: { met: disciplinaryClearance },
  };

  let status: "eligible" | "conditionally_eligible" | "not_eligible";
  const outstanding: string[] = [];
  if (!academicClearance) outstanding.push(`${requiredUnitCount - completedUnits} unit(s) still incomplete`);
  if (!disciplinaryClearance) outstanding.push("an upheld integrity case is unresolved");
  if (!financeClearance) outstanding.push(`fee balance of ${feeBalance}`);
  if (!attachmentClearance) outstanding.push("industrial attachment not completed");

  if (academicClearance && disciplinaryClearance && financeClearance && attachmentClearance) {
    status = "eligible";
  } else if (academicClearance && disciplinaryClearance) {
    status = "conditionally_eligible";
  } else {
    status = "not_eligible";
  }

  return {
    studentId: student.id,
    studentNumber: student.studentNumber,
    fullName: student.fullName,
    programmeId: student.programmeId,
    status,
    eligible: status === "eligible", // kept for backward compatibility with existing callers
    checks,
    outstanding,
  };
}

graduationRouter.get(
  "/audit/:studentId",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const result = await computeEligibility(req.params.studentId);
    if (!result) return res.status(404).json({ message: "Student not found." });
    res.json(result);
  }
);

// RG017 — graduation clearance. computeEligibility() above is deliberately
// always live, but a registrar formally issuing clearance is a distinct
// real event and deserves its own permanent record, not just "re-run the
// audit again and it happened to say eligible that day". Refuses outright
// for a student who is not_eligible — clearance can never be issued around
// a hard gate (academic/disciplinary), only once the live data actually
// clears it.
graduationRouter.post(
  "/:studentId/issue-clearance",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const result = await computeEligibility(req.params.studentId);
    if (!result) return res.status(404).json({ message: "Student not found." });
    if (result.status === "not_eligible") {
      return res.status(400).json({
        message: "This student is not eligible — clearance cannot be issued while a hard gate is unmet.",
        outstanding: result.outstanding,
      });
    }

    const clearance = await prisma.graduationClearance.create({
      data: {
        studentId: result.studentId,
        issuedById: req.user!.id,
        eligibilityTier: result.status,
        snapshot: result,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "GRADUATION_CLEARANCE_ISSUED",
        entityType: "GraduationClearance",
        entityId: clearance.id,
        metadata: { studentId: result.studentId, eligibilityTier: result.status },
      },
    });

    res.status(201).json(clearance);
  }
);

// RG017 — real issuance history for a student, distinct from the always-
// live audit above: this is what was actually formally cleared and when,
// even if the student's live data has since changed (e.g. a later
// integrity finding doesn't retroactively un-issue a clearance already
// granted — it would simply block issuing another one).
graduationRouter.get(
  "/:studentId/clearance-history",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const clearances = await prisma.graduationClearance.findMany({
      where: { studentId: req.params.studentId },
      orderBy: { issuedAt: "desc" },
    });
    res.json(clearances);
  }
);

// RG018 — graduation list: every student in a programme, categorized
// eligible / conditionally eligible / not eligible, each with the exact
// reason. Built on the same computeEligibility used above — the two views
// cannot drift apart.
graduationRouter.get(
  "/list/:programmeId",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const students = await prisma.student.findMany({
      where: { programmeId: req.params.programmeId },
      select: { id: true },
    });

    const results = await Promise.all(students.map((s) => computeEligibility(s.id)));
    const valid = results.filter((r): r is NonNullable<typeof r> => r !== null);

    res.json({
      programmeId: req.params.programmeId,
      totalStudents: valid.length,
      eligible: valid.filter((r) => r.status === "eligible"),
      conditionallyEligible: valid.filter((r) => r.status === "conditionally_eligible"),
      notEligible: valid.filter((r) => r.status === "not_eligible"),
    });
  }
);
