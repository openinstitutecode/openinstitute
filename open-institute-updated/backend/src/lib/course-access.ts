// Who may see or change a course. The trainer portal's routes used to trust
// any authenticated caller (a student could read a course roster or post an
// "announcement" to a whole class). Every course-scoped trainer route now
// goes through these checks instead.

import { prisma } from "./prisma.js";

export type Actor = { id: string; role: string };

/** Staff who oversee teaching without owning the course (read-only oversight). */
export const COURSE_OVERSIGHT_ROLES = [
  "SUPER_ADMIN",
  "PRINCIPAL",
  "DEPUTY_PRINCIPAL",
  "DEPARTMENT_HEAD",
  "PROGRAMME_COORDINATOR",
  "QA_OFFICER",
  "EXAMINATION_OFFICER",
  "REGISTRAR",
  "ICT_ADMIN",
  "AUDITOR",
  "REGULATORY_INSPECTOR",
  "EXTERNAL_EXAMINER",
];

const LEARNER_ROLES = ["STUDENT", "APPLICANT", "ALUMNUS", "EMPLOYER"];

export function isLearnerRole(role: string): boolean {
  return LEARNER_ROLES.includes(role);
}

export async function trainerIdForUser(userId: string): Promise<string | null> {
  const trainer = await prisma.trainer.findUnique({ where: { userId }, select: { id: true } });
  return trainer?.id ?? null;
}

/** The course's own trainer (or SUPER_ADMIN) — may edit content, grade, mark attendance, run live classes. */
export async function canTeachCourse(actor: Actor, courseId: string): Promise<boolean> {
  if (actor.role === "SUPER_ADMIN") return true;
  if (actor.role !== "TRAINER") return false;
  const trainerId = await trainerIdForUser(actor.id);
  if (!trainerId) return false;
  const course = await prisma.course.findFirst({ where: { id: courseId, trainerId }, select: { id: true } });
  return !!course;
}

/** Teaching trainer, or an oversight role: may read rosters, analytics, at-risk lists. */
export async function canViewCourseAsStaff(actor: Actor, courseId: string): Promise<boolean> {
  if (COURSE_OVERSIGHT_ROLES.includes(actor.role)) return true;
  return canTeachCourse(actor, courseId);
}

/** Enrolled in the course's unit in any status (a completed student can still revisit content). */
export async function isEnrolledInCourse(userId: string, courseId: string): Promise<boolean> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { unitId: true } });
  if (!course) return false;
  const student = await prisma.student.findUnique({ where: { userId }, select: { id: true } });
  if (!student) return false;
  const enrollment = await prisma.enrollment.findFirst({ where: { studentId: student.id, unitId: course.unitId }, select: { id: true } });
  return !!enrollment;
}

export async function canAccessCourseContent(actor: Actor, courseId: string): Promise<boolean> {
  if (await canViewCourseAsStaff(actor, courseId)) return true;
  if (isLearnerRole(actor.role)) return isEnrolledInCourse(actor.id, courseId);
  // Any other staff role (e.g. librarian, counsellor) keeps the read access it had before.
  return !isLearnerRole(actor.role);
}

/** Route helper (KSEC-007): 404 unless the caller may see this course's content. Enrolled students, teaching/oversight staff. */
export async function courseGate(req: { user?: Actor }, res: { status: (n: number) => { json: (b: unknown) => unknown } }, courseId: string): Promise<boolean> {
  if (req.user && (await canAccessCourseContent(req.user, courseId))) return true;
  res.status(404).json({ message: "Course not found.", code: "NOT_FOUND" });
  return false;
}
