// Batch 69 — KFEAT-088/089: resolution time and satisfaction, now that tickets store resolvedAt and rating.
export function ticketStats(rows: { createdAt: Date; resolvedAt: Date | null; rating: number | null }[]) {
  const hours = rows.filter((r) => r.resolvedAt).map((r) => (r.resolvedAt!.getTime() - r.createdAt.getTime()) / 3_600_000).filter((h) => h >= 0).sort((a, b) => a - b);
  const ratings = rows.map((r) => r.rating).filter((r): r is number => typeof r === "number");
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const mid = hours.length ? (hours.length % 2 ? hours[(hours.length - 1) / 2] : (hours[hours.length / 2 - 1] + hours[hours.length / 2]) / 2) : null;
  return {
    resolvedCount: hours.length,
    avgResolutionHours: hours.length ? r1(hours.reduce((a, b) => a + b, 0) / hours.length) : null,
    medianResolutionHours: mid === null ? null : r1(mid),
    ratedCount: ratings.length,
    avgRating: ratings.length ? r1(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null,
    satisfiedPercent: ratings.length ? r1((ratings.filter((r) => r >= 4).length / ratings.length) * 100) : null,
  };
}
