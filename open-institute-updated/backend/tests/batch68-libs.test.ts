import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStatement, classifyInvoice, staleLogbooks, pseudonymise, buildIcs, retentionSummary } from "../src/lib/quickwins.js";

const d = (s: string) => new Date(s);
test("statement running balance skips reversed payments", () => {
  const s = buildStatement([{ id: "i", semester: "2026-S1", amountDue: 1000, dueDate: d("2026-02-01"), createdAt: d("2026-01-01"), payments: [
    { id: "a", amount: 400, method: "mpesa", reference: "R1", paidAt: d("2026-01-05") },
    { id: "b", amount: 100, method: "bank", reference: "R2", paidAt: d("2026-01-06"), reversedAt: d("2026-01-07") }] }]);
  assert.equal(s.balance, 600); assert.equal(s.totalPaid, 400); assert.equal(s.lines.length, 2);
});
test("invoice buckets", () => {
  const now = d("2026-03-10");
  assert.equal(classifyInvoice({ amountDue: 10, amountPaid: 10, dueDate: d("2026-01-01") }, now).bucket, "settled");
  assert.equal(classifyInvoice({ amountDue: 10, amountPaid: 0, dueDate: d("2026-03-01") }, now).bucket, "overdue");
  assert.equal(classifyInvoice({ amountDue: 10, amountPaid: 0, dueDate: d("2026-03-14") }, now).bucket, "due_soon");
  assert.equal(classifyInvoice({ amountDue: 10, amountPaid: 0, dueDate: d("2026-05-01") }, now).bucket, "upcoming");
});
test("stale logbooks", () => {
  const now = d("2026-03-20");
  const r = staleLogbooks([
    { id: "new", startDate: d("2026-03-18"), logbookEntries: [] },
    { id: "stale", startDate: d("2026-02-01"), logbookEntries: [{ submittedAt: d("2026-03-01") }] },
    { id: "ok", startDate: d("2026-02-01"), logbookEntries: [{ submittedAt: d("2026-03-19") }] }], now);
  assert.deepEqual(r.map((p) => p.id), ["stale"]);
});
test("pseudonymise is stable and secret-dependent", () => {
  assert.equal(pseudonymise("x", "s1"), pseudonymise("x", "s1"));
  assert.notEqual(pseudonymise("x", "s1"), pseudonymise("x", "s2"));
});
test("ics has weekly rule and all-day exclusive end", () => {
  const out = buildIcs({ name: "T", now: d("2026-03-02T00:00:00Z"), from: d("2026-03-02T00:00:00Z"), timetable: [{ uid: "t1", title: "Math, Intro", dayOfWeek: 3, startTime: "09:00", endTime: "11:00" }], events: [{ uid: "e1", title: "Holiday", startDate: d("2026-04-03"), endDate: d("2026-04-03") }] });
  assert.match(out, /DTSTART;TZID=Africa\/Nairobi:20260304T090000/); assert.match(out, /BYDAY=WE/); assert.match(out, /Math\\, Intro/); assert.match(out, /DTEND;VALUE=DATE:20260404/);
});
test("retention excludes graduates", () => {
  const r = retentionSummary({ ACTIVE: 80, WITHDRAWN: 15, EXCLUDED: 5, GRADUATED: 50 });
  assert.equal(r.total, 100); assert.equal(r.attritionPercent, 20); assert.equal(r.retentionPercent, 80);
});
