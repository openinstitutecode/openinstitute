// Moodle integration — course sync.
//
// Only ever called for a Course with lmsEngine = MOODLE. A
// CUSTOM-mode course should never reach any function in this file —
// callers (the route branching added in the next step) are responsible
// for that check; this module trusts it's only invoked for MOODLE
// courses and does not re-check lmsEngine itself.

import { prisma } from "../lib/prisma.js";
import { callMoodle } from "./client.js";
import { MoodleApiError, type MoodleCourse } from "./types.js";

// A single default category for now — Moodle categories mirroring your
// programme structure is a reasonable next step, but not required to
// get a working integration; revisit once the first few MOODLE-mode
// courses are live and it's clear how you want them organised.
const DEFAULT_CATEGORY_ID = Number(process.env.MOODLE_DEFAULT_CATEGORY_ID ?? 1);

/**
 * Ensure a Moodle course exists for the given application Course,
 * creating it if needed. Idempotent. Returns the Moodle course id.
 *
 * Throws if the course is not lmsEngine = MOODLE — callers must
 * branch on lmsEngine before calling this, this is a defensive
 * backstop, not the primary control.
 */
export async function ensureMoodleCourse(courseId: string): Promise<number> {
  const course = await prisma.course.findUniqueOrThrow({
    where: { id: courseId },
    include: { unit: true },
  });

  if (course.lmsEngine !== "MOODLE") {
    throw new Error(
      `ensureMoodleCourse called for course ${courseId}, which is lmsEngine=CUSTOM. This is a caller bug.`
    );
  }

  if (course.moodleCourseId) return course.moodleCourseId;

  const shortname = shortnameFor(course.id, course.unit.code);

  try {
    const created = await callMoodle<MoodleCourse[]>("core_course_create_courses", {
      courses: [
        {
          fullname: course.title,
          shortname,
          categoryid: DEFAULT_CATEGORY_ID,
          summary: course.description ?? "",
          visible: course.publishedAt ? 1 : 0,
        },
      ],
    });

    const createdCourse = created[0];
    if (!createdCourse?.id) {
      throw new Error("Moodle did not return a course id after creating the course.");
    }
    const moodleCourseId = createdCourse.id;
    await persistMoodleCourseId(course.id, moodleCourseId);
    return moodleCourseId;
  } catch (err) {
    if (err instanceof MoodleApiError && err.moodleErrorCode === "shortnametaken") {
      const result = await callMoodle<{ courses?: MoodleCourse[] }>("core_course_get_courses_by_field", {
        field: "shortname",
        value: shortname,
      });
      const [existing] = result.courses ?? [];
      if (!existing) throw err;
      await persistMoodleCourseId(course.id, existing.id);
      return existing.id;
    }
    throw err;
  }
}

/**
 * Push title/description/visibility changes to an already-synced Moodle
 * course. No-op (returns false) if the course hasn't been synced yet —
 * callers that need a course to exist should use ensureMoodleCourse.
 */
export async function updateMoodleCourse(courseId: string): Promise<boolean> {
  const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
  if (!course.moodleCourseId) return false;

  await callMoodle("core_course_update_courses", {
    courses: [
      {
        id: course.moodleCourseId,
        fullname: course.title,
        summary: course.description ?? "",
        visible: course.publishedAt ? 1 : 0,
      },
    ],
  });
  await prisma.course.update({ where: { id: courseId }, data: { moodleSyncedAt: new Date() } });
  return true;
}

async function persistMoodleCourseId(courseId: string, moodleCourseId: number) {
  await prisma.course.update({
    where: { id: courseId },
    data: { moodleCourseId, moodleSyncedAt: new Date() },
  });
}

function shortnameFor(courseId: string, unitCode: string): string {
  // Unit code gives it a human-recognisable prefix in the Moodle admin
  // UI; the course id suffix guarantees uniqueness without a counter.
  return `${unitCode}-${courseId}`.toLowerCase();
}
