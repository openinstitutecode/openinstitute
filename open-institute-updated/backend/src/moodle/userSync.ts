// Moodle integration — user sync.
//
// Sync is LAZY: a user is only ever pushed to Moodle the first time they
// actually touch a MOODLE-mode course (enrolling, or a trainer having a
// MOODLE-mode course assigned to them) — not at registration. Given most
// courses stay on the custom LMS, most users should never get a Moodle
// account at all.
//
// Your application's User.id is authoritative. The mapping is
// User.moodleUserId <-> Moodle's numeric user id, persisted once and
// reused — never re-derived from email on every call.

import { prisma } from "../lib/prisma.js";
import { randomBytes } from "node:crypto";
import { callMoodle } from "./client.js";
import { mapRoleToMoodle } from "./roleMap.js";
import { MoodleApiError, type MoodleUser } from "./types.js";

/**
 * Ensure the given application user has a corresponding Moodle account,
 * creating one if needed. Idempotent — safe to call repeatedly; will not
 * create duplicates even under concurrent calls (falls back to a
 * lookup-by-email if Moodle reports the account already exists).
 *
 * Returns null if this user's role has no Moodle presence (see
 * roleMap.ts) — callers must treat that as "do not proceed with any
 * Moodle-side action for this user", not as an error to swallow blindly.
 */
export async function ensureMoodleUser(userId: string): Promise<number | null> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (user.moodleUserId) return user.moodleUserId;

  const moodleRole = mapRoleToMoodle(user.role);
  if (!moodleRole) return null;

  const [firstname, ...rest] = deriveNameParts(user.email);
  const lastname = rest.join(" ") || "User";

  try {
    const created = await callMoodle<MoodleUser[]>("core_user_create_users", {
      users: [
        {
          username: usernameFor(user.id),
          email: user.email,
          firstname,
          lastname,
          // Moodle requires a password on creation; the account is never
          // logged into with it directly — auth happens via the OIDC SSO
          // bridge (sso.ts), so this is generated and discarded.
          password: randomThrowawayPassword(),
          auth: "oauth2",
        },
      ],
    });

    const createdUser = created[0];
    if (!createdUser?.id) {
      throw new Error("Moodle did not return a user id after creating the account.");
    }
    const moodleUserId = createdUser.id;
    await persistMoodleUserId(user.id, moodleUserId);
    return moodleUserId;
  } catch (err) {
    if (err instanceof MoodleApiError && err.moodleErrorCode === "useralreadyexists") {
      // Race with another request, or a pre-existing Moodle account for
      // this email from before the integration existed — look it up
      // instead of retrying creation, so we never duplicate.
      const [existing] = await callMoodle<MoodleUser[]>("core_user_get_users_by_field", {
        field: "email",
        values: [user.email],
      });
      if (!existing) throw err; // genuinely unexpected — surface it
      await persistMoodleUserId(user.id, existing.id);
      return existing.id;
    }
    throw err;
  }
}

async function persistMoodleUserId(userId: string, moodleUserId: number) {
  await prisma.user.update({ where: { id: userId }, data: { moodleUserId } });
}

function usernameFor(userId: string): string {
  // Stable, collision-resistant, and never exposes email as the
  // Moodle-visible username.
  return `kvbdtc_${userId}`.toLowerCase();
}

function deriveNameParts(email: string): [string, ...string[]] {
  const local = email.split("@")[0] ?? "user";
  const parts = local.split(/[._-]/).filter(Boolean);
  return parts.length > 0 ? (parts as [string, ...string[]]) : ["User"];
}

function randomThrowawayPassword(): string {
  // Meets Moodle's default complexity policy; never surfaced or reused
  // since login only ever happens via SSO.
  return `Kx9!${randomBytes(32).toString("base64url")}Aa1`;
}
