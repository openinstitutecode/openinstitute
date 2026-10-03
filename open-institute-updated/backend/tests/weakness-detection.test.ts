// Unit tests for AI026 (weakness detection) and AI024 (adaptive difficulty
// suggestion) pure logic.
// Run: npm test   (uses Node's built-in test runner via tsx; no database needed)
import test from "node:test";
import assert from "node:assert/strict";

import { computeWeakTopics, suggestDifficulty } from "../src/lib/weakness-detection.js";

test("computeWeakTopics: flags a topic below the threshold with enough attempts", () => {
  const responses = [
    { topic: "Double-entry bookkeeping", isCorrect: false },
    { topic: "Double-entry bookkeeping", isCorrect: false },
    { topic: "Double-entry bookkeeping", isCorrect: true },
    { topic: "Double-entry bookkeeping", isCorrect: false },
  ];
  const weak = computeWeakTopics(responses);
  assert.equal(weak.length, 1);
  assert.equal(weak[0].topic, "Double-entry bookkeeping");
  assert.equal(weak[0].attempts, 4);
  assert.equal(weak[0].accuracyPercent, 25);
});

test("computeWeakTopics: a topic the student is good at is never flagged", () => {
  const responses = [
    { topic: "VAT calculations", isCorrect: true },
    { topic: "VAT calculations", isCorrect: true },
    { topic: "VAT calculations", isCorrect: true },
    { topic: "VAT calculations", isCorrect: false },
  ];
  assert.deepEqual(computeWeakTopics(responses), []);
});

test("computeWeakTopics: too few attempts is not a pattern yet, even at 0%", () => {
  const responses = [
    { topic: "Payroll", isCorrect: false },
    { topic: "Payroll", isCorrect: false },
  ];
  assert.deepEqual(computeWeakTopics(responses, { minAttempts: 3 }), []);
});

test("computeWeakTopics: ungraded and untagged responses are ignored, not counted as wrong", () => {
  const responses = [
    { topic: "Payroll", isCorrect: null },
    { topic: null, isCorrect: false },
    { topic: "Payroll", isCorrect: false },
    { topic: "Payroll", isCorrect: false },
    { topic: "Payroll", isCorrect: false },
  ];
  const weak = computeWeakTopics(responses);
  assert.equal(weak.length, 1);
  assert.equal(weak[0].attempts, 3); // only the 3 graded, tagged Payroll responses count
});

test("computeWeakTopics: sorted worst-first across multiple weak topics", () => {
  const responses = [
    { topic: "A", isCorrect: false },
    { topic: "A", isCorrect: false },
    { topic: "A", isCorrect: false },
    { topic: "B", isCorrect: true },
    { topic: "B", isCorrect: false },
    { topic: "B", isCorrect: false },
  ];
  const weak = computeWeakTopics(responses);
  assert.equal(weak.length, 2);
  assert.equal(weak[0].topic, "A"); // 0% comes before B's 33%
  assert.equal(weak[1].topic, "B");
});

test("suggestDifficulty: no history defaults to intermediate", () => {
  assert.equal(suggestDifficulty([]), "intermediate");
});

test("suggestDifficulty: low average suggests beginner", () => {
  assert.equal(suggestDifficulty([30, 40, 45]), "beginner");
});

test("suggestDifficulty: mid average suggests intermediate", () => {
  assert.equal(suggestDifficulty([60, 65, 70]), "intermediate");
});

test("suggestDifficulty: high average suggests advanced", () => {
  assert.equal(suggestDifficulty([80, 90, 95]), "advanced");
});
