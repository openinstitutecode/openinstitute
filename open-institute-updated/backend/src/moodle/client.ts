// Moodle integration — Web Services REST client.
//
// This is the ONLY place in the codebase that should construct a Moodle
// API request. Everything else (userSync, courseSync, enrolment, grades)
// calls through here so token handling, error shape, and retries stay
// in one spot.
//
// Moodle's REST protocol is deliberately unusual: it's a POST with
// url-encoded params, a `wsfunction` field selecting the RPC, and
// `moodlewsrestformat=json`. Array/object params get flattened with
// bracket notation (handled by `flattenParams` below).

import { MoodleApiError } from "./types.js";

const MOODLE_BASE_URL = process.env.MOODLE_BASE_URL;
const MOODLE_WS_TOKEN = process.env.MOODLE_WS_TOKEN;

function assertConfigured(): void {
  if (!MOODLE_BASE_URL || !MOODLE_WS_TOKEN) {
    throw new MoodleApiError(
      "Moodle integration is not configured (MOODLE_BASE_URL / MOODLE_WS_TOKEN missing). " +
        "This should only be reached for a MOODLE-mode course — check the caller.",
      "config"
    );
  }
}

// Moodle expects nested params as bracket-notated form fields, e.g.
// users[0][username]=foo, users[0][email]=bar. This is the standard
// flattening scheme used by every Moodle client library.
function flattenParams(prefix: string, value: unknown, out: URLSearchParams) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => flattenParams(`${prefix}[${i}]`, v, out));
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flattenParams(`${prefix}[${k}]`, v, out);
    }
  } else {
    out.append(prefix, String(value));
  }
}

interface CallOptions {
  /** Retry transient failures (network / 5xx). Default true. */
  retry?: boolean;
  timeoutMs?: number;
  /**
   * Override the token for this call. Used by sso.ts to call
   * auth_userkey with a narrowly-scoped MOODLE_SSO_WS_TOKEN rather than
   * the general-purpose MOODLE_WS_TOKEN — least privilege: a leak of
   * one token shouldn't grant the other's capabilities.
   */
  token?: string;
}

/**
 * Call a single Moodle Web Service function.
 *
 * Deliberately generic (`params`/return typed by the caller) rather than
 * exposing a typed method per wsfunction — Moodle has hundreds of
 * functions and we only need a handful; callers in userSync.ts /
 * courseSync.ts / enrolment.ts / grades.ts wrap this with proper types.
 */
export async function callMoodle<T>(
  wsfunction: string,
  params: Record<string, unknown> = {},
  options: CallOptions = {}
): Promise<T> {
  assertConfigured();
  const { retry = true, timeoutMs = 15_000, token } = options;

  const body = new URLSearchParams();
  body.append("wstoken", token ?? (MOODLE_WS_TOKEN as string));
  body.append("wsfunction", wsfunction);
  body.append("moodlewsrestformat", "json");
  for (const [key, value] of Object.entries(params)) {
    flattenParams(key, value, body);
  }

  const attempt = async (): Promise<T> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${MOODLE_BASE_URL}/webservice/rest/server.php`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      throw new MoodleApiError(`Network error calling Moodle (${wsfunction})`, wsfunction, undefined, err);
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      throw new MoodleApiError(`Moodle returned HTTP ${res.status} for ${wsfunction}`, wsfunction);
    }

    const data = await res.json();

    // Moodle signals RPC-level errors with a 200 + an `exception`/`errorcode`
    // body rather than an HTTP error status — has to be checked explicitly.
    if (data && typeof data === "object" && "exception" in data) {
      throw new MoodleApiError(
        (data as { message?: string }).message ?? `Moodle exception in ${wsfunction}`,
        wsfunction,
        (data as { errorcode?: string }).errorcode
      );
    }

    return data as T;
  };

  try {
    return await attempt();
  } catch (err) {
    if (retry && err instanceof MoodleApiError && !err.moodleErrorCode) {
      // Only retry transport-level failures (network/HTTP), never a real
      // Moodle-side rejection (e.g. "user already exists") — retrying
      // those would just risk duplicate-creation races.
      return attempt();
    }
    throw err;
  }
}

export function isMoodleConfigured(): boolean {
  return Boolean(MOODLE_BASE_URL && MOODLE_WS_TOKEN);
}
