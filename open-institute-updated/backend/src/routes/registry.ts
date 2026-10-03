import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { emitPortalEvent } from "../integration/events.js";

export const registryRouter = Router();

const changeSchema = z.object({
  studentId: z.string(),
  type: z.enum(["transfer", "exemption", "deferment", "withdrawal", "readmission"]),
  detail: z.string().min(3),
  effectiveDate: z.string().datetime(),
});

// A single, audited entry point for every registry status change. Each type
// also updates the student's AcademicStatus where that makes sense — a
// deferment sets ON_LEAVE, a withdrawal sets WITHDRAWN, a readmission sets
// ACTIVE — so the record and the status field can never drift apart.
registryRouter.post(
  "/record-changes",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = changeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid record change." });

    const statusMap: Record<string, "ON_LEAVE" | "WITHDRAWN" | "ACTIVE" | undefined> = {
      deferment: "ON_LEAVE",
      withdrawal: "WITHDRAWN",
      readmission: "ACTIVE",
      transfer: undefined,
      exemption: undefined,
    };

    const change = await prisma.academicRecordChange.create({
      data: {
        studentId: parsed.data.studentId,
        type: parsed.data.type,
        detail: parsed.data.detail,
        effectiveDate: new Date(parsed.data.effectiveDate),
        approvedById: req.user!.id,
      },
    });

    const newStatus = statusMap[parsed.data.type];
    if (newStatus) {
      await prisma.student.update({
        where: { id: parsed.data.studentId },
        data: { academicStatus: newStatus },
      });

      // Batch 65 — VBI006: tell the Lab whenever a status change actually
      // affects standing (ON_LEAVE/WITHDRAWN/ACTIVE) so it can deactivate
      // (or reactivate) the student's Lab account. Sent unconditionally —
      // the Lab already no-ops harmlessly if this student was never
      // mapped there (see IntegrationService._route_portal_event).
      emitPortalEvent({
        eventType: "student.status_changed",
        entityType: "Student",
        entityId: parsed.data.studentId,
        payload: { portalStudentId: parsed.data.studentId, status: newStatus === "ACTIVE" ? "ACTIVE" : "SUSPENDED" },
      }).catch((err) => console.error("Failed to queue student.status_changed for VBL sync", err));
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: `RECORD_CHANGE_${parsed.data.type.toUpperCase()}`,
        entityType: "Student",
        entityId: parsed.data.studentId,
      },
    });

    res.status(201).json(change);
  }
);

registryRouter.get(
  "/record-changes/:studentId",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const changes = await prisma.academicRecordChange.findMany({
      where: { studentId: req.params.studentId },
      orderBy: { createdAt: "desc" },
    });
    res.json(changes);
  }
);

// RG006 — academic history. Enrollment rows have existed since early
// batches, but there was no route that returned them as a browsable
// history — only individual pieces used elsewhere (standing, roadmap).
registryRouter.get(
  "/academic-history/:studentId",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const student = await prisma.student.findUnique({ where: { id: req.params.studentId } });
    if (!student) return res.status(404).json({ message: "Student not found." });

    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: student.id },
      include: { unit: true },
      orderBy: [{ semester: "asc" }, { createdAt: "asc" }],
    });

    res.json(
      enrollments.map((e) => ({
        id: e.id,
        unitCode: e.unit.code,
        unitTitle: e.unit.title,
        semester: e.semester,
        status: e.status,
        finalGrade: e.finalGrade,
        creditHours: e.unit.creditHours,
      }))
    );
  }
);

// RG015 — the defaults used when a programme has no ProgressionRule row of
// its own yet. These match the exact thresholds that used to be hardcoded
// directly into the standing computation below, so no existing programme's
// results change until a registrar deliberately configures something
// different for it.
const DEFAULT_PROGRESSION_RULE = {
  goodStandingMinAverage: 60,
  warningMinAverage: 50,
  maxFailedUnitsForGood: 0,
  maxFailedUnitsForWarning: 1,
};

// RG014 — academic standing: a simple, transparent computation from actual
// graded submissions, not a hidden formula. RG015 — the thresholds it uses
// are now a real per-programme configuration (ProgressionRule), not a
// number baked into the code; a programme with no rule configured falls
// back to the same defaults this route always used.
registryRouter.get(
  "/academic-standing/:studentId",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const student = await prisma.student.findUnique({
      where: { id: req.params.studentId },
      include: { user: true, enrollments: true, programme: { include: { progressionRule: true } } },
    });
    if (!student) return res.status(404).json({ message: "Student not found." });

    const submissions = await prisma.submission.findMany({
      where: { studentUserId: student.userId, score: { not: null } },
      include: { assessment: true },
    });

    const percentages = submissions
      .filter((s) => s.assessment)
      .map((s) => (s.score! / s.assessment!.totalMarks) * 100);
    const average = percentages.length > 0 ? percentages.reduce((a, b) => a + b, 0) / percentages.length : null;

    const failedUnits = student.enrollments.filter((e) => e.status === "failed").length;

    const rule = student.programme.progressionRule ?? DEFAULT_PROGRESSION_RULE;

    let standing: "good" | "warning" | "probation" | "insufficient_data";
    if (average === null) standing = "insufficient_data";
    else if (average >= rule.goodStandingMinAverage && failedUnits <= rule.maxFailedUnitsForGood) standing = "good";
    else if (average >= rule.warningMinAverage || failedUnits <= rule.maxFailedUnitsForWarning) standing = "warning";
    else standing = "probation";

    res.json({
      averageScore: average,
      failedUnitsCount: failedUnits,
      standing,
      ruleApplied: {
        goodStandingMinAverage: rule.goodStandingMinAverage,
        warningMinAverage: rule.warningMinAverage,
        maxFailedUnitsForGood: rule.maxFailedUnitsForGood,
        maxFailedUnitsForWarning: rule.maxFailedUnitsForWarning,
        isDefault: !student.programme.progressionRule,
      },
    });
  }
);

// RG015 — read a programme's configured progression rule, or the default
// if none has been set yet (so the admin UI always has something concrete
// to show/edit rather than a blank form).
registryRouter.get(
  "/progression-rules/:programmeId",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const programme = await prisma.programme.findUnique({
      where: { id: req.params.programmeId },
      include: { progressionRule: true },
    });
    if (!programme) return res.status(404).json({ message: "Programme not found." });

    if (programme.progressionRule) {
      return res.json({ ...programme.progressionRule, isDefault: false });
    }
    res.json({ programmeId: programme.id, ...DEFAULT_PROGRESSION_RULE, isDefault: true });
  }
);

const progressionRuleSchema = z.object({
  goodStandingMinAverage: z.number().min(0).max(100),
  warningMinAverage: z.number().min(0).max(100),
  maxFailedUnitsForGood: z.number().int().min(0),
  maxFailedUnitsForWarning: z.number().int().min(0),
});

// RG015 — create-or-update the configured rule for a programme. Real
// validation: the warning floor cannot sit above the good-standing floor,
// and "warning" tolerance for failed units cannot be stricter than "good"
// tolerance — otherwise the three-tier logic in the standing route above
// could produce a student who is simultaneously "good" by one axis and
// "probation" by the other with no sane resolution.
registryRouter.put(
  "/progression-rules/:programmeId",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = progressionRuleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide valid progression thresholds." });
    const { goodStandingMinAverage, warningMinAverage, maxFailedUnitsForGood, maxFailedUnitsForWarning } = parsed.data;

    if (warningMinAverage > goodStandingMinAverage) {
      return res.status(400).json({ message: "The warning threshold cannot be higher than the good-standing threshold." });
    }
    if (maxFailedUnitsForWarning < maxFailedUnitsForGood) {
      return res.status(400).json({ message: "The warning failed-units tolerance cannot be stricter than the good-standing tolerance." });
    }

    const programme = await prisma.programme.findUnique({ where: { id: req.params.programmeId } });
    if (!programme) return res.status(404).json({ message: "Programme not found." });

    const rule = await prisma.progressionRule.upsert({
      where: { programmeId: programme.id },
      create: { programmeId: programme.id, ...parsed.data, updatedById: req.user!.id },
      update: { ...parsed.data, updatedById: req.user!.id },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "PROGRESSION_RULE_UPDATED",
        entityType: "ProgressionRule",
        entityId: rule.id,
        metadata: { programmeId: programme.id, ...parsed.data },
      },
    });

    res.json(rule);
  }
);

// RG035 — academic statistics: real counts across the institution, grouped
// by programme and by academic status. No projection or forecasting here —
// every number is a direct count from current rows.
registryRouter.get(
  "/statistics",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const programmes = await prisma.programme.findMany({
      include: { students: true, units: true },
    });

    const byProgramme = programmes.map((p) => {
      const statusCounts: Record<string, number> = {};
      for (const s of p.students) {
        statusCounts[s.academicStatus] = (statusCounts[s.academicStatus] ?? 0) + 1;
      }
      return {
        programmeId: p.id,
        programmeName: p.name,
        totalStudents: p.students.length,
        unitCount: p.units.length,
        statusCounts,
      };
    });

    const allStudents = programmes.flatMap((p) => p.students);
    const overallStatusCounts: Record<string, number> = {};
    for (const s of allStudents) {
      overallStatusCounts[s.academicStatus] = (overallStatusCounts[s.academicStatus] ?? 0) + 1;
    }

    res.json({
      totalStudents: allStudents.length,
      totalProgrammes: programmes.length,
      overallStatusCounts,
      byProgramme,
    });
  }
);

// ---------------------------------------------------------------------------
// RG037/038 — qualification register and awarding-body records. The
// register is a real view over Programme (already the source of truth for
// qualificationLevel/approvalStatus), joined to the awarding body that
// actually confers it — not a separately maintained duplicate list.
// ---------------------------------------------------------------------------

registryRouter.get(
  "/qualification-register",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const programmes = await prisma.programme.findMany({
      include: { awardingBody: true, students: true },
    });
    res.json(
      programmes.map((p) => ({
        programmeId: p.id,
        name: p.name,
        qualificationLevel: p.qualificationLevel,
        approvalStatus: p.approvalStatus,
        durationSemesters: p.durationSemesters,
        enrolledCount: p.students.length,
        awardingBody: p.awardingBody ? { id: p.awardingBody.id, name: p.awardingBody.name } : null,
      }))
    );
  }
);

registryRouter.get(
  "/awarding-bodies",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const bodies = await prisma.awardingBody.findMany({ include: { programmes: true } });
    res.json(bodies.map((b) => ({ ...b, programmeCount: b.programmes.length })));
  }
);

const awardingBodySchema = z.object({
  name: z.string().min(2),
  accreditationNumber: z.string().optional(),
  contactEmail: z.string().email().optional(),
  recognizedSince: z.string().datetime().optional(),
});

registryRouter.post(
  "/awarding-bodies",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = awardingBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide at least a name." });
    const body = await prisma.awardingBody.create({
      data: {
        ...parsed.data,
        recognizedSince: parsed.data.recognizedSince ? new Date(parsed.data.recognizedSince) : undefined,
      },
    });
    res.status(201).json(body);
  }
);

registryRouter.patch(
  "/programmes/:id/awarding-body",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = z.object({ awardingBodyId: z.string().nullable() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide awardingBodyId (or null to clear it)." });
    const programme = await prisma.programme.update({
      where: { id: req.params.id },
      data: { awardingBodyId: parsed.data.awardingBodyId },
    });
    res.json(programme);
  }
);

// ---------------------------------------------------------------------------
// RG003/004/005 — registrar-side enrollment verification, programme
// registration, and course registration. Distinct from the student
// self-service versions in me.ts: these are administrative actions a
// registrar takes on a student's behalf (correcting a registration issue,
// executing an approved transfer or appeal decision), each audited.
// ---------------------------------------------------------------------------

// RG003 — enrollment verification: the registrar's real, current view of
// a student's enrollment records — the same data an enrollment
// verification LETTER (RG033) restates in prose, but here as structured
// data for internal review rather than an issued document.
registryRouter.get(
  "/enrollment-verification/:studentId",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const student = await prisma.student.findUnique({
      where: { id: req.params.studentId },
      include: {
        programme: { select: { name: true } },
        enrollments: { include: { unit: { select: { title: true, code: true } } }, orderBy: { createdAt: "desc" } },
      },
    });
    if (!student) return res.status(404).json({ message: "Student not found." });

    res.json({
      studentId: student.id,
      studentNumber: student.studentNumber,
      fullName: student.fullName,
      programme: student.programme.name,
      academicStatus: student.academicStatus,
      enrollments: student.enrollments.map((e) => ({
        unit: e.unit.title,
        code: e.unit.code,
        semester: e.semester,
        status: e.status,
      })),
    });
  }
);

// RG004 — programme registration: registrar transfers/registers a student
// into a (possibly different) programme. Audited — this changes which
// units the student is expected to complete for graduation.
const programmeRegistrationSchema = z.object({ studentId: z.string(), programmeId: z.string(), reason: z.string().min(3) });

registryRouter.post(
  "/programme-registration",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = programmeRegistrationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide studentId, programmeId, and a reason." });

    const student = await prisma.student.findUnique({ where: { id: parsed.data.studentId } });
    if (!student) return res.status(404).json({ message: "Student not found." });
    const programme = await prisma.programme.findUnique({ where: { id: parsed.data.programmeId } });
    if (!programme) return res.status(404).json({ message: "Programme not found." });

    const previousProgrammeId = student.programmeId;
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.student.update({ where: { id: student.id }, data: { programmeId: parsed.data.programmeId } });
      await tx.academicRecordChange.create({
        data: {
          studentId: student.id,
          type: "transfer",
          detail: `Programme registration: ${previousProgrammeId} -> ${parsed.data.programmeId}. Reason: ${parsed.data.reason}`,
          effectiveDate: new Date(),
          approvedById: req.user!.id,
        },
      });
      return result;
    });

    res.json(updated);
  }
);

// RG005 — course (unit) registration: registrar enrolls a student into a
// unit administratively. Rejects a duplicate for the same student/unit/
// semester exactly like the student self-service path does — an
// administrative override still respects the same real constraint.
const courseRegistrationSchema = z.object({ studentId: z.string(), unitId: z.string(), semester: z.string().min(2) });

registryRouter.post(
  "/course-registration",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = courseRegistrationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide studentId, unitId, and semester." });

    const existing = await prisma.enrollment.findUnique({
      where: { studentId_unitId_semester: { studentId: parsed.data.studentId, unitId: parsed.data.unitId, semester: parsed.data.semester } },
    });
    if (existing) return res.status(409).json({ message: "Student is already enrolled in that unit for that semester." });

    // LMS020 — same prerequisite gate as the student's own self-service
    // registration (SP012/me.ts), so the registrar's administrative path
    // can't be used to silently bypass it. A registrar may knowingly
    // override with ?overridePrerequisite=true (e.g. RPL, credit transfer).
    const unit = await prisma.unit.findUnique({ where: { id: parsed.data.unitId }, select: { prerequisiteUnitIds: true, vblEnabled: true, code: true } });
    const override = req.query.overridePrerequisite === "true";
    if (unit && unit.prerequisiteUnitIds.length > 0 && !override) {
      const completed = await prisma.enrollment.findMany({
        where: { studentId: parsed.data.studentId, unitId: { in: unit.prerequisiteUnitIds }, status: "completed" },
        select: { unitId: true },
      });
      const completedIds = new Set(completed.map((e: { unitId: string }) => e.unitId));
      const missingIds = unit.prerequisiteUnitIds.filter((id: string) => !completedIds.has(id));
      if (missingIds.length > 0) {
        const missing = await prisma.unit.findMany({ where: { id: { in: missingIds } }, select: { code: true, title: true } });
        return res.status(409).json({
          message: `Prerequisite(s) not yet completed: ${missing.map((u: { code: string; title: string }) => `${u.code} (${u.title})`).join(", ")}. Resubmit with ?overridePrerequisite=true to register anyway.`,
          missingPrerequisites: missingIds,
        });
      }
    }

    const enrollment = await prisma.enrollment.create({ data: parsed.data });

    // Batch 65 — VBI004: registrar-driven enrollment is the second of the
    // two places Enrollment rows are created (the other is the student's
    // own self-service registration in me.ts) — both must emit the sync
    // event, or a registrar-entered enrollment would silently never reach
    // the Lab. Same fire-and-forget contract as me.ts's copy of this.
    if (unit?.vblEnabled) {
      const student = await prisma.student.findUnique({ where: { id: parsed.data.studentId }, select: { studentNumber: true } });
      emitPortalEvent({
        eventType: "enrollment.created",
        entityType: "Enrollment",
        entityId: enrollment.id,
        payload: {
          portalStudentId: parsed.data.studentId,
          registrationNumber: student?.studentNumber,
          unitId: parsed.data.unitId,
          unitCode: unit.code,
          semester: enrollment.semester,
        },
      }).catch((err) => console.error("Failed to queue enrollment.created for VBL sync", err));
    }

    res.status(201).json(enrollment);
  }
);

// ---------------------------------------------------------------------------
// Batch 65 — VBI005: Enrollment Cancellation Sync. This closes a real gap
// that predates this batch: nothing in the portal ever set Enrollment.status
// to "withdrawn" even though the schema comment always allowed it, so there
// was no cancellation to sync in either direction. This endpoint is both
// the withdrawal feature itself and its VBL sync in one place, since one
// didn't meaningfully exist without the other.
// ---------------------------------------------------------------------------
registryRouter.post(
  "/enrollments/:id/withdraw",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: req.params.id },
      include: { unit: { select: { vblEnabled: true, code: true } }, student: { select: { studentNumber: true } } },
    });
    if (!enrollment) return res.status(404).json({ message: "Enrollment not found." });
    if (enrollment.status === "withdrawn") return res.status(409).json({ message: "Already withdrawn." });

    const updated = await prisma.enrollment.update({ where: { id: enrollment.id }, data: { status: "withdrawn" } });

    await prisma.auditLog.create({
      data: { userId: req.user!.id, action: "ENROLLMENT_WITHDRAWN", entityType: "Enrollment", entityId: enrollment.id },
    });

    if (enrollment.unit.vblEnabled) {
      emitPortalEvent({
        eventType: "enrollment.cancelled",
        entityType: "Enrollment",
        entityId: enrollment.id,
        payload: {
          portalStudentId: enrollment.studentId,
          registrationNumber: enrollment.student.studentNumber,
          unitId: enrollment.unitId,
          unitCode: enrollment.unit.code,
          semester: enrollment.semester,
        },
      }).catch((err) => console.error("Failed to queue enrollment.cancelled for VBL sync", err));
    }

    res.json(updated);
  }
);

// ---------------------------------------------------------------------------
// RG031 — academic records archive: a real, browsable view over every
// AcademicRecordChange on record across every student — the model already
// existed (transfers, exemptions, deferments, withdrawals, readmissions
// have been written here since earlier batches), but nothing exposed it
// as a searchable institutional archive rather than a per-student detail.
// ---------------------------------------------------------------------------
registryRouter.get(
  "/records-archive",
  requireAuth,
  requireRole("REGISTRAR", "AUDITOR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const changes = await prisma.academicRecordChange.findMany({
      where: type ? { type } : undefined,
      include: { student: { select: { fullName: true, studentNumber: true } } },
      orderBy: { effectiveDate: "desc" },
      take: 200,
    });
    res.json(changes);
  }
);

// ---------------------------------------------------------------------------
// AD003 — student population analytics: real breakdowns by intake cohort
// and study mode — deliberately distinct from RG035's by-programme/by-
// status statistics (built in batch 25). No demographic fields (gender,
// age, location) exist on the Student model, so this does NOT fabricate
// a breakdown the data can't actually support.
// ---------------------------------------------------------------------------
registryRouter.get(
  "/population-analytics",
  requireAuth,
  requireRole("REGISTRAR", "PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const students = await prisma.student.findMany({ select: { intake: true, studyMode: true, academicStatus: true } });

    const byIntake = students.reduce<Record<string, number>>((acc, s) => {
      acc[s.intake] = (acc[s.intake] ?? 0) + 1;
      return acc;
    }, {});
    const byStudyMode = students.reduce<Record<string, number>>((acc, s) => {
      acc[s.studyMode] = (acc[s.studyMode] ?? 0) + 1;
      return acc;
    }, {});

    res.json({ totalStudents: students.length, byIntake, byStudyMode });
  }
);
