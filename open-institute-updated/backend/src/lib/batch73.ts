// Batch 73 — pure helpers (no DB, no Express).

// KPERF-004 — opt-in paging for legacy array endpoints: without ?page the old behaviour (first `legacyMax` rows) is kept.
import { parsePaging } from "./pagination.js";
export function pagedWindow(q: Record<string, unknown>, legacyMax: number) {
  if (q.page === undefined && q.pageSize === undefined) return { paged: false, skip: 0, take: legacyMax };
  const p = parsePaging(q, { pageSize: 25, maxPageSize: 100 });
  return { paged: true, skip: p.skip, take: p.take };
}
