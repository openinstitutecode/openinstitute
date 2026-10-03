// Moodle integration — enrolment sync.
//
// The backend is the sole authority here: this module is never called
// directly off a frontend request. The caller (a future route in
// courses.ts or similar) must independently verify eligibility/payment
// before invoking enrolStudent — this file assumes that check already
// happened and does not re-derive authorization itself.

import { prisma } from "../lib/prisma.js";
import { callMoodle } from "./client.js";
import { ensureMoodleCourse } from "./courseSync.js";
import { ensureMoodleUser } from "./userSync.js";
import { mapRoleToMoodle } from "./roleMap.js";

/**
 * Enrol a student into the Moodle course backing the given application
 * Course. Idempotent: safe to call again for an already-enrolled
 * student (Moodle's enrol_manual_enrol_users is itself idempotent for
 * an existing user+course+role combination).
 *
 * Expects the caller to have already confirmed lmsEngine = MOODLE
 * and eligibility (payment, prerequisites, etc.) for this course.
 */
export async function enrolStudent(params: {
  studentUserId: string; // User.id of the student (not Student.id)
  courseId: string; // Course.id, must be lmsEngine = MOODLE
}): Promise<number> {
  const { studentUserId, courseId } = params;

  const moodleUserId = await ensureMoodleUser(studentUserId);
  if (moodleUserId === null) {
    throw new Error(`User ${studentUserId} has no Moodle-mapped role — cannot enrol.`);
  }
  const moodleCourseId = await ensureMoodleCourse(courseId);
  const roleShortname = mapRoleToMoodle("STUDENT")!; // enrolStudent is student-only by contract

  await callMoodle("enrol_manual_enrol_users", {
    enrolments: [
      {
        roleid: await roleIdFor(roleShortname),
        userid: moodleUserId,
        courseid: moodleCourseId,
      },
    ],
  });

  return moodleCourseId;
}

/**
 * Revoke Moodle access for a student on this course — used when payment
 * fails, access expires, or the enrollment is withdrawn. Idempotent:
 * unenrolling an already-unenrolled user is a no-op in Moodle, not an
 * error.
 */
export async function unenrolStudent(params: { studentUserId: string; courseId: string }): Promise<void> {
  const { studentUserId, courseId } = params;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: studentUserId } });
  const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });

  if (!user.moodleUserId || !course.moodleCourseId) {
    // Never synced in the first place — nothing to revoke.
    return;
  }

  await callMoodle("enrol_manual_unenrol_users", {
    enrolments: [{ userid: user.moodleUserId, courseid: course.moodleCourseId }],
  });
}

// Moodle role ids are per-install (not guaranteed stable across
// instances), so shortname -> id is resolved via core_role_.. lookup
// rather than hardcoded, and cached for the process lifetime.
const roleIdCache = new Map<string, number>();
async function roleIdFor(shortname: string): Promise<number> {
  if (roleIdCache.has(shortname)) return roleIdCache.get(shortname)!;
  const roles = await callMoodle<Array<{ id: number; shortname: string }>>("core_role_get_roles" as any, {});
  const match = roles.find((r) => r.shortname === shortname);
  if (!match) throw new Error(`Moodle has no role with shortname "${shortname}" — check site role config.`);
  roleIdCache.set(shortname, match.id);
  return match.id;
}
