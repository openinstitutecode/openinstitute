// VBI015 — retry spacing (Batch 66). Pure.
import test from "node:test";
import assert from "node:assert/strict";
import { backoffSeconds, MAX_ATTEMPTS } from "../src/integration/backoff.js";

test("backoff doubles from 15s and is capped at one hour", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(backoffSeconds), [15, 30, 60, 120, 240]);
  assert.equal(backoffSeconds(9), 3600);
  assert.equal(backoffSeconds(50), 3600);
});

test("nonsense attempt counts are clamped to the first step", () => {
  assert.equal(backoffSeconds(0), 15);
  assert.equal(backoffSeconds(-3), 15);
  assert.equal(backoffSeconds(1.9), 15);
});

test("the retry budget fits inside a working day, so a real outage becomes visible on the dashboard", () => {
  let total = 0;
  for (let a = 1; a < MAX_ATTEMPTS; a++) total += backoffSeconds(a);
  assert.ok(total < 24 * 3600);
});
