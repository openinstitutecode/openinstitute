import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain .mjs helper used by the CI audit scripts
import { inventory } from "../scripts/route-inventory.mjs";
import { DEFAULT_INSIGHT_ROLES } from "../src/lib/insight-roles.js";
import { isVisibleNotice, majorOutageMinutes, availabilityPercent } from "../src/lib/service-notices.js";

type Row = { method: string; path: string; guard: string };
const rows: Row[] = inventory();
const d = (s: string) => new Date(s);

// KQA-006 — static RBAC invariants. These read the route source, so they run without a database.
test("every insights route is role-guarded", () => {
  const bad = rows.filter((r) => r.path.startsWith("/api/insights") && r.guard !== "role");
  assert.deepEqual(bad.map((r) => `${r.method} ${r.path}`), []);
  assert.ok(rows.filter((r) => r.path.startsWith("/api/insights")).length >= 20, "route discovery found the insights router");
});
test("settings and notices writes are role-guarded; only the public reads are open", () => {
  const open = rows.filter((r) => (r.path.startsWith("/api/settings") || r.path.startsWith("/api/notices")) && r.guard !== "role").map((r) => `${r.method} ${r.path}`).sort();
  assert.deepEqual(open, ["GET /api/notices/active", "GET /api/settings/public"]);
});
test("no self-service route is open to anonymous callers", () => {
  const bad = rows.filter((r) => r.path.startsWith("/api/self") && r.guard === "NONE");
  assert.equal(bad.length, 0);
});
test("learner roles never appear in insight defaults; sensitive areas exclude trainers", () => {
  const learners = ["STUDENT", "APPLICANT", "ALUMNUS", "EMPLOYER"];
  for (const [area, roles] of Object.entries(DEFAULT_INSIGHT_ROLES)) assert.ok(!roles.some((r) => learners.includes(r)), area);
  for (const area of ["jobs", "security", "reconcile", "privacy", "finance", "analytics"] as const) assert.ok(!DEFAULT_INSIGHT_ROLES[area].includes("TRAINER"), area);
});

test("notice visibility: incident from start; maintenance 24h ahead until end; closed never", () => {
  const now = d("2026-06-10T12:00:00Z");
  const inc = { kind: "incident", severity: "minor", status: "active", startsAt: d("2026-06-10T11:00:00Z"), endsAt: null };
  assert.ok(isVisibleNotice(inc, now)); assert.equal(isVisibleNotice({ ...inc, status: "resolved" }, now), false); assert.equal(isVisibleNotice({ ...inc, startsAt: d("2026-06-10T13:00:00Z") }, now), false);
  const m = { kind: "maintenance", severity: "minor", status: "active", startsAt: d("2026-06-11T06:00:00Z"), endsAt: d("2026-06-11T08:00:00Z") };
  assert.ok(isVisibleNotice(m, now)); assert.equal(isVisibleNotice(m, d("2026-06-09T12:00:00Z")), false); assert.equal(isVisibleNotice(m, d("2026-06-11T09:00:00Z")), false); assert.equal(isVisibleNotice({ ...m, status: "cancelled" }, now), false);
});
test("availability merges overlaps, ignores minor/cancelled, runs ongoing incidents to now, clips to window", () => {
  const now = d("2026-06-30T00:00:00Z");
  const major = (a: string, b: string | null, extra = {}) => ({ kind: "incident", severity: "major", status: b ? "resolved" : "active", startsAt: d(a), endsAt: b ? d(b) : null, ...extra });
  assert.equal(majorOutageMinutes([major("2026-06-10T00:00:00Z", "2026-06-10T01:00:00Z"), major("2026-06-10T00:30:00Z", "2026-06-10T02:00:00Z")], 30, now), 120); // merged, not 150
  assert.equal(majorOutageMinutes([{ ...major("2026-06-10T00:00:00Z", "2026-06-10T05:00:00Z"), severity: "minor" }, major("2026-06-11T00:00:00Z", "2026-06-11T05:00:00Z", { status: "cancelled" })], 30, now), 0);
  assert.equal(majorOutageMinutes([major("2026-06-29T22:00:00Z", null)], 30, now), 120);
  assert.equal(majorOutageMinutes([major("2026-05-01T00:00:00Z", "2026-05-30T00:00:00Z")], 30, now), 0); // ended before the window... 
  assert.equal(availabilityPercent([major("2026-06-10T00:00:00Z", "2026-06-10T00:43:12Z")], 30, now), 99.9);
  assert.equal(availabilityPercent([], 30, now), 100);
});
