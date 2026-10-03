// Batch 71 — KOBS-013/017/018. Pure rules for which notices users see and how availability is counted.
export type Notice = { kind: string; severity: string; status: string; startsAt: Date; endsAt: Date | null };

/** Shown to users: unresolved incidents; maintenance from 24 h before it starts until it ends (or is cancelled). */
export function isVisibleNotice(n: Notice, now = new Date()): boolean {
  if (n.status !== "active") return false;
  if (n.kind === "incident") return n.startsAt <= now;
  const lead = new Date(n.startsAt.getTime() - 24 * 3_600_000);
  return now >= lead && (!n.endsAt || now <= n.endsAt);
}

/** Minutes of "major" incident time in the window (overlapping incidents are merged so nothing is counted twice). Ongoing ones run to `now`. */
export function majorOutageMinutes(incidents: Notice[], windowDays = 30, now = new Date()): number {
  const from = now.getTime() - windowDays * 86_400_000;
  const spans = incidents
    .filter((i) => i.kind === "incident" && i.severity === "major" && i.status !== "cancelled")
    .map((i) => [Math.max(from, i.startsAt.getTime()), Math.min(now.getTime(), (i.endsAt ?? now).getTime())] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0, curEnd = -Infinity, curStart = 0;
  for (const [a, b] of spans) {
    if (a > curEnd) { if (curEnd > -Infinity) total += curEnd - curStart; curStart = a; curEnd = b; } else curEnd = Math.max(curEnd, b);
  }
  if (curEnd > -Infinity) total += curEnd - curStart;
  return Math.round(total / 60_000);
}
export function availabilityPercent(incidents: Notice[], windowDays = 30, now = new Date()): number {
  const total = windowDays * 1440;
  return Math.round((1 - Math.min(total, majorOutageMinutes(incidents, windowDays, now)) / total) * 10000) / 100;
}
