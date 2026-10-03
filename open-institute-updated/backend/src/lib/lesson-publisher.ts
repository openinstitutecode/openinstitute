// Batch 77 — CNT030 / ASG005: every few minutes, publish lessons whose scheduled time has arrived and announce
// assignments whose release time has arrived. Idempotent (a lesson's publishAt is cleared; an assignment's
// reminderSentAt is set) so two instances running at once cannot double-send. Disable with LESSON_PUBLISHER_ENABLED=false.
import { prisma } from "./prisma.js";
import { notifyOnce } from "./reminder-jobs.js";

export async function publishDueLessons(now = new Date()) {
  const due = await prisma.lesson.findMany({ where: { isPublished: false, publishAt: { lte: now } }, select: { id: true, title: true, module: { select: { course: { select: { id: true, title: true, unitId: true } } } } }, take: 200 });
  let published = 0, notified = 0;
  for (const l of due) {
    const claimed = await prisma.lesson.updateMany({ where: { id: l.id, isPublished: false, publishAt: { lte: now } }, data: { isPublished: true, publishAt: null, lastNotifiedAt: now } });
    if (!claimed.count) continue;
    published++;
    const roster = await prisma.enrollment.findMany({ where: { unitId: l.module.course.unitId, status: { not: "withdrawn" } }, select: { student: { select: { userId: true } } } });
    const r = await notifyOnce([...new Set(roster.map((x) => x.student.userId))].map((userId) => ({ userId, title: `New lesson: ${l.title}`.slice(0, 120), body: `${l.module.course.title} has a new lesson available.` })), "academic", 1);
    notified += r.created;
  }
  return { published, notified };
}

export async function announceReleasedAssignments(now = new Date()) {
  const due = await prisma.assignment.findMany({ where: { status: "PUBLISHED", releaseAt: { lte: now }, reminderSentAt: null }, include: { course: { select: { title: true, unitId: true } } }, take: 100 });
  let announced = 0;
  for (const a of due) {
    const claimed = await prisma.assignment.updateMany({ where: { id: a.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (!claimed.count) continue;
    announced++;
    const roster = await prisma.enrollment.findMany({ where: { unitId: a.course.unitId, status: { not: "withdrawn" } }, select: { student: { select: { userId: true } } } });
    await notifyOnce([...new Set(roster.map((x) => x.student.userId))].map((userId) => ({ userId, title: `New assignment: ${a.title}`.slice(0, 120), body: `${a.course.title} — due ${a.dueAt.toISOString().slice(0, 16).replace("T", " ")} UTC, ${a.totalMarks} marks.` })), "academic", 7);
  }
  return { announced };
}

let timer: NodeJS.Timeout | null = null;
export function startLessonPublisher(): boolean {
  if (timer || process.env.LESSON_PUBLISHER_ENABLED === "false") return false;
  const tick = () => void Promise.all([publishDueLessons(), announceReleasedAssignments()]).catch((e) => console.error("[lesson-publisher]", e));
  timer = setInterval(tick, 5 * 60_000);
  timer.unref?.();
  return true;
}
export function stopLessonPublisher() { if (timer) clearInterval(timer); timer = null; }
