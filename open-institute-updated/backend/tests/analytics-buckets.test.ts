// Unit tests for the pure month-bucketing logic behind AD037 institutional
// analytics. Run: npm test (Node's built-in test runner via tsx; no database
// needed — same pattern as tp-libs.test.ts).
import test from "node:test";
import assert from "node:assert/strict";

import { monthKey, emptyMonthBuckets, bucketDates, bucketAmounts } from "../src/lib/analytics-buckets.js";

const FIXED_NOW = new Date(2026, 8, 20); // September 20, 2026 (month index 8)

test("monthKey formats as YYYY-MM, zero-padded", () => {
  assert.equal(monthKey(new Date(2026, 0, 5)), "2026-01");
  assert.equal(monthKey(new Date(2026, 10, 1)), "2026-11");
});

test("emptyMonthBuckets returns the last N months ending at 'now', all zero", () => {
  const buckets = emptyMonthBuckets(3, FIXED_NOW);
  assert.deepEqual(Object.keys(buckets), ["2026-07", "2026-08", "2026-09"]);
  assert.deepEqual(Object.values(buckets), [0, 0, 0]);
});

test("bucketDates counts each date into its own month, ignores dates outside the window", () => {
  const dates = [
    new Date(2026, 6, 1), // July — in window
    new Date(2026, 6, 15), // July — in window
    new Date(2026, 8, 1), // September — in window
    new Date(2025, 0, 1), // way outside the 3-month window — must not count
  ];
  const result = bucketDates(dates, 3, FIXED_NOW);
  assert.deepEqual(result, [
    { month: "2026-07", count: 2 },
    { month: "2026-08", count: 0 },
    { month: "2026-09", count: 1 },
  ]);
});

test("bucketDates returns all-zero series when given no dates", () => {
  const result = bucketDates([], 2, FIXED_NOW);
  assert.deepEqual(result, [
    { month: "2026-08", count: 0 },
    { month: "2026-09", count: 0 },
  ]);
});

test("bucketAmounts sums amounts per month and rounds to 2dp", () => {
  const rows = [
    { date: new Date(2026, 7, 3), amount: 1000.005 },
    { date: new Date(2026, 7, 10), amount: 250.001 },
    { date: new Date(2026, 8, 1), amount: 99.999 },
  ];
  const result = bucketAmounts(rows, 2, FIXED_NOW);
  assert.deepEqual(result, [
    { month: "2026-08", total: 1250.01 },
    { month: "2026-09", total: 100 },
  ]);
});

test("bucketAmounts ignores amounts outside the window", () => {
  const rows = [{ date: new Date(2020, 0, 1), amount: 500 }];
  const result = bucketAmounts(rows, 1, FIXED_NOW);
  assert.deepEqual(result, [{ month: "2026-09", total: 0 }]);
});
