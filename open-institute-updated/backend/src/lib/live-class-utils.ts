// TP026 — small pure helpers for live-class timing and attendance dates.

export const JOIN_OPENS_MINUTES_BEFORE = 10;
export const STALE_LIVE_GRACE_MINUTES = 60;

export function sessionEndsAt(scheduledAt: Date, durationMinutes: number): Date {
  return new Date(scheduledAt.getTime() + durationMinutes * 60_000);
}

export function joinOpensAt(scheduledAt: Date): Date {
  return new Date(scheduledAt.getTime() - JOIN_OPENS_MINUTES_BEFORE * 60_000);
}

/** A session still marked LIVE long after it should have finished was never ended by its host. */
export function isStaleLive(status: string, scheduledAt: Date, durationMinutes: number, now = new Date()): boolean {
  if (status !== "LIVE") return false;
  return now.getTime() > sessionEndsAt(scheduledAt, durationMinutes).getTime() + STALE_LIVE_GRACE_MINUTES * 60_000;
}

/**
 * The calendar day a session belongs to, in the institution's time zone, as a
 * UTC-midnight Date — the same convention the manual attendance page uses, so
 * a live-class attendance save and a manual one for the same day are the same record.
 */
export function sessionDay(d: Date, tz = process.env.INSTITUTION_TZ ?? "Africa/Nairobi"): Date {
  const ymd = d.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
  return new Date(`${ymd}T00:00:00.000Z`);
}
