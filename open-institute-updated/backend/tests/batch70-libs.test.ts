import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidKey, hashBody, classifyExisting, STALE_AFTER_MS } from "../src/lib/idempotency.js";
import { scoreStats } from "../src/lib/score-stats.js";
import { responseDays, dueDateFor, requestUrgency, DATA_REQUEST_TYPES } from "../src/lib/data-requests.js";
import { taskEscalations, subscriptionDue } from "../src/lib/task-escalation.js";
import { rolesFor } from "../src/lib/insight-roles.js";

const d = (s: string) => new Date(s);

test("idempotency key format and body hash", () => {
  assert.ok(isValidKey("3f2b1c9e-aaaa-4bbb-8ccc-123456789abc")); assert.equal(isValidKey("short"), false); assert.equal(isValidKey("has space in it!"), false);
  assert.equal(hashBody({ a: 1 }), hashBody({ a: 1 })); assert.notEqual(hashBody({ a: 1 }), hashBody({ a: 2 }));
});
test("idempotency verdicts", () => {
  const now = d("2026-05-01T10:00:00Z");
  const base = { route: "POST /api/x/", bodyHash: "h", status: "done", createdAt: d("2026-05-01T09:59:30Z") };
  assert.equal(classifyExisting(base, "POST /api/x/", "h", now), "replay");
  assert.equal(classifyExisting(base, "POST /api/y/", "h", now), "mismatch");
  assert.equal(classifyExisting(base, "POST /api/x/", "other", now), "mismatch");
  assert.equal(classifyExisting({ ...base, status: "in_progress" }, "POST /api/x/", "h", now), "busy");
  assert.equal(classifyExisting({ ...base, status: "in_progress", createdAt: new Date(now.getTime() - STALE_AFTER_MS - 1) }, "POST /api/x/", "h", now), "stale");
});
test("score stats: quartiles, spread, pass rate, histogram edges", () => {
  const s = scoreStats([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 50);
  assert.equal(s.n, 10); assert.equal(s.mean, 55); assert.equal(s.median, 55); assert.equal(s.q1, 32.5); assert.equal(s.q3, 77.5); assert.equal(s.passRatePercent, 60);
  assert.equal(s.histogram[9].count, 2); // 90 and 100 both land in the top bin
  assert.equal(s.histogram.reduce((a, b) => a + b.count, 0), 10);
  const one = scoreStats([64], 50); assert.equal(one.stdDev, 0); assert.equal(one.median, 64);
  assert.equal(scoreStats([], 50).n, 0); assert.equal(scoreStats([NaN], 50).mean, null);
});
test("data requests: configurable deadline, bad values fall back", () => {
  assert.equal(responseDays({} as any), 14); assert.equal(responseDays({ DATA_REQUEST_RESPONSE_DAYS: "30" } as any), 30);
  assert.equal(responseDays({ DATA_REQUEST_RESPONSE_DAYS: "0" } as any), 14); assert.equal(responseDays({ DATA_REQUEST_RESPONSE_DAYS: "abc" } as any), 14);
  assert.equal(dueDateFor(d("2026-01-01T00:00:00Z"), {} as any).toISOString().slice(0, 10), "2026-01-15");
  const now = d("2026-01-10");
  assert.equal(requestUrgency({ status: "received", dueAt: d("2026-01-09") }, now), "overdue");
  assert.equal(requestUrgency({ status: "in_progress", dueAt: d("2026-01-12") }, now), "due_soon");
  assert.equal(requestUrgency({ status: "received", dueAt: d("2026-01-20") }, now), "on_track");
  assert.equal(requestUrgency({ status: "completed", dueAt: d("2026-01-01") }, now), "closed");
  assert.equal(DATA_REQUEST_TYPES.length, 5);
});
test("task escalation: assignee first, creator after a week, done/undated ignored", () => {
  const now = d("2026-03-20");
  const t = (o: any) => ({ title: "Mark scripts", status: "open", dueDate: d("2026-03-19"), assignedToId: "a", createdById: "c", ...o });
  assert.deepEqual(taskEscalations([t({})], now).map((x) => x.userId), ["a"]);
  assert.deepEqual(taskEscalations([t({ dueDate: d("2026-03-10") })], now).map((x) => x.userId), ["a", "c"]);
  assert.deepEqual(taskEscalations([t({ dueDate: d("2026-03-10"), createdById: "a" })], now).map((x) => x.userId), ["a"]);
  assert.equal(taskEscalations([t({ status: "done" }), t({ dueDate: null }), t({ dueDate: d("2026-04-01") })], now).length, 0);
  assert.notEqual(taskEscalations([t({ title: "A" }), t({ title: "B" })], now)[0].title, taskEscalations([t({ title: "A" }), t({ title: "B" })], now)[1].title);
});
test("scheduled report cadence", () => {
  const now = d("2026-03-20T09:00:00Z");
  assert.ok(subscriptionDue("daily", null, now)); assert.equal(subscriptionDue("daily", d("2026-03-20T02:00:00Z"), now), false); assert.ok(subscriptionDue("daily", d("2026-03-19T09:00:00Z"), now));
  assert.equal(subscriptionDue("weekly", d("2026-03-15T09:00:00Z"), now), false); assert.ok(subscriptionDue("weekly", d("2026-03-13T09:00:00Z"), now));
  assert.equal(subscriptionDue("monthly", d("2026-03-01T09:00:00Z"), now), false); assert.equal(subscriptionDue("hourly", d("2020-01-01"), now), false);
});
test("new insight areas have sensible defaults", () => {
  assert.ok(rolesFor("privacy", {} as any).includes("REGISTRAR")); assert.ok(!rolesFor("security", {} as any).includes("STUDENT"));
  assert.ok(!rolesFor("operations", {} as any).includes("TRAINER"));
});
