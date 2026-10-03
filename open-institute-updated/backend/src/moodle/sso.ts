// Moodle integration — single sign-on.
//
// Uses the auth_userkey plugin (Catalyst IT — moodle.org/plugins/auth_userkey),
// NOT a hand-rolled OIDC provider. Reasoning: your auth is a stateless JWT
// bearer token with no browser session/cookie, which doesn't fit a real
// OIDC authorization-code redirect flow cleanly. auth_userkey is a
// documented, widely-used Moodle plugin built for exactly this shape of
// integration — server-to-server call, get a one-time login URL, redirect
// the browser to it.
//
// REQUIRES (not automatic — must be done in Moodle admin, see
// docs/moodle-integration.md):
//   1. Install auth_userkey (it is a THIRD-PARTY plugin, not Moodle core
//      — correcting the earlier architecture note that called it core).
//   2. Site administration > Plugins > Authentication > enable "User key".
//   3. Set Mapping field = username (matches the username scheme in
//      userSync.ts's usernameFor()).
//   4. Create a Web Services token for a dedicated service account with
//      the 'auth/userkey:generatekey' capability, authorised for the
//      "User key authentication web service".
//   5. Set MOODLE_SSO_WS_TOKEN — a SEPARATE token from MOODLE_WS_TOKEN,
//      scoped only to auth_userkey, so a leak of one doesn't grant the
//      other's privileges.

import { prisma } from "../lib/prisma.js";
import { callMoodle } from "./client.js";
import { ensureMoodleUser } from "./userSync.js";
import { ensureMoodleCourse } from "./courseSync.js";
import { MoodleApiError } from "./types.js";

interface UserKeyResponse {
  loginurl: string;
}

export function isMoodleSsoConfigured(): boolean {
  return Boolean(process.env.MOODLE_BASE_URL && process.env.MOODLE_WS_TOKEN && process.env.MOODLE_SSO_WS_TOKEN);
}

/**
 * Get a one-time Moodle login URL for this user, optionally landing them
 * directly on a specific course after login.
 *
 * The `wantsurl` query param appended below relies on Moodle's general
 * post-login redirect behaviour (respected by login.php since early
 * Moodle 2.x) rather than being part of auth_userkey's own documented
 * webservice contract — verify this actually lands on the course page
 * once tested against your real instance; if it doesn't, drop the
 * course targeting and send the student to the Moodle dashboard instead,
 * with a "your course" note in your own UI leading them from there.
 */
export async function getMoodleLaunchUrl(params: { userId: string; courseId?: string }): Promise<string> {
  const { userId, courseId } = params;
  const ssoToken = process.env.MOODLE_SSO_WS_TOKEN;
  if (!ssoToken) {
    throw new MoodleApiError("Moodle SSO is not configured (MOODLE_SSO_WS_TOKEN missing).", "config");
  }

  const moodleUserId = await ensureMoodleUser(userId);
  if (moodleUserId === null) {
    throw new Error(`User ${userId} has no Moodle-mapped role — cannot generate an SSO launch URL.`);
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const username = `kvbdtc_${user.id}`.toLowerCase(); // must match userSync.ts's usernameFor()

  const response = await callMoodle<UserKeyResponse>(
    "auth_userkey_request_login_url",
    { user: { username } },
    { retry: false, token: ssoToken }
  );

  if (!response?.loginurl) {
    throw new Error("Moodle did not return a login URL — check auth_userkey is enabled and configured.");
  }

  let url = response.loginurl;

  if (courseId) {
    const moodleCourseId = await ensureMoodleCourse(courseId);
    const separator = url.includes("?") ? "&" : "?";
    url = `${url}${separator}wantsurl=${encodeURIComponent(`/course/view.php?id=${moodleCourseId}`)}`;
  }

  return url;
}
