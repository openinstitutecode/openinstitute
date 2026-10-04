import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateTermInvoice,
  creditLoadViolation,
  endOfUtcDate,
  isEightWeekTerm,
  MIN_TERM_CREDITS,
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
