// KOBS-003 API latency / error-rate · KOBS-014 resource usage. In-process (per instance); a scraper
// can hit /api/ops/metrics.prom on each instance. Bounded memory: at most MAX_ROUTES labels.
import { monitorEventLoopDelay } from "node:perf_hooks";

const BUCKETS_MS = [50, 100, 250, 500, 1000, 2500, 5000];
const MAX_ROUTES = 500;

type RouteStat = { count: number; errors5xx: number; errors4xx: number; sumMs: number; maxMs: number; buckets: number[] };
const routes = new Map<string, RouteStat>();
const startedAt = Date.now();
let total = 0;
const byClass: Record<string, number> = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
const loop = monitorEventLoopDelay({ resolution: 20 });
loop.enable();

export function recordRequest(method: string, route: string, status: number, ms: number): void {
  const key = `${method} ${route}`;
  let s = routes.get(key);
  if (!s) {
    if (routes.size >= MAX_ROUTES) return recordOther(status);
    s = { count: 0, errors5xx: 0, errors4xx: 0, sumMs: 0, maxMs: 0, buckets: new Array(BUCKETS_MS.length + 1).fill(0) };
    routes.set(key, s);
  }
  s.count++;
  s.sumMs += ms;
  s.maxMs = Math.max(s.maxMs, ms);
  if (status >= 500) s.errors5xx++;
  else if (status >= 400) s.errors4xx++;
  let i = BUCKETS_MS.findIndex((b) => ms <= b);
  if (i === -1) i = BUCKETS_MS.length;
  s.buckets[i]++;
  recordOther(status);
}
function recordOther(status: number) {
  total++;
  const c = `${Math.floor(status / 100)}xx`;
  byClass[c] = (byClass[c] ?? 0) + 1;
}

/** Upper bound of the bucket containing the requested quantile — an estimate, labelled as such. */
export function estimateQuantile(buckets: number[], q: number): number | null {
  const n = buckets.reduce((a, b) => a + b, 0);
  if (n === 0) return null;
  let seen = 0;
  for (let i = 0; i < buckets.length; i++) {
    seen += buckets[i];
    if (seen / n >= q) return i < BUCKETS_MS.length ? BUCKETS_MS[i] : Infinity;
  }
  return Infinity;
}

export function snapshot(topN = 25) {
  const mem = process.memoryUsage();
  const rows = [...routes.entries()].map(([route, s]) => ({
    route,
    count: s.count,
    errors5xx: s.errors5xx,
    errors4xx: s.errors4xx,
    avgMs: Math.round(s.sumMs / s.count),
    maxMs: Math.round(s.maxMs),
    p95MsUpperBound: estimateQuantile(s.buckets, 0.95),
  }));
  return {
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    totalRequests: total,
    statusClasses: { ...byClass },
    serverErrorRate: total ? Number((byClass["5xx"] / total).toFixed(4)) : 0,
    busiestRoutes: [...rows].sort((a, b) => b.count - a.count).slice(0, topN),
    slowestRoutes: [...rows].filter((r) => r.count >= 3).sort((a, b) => b.avgMs - a.avgMs).slice(0, topN),
    process: {
      rssMb: Math.round(mem.rss / 1048576),
      heapUsedMb: Math.round(mem.heapUsed / 1048576),
      heapTotalMb: Math.round(mem.heapTotal / 1048576),
      cpuUserMs: Math.round(process.cpuUsage().user / 1000),
      cpuSystemMs: Math.round(process.cpuUsage().system / 1000),
      eventLoopDelayP99Ms: Number((loop.percentile(99) / 1e6).toFixed(2)),
      nodeVersion: process.version,
    },
    note: "Per-instance, since process start. p95 is a histogram bucket upper bound, not an exact value.",
  };
}

/** Prometheus text exposition (KOBS-002 groundwork). */
export function toPrometheus(): string {
  const lines: string[] = ["# TYPE kvbdtc_http_requests_total counter"];
  for (const [key, s] of routes) {
    const [method, ...rest] = key.split(" ");
    const labels = `method="${method}",route="${rest.join(" ").replace(/"/g, "'")}"`;
    lines.push(`kvbdtc_http_requests_total{${labels}} ${s.count}`);
    lines.push(`kvbdtc_http_request_errors_total{${labels},class="5xx"} ${s.errors5xx}`);
    lines.push(`kvbdtc_http_request_duration_ms_sum{${labels}} ${Math.round(s.sumMs)}`);
  }
  const m = process.memoryUsage();
  lines.push("# TYPE kvbdtc_process_rss_bytes gauge", `kvbdtc_process_rss_bytes ${m.rss}`, `kvbdtc_process_heap_used_bytes ${m.heapUsed}`);
  return lines.join("\n") + "\n";
}

export function resetMetricsForTests(): void {
  routes.clear();
  total = 0;
  for (const k of Object.keys(byClass)) byClass[k] = 0;
}
