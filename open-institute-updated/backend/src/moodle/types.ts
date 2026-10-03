// Moodle integration — shared types.
// This module only ever talks to Moodle through its documented Web
// Services REST API (see client.ts). Nothing here touches Moodle's
// database directly.

export interface MoodleUser {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
  email: string;
  suspended?: boolean;
}

export interface MoodleCourse {
  id: number;
  shortname: string;
  fullname: string;
  categoryid: number;
  visible?: number; // 0 | 1
}

export interface MoodleEnrolment {
  id: number;
  userid: number;
  courseid: number;
  roleShortname: MoodleRoleShortname;
}

// The Moodle role shortnames we map onto. Kept narrow and explicit —
// resist the temptation to widen this without a corresponding entry in
// roleMap.ts, since an unmapped role must never silently fall through to
// something over-privileged.
export type MoodleRoleShortname = "student" | "teacher" | "manager";

export class MoodleApiError extends Error {
  constructor(
    message: string,
    public readonly wsfunction: string,
    public readonly moodleErrorCode?: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "MoodleApiError";
  }
}
