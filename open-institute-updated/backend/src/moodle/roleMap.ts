// Moodle integration — role mapping.
//
// Deliberately explicit and narrow: only roles that plausibly touch a
// MOODLE-mode course are mapped. Every other role (finance, HR, QA,
// registrar, etc.) has no Moodle presence at all — they were never
// meant to log into Moodle, so there's no default to fall back to.
//
// Least privilege per the integration brief: nobody gets Moodle's
// "manager" (near-admin) role just by holding an application-side admin
// title. If a specific person genuinely needs Moodle admin, that's a
// manual grant inside Moodle itself, never something this sync assigns.

import type { MoodleRoleShortname } from "./types.js";

const ROLE_MAP: Partial<Record<string, MoodleRoleShortname>> = {
  STUDENT: "student",
  TRAINER: "teacher",
  DEPARTMENT_HEAD: "teacher",
  PROGRAMME_COORDINATOR: "teacher",
  QA_OFFICER: "manager",
};

/**
 * Returns the Moodle role for an application Role, or null if that role
 * has no business being synced to Moodle at all. Callers must treat
 * `null` as "do not create/enrol this user in Moodle", not as a signal
 * to fall back to a default role.
 */
export function mapRoleToMoodle(appRole: string): MoodleRoleShortname | null {
  return ROLE_MAP[appRole] ?? null;
}
