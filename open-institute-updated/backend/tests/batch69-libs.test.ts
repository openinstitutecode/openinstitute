import { test } from "node:test";
import assert from "node:assert/strict";
import { rolesFor, DEFAULT_INSIGHT_ROLES } from "../src/lib/insight-roles.js";
import { resolvePseudonymSecret } from "../src/lib/pseudonym-secret.js";
import { kpiStatus, evaluateKpis } from "../src/lib/kpis.js";
import { ticketStats } from "../src/lib/ticket-stats.js";
import { planInvoiceFix } from "../src/lib/invoice-reconcile.js";
import { checkUrl, checkLinks } from "../src/lib/link-check.js";
import { weekBuckets, mondayKey } from "../src/lib/quickwins.js";
import { canAccessProject } from "../src/lib/access.js";
import { retentionCutoffs } from "../src/lib/reminder-jobs.js";
import { SETTING_SCHEMAS, SETTING_DEFAULTS } from "../src/lib/settings.js";

const d = (s: string) => new Date(s);

test("insight roles: env override, blank falls back", () => {
  assert.deepEqual(rolesFor("finance", { INSIGHTS_ROLES_FINANCE: " super_admin ,finance_officer" } as any), ["SUPER_ADMIN", "FINANCE_OFFICER"]);
  assert.deepEqual(rolesFor("finance", { INSIGHTS_ROLES_FINANCE: " , " } as any), DEFAULT_INSIGHT_ROLES.finance);
  assert.ok(!DEFAULT_INSIGHT_ROLES.finance.includes("STUDENT"));
});
test("pseudonym secret: production demands its own key", () => {
  assert.ok(resolvePseudonymSecret({ NODE_ENV: "production" } as any, "jwt").problem);
  assert.ok(resolvePseudonymSecret({ NODE_ENV: "production", ANALYTICS_PSEUDONYM_SECRET: "x".repeat(32) } as any, "jwt").secret);
  const dev = resolvePseudonymSecret({} as any, "jwt").secret!;
  assert.notEqual(dev, "jwt"); // derived, never the raw login secret
  assert.equal(dev, resolvePseudonymSecret({} as any, "jwt").secret);
});
test("kpi status directions", () => {
  assert.equal(kpiStatus(90, 85, "min"), "ok"); assert.equal(kpiStatus(80, 85, "min"), "warn"); assert.equal(kpiStatus(50, 85, "min"), "bad");
  assert.equal(kpiStatus(20, 25, "max"), "ok"); assert.equal(kpiStatus(30, 25, "max"), "warn"); assert.equal(kpiStatus(40, 25, "max"), "bad");
  assert.equal(kpiStatus(null, 85, "min"), "unknown");
  assert.equal(evaluateKpis({}, SETTING_DEFAULTS["kpi.targets"]).every((k) => k.status === "unknown"), true);
});
test("ticket stats: median, rating, reopened ignored", () => {
  const s = ticketStats([
    { createdAt: d("2026-01-01T00:00Z"), resolvedAt: d("2026-01-01T02:00Z"), rating: 5 },
    { createdAt: d("2026-01-01T00:00Z"), resolvedAt: d("2026-01-01T10:00Z"), rating: 2 },
    { createdAt: d("2026-01-01T00:00Z"), resolvedAt: null, rating: null }]);
  assert.equal(s.resolvedCount, 2); assert.equal(s.avgResolutionHours, 6); assert.equal(s.medianResolutionHours, 6); assert.equal(s.avgRating, 3.5); assert.equal(s.satisfiedPercent, 50);
  assert.equal(ticketStats([]).avgResolutionHours, null);
});
test("invoice reconcile", () => {
  const now = d("2026-03-01");
  const inv = (paid: number, status: string, due = "2026-02-01") => ({ amountDue: 1000, amountPaid: paid, status, dueDate: d(due) });
  assert.equal(planInvoiceFix(inv(400, "partial"), [{ amount: 400 }], now), null);
  const f = planInvoiceFix(inv(500, "partial"), [{ amount: 400 }, { amount: 100, reversedAt: d("2026-02-02") }], now)!;
  assert.equal(f.amountPaid, 400);
  assert.equal(planInvoiceFix(inv(0, "unpaid"), [{ amount: 1000 }], now)!.status, "paid");
  assert.equal(planInvoiceFix(inv(0, "overdue"), [], now), null); // the overdue sweep owns this status
});
test("link check: HEAD 405 falls back to GET; timeouts reported; guard blocks", async () => {
  const calls: string[] = [];
  const f = (async (_u: string, init: RequestInit) => { calls.push(init.method!); return new Response(null, { status: init.method === "HEAD" ? 405 : 200 }); }) as unknown as typeof fetch;
  assert.deepEqual(await checkUrl("https://a.test", { fetchImpl: f }), { ok: true, status: 200 }); assert.deepEqual(calls, ["HEAD", "GET"]);
  const dead = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
  assert.equal((await checkUrl("https://b.test", { fetchImpl: dead })).ok, false);
  const blocked = await checkUrl("http://10.0.0.1", { fetchImpl: dead, guard: async () => { throw new Error("private"); } });
  assert.equal(blocked.ok, false); assert.equal(blocked.error, "private");
  const many = await checkLinks([{ id: "1", url: "u1" }, { id: "2", url: "u2" }, { id: "3", url: "u3" }], async (u) => ({ ok: u !== "u2" }), 2);
  assert.equal(many.length, 3); assert.equal(many.filter((m) => !m.ok).length, 1);
});
test("week buckets are Monday-based and include empty weeks", () => {
  const now = d("2026-03-11T12:00Z"); // Wednesday
  const b = weekBuckets([{ at: d("2026-03-09T01:00Z"), value: 5 }, { at: d("2026-03-15T23:00Z"), value: 2 }, { at: d("2026-01-01"), value: 99 }], 3, now);
  assert.deepEqual(b.map((x) => x.weekStart), ["2026-02-23", "2026-03-02", "2026-03-09"]); assert.deepEqual(b.map((x) => x.total), [0, 0, 7]);
  assert.equal(mondayKey(d("2026-03-15")), "2026-03-09");
});
test("research project access rule", () => {
  const p = { leadUserId: "lead", supervisorUserId: "sup" };
  assert.ok(canAccessProject({ id: "lead", role: "STUDENT" }, p)); assert.ok(canAccessProject({ id: "sup", role: "TRAINER" }, p));
  assert.ok(canAccessProject({ id: "x", role: "QA_OFFICER" }, p));
  assert.equal(canAccessProject({ id: "other", role: "STUDENT" }, p), false); assert.equal(canAccessProject({ id: "t", role: "TRAINER" }, p), false);
});
test("retention windows: defaults and env, bad values ignored", () => {
  const now = d("2026-06-01");
  assert.equal(retentionCutoffs({} as any, now).failedLogins.toISOString().slice(0, 10), "2026-03-03");
  assert.equal(retentionCutoffs({ RETENTION_FAILED_LOGIN_DAYS: "10" } as any, now).failedLogins.toISOString().slice(0, 10), "2026-05-22");
  assert.equal(retentionCutoffs({ RETENTION_FAILED_LOGIN_DAYS: "-5" } as any, now).failedLogins.toISOString().slice(0, 10), "2026-03-03");
});
test("settings schemas accept their own defaults and reject junk", () => {
  for (const k of Object.keys(SETTING_SCHEMAS) as (keyof typeof SETTING_SCHEMAS)[]) assert.ok(SETTING_SCHEMAS[k].safeParse(SETTING_DEFAULTS[k]).success, k);
  assert.equal(SETTING_SCHEMAS.branding.safeParse({ institutionName: "X", primaryColor: "red" }).success, false);
  assert.equal(SETTING_SCHEMAS["kpi.targets"].safeParse({ ...SETTING_DEFAULTS["kpi.targets"], retentionPercent: 140 }).success, false);
});
