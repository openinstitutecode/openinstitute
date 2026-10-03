// KSEC-005 brute-force protection · KFX-009 lockout tracking. Decision logic is pure; the caller
// supplies attempt timestamps read from the shared FailedLoginAttempt table, so the lockout holds
// across restarts and across API instances (no per-process state).
export type ThrottlePolicy = { maxFailures: number; windowMinutes: number; ipMaxFailures: number };

export function throttlePolicy(env: NodeJS.ProcessEnv = process.env): ThrottlePolicy {
  const n = (k: string, d: number) => (Number.isInteger(Number(env[k])) && Number(env[k]) > 0 ? Number(env[k]) : d);
  return { maxFailures: n("LOGIN_MAX_FAILURES", 5), windowMinutes: n("LOGIN_LOCKOUT_MINUTES", 15), ipMaxFailures: n("LOGIN_IP_MAX_FAILURES", 30) };
}

/**
 * @param failures timestamps of counted failures (already limited to this account or IP, excluding
 *                 attempts that were themselves rejected for being locked — otherwise hammering a
 *                 locked account would extend the lock forever).
 * @returns retryAfterSeconds > 0 when locked.
 */
export function lockoutStatus(failures: Date[], now: Date, limit: number, windowMinutes: number): { locked: boolean; retryAfterSeconds: number } {
  const windowMs = windowMinutes * 60_000;
  const recent = failures.filter((d) => now.getTime() - d.getTime() < windowMs).sort((a, b) => a.getTime() - b.getTime());
  if (recent.length < limit) return { locked: false, retryAfterSeconds: 0 };
  // The lock lifts when the failure that put us at the limit ages out of the window.
  const pivot = recent[recent.length - limit];
  const retry = Math.ceil((pivot.getTime() + windowMs - now.getTime()) / 1000);
  return retry > 0 ? { locked: true, retryAfterSeconds: retry } : { locked: false, retryAfterSeconds: 0 };
}
