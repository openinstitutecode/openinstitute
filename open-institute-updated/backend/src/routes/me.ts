import { canSeeScore } from "../lib/quiz-engine.js"; // Batch 76
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { emitPortalEvent } from "../integration/events.js";

export const meRouter = Router();

// SP002 — personalized welcome, for real, across every portal (student,
// trainer, admin/staff, employer). Every portal page was hardcoding a
// placeholder name ("Silas", "Registrar", "Principal", etc.) in its
// PortalShell userName prop — this is the one real lookup all of them
// now call instead. Resolves whichever profile record actually exists for
// this logged-in user; falls back to email if none does (e.g. a role with
// no dedicated profile table yet).
meRouter.get("/whoami", requireAuth, async (req: AuthedRequest, res) => {
  const { id, role } = req.user!;

  const student = await prisma.student.findUnique({ where: { userId: id } });
  if (student) return res.json({ name: student.fullName, role });

  const trainer = await prisma.trainer.findUnique({ where: { userId: id } });
  if (trainer) return res.json({ name: trainer.fullName, role });

  const staff = await prisma.staffProfile.findUnique({ where: { userId: id } });
  if (staff) return res.json({ name: staff.fullName, role });

  const employer = await prisma.employerProfile.findUnique({
    where: { userId: id },
    include: { employer: true },
  });
  if (employer) return res.json({ name: employer.employer.name, role });

  const user = await prisma.user.findUnique({ where: { id } });
  res.json({ name: user?.email ?? "User", role });
});

// SP008 — student profile (self-service view/edit of the editable fields).
meRouter.get("/profile", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({
    where: { userId: req.user!.id },
    include: { programme: true, user: { select: { email: true, phone: true } } },
  });
  if (!student) return res.status(404).json({ message: "No student record for this account." });
  res.json(student);
});

const updateProfileSchema = z.object({
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  // EX014/Batch 64 — a real base64 data URL photo the student uploads for
  // exam admit cards. Capped well under the app's 2mb JSON body limit
  // (~300KB of base64, ~220KB actual image) so one large upload can't
  // crowd out the rest of the request pipeline; the frontend also
  // downsizes the image client-side before encoding (see
  // StudentProfile.tsx) so this limit is rarely the thing a real photo
  // actually hits.
  photoDataUrl: z
    .string()
    .refine((v) => v.startsWith("data:image/"), "Must be an image data URL.")
    .refine((v) => v.length <= 300_000, "Photo is too large — try a smaller image.")
    .optional(),
});

meRouter.patch("/profile", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid profile update." });

  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const updated = await prisma.student.update({
    where: { id: student.id },
    data: parsed.data,
  });
  res.json(updated);
});

// SP040 — self-service graduation dashboard. Reuses the same live-computed
// checks as the registrar's audit (backend/src/routes/graduation.ts) so the
// student and the registrar are always looking at identical numbers.
meRouter.get("/graduation-status", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({
    where: { userId: req.user!.id },
    include: {
      programme: { include: { units: true } },
      enrollments: true,
      feeInvoices: true,
      attachments: true,
      integrityCases: true,
    },
  });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const requiredUnitCount = student.programme.units.length;
  const completedUnits = student.enrollments.filter((e) => e.status === "completed").length;
  const academicClearance = completedUnits >= requiredUnitCount;

  const feeBalance = student.feeInvoices.reduce(
    (sum, inv) => sum + Number(inv.amountDue) - Number(inv.amountPaid),
    0
  );
  const financeClearance = feeBalance <= 0;

  const attachmentClearance =
    !student.programme.requiresAttachment || student.attachments.some((a) => a.status === "completed");

  const disciplinaryClearance = !student.integrityCases.some((c) => c.status === "upheld");

  const eligible = academicClearance && financeClearance && attachmentClearance && disciplinaryClearance;

  res.json({
    eligible,
    checks: {
      academicClearance: { met: academicClearance, completedUnits, requiredUnitCount },
      financeClearance: { met: financeClearance, feeBalance },
      attachmentClearance: { met: attachmentClearance, required: student.programme.requiresAttachment },
      disciplinaryClearance: { met: disciplinaryClearance },
    },
  });
});

// SP036/FN019 — financial clearance as its own standalone badge, distinct
// from the graduation audit above (which only surfaces fee balance as one
// of four graduation gates). A student can ask "am I clear on fees right
// now" at any point in their programme, not only when checking graduation
// eligibility. Clear means both a non-positive fee balance AND no active
// financial hold — matches the same computation the finance-office view
// uses (backend/src/routes/finance.ts GET /clearance/:studentId) so the two
// can never disagree.
meRouter.get("/financial-clearance", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const invoices = await prisma.invoice.findMany({ where: { studentId: student.id } });
  const feeBalance = invoices.reduce(
    (sum, inv) => sum + Number(inv.amountDue) - Number(inv.amountPaid),
    0
  );
  const activeHold = await prisma.financialHold.findFirst({
    where: { studentId: student.id, releasedAt: null },
    orderBy: { placedAt: "desc" },
  });
  const feeClearance = feeBalance <= 0;

  res.json({
    clear: feeClearance && !activeHold,
    feeBalance,
    feeClearance,
    activeHold: activeHold ? { reason: activeHold.reason, placedAt: activeHold.placedAt } : null,
  });
});

// SP035 — digital receipts: every completed payment against the student's
// own invoices, with enough detail to stand in as a receipt.
meRouter.get("/receipts", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const payments = await prisma.payment.findMany({
    where: { invoice: { studentId: student.id } },
    include: { invoice: true },
    orderBy: { paidAt: "desc" },
  });
  res.json(payments);
});

// SP011 — enrollment history: every unit the student has ever been
// enrolled in, across all semesters, not just the current one.
meRouter.get("/enrollments", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: student.id },
    include: { unit: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(enrollments);
});

// SP012/RG005 — self-service course registration. Prevents duplicate
// registration for the same unit/semester and validates the unit actually
// belongs to the student's own programme (SP013 registration validation).
const registerSchema = z.object({ unitId: z.string(), semester: z.string() });

meRouter.post("/register-unit", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Choose a unit and semester." });

  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const unit = await prisma.unit.findUnique({ where: { id: parsed.data.unitId } });
  if (!unit || unit.programmeId !== student.programmeId) {
    return res.status(400).json({ message: "That unit isn't part of your programme." });
  }

  // LMS020 — prerequisite rules: block registration until every listed
  // prerequisite unit is completed. Enforced here, not just in the UI, so
  // this can't be bypassed by calling the API directly.
  if (unit.prerequisiteUnitIds.length > 0) {
    const completed = await prisma.enrollment.findMany({
      where: { studentId: student.id, unitId: { in: unit.prerequisiteUnitIds }, status: "completed" },
      select: { unitId: true },
    });
    const completedIds = new Set(completed.map((e: { unitId: string }) => e.unitId));
    const missingIds = unit.prerequisiteUnitIds.filter((id: string) => !completedIds.has(id));
    if (missingIds.length > 0) {
      const missing = await prisma.unit.findMany({ where: { id: { in: missingIds } }, select: { code: true, title: true } });
      return res.status(409).json({
        message: `You need to complete ${missing.map((u: { code: string; title: string }) => `${u.code} (${u.title})`).join(", ")} before registering for this unit.`,
      });
    }
  }

  const existing = await prisma.enrollment.findUnique({
    where: {
      studentId_unitId_semester: {
        studentId: student.id,
        unitId: unit.id,
        semester: parsed.data.semester,
      },
    },
  });
  if (existing) return res.status(409).json({ message: "You're already registered for this unit this semester." });

  const enrollment = await prisma.enrollment.create({
    data: { studentId: student.id, unitId: unit.id, semester: parsed.data.semester },
  });

  // Batch 65 — VBI004: if this unit has a Virtual Business Lab mapping,
  // let the Lab know so it can provision the student's access. Fire-and-
  // forget: the ledger row is written synchronously (so it's never lost),
  // but delivery happens on the next dispatchPendingEvents() tick — a
  // slow/unreachable Lab must never block registration (see the "failure
  // isolation" principle in docs/VBL_MAIN_PORTAL_INTEGRATION_ARCHITECTURE.md).
  if (unit.vblEnabled) {
    emitPortalEvent({
      eventType: "enrollment.created",
      entityType: "Enrollment",
      entityId: enrollment.id,
      payload: {
        portalStudentId: student.id,
        registrationNumber: student.studentNumber,
        unitId: unit.id,
        unitCode: unit.code,
        semester: enrollment.semester,
      },
    }).catch((err) => console.error("Failed to queue enrollment.created for VBL sync", err));
  }

  res.status(201).json(enrollment);
});


// EX027 companion — only published results are visible to the student,
// even though the score exists in the DB as soon as a trainer grades it.
meRouter.get("/results", requireAuth, async (req: AuthedRequest, res) => {
  const submissions = await prisma.submission.findMany({
    where: {
      studentUserId: req.user!.id,
      assessment: { resultsPublished: true },
    },
    include: { assessment: true },
    orderBy: { submittedAt: "desc" },
  });
  // Batch 76 — a quiz's own visibility settings (never / after it closes) still apply
  // here, so this list can't show a score the Assessment Centre is hiding.
  const now = new Date();
  res.json(
    submissions.filter((s) => {
      const a = s.assessment;
      if (!a) return true;
      const closesAt = a.closesAt ?? (a.scheduledAt && a.durationMinutes ? new Date(a.scheduledAt.getTime() + a.durationMinutes * 60000) : null);
      return canSeeScore({ resultVisibility: a.resultVisibility, markingMode: a.markingMode, resultsPublished: a.resultsPublished, answerKeyReleaseAt: a.answerKeyReleaseAt, closesAt }, now);
    })
  );
});

// SP001–SP006 dashboard — real aggregate numbers instead of the illustrative
// static content the dashboard page used to render.
// SP003 (academic progress tracker) and SP006 (upcoming deadlines) were
// still 🟡 PARTIAL — /me/dashboard already had real units/fees/notifications
// but never computed a real completion percentage or looked at any
// Assignment/Assessment due date. Both are now real, computed from the
// student's actual enrollments — nothing invented or illustrative.
meRouter.get("/dashboard", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({
    where: { userId: req.user!.id },
    include: {
      programme: { include: { units: true } },
      enrollments: { include: { unit: true } },
      feeInvoices: true,
    },
  });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const activeEnrollments = student.enrollments.filter((e) => e.status === "in_progress");
  const completedCount = student.enrollments.filter((e) => e.status === "completed").length;
  const totalUnitsInProgramme = student.programme.units.length;
  // SP003 — real progress percentage: completed units / total units required
  // by the programme. Guards against a zero-unit programme rather than
  // dividing by zero.
  const progressPercent =
    totalUnitsInProgramme > 0 ? Math.round((completedCount / totalUnitsInProgramme) * 100) : 0;

  const feeBalance = student.feeInvoices.reduce(
    (sum, inv) => sum + Number(inv.amountDue) - Number(inv.amountPaid),
    0
  );

  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id, readAt: null },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // SP005 — real "current semester" view: the programme's actual active
  // SemesterConfig (registrar-set dates, registration window, assessment
  // window), not the bare `semester` string an Enrollment happens to carry.
  // Falls back to the most recent configured semester if none is flagged
  // active yet, so the widget still shows real dates rather than nothing.
  const activeSemesterConfig = await prisma.semesterConfig.findFirst({
    where: { programmeId: student.programmeId, isActive: true },
  });
  const semesterConfig =
    activeSemesterConfig ??
    (await prisma.semesterConfig.findFirst({
      where: { programmeId: student.programmeId },
      orderBy: [{ academicYear: "desc" }, { semesterNumber: "desc" }],
    }));

  let currentSemester: unknown = null;
  if (semesterConfig) {
    const nowTime = Date.now();
    currentSemester = {
      id: semesterConfig.id,
      semesterNumber: semesterConfig.semesterNumber,
      academicYear: semesterConfig.academicYear,
      startDate: semesterConfig.startDate,
      endDate: semesterConfig.endDate,
      registrationOpen: semesterConfig.registrationOpen,
      registrationClose: semesterConfig.registrationClose,
      assessmentStart: semesterConfig.assessmentStart,
      assessmentEnd: semesterConfig.assessmentEnd,
      resultsDueDate: semesterConfig.resultsDueDate,
      isActive: semesterConfig.isActive,
      isRegistrationOpen:
        nowTime >= semesterConfig.registrationOpen.getTime() && nowTime <= semesterConfig.registrationClose.getTime(),
      isAssessmentPeriod:
        nowTime >= semesterConfig.assessmentStart.getTime() && nowTime <= semesterConfig.assessmentEnd.getTime(),
      daysRemaining: Math.ceil((semesterConfig.endDate.getTime() - nowTime) / (1000 * 60 * 60 * 24)),
    };
  }

  // SP006 — real upcoming deadlines: assignments due (with no submission
  // from this student yet) and scheduled assessments, for units the
  // student is actively enrolled in, ordered soonest-first. Nothing
  // static — every date and title comes from the actual Assignment /
  // Assessment rows for this student's real courses.
  const activeUnitIds = activeEnrollments.map((e) => e.unitId);
  const now = new Date();
  let upcomingDeadlines: { type: string; title: string; dueAt: Date; courseTitle: string }[] = [];

  if (activeUnitIds.length > 0) {
    const courses = await prisma.course.findMany({
      where: { unitId: { in: activeUnitIds } },
      include: {
        assignments: {
          where: { dueAt: { gte: now } },
          include: { submissions: { where: { studentUserId: student.userId } } },
        },
        assessments: { where: { scheduledAt: { gte: now } } },
      },
    });

    for (const course of courses) {
      for (const a of course.assignments) {
        if (a.submissions.length === 0) {
          upcomingDeadlines.push({
            type: "assignment",
            title: a.title,
            dueAt: a.dueAt,
            courseTitle: course.title,
          });
        }
      }
      for (const a of course.assessments) {
        if (a.scheduledAt) {
          upcomingDeadlines.push({
            type: a.type,
            title: a.title,
            dueAt: a.scheduledAt,
            courseTitle: course.title,
          });
        }
      }
    }
    upcomingDeadlines.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    upcomingDeadlines = upcomingDeadlines.slice(0, 5);
  }

  res.json({
    programme: student.programme.name,
    activeUnits: activeEnrollments.map((e) => ({
      unitId: e.unitId,
      title: e.unit.title,
      semester: e.semester,
    })),
    completedUnitsCount: completedCount,
    totalUnitsInProgramme,
    progressPercent,
    feeBalance,
    unreadNotifications: notifications,
    upcomingDeadlines,
    currentSemester,
  });
});

// Real course list for "My Courses" — resolves the student's active
// enrollments to actual Course records via their Unit.
meRouter.get("/courses", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({
    where: { userId: req.user!.id },
    include: {
      enrollments: {
        where: { status: "in_progress" },
        include: { unit: { include: { courses: { include: { trainer: true } } } } },
      },
    },
  });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const courses = student.enrollments.flatMap((e) =>
    e.unit.courses.map((c) => ({
      courseId: c.id,
      title: c.title,
      unitTitle: e.unit.title,
      trainerName: c.trainer?.fullName ?? "Unassigned",
      // Batch 47 — lets the course selector show a "Moodle" badge without
      // a second call per course.
      lmsEngine: c.lmsEngine,
    }))
  );
  res.json(courses);
});

// SP037 — real industrial attachment data (was static in the UI even
// though AttachmentPlacement/LogbookEntry models already existed).
meRouter.get("/attachment", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const placement = await prisma.attachmentPlacement.findFirst({
    where: { studentId: student.id },
    include: { employer: true, logbookEntries: { orderBy: { weekNumber: "asc" } } },
    orderBy: { startDate: "desc" },
  });
  if (!placement) return res.json(null);
  res.json(placement);
});

const logbookSchema = z.object({ placementId: z.string(), summary: z.string().min(3) });

meRouter.post("/attachment/logbook", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = logbookSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Write a summary of your week." });

  const placement = await prisma.attachmentPlacement.findUnique({
    where: { id: parsed.data.placementId },
    include: { logbookEntries: true },
  });
  if (!placement) return res.status(404).json({ message: "Placement not found." });

  const nextWeek = placement.logbookEntries.length + 1;
  const entry = await prisma.logbookEntry.create({
    data: { placementId: placement.id, weekNumber: nextWeek, summary: parsed.data.summary },
  });
  res.status(201).json(entry);
});

// SP007 — academic alerts: a real, computed feed rather than a static
// list. Combines the student's own unread Notification rows with three
// live-derived academic signals: a graded-but-failing assessment (score
// below 50% of totalMarks, once results are published), an overdue
// assignment with no submission, and units with academic status "failed".
// Each alert item says exactly what it is and why it fired — no invented
// urgency, no AI judgment call.
meRouter.get("/alerts", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({
    where: { userId: req.user!.id },
    include: { enrollments: { include: { unit: { include: { courses: { include: { assignments: true, assessments: true } } } } } } },
  });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id, readAt: null },
    orderBy: { createdAt: "desc" },
  });

  type Alert = { severity: "info" | "warn" | "danger"; category: string; message: string; occurredAt: Date };
  const alerts: Alert[] = notifications.map((n) => ({
    severity: "info",
    category: "notification",
    message: n.title,
    occurredAt: n.createdAt,
  }));

  const now = new Date();
  for (const enrollment of student.enrollments) {
    if (enrollment.status === "failed") {
      alerts.push({
        severity: "danger",
        category: "failed_unit",
        message: `${enrollment.unit.title} is recorded as failed.`,
        occurredAt: enrollment.createdAt,
      });
    }
    for (const course of enrollment.unit.courses) {
      for (const assignment of course.assignments) {
        if (assignment.status === "PUBLISHED" && assignment.dueAt < now) {
          const submitted = await prisma.submission.findFirst({
            where: { assignmentId: assignment.id, studentUserId: req.user!.id },
          });
          if (!submitted) {
            alerts.push({
              severity: "warn",
              category: "missing_work",
              message: `"${assignment.title}" (${course.title}) was due ${assignment.dueAt.toLocaleDateString()} and hasn't been submitted.`,
              occurredAt: assignment.dueAt,
            });
          }
        }
      }
      for (const assessment of course.assessments) {
        if (!assessment.resultsPublished) continue;
        const submission = await prisma.submission.findFirst({
          where: { assessmentId: assessment.id, studentUserId: req.user!.id, score: { not: null } },
          orderBy: { submittedAt: "desc" },
        });
        if (submission && submission.score !== null && submission.score / assessment.totalMarks < 0.5) {
          alerts.push({
            severity: "danger",
            category: "failed_assessment",
            message: `${assessment.title} (${course.title}): ${submission.score}/${assessment.totalMarks} — below the pass mark.`,
            occurredAt: submission.gradedAt ?? submission.submittedAt,
          });
        }
      }
    }
  }

  alerts.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  res.json(alerts);
});

// SP004 — programme roadmap: every unit in the programme, admission to
// graduation, with the student's actual status against each one.
meRouter.get("/roadmap", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({
    where: { userId: req.user!.id },
    include: {
      programme: { include: { units: { orderBy: [{ semester: "asc" }, { code: "asc" }] } } },
      enrollments: true,
    },
  });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const enrollmentByUnit = new Map(student.enrollments.map((e) => [e.unitId, e]));

  const roadmap = student.programme.units.map((u) => {
    const enrollment = enrollmentByUnit.get(u.id);
    return {
      unitId: u.id,
      code: u.code,
      title: u.title,
      semester: u.semester,
      status: enrollment?.status ?? "not_started",
      grade: enrollment?.finalGrade ?? null,
    };
  });

  res.json(roadmap);
});

// SP029 — AI competency-gap analysis, done honestly as deterministic set
// comparison rather than an actual AI call: every competency defined for
// the student's programme, minus the ones the student has already reached
// "competent" or "advanced" on. No model inference involved — this is a
// real, explainable gap list.
meRouter.get("/competency-gaps", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({
    where: { userId: req.user!.id },
    include: {
      programme: { include: { competencies: true } },
      competencyRecords: true,
    },
  });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const achievedIds = new Set(
    student.competencyRecords.filter((r) => r.level !== "developing").map((r) => r.competencyId)
  );
  const developingRecordByCompetency = new Map(
    student.competencyRecords.filter((r) => r.level === "developing").map((r) => [r.competencyId, r])
  );

  const gaps = student.programme.competencies
    .filter((c) => !achievedIds.has(c.id))
    .map((c) => ({
      competencyId: c.id,
      name: c.name,
      description: c.description,
      status: developingRecordByCompetency.has(c.id) ? "developing" : "not_started",
    }));

  res.json({
    totalCompetencies: student.programme.competencies.length,
    achievedCount: achievedIds.size,
    gaps,
  });
});

// SP030 — student knowledge notebook: purely self-service notes, including
// ones saved directly from an AI tutor reply. Only the owning student can
// read or write their own entries.
const notebookSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  unitId: z.string().optional(),
  sourceType: z.enum(["manual", "ai_tutor"]).default("manual"),
});

meRouter.get("/notebook", requireAuth, async (req: AuthedRequest, res) => {
  const entries = await prisma.notebookEntry.findMany({
    where: { studentUserId: req.user!.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(entries);
});

meRouter.post("/notebook", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = notebookSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide a title and content." });
  const entry = await prisma.notebookEntry.create({
    data: { ...parsed.data, studentUserId: req.user!.id },
  });
  res.status(201).json(entry);
});

meRouter.delete("/notebook/:id", requireAuth, async (req: AuthedRequest, res) => {
  const entry = await prisma.notebookEntry.findUnique({ where: { id: req.params.id } });
  if (!entry || entry.studentUserId !== req.user!.id) {
    return res.status(404).json({ message: "Notebook entry not found." });
  }
  await prisma.notebookEntry.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// SP023 — digital portfolio: a student-curated showcase, distinct from any
// official academic record. Adding an item here changes nothing else.
const portfolioSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(["project", "competency", "badge", "research", "attachment", "other"]),
  linkUrl: z.string().url().optional(),
});

meRouter.get("/portfolio", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });
  const items = await prisma.portfolioItem.findMany({
    where: { studentId: student.id },
    orderBy: { addedAt: "desc" },
  });
  res.json(items);
});

meRouter.post("/portfolio", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = portfolioSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide a title and category." });
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });
  const item = await prisma.portfolioItem.create({
    data: { ...parsed.data, studentId: student.id },
  });
  res.status(201).json(item);
});

meRouter.delete("/portfolio/:id", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });
  const item = await prisma.portfolioItem.findUnique({ where: { id: req.params.id } });
  if (!item || item.studentId !== student.id) {
    return res.status(404).json({ message: "Portfolio item not found." });
  }
  await prisma.portfolioItem.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
