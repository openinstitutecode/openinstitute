// AD037 — pure month-bucketing logic behind institutional analytics trends,
// pulled out of the route file so it can be unit-tested without a database
// (same discipline as quiz-scoring.ts / lesson-blocks.ts).

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function emptyMonthBuckets(months: number, now: Date = new Date()): Record<string, number> {
  const buckets: Record<string, number> = {};
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets[monthKey(d)] = 0;
  }
  return buckets;
}

export function bucketDates(dates: Date[], months: number, now: Date = new Date()): { month: string; count: number }[] {
  const buckets = emptyMonthBuckets(months, now);
  for (const d of dates) {
    const key = monthKey(d);
    if (key in buckets) buckets[key] += 1;
  }
  return Object.entries(buckets).map(([month, count]) => ({ month, count }));
}

export function bucketAmounts(
  rows: { date: Date; amount: number }[],
  months: number,
  now: Date = new Date()
): { month: string; total: number }[] {
  const buckets: Record<string, number> = {};
  Object.keys(emptyMonthBuckets(months, now)).forEach((k) => (buckets[k] = 0));
  for (const r of rows) {
    const key = monthKey(r.date);
    if (key in buckets) buckets[key] += r.amount;
  }
  return Object.entries(buckets).map(([month, total]) => ({ month, total: Math.round(total * 100) / 100 }));
}
