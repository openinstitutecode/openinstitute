import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateTermInvoice,
  creditLoadViolation,
  endOfUtcDate,
  isEightWeekTerm,
  MIN_TERM_CREDITS,
  normalizeTermSetup,
} from "../src/lib/term-registration.js";

test("term dates must span exactly 56 inclusive calendar days", () => {
  assert.equal(isEightWeekTerm(new Date("2026-10-01T00:00:00.000Z"), new Date("2026-11-25T00:00:00.000Z")), true);
  assert.equal(isEightWeekTerm(new Date("2026-10-01T00:00:00.000Z"), new Date("2026-11-24T00:00:00.000Z")), false);
  assert.equal(isEightWeekTerm(new Date("2026-10-01T00:00:00.000Z"), new Date("2026-11-26T00:00:00.000Z")), false);
});

test("registration enforces the 8-credit minimum and configured maximum", () => {
  assert.equal(MIN_TERM_CREDITS, 8);
  assert.equal(creditLoadViolation(7, 24), "minimum");
  assert.equal(creditLoadViolation(8, 24), null);
  assert.equal(creditLoadViolation(24, 24), null);
  assert.equal(creditLoadViolation(25, 24), "maximum");
});

test("term invoice totals separate tuition from administration and industrial fees", () => {
  assert.deepEqual(calculateTermInvoice(8, 400, 1000, 2500), { tuition: 3200, total: 6700 });
  assert.deepEqual(calculateTermInvoice(12, 500, 1000, 0), { tuition: 6000, total: 7000 });
});

test("term end-date comparison includes the entire configured end date", () => {
  assert.equal(endOfUtcDate(new Date("2026-11-25T00:00:00.000Z")).toISOString(), "2026-11-25T23:59:59.999Z");
});

test("term setup repairs invalid dates and settings into a current usable 8-week term", () => {
  const normalized = normalizeTermSetup({
    semesterNumber: "0",
    academicYear: "not a year",
    startDate: "2026-02-31",
    endDate: "2026-10-03",
    registrationOpen: "2026-10-20",
    registrationClose: "2026-10-01",
    assessmentStart: "2026-12-01",
    assessmentEnd: "2026-11-01",
    resultsDueDate: "bad",
    maxCreditsPerTerm: "100",
    creditRate: "not a number",
  }, new Date("2026-10-04T13:00:00.000Z"));

  assert.equal(normalized.semesterNumber, 1);
  assert.equal(normalized.academicYear, "2026/2027");
  assert.equal(normalized.startDate.toISOString(), "2026-10-04T00:00:00.000Z");
  assert.equal(isEightWeekTerm(normalized.startDate, normalized.endDate), true);
  assert.ok(normalized.registrationClose >= normalized.registrationOpen);
  assert.ok(normalized.assessmentEnd >= normalized.assessmentStart);
  assert.ok(normalized.resultsDueDate > normalized.endDate);
  assert.equal(normalized.maxCreditsPerTerm, 36);
  assert.equal(normalized.creditRate, 300);
});

test("term setup preserves valid selected dates and fee settings", () => {
  const normalized = normalizeTermSetup({
    semesterNumber: "3",
    academicYear: "2026/2027",
    startDate: "2026-10-01",
    endDate: "2026-11-25",
    registrationOpen: "2026-09-20",
    registrationClose: "2026-09-30",
    assessmentStart: "2026-11-18",
    assessmentEnd: "2026-11-25",
    resultsDueDate: "2026-12-10",
    maxCreditsPerTerm: "30",
    creditRate: "450",
  }, new Date("2026-09-01T00:00:00.000Z"));

  assert.equal(normalized.semesterNumber, 3);
  assert.equal(normalized.startDate.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(normalized.endDate.toISOString(), "2026-11-25T00:00:00.000Z");
  assert.equal(normalized.maxCreditsPerTerm, 30);
  assert.equal(normalized.creditRate, 450);
});
