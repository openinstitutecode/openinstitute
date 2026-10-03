// VBI015 — retry policy for outbound events. Dependency-free so it can be unit-tested (and reused
// by scripts) without loading the Prisma client.
export const MAX_ATTEMPTS = 8;

// Exponential backoff between attempts of the SAME event: 15s, 30s, 1m, 2m ... capped at 1h.
// `attempts` is the number of attempts already made (>= 1 after the first failure).
export function backoffSeconds(attempts: number): number {
  const n = Math.max(1, Math.floor(attempts));
  return Math.min(3600, 15 * 2 ** (n - 1));
}
