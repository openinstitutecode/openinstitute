// KPERF-004 / KFX-023 — one safe way to read ?page & ?pageSize (clamped, never NaN/negative).
export function parsePaging(q: Record<string, unknown>, defaults = { pageSize: 25, maxPageSize: 100 }) {
  const int = (v: unknown, d: number) => { const n = Number.parseInt(String(v ?? ""), 10); return Number.isFinite(n) ? n : d; };
  const pageSize = Math.min(defaults.maxPageSize, Math.max(1, int(q.pageSize ?? q.limit, defaults.pageSize)));
  const page = Math.max(1, int(q.page, 1));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
export function pageMeta(total: number, p: { page: number; pageSize: number }) {
  return { total, page: p.page, pageSize: p.pageSize, totalPages: Math.max(1, Math.ceil(total / p.pageSize)) };
}
