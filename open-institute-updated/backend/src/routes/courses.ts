import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { canAccessCourseContent, canTeachCourse, canViewCourseAsStaff, courseGate } from "../lib/course-access.js";
import { notifyOnce } from "../lib/reminder-jobs.js";
import { presentLessons } from "../lib/lesson-delivery.js";
import { listLiveClasses } from "../moodle/liveClasses.js";
import { getMoodleLaunchUrl, isMoodleSsoConfigured } from "../moodle/sso.js";
import { isMoodleConfigured } from "../moodle/client.js";
import { ensureMoodleCourse, updateMoodleCourse } from "../moodle/courseSync.js";
import { enrolStudent } from "../moodle/enrolment.js";
import { emitPortalEvent } from "../integration/events.js";

export const coursesRouter = Router();

// Batch 47 — roles allowed to manage courses (create, edit, toggle
// lmsEngine) from the admin dashboard. Kept as one list so the
// permission story for "who can flip a course into Moodle mode"
// stays in exactly one place.
const ADMIN_COURSE_ROLES = ["SUPER_ADMIN", "ICT_ADMIN", "PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD"];
const COURSE_ASSIGNMENT_ROLES = [...ADMIN_COURSE_ROLES, "REGISTRAR"];
const COURSE_CATALOGUE_ROLES = [...ADMIN_COURSE_ROLES, "REGISTRAR", "TRAINER"];

// Real course content for the LMS view — modules, lessons, and the
// requesting student's own progress markers (based on completed
// assignment/assessment submissions for this course).
coursesRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const course = await prisma.course.findUnique({
    where: { id: req.params.id },
    include: {
      unit: true,
      trainer: true,
      modules: { include: { lessons: { orderBy: { order: "asc" } } }, orderBy: { order: "asc" } },
      announcements: { where: { status: "SENT", OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] }, orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!course) return res.status(404).json({ message: "Course not found." });

  // Course content is for the course's staff and its enrolled learners only.
  const actor = req.user!;
  const staff = await canViewCourseAsStaff(actor, course.id);
  if (!staff && !(await canAccessCourseContent(actor, course.id))) {
    return res.status(403).json({ message: "Enrol in this course to see its content." });
  }

  // SP017 — attach the requesting student's real per-lesson completion,
  // rolled up into module- and course-level percentages. TP006/TP007 — the
  // lessons a viewer gets are filtered and resolved by lib/lesson-delivery.ts:
  // drafts are hidden from students, a lesson awaiting QA approval shows its
  // last approved content, and uploaded media arrives as signed URLs.
  let courseProgress: { totalLessons: number; completedLessons: number; percent: number } | null = null;
  let liveClasses: any[] = [];
  if (course.lmsEngine === "CUSTOM") {
    const student = await prisma.student.findUnique({ where: { userId: actor.id } });
    const presented = await presentLessons(
      course.modules.flatMap((m: any) => m.lessons),
      { forStaff: staff }
    );
    const lessonIds = presented.map((l) => l.id);
    const completed =
      student && lessonIds.length > 0
        ? await prisma.lessonProgress.findMany({
            where: { studentId: student.id, lessonId: { in: lessonIds } },
            select: { lessonId: true, completedAt: true },
          })
        : [];
    const completedMap = new Map<string, Date | null>(completed.map((c: { lessonId: string; completedAt: Date | null }) => [c.lessonId, c.completedAt]));

    const modules = course.modules
      .map((m: any) => {
        const lessons = presented
          .filter((l: any) => l.moduleId === m.id)
          .sort((a: any, b: any) => a.order - b.order)
          .map((l: any) => ({ ...l, completed: completedMap.has(l.id), completedAt: completedMap.get(l.id) ?? null }));
        return { ...m, completedCount: lessons.filter((l: any) => l.completed).length, totalCount: lessons.length, lessons };
      })
      .filter((m: any) => staff || m.lessons.length > 0); // learners don't see modules with nothing published
    (course as any).modules = modules;

    if (student) {
      courseProgress = {
        totalLessons: lessonIds.length,
        completedLessons: completed.length,
        percent: lessonIds.length > 0 ? Math.round((completed.length / lessonIds.length) * 100) : 0,
      };
    }

    // TP026 — live classes the trainer scheduled directly. Only upcoming/recent
    // ones; full history lives behind the dedicated live-classes endpoints.
    const sessions = await prisma.liveClassSession.findMany({
      where: {
        courseId: course.id,
        OR: [{ status: { in: ["SCHEDULED", "LIVE"] } }, { endedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }],
      },
      orderBy: { scheduledAt: "asc" },
      take: 10,
    });
    // Room passwords never leave the server; students also don't see the raw
    // meeting link (they get it from /live-classes/:id/join so joins are recorded).
    liveClasses = sessions.map((s: any) => {
      const { moderatorPassword: _m, attendeePassword: _a, externalUrl, ...rest } = s;
      return staff ? { ...rest, externalUrl } : rest;
    });
  }

  // MOODLE-mode courses have no rows in `modules`/`lessons` (those
  // stay CUSTOM-only tables) — a `moodle` block is attached instead so
  // the frontend can render live classes without a second round trip.
  if (course.lmsEngine === "MOODLE" && course.moodleCourseId) {
    try {
      const moodleLiveClasses = await listLiveClasses(course.moodleCourseId);
      res.json({ ...course, moodle: { liveClasses: moodleLiveClasses } });
      return;
    } catch (err) {
      // A Moodle-side hiccup shouldn't 500 the whole course page — the
      // student still sees the course, just without the live-classes
      // block, and this is visible in server logs for diagnosis.
      // eslint-disable-next-line no-console
      console.error(`Failed to fetch Moodle live classes for course ${course.id}`, err);
      res.json({ ...course, moodle: { liveClasses: [], error: "unavailable" } });
      return;
    }
  }

  res.json({ ...course, progress: courseProgress, liveClasses });
});

// Mints a one-time Moodle login URL for the requesting user and redirects
// them straight into this course. Only meaningful for lmsEngine=MOODLE
// courses; 400s otherwise rather than silently doing nothing.
coursesRouter.post("/:id/moodle-launch", requireAuth, async (req: AuthedRequest, res) => {
  if (!isMoodleSsoConfigured()) {
    return res.status(503).json({ message: "Moodle SSO is not configured on this deployment." });
  }
  const course = await prisma.course.findUnique({ where: { id: req.params.id } });
  if (!course || !(await canAccessCourseContent(req.user!, course.id))) return res.status(404).json({ message: "Course not found.", code: "NOT_FOUND" });
  if (course.lmsEngine !== "MOODLE") {
    return res.status(400).json({ message: "This course is not delivered through Moodle." });
  }

  try {
    const launchUrl = await getMoodleLaunchUrl({ userId: (req as any).user.id, courseId: course.id });
    res.json({ launchUrl });
  } catch (err: any) {
    res.status(502).json({ message: "Could not reach Moodle to start your session.", detail: err?.message });
  }
});

// ---------------------------------------------------------------------------
// Batch 47 — Admin course management. Previously there was no way to
// create a Course or flip its lmsEngine at all short of hand-editing the
// database, so a MOODLE-mode course could only ever exist by manual SQL.
// These routes are the admin dashboard's "Courses" page.
// ---------------------------------------------------------------------------

// Full listing for the admin table — every course regardless of
// catalogue visibility or publish state, with the fields the dashboard
// needs to show a Moodle status column without a second round trip.
coursesRouter.get("/", requireAuth, requireRole(...COURSE_ASSIGNMENT_ROLES), async (_req, res) => {
  const courses = await prisma.course.findMany({
    include: { unit: { include: { programme: true } }, trainer: true, catalogueEntry: true },
    orderBy: { title: "asc" },
  });
  res.json(courses);
});

// Everything the "new course" / "edit course" form needs in one call:
// the unit and trainer pickers, plus whether this deployment even has
// Moodle configured — the form disables/explains the MOODLE option
// rather than letting an admin pick it and silently get nothing.
coursesRouter.get("/admin/form-options", requireAuth, requireRole(...COURSE_ASSIGNMENT_ROLES), async (_req, res) => {
  const [units, trainers] = await Promise.all([
    prisma.unit.findMany({ include: { programme: true }, orderBy: { code: "asc" } }),
    prisma.trainer.findMany({ orderBy: { fullName: "asc" } }),
  ]);
  res.json({ units, trainers, moodleConfigured: isMoodleConfigured() });
});

const courseWriteSchema = z.object({
  unitId: z.string().min(1),
  trainerId: z.string().min(1).nullable().optional(),
  title: z.string().min(2),
  credits: z.number().int().min(1).max(36).nullable().optional(),
  description: z.string().optional(),
  lmsEngine: z.enum(["CUSTOM", "MOODLE"]).optional(),
  published: z.boolean().optional(),
});
const courseUpdateSchema = courseWriteSchema.partial();

// Best-effort push to Moodle after a create/update. Never throws — a
// Moodle-side failure (not configured, unreachable, rejected) leaves the
// row saved in the app with moodleStatus="pending" so an admin can retry
// via POST /:id/moodle-sync once the underlying problem is fixed, rather
// than the whole request 500ing because Moodle had a bad moment.
async function syncCourseToMoodle(courseId: string): Promise<"not_applicable" | "synced" | "pending"> {
  const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
  if (course.lmsEngine !== "MOODLE") return "not_applicable";
  if (!isMoodleConfigured()) return "pending";
  try {
    await ensureMoodleCourse(courseId);
    await updateMoodleCourse(courseId);
    return "synced";
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Moodle sync failed for course ${courseId}`, err);
    return "pending";
  }
}

// When a course is switched into MOODLE mode, every student already
// actively enrolled in its unit should land in the Moodle course too —
// otherwise "switch to Moodle" silently strands existing students.
// Best-effort per student; one failure doesn't block the others.
async function enrolExistingStudents(courseId: string, unitId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { unitId, status: "in_progress" },
    include: { student: true },
  });
  for (const enrollment of enrollments) {
    try {
      await enrolStudent({
        studentUserId: enrollment.student.userId,
        courseId,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Could not enrol student ${enrollment.studentId} into Moodle course ${courseId}`, err);
    }
  }
}

coursesRouter.post("/", requireAuth, requireRole(...ADMIN_COURSE_ROLES), async (req, res) => {
  const parsed = courseWriteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid course details.", issues: parsed.error.flatten() });
  const { unitId, trainerId, title, description, lmsEngine, published, credits } = parsed.data;

  try {
    const course = await prisma.course.create({
      data: {
        unitId,
        trainerId: trainerId ?? null,
        title,
        description,
        ...(credits !== undefined ? {
          catalogueEntry: {
            create: { credits, isVisible: true },
          },
        } : {}),
        lmsEngine: lmsEngine ?? "CUSTOM",
        publishedAt: published ? new Date() : null,
      },
    });

    const moodleStatus = await syncCourseToMoodle(course.id);
    if (moodleStatus === "synced") await enrolExistingStudents(course.id, course.unitId);

    await prisma.auditLog.create({
      data: {
        userId: (req as any).user.id,
        action: "COURSE_CREATED",
        entityType: "Course",
        entityId: course.id,
        metadata: { lmsEngine: course.lmsEngine, moodleStatus },
      },
    });

    const refreshed = await prisma.course.findUnique({ where: { id: course.id }, include: { unit: true, trainer: true } });

    // Batch 65 — VBI007: if this trainer is teaching a VBL-enabled unit,
    // let the Lab know so it can provision/refresh the trainer's Lab
    // access (VBI002). Fire-and-forget, same contract as the enrollment
    // sync calls elsewhere in this batch.
    if (refreshed?.unit.vblEnabled && refreshed.trainer) {
      emitPortalEvent({
        eventType: "staff.assigned",
        entityType: "Course",
        entityId: course.id,
        payload: {
          portalTrainerId: refreshed.trainer.id,
          trainerName: refreshed.trainer.fullName,
          unitId: refreshed.unit.id,
          unitCode: refreshed.unit.code,
        },
      }).catch((err) => console.error("Failed to queue staff.assigned for VBL sync", err));
    }

    res.status(201).json({ ...refreshed, moodleStatus });
  } catch (err: any) {
    res.status(400).json({ message: "Could not create course.", detail: err?.message });
  }
});

coursesRouter.patch("/:id", requireAuth, requireRole(...ADMIN_COURSE_ROLES), async (req, res) => {
  const parsed = courseUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid course update.", issues: parsed.error.flatten() });

  const existing = await prisma.course.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ message: "Course not found." });

  const { published, credits, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (published !== undefined) data.publishedAt = published ? existing.publishedAt ?? new Date() : null;

  try {
    const course = await prisma.course.update({ where: { id: req.params.id }, data });
    if (credits !== undefined) {
      await prisma.courseCatalogueEntry.upsert({
        where: { courseId: course.id },
        create: { courseId: course.id, credits, isVisible: true },
        update: { credits },
      });
    }
    const switchedToMoodle = course.lmsEngine === "MOODLE" && existing.lmsEngine !== "MOODLE";

    const moodleStatus = await syncCourseToMoodle(course.id);
    if (switchedToMoodle && moodleStatus === "synced") await enrolExistingStudents(course.id, course.unitId);

    await prisma.auditLog.create({
      data: {
        userId: (req as any).user.id,
        action: "COURSE_UPDATED",
        entityType: "Course",
        entityId: course.id,
        metadata: { changes: parsed.data, moodleStatus },
      },
    });

    const refreshed = await prisma.course.findUnique({ where: { id: course.id }, include: { unit: true, trainer: true } });

    // Batch 65 — VBI007: the other half of trainer-assignment sync — POST
    // (course creation) was covered already; this closes the gap where a
    // trainer is (re)assigned via PATCH instead. Only fires when the
    // trainer actually changed, so an unrelated field edit doesn't
    // needlessly re-provision the same trainer over and over.
    if (refreshed?.unit.vblEnabled && refreshed.trainer && course.trainerId !== existing.trainerId) {
      emitPortalEvent({
        eventType: "staff.assigned",
        entityType: "Course",
        entityId: course.id,
        payload: {
          portalTrainerId: refreshed.trainer.id,
          trainerName: refreshed.trainer.fullName,
          unitId: refreshed.unit.id,
          unitCode: refreshed.unit.code,
        },
      }).catch((err) => console.error("Failed to queue staff.assigned for VBL sync", err));
    }

    res.json({ ...refreshed, moodleStatus });
  } catch (err: any) {
    res.status(400).json({ message: "Could not update course.", detail: err?.message });
  }
});

coursesRouter.patch("/:id/trainer", requireAuth, requireRole(...COURSE_ASSIGNMENT_ROLES), async (req: AuthedRequest, res) => {
  const parsed = z.object({ trainerId: z.string().min(1).nullable() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide a trainer id or null to unassign the trainer." });
  const existing = await prisma.course.findUnique({
    where: { id: req.params.id },
    select: { id: true, trainerId: true },
  });
  if (!existing) return res.status(404).json({ message: "Course not found." });
  if (parsed.data.trainerId && !(await prisma.trainer.findUnique({ where: { id: parsed.data.trainerId }, select: { id: true } }))) {
    return res.status(400).json({ message: "That trainer profile does not exist." });
  }

  const course = await prisma.course.update({
    where: { id: existing.id },
    data: { trainerId: parsed.data.trainerId },
    include: { trainer: { select: { id: true, fullName: true } }, unit: { select: { id: true, code: true, vblEnabled: true } } },
  });
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: "COURSE_TRAINER_ASSIGNED",
      entityType: "Course",
      entityId: course.id,
      metadata: { fromTrainerId: existing.trainerId, toTrainerId: course.trainerId },
    },
  });
  if (course.unit.vblEnabled && course.trainer && course.trainerId !== existing.trainerId) {
    emitPortalEvent({
      eventType: "staff.assigned",
      entityType: "Course",
      entityId: course.id,
      payload: {
        portalTrainerId: course.trainer.id,
        trainerName: course.trainer.fullName,
        unitId: course.unit.id,
        unitCode: course.unit.code,
      },
    }).catch((err) => console.error("Failed to queue staff.assigned for VBL sync", err));
  }
  res.json(course);
});

coursesRouter.delete("/:id", requireAuth, requireRole(...ADMIN_COURSE_ROLES), async (req: AuthedRequest, res) => {
  const result = await prisma.$transaction(async (tx) => {
    const course = await tx.course.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: {
            modules: true,
            assignments: true,
            assessments: true,
            attendanceRecords: true,
            timetableEntries: true,
            forums: true,
            feedback: true,
            studyGroups: true,
            certificates: true,
            announcements: true,
            liveClasses: true,
            examBoardRatifications: true,
            approvals: true,
          },
        },
        catalogueEntry: { select: { id: true } },
        deliveryPlan: { select: { id: true } },
        completionRule: { select: { id: true } },
      },
    });
    if (!course) return { kind: "missing" as const };
    const dependencies = Object.entries(course._count)
      .filter(([, count]) => count > 0)
      .map(([name, count]) => `${count} ${name}`);
    if (course.catalogueEntry) dependencies.push("catalogue entry");
    if (course.deliveryPlan) dependencies.push("delivery plan");
    if (course.completionRule) dependencies.push("completion rule");
    if (dependencies.length > 0) return { kind: "in-use" as const, dependencies };

    await tx.course.delete({ where: { id: course.id } });
    await tx.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "COURSE_DELETED",
        entityType: "Course",
        entityId: course.id,
        metadata: { title: course.title, unitId: course.unitId, trainerId: course.trainerId },
      },
    });
    return { kind: "deleted" as const };
  });

  if (result.kind === "missing") return res.status(404).json({ message: "Course not found." });
  if (result.kind === "in-use") {
    return res.status(409).json({
      message: `This course cannot be deleted because it has associated records: ${result.dependencies.join(", ")}. Unpublish it or remove/archive its records first.`,
      dependencies: result.dependencies,
    });
  }
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// QA014 — course approval: publishing a course above was previously a flag
// any ADMIN_COURSE_ROLES user could flip directly (PATCH /:id { published }),
// with no review step at all — QA009's accreditation workflow only ever
// covered the programme level. This adds a real, additive submit -> decide
// gate: PATCH /:id { published: true } still works exactly as before for
// admin-course-role users who don't want the extra ceremony (nothing here
// removes that), but a course can now also be routed through an actual
// QA sign-off, mirroring programme-accreditation.ts's shape.
// ---------------------------------------------------------------------------
const courseApprovalRequestSchema = z.object({ notes: z.string().optional() });

coursesRouter.post(
  "/:id/request-approval",
  requireAuth,
  requireRole(...ADMIN_COURSE_ROLES, "TRAINER"),
  async (req: AuthedRequest, res) => {
    const parsed = courseApprovalRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid request." });

    const course = await prisma.course.findUnique({ where: { id: req.params.id } });
    if (!course) return res.status(404).json({ message: "Course not found." });

    const approval = await prisma.courseApproval.create({
      data: { courseId: course.id, requestedById: req.user!.id, notes: parsed.data.notes, status: "pending" },
    });

    await prisma.auditLog.create({
      data: { userId: req.user!.id, action: "COURSE_APPROVAL_REQUESTED", entityType: "Course", entityId: course.id, metadata: { approvalId: approval.id } },
    });

    res.status(201).json(approval);
  }
);

coursesRouter.get(
  "/:id/approvals",
  requireAuth,
  requireRole(...ADMIN_COURSE_ROLES, "TRAINER", "QA_OFFICER"),
  async (req: AuthedRequest, res) => {
    const approvals = await prisma.courseApproval.findMany({ where: { courseId: req.params.id }, orderBy: { createdAt: "desc" } });
    res.json(approvals);
  }
);

coursesRouter.get(
  "/approvals/pending",
  requireAuth,
  requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const pending = await prisma.courseApproval.findMany({
      where: { status: "pending" },
      include: { course: { include: { unit: true } } },
      orderBy: { createdAt: "asc" },
    });
    res.json(pending);
  }
);

const courseApprovalDecisionSchema = z.object({ decision: z.enum(["approved", "rejected"]), notes: z.string().optional() });

// Approving a course is the single point where it actually goes live via
// this workflow — publishedAt is set in the same transaction as the
// decision, so a course can never end up "approved" on the QA record
// while still unpublished, or vice versa.
coursesRouter.post(
  "/approvals/:approvalId/decision",
  requireAuth,
  requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = courseApprovalDecisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "decision must be approved or rejected." });

    const approval = await prisma.courseApproval.findUnique({ where: { id: req.params.approvalId } });
    if (!approval) return res.status(404).json({ message: "Approval request not found." });
    if (approval.status !== "pending") return res.status(409).json({ message: "This request was already decided." });

    const [updatedApproval] = await prisma.$transaction([
      prisma.courseApproval.update({
        where: { id: approval.id },
        data: { status: parsed.data.decision, notes: parsed.data.notes, reviewedById: req.user!.id, reviewedAt: new Date() },
      }),
      ...(parsed.data.decision === "approved"
        ? [prisma.course.update({ where: { id: approval.courseId }, data: { publishedAt: new Date() } })]
        : []),
    ]);

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "COURSE_APPROVAL_DECIDED",
        entityType: "Course",
        entityId: approval.courseId,
        metadata: { decision: parsed.data.decision, approvalId: approval.id },
      },
    });

    res.json(updatedApproval);
  }
);

// Manual retry — for a course that's lmsEngine=MOODLE but stuck
// moodleStatus="pending" because Moodle wasn't reachable/configured
// when it was created or last edited.
coursesRouter.post("/:id/moodle-sync", requireAuth, requireRole(...ADMIN_COURSE_ROLES), async (req, res) => {
  if (!isMoodleConfigured()) {
    return res.status(503).json({ message: "Moodle is not configured on this deployment (MOODLE_BASE_URL / MOODLE_WS_TOKEN missing)." });
  }
  const course = await prisma.course.findUnique({ where: { id: req.params.id } });
  if (!course) return res.status(404).json({ message: "Course not found." });
  if (course.lmsEngine !== "MOODLE") return res.status(400).json({ message: "This course is not in Moodle mode." });

  try {
    const moodleCourseId = await ensureMoodleCourse(course.id);
    await updateMoodleCourse(course.id);
    await enrolExistingStudents(course.id, course.unitId);
    res.json({ moodleCourseId, syncedAt: new Date() });
  } catch (err: any) {
    res.status(502).json({ message: "Could not reach Moodle to sync this course.", detail: err?.message });
  }
});

// LMS001 — Course catalogue: browsable listing of courses
coursesRouter.get("/catalogue/browse", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const isAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMISSIONS_OFFICER";

    const entries = await prisma.courseCatalogueEntry.findMany({
      where: isAdmin ? {} : { isVisible: true },
      include: {
        course: {
          include: { unit: true, trainer: true },
        },
      },
      orderBy: { course: { title: "asc" } },
    });
    res.json(entries);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update catalogue entry
coursesRouter.get("/:courseId/catalogue", requireAuth, requireRole(...COURSE_CATALOGUE_ROLES), async (req, res) => {
  const course = await prisma.course.findUnique({
    where: { id: req.params.courseId },
    select: { id: true },
  });
  if (!course) return res.status(404).json({ message: "Course not found." });
  const entry = await prisma.courseCatalogueEntry.findUnique({ where: { courseId: course.id } });
  res.json(entry ?? {
    courseId: course.id,
    isVisible: true,
    shortCode: null,
    credits: null,
    level: null,
    prerequisites: [],
    keywords: [],
  });
});

coursesRouter.post("/:courseId/catalogue", requireAuth, requireRole(...COURSE_CATALOGUE_ROLES), async (req, res) => {
  try {
    const { courseId } = req.params;
    const parsed = z.object({
      isVisible: z.boolean().optional(),
      shortCode: z.string().nullable().optional(),
      credits: z.number().int().min(1).max(36).nullable().optional(),
      level: z.string().nullable().optional(),
      prerequisites: z.array(z.string()).optional(),
      keywords: z.array(z.string()).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Course credits must be between 1 and 36; check the catalogue details." });
    const { isVisible, shortCode, credits, level, prerequisites, keywords } = parsed.data;

    const existing = await prisma.courseCatalogueEntry.findUnique({
      where: { courseId },
    });

    const entry = existing
      ? await prisma.courseCatalogueEntry.update({
          where: { courseId },
          data: { isVisible, shortCode, credits, level, prerequisites, keywords },
        })
      : await prisma.courseCatalogueEntry.create({
          data: { courseId, isVisible: isVisible !== false, shortCode, credits, level, prerequisites: prerequisites ?? [], keywords: keywords ?? [] },
        });

    res.json(entry);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// LMS015 — Course-level announcements
coursesRouter.post("/:courseId/announcements", requireAuth, requireRole("TRAINER"), async (req: AuthedRequest, res) => {
  try {
    const { courseId } = req.params;
    const parsed = z.object({ title: z.string().trim().min(3).max(100), content: z.string().trim().min(3).max(4000), importance: z.enum(["low", "normal", "high", "urgent"]).optional(), pinnedUntil: z.string().datetime().optional(), scheduledAt: z.string().datetime().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide a title, message, valid importance, and optional ISO dates." });
    if (!(await canTeachCourse(req.user!, courseId))) return res.status(403).json({ error: "You don't teach this course." });
    const { title, content, importance, pinnedUntil, scheduledAt } = parsed.data;
    const due = scheduledAt ? new Date(scheduledAt) : null;
    if (due && (due <= new Date() || due.getTime() > Date.now() + 365 * 86_400_000)) return res.status(400).json({ error: "Schedule the notice for a future date within the next year." });
    // Batch 45 fix: (req as any).user.trainerId never existed — requireAuth only
    // puts { id, role, email } on req.user, so this always fell through to the
    // 403 below even for real trainers (LMS015 was non-functional as shipped).
    const trainer = await prisma.trainer.findUnique({ where: { userId: (req as any).user.id } });

    if (!trainer) return res.status(403).json({ error: "Only trainers can post announcements" });

    const announcement = await prisma.courseAnnouncement.create({
      data: {
        courseId,
        trainerId: trainer.id,
        title,
        content,
        importance: importance || "normal",
        pinnedUntil: pinnedUntil ? new Date(pinnedUntil) : undefined,
        scheduledAt: due,
        sentAt: due ? null : new Date(),
        status: due ? "SCHEDULED" : "SENT",
      },
    });
    if (!due) {
      const course = await prisma.course.findUnique({ where: { id: courseId }, select: { title: true, unitId: true } });
      const roster = course ? await prisma.enrollment.findMany({ where: { unitId: course.unitId, status: { not: "withdrawn" } }, select: { student: { select: { userId: true } } } }) : [];
      await notifyOnce(roster.map((r) => ({ userId: r.student.userId, title: `${course?.title ?? "Course"}: ${title}`.slice(0, 120), body: content })), "announcement", 0.04).catch(() => undefined);
    }
    res.status(due ? 202 : 201).json(announcement);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

coursesRouter.get("/:courseId/announcements", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { courseId } = req.params;
    if (!(await courseGate(req, res, courseId))) return;
    const announcements = await prisma.courseAnnouncement.findMany({
      where: { courseId, status: "SENT", OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] },
      include: { trainer: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(announcements);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

const announcementUpdateSchema = z.object({
  title: z.string().trim().min(3).max(100).optional(),
  content: z.string().trim().min(3).max(4000).optional(),
  importance: z.enum(["low", "normal", "high", "urgent"]).optional(),
}).refine((data) => Object.keys(data).length > 0);

coursesRouter.patch("/:courseId/announcements/:announcementId", requireAuth, requireRole("TRAINER"), async (req: AuthedRequest, res) => {
  const parsed = announcementUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Provide at least one valid note field to update." });
  if (!(await canTeachCourse(req.user!, req.params.courseId))) {
    return res.status(403).json({ error: "You don't teach this course." });
  }
  const trainer = await prisma.trainer.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  const existing = await prisma.courseAnnouncement.findFirst({
    where: { id: req.params.announcementId, courseId: req.params.courseId, trainerId: trainer?.id },
  });
  if (!existing) return res.status(404).json({ error: "Course note not found." });
  res.json(await prisma.courseAnnouncement.update({
    where: { id: existing.id },
    data: parsed.data,
  }));
});

coursesRouter.delete("/:courseId/announcements/:announcementId", requireAuth, requireRole("TRAINER"), async (req: AuthedRequest, res) => {
  if (!(await canTeachCourse(req.user!, req.params.courseId))) {
    return res.status(403).json({ error: "You don't teach this course." });
  }
  const trainer = await prisma.trainer.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  const existing = await prisma.courseAnnouncement.findFirst({
    where: { id: req.params.announcementId, courseId: req.params.courseId, trainerId: trainer?.id },
  });
  if (!existing) return res.status(404).json({ error: "Course note not found." });
  await prisma.courseAnnouncement.delete({ where: { id: existing.id } });
  res.status(204).send();
});

// LMS036 — Course certificates
coursesRouter.post("/:courseId/certificates/:studentId", requireAuth, requireRole("TRAINER", "REGISTRAR"), async (req, res) => {
  try {
    const { courseId, studentId } = req.params;
    const { grade } = req.body;

    const existing = await prisma.courseCertificate.findUnique({
      where: { courseId_studentId: { courseId, studentId } },
    });

    if (existing) return res.status(400).json({ error: "Certificate already issued" });

    const certificate = await prisma.courseCertificate.create({
      data: {
        courseId,
        studentId,
        grade: grade || "PASS",
        certificateCode: `CC-${courseId.slice(0, 6)}-${studentId.slice(0, 6)}-${Date.now()}`,
      },
    });
    res.json(certificate);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

coursesRouter.get("/mine/certificates", requireAuth, async (req, res) => {
  try {
    // Batch 45 fix: (req as any).user.studentId never existed — same class
    // of bug as the trainerId one above. This endpoint 403'd for every
    // real student since it shipped.
    const student = await prisma.student.findUnique({ where: { userId: (req as any).user.id } });
    if (!student) return res.status(403).json({ error: "Students only" });

    const certificates = await prisma.courseCertificate.findMany({
      where: { studentId: student.id, revoked: false },
      include: { course: { include: { unit: true, trainer: true } } },
      orderBy: { issuedAt: "desc" },
    });
    res.json(certificates);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// LMS036 (Batch 45) — revoke, and an institution-wide registry view.
// Issuance already existed; revocation and oversight did not, even though
// the `revoked`/`revokedAt` columns were already sitting unused on the model.
coursesRouter.patch(
  "/certificates/:certificateId/revoke",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const certificate = await prisma.courseCertificate.update({
        where: { id: req.params.certificateId },
        data: { revoked: true, revokedAt: new Date() },
      });
      res.json(certificate);
    } catch {
      res.status(404).json({ error: "Certificate not found" });
    }
  }
);

coursesRouter.get(
  "/certificates/all",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req, res) => {
    const { revoked } = req.query;
    const certificates = await prisma.courseCertificate.findMany({
      where: typeof revoked === "string" ? { revoked: revoked === "true" } : {},
      include: { course: { select: { title: true } }, student: { select: { fullName: true, studentNumber: true } } },
      orderBy: { issuedAt: "desc" },
    });
    res.json(certificates);
  }
);
