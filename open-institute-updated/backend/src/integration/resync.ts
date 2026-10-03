import { prisma } from "../lib/prisma.js";
import { emitPortalEvent } from "./events.js";

// VBI039 — Manual Resynchronization (portal side). Re-emits the events that establish a student's
// (or a whole unit's) presence in the Lab, for the cases where the original events were never
// sent or were lost: the unit was Lab-enabled AFTER students had already enrolled, a Lab was
// rebuilt from scratch, etc. Safe to run repeatedly — the Lab side is idempotent on the things
// these events establish (a student already provisioned/enrolled is left alone), and each emission
// gets a fresh eventId so the ledger records every resync as its own auditable event.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type Emit = (e: { eventType: string; entityType?: string; entityId?: string; payload: Record<string, unknown> }) => Promise<unknown>;

export interface ResyncSummary {
  found: boolean;
  enrollmentsResynced: number;
  staffResynced: number;
  statusResynced: boolean;
}

async function emitEnrollment(db: Db, emit: Emit, enrollment: { id: string; semester: string; unitId: string; unit: { code: string } }, student: { id: string; studentNumber: string; fullName: string; user?: { email?: string } }) {
  await emit({
    eventType: "enrollment.created",
    entityType: "Enrollment",
    entityId: enrollment.id,
    payload: {
      portalStudentId: student.id,
      registrationNumber: student.studentNumber,
      fullName: student.fullName,
      email: student.user?.email,
      unitId: enrollment.unitId,
      unitCode: enrollment.unit.code,
      semester: enrollment.semester,
      resync: true,
    },
  });
}

export async function resyncStudent(studentId: string, db: Db = prisma, emit: Emit = (e) => emitPortalEvent(e, db)): Promise<ResyncSummary> {
  const student = await db.student.findUnique({
    where: { id: studentId },
    include: { user: { select: { email: true } } },
  });
  if (!student) return { found: false, enrollmentsResynced: 0, staffResynced: 0, statusResynced: false };

  const enrollments = await db.enrollment.findMany({
    where: { studentId, status: "in_progress", unit: { vblEnabled: true } },
    include: { unit: { select: { code: true } } },
  });
  for (const e of enrollments) await emitEnrollment(db, emit, e, student);

  await emit({
    eventType: "student.status_changed",
    entityType: "Student",
    entityId: student.id,
    payload: { portalStudentId: student.id, status: student.academicStatus === "ACTIVE" ? "ACTIVE" : student.academicStatus, resync: true },
  });
  return { found: true, enrollmentsResynced: enrollments.length, staffResynced: 0, statusResynced: true };
}

export async function resyncUnit(unitId: string, db: Db = prisma, emit: Emit = (e) => emitPortalEvent(e, db)): Promise<ResyncSummary> {
  const unit = await db.unit.findUnique({ where: { id: unitId }, select: { id: true, code: true, vblEnabled: true } });
  if (!unit) return { found: false, enrollmentsResynced: 0, staffResynced: 0, statusResynced: false };
  if (!unit.vblEnabled) return { found: true, enrollmentsResynced: 0, staffResynced: 0, statusResynced: false };

  const courses = await db.course.findMany({ where: { unitId, trainerId: { not: null } }, include: { trainer: { select: { id: true, fullName: true } } } });
  let staff = 0;
  for (const c of courses) {
    if (!c.trainer) continue;
    await emit({
      eventType: "staff.assigned",
      entityType: "Course",
      entityId: c.id,
      payload: { portalTrainerId: c.trainer.id, trainerName: c.trainer.fullName, unitId: unit.id, unitCode: unit.code, resync: true },
    });
    staff++;
  }

  const enrollments = await db.enrollment.findMany({
    where: { unitId, status: "in_progress" },
    include: { unit: { select: { code: true } }, student: { include: { user: { select: { email: true } } } } },
  });
  for (const e of enrollments) await emitEnrollment(db, emit, e, e.student);
  return { found: true, enrollmentsResynced: enrollments.length, staffResynced: staff, statusResynced: false };
}
