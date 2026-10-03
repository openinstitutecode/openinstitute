import { prisma } from "../lib/prisma.js";

// Batch 66 — trainer review scoping. Batch 65 let ANY trainer review ANY Lab result. A TRAINER may
// now only review results for units they are assigned to teach (Course.trainerId -> Trainer.userId);
// ICT_ADMIN / SUPER_ADMIN keep global access. One indexed query, no in-process state.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
export interface Reviewer { id: string; role: string }

const GLOBAL_ROLES = new Set(["ICT_ADMIN", "SUPER_ADMIN"]);

export const hasGlobalLabAccess = (reviewer: Reviewer): boolean => GLOBAL_ROLES.has(reviewer.role);

/** Unit ids this user teaches. Empty for anyone who is not a trainer with an assigned course. */
export async function trainerUnitIds(userId: string, db: Db = prisma): Promise<string[]> {
  const courses = await db.course.findMany({
    where: { trainer: { userId } },
    select: { unitId: true },
    distinct: ["unitId"],
  });
  return courses.map((c: { unitId: string }) => c.unitId);
}

export async function canReviewUnit(reviewer: Reviewer, unitId: string, db: Db = prisma): Promise<boolean> {
  if (hasGlobalLabAccess(reviewer)) return true;
  if (reviewer.role !== "TRAINER") return false;
  const owned = await db.course.findFirst({ where: { unitId, trainer: { userId: reviewer.id } }, select: { id: true } });
  return owned !== null;
}
