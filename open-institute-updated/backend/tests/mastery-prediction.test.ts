// Unit tests for AI025 (mastery prediction) pure logic.
// Run: npm test   (uses Node's built-in test runner via tsx; no database needed)
import test from "node:test";
import assert from "node:assert/strict";

import { predictMastery } from "../src/lib/mastery-prediction.js";

function attempt(percent: number, daysAgo: number) {
  return { percent, at: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000) };
}

test("predictMastery: no attempts returns insufficient_data with no null-unsafe reads", () => {
  const r = predictMastery([]);
  assert.equal(r.attempts, 0);
  assert.equal(r.trend, "insufficient_data");
  assert.equal(r.predictedNextPercent, null);
  assert.equal(r.masteryLevel, "not_yet_competent");
});

test("predictMastery: a single attempt has no trend but does have a mastery level", () => {
  const r = predictMastery([attempt(72, 1)]);
  assert.equal(r.attempts, 1);
  assert.equal(r.latestPercent, 72);
  assert.equal(r.trend, "insufficient_data");
  assert.equal(r.predictedNextPercent, null);
  assert.equal(r.masteryLevel, "competent");
  assert.equal(r.confidence, "low");
});

test("predictMastery: consistently improving scores are flagged as improving with a positive predicted next score", () => {
  // oldest -> newest: 40, 50, 60, 70, 80
  const attempts = [attempt(40, 40), attempt(50, 30), attempt(60, 20), attempt(70, 10), attempt(80, 1)];
  const r = predictMastery(attempts);
  assert.equal(r.attempts, 5);
  assert.equal(r.trend, "improving");
  assert.ok(r.trendSlope! > 1.5);
  // predictedNextPercent = weighted average + one slope step, so on a
  // clear upward trend it sits above the recency-weighted average itself
  // (comparing against the single latest raw attempt isn't meaningful,
  // since the weighted average already discounts older, lower scores).
  assert.ok(r.predictedNextPercent! > r.weightedAveragePercent!, "predicted next score should exceed the weighted average on a clear upward trend");
  assert.equal(r.confidence, "high");
});

test("predictMastery: consistently declining scores are flagged as declining", () => {
  const attempts = [attempt(85, 40), attempt(70, 30), attempt(55, 20), attempt(40, 10)];
  const r = predictMastery(attempts);
  assert.equal(r.trend, "declining");
  assert.ok(r.trendSlope! < -1.5);
  assert.ok(r.predictedNextPercent! < r.weightedAveragePercent!, "predicted next score should fall below the weighted average on a clear downward trend");
});

test("predictMastery: flat scores are stable, not noise-flagged as a trend", () => {
  const attempts = [attempt(65, 40), attempt(64, 30), attempt(66, 20), attempt(65, 10)];
  const r = predictMastery(attempts);
  assert.equal(r.trend, "stable");
});

test("predictMastery: recency weighting means the weighted average leans toward recent attempts, not a flat mean", () => {
  // A weak start followed by strong recent attempts: the weighted mean
  // should sit well above the plain arithmetic mean (57.5).
  const attempts = [attempt(20, 40), attempt(30, 30), attempt(80, 20), attempt(90, 10)];
  const r = predictMastery(attempts);
  const plainMean = (20 + 30 + 80 + 90) / 4;
  assert.ok(r.weightedAveragePercent! > plainMean);
});

test("predictMastery: predictedNextPercent is clamped to [0, 100]", () => {
  const attempts = [attempt(85, 40), attempt(92, 30), attempt(98, 20), attempt(100, 10), attempt(100, 1)];
  const r = predictMastery(attempts);
  assert.ok(r.predictedNextPercent! <= 100);
});

test("predictMastery: confidence scales with attempt count (low < 3, medium 3-4, high 5+)", () => {
  assert.equal(predictMastery([attempt(50, 2), attempt(55, 1)]).confidence, "low");
  assert.equal(predictMastery([attempt(50, 3), attempt(55, 2), attempt(60, 1)]).confidence, "medium");
  assert.equal(
    predictMastery([attempt(50, 5), attempt(55, 4), attempt(60, 3), attempt(58, 2), attempt(62, 1)]).confidence,
    "high"
  );
});

test("predictMastery: mastery bands match the documented thresholds", () => {
  assert.equal(predictMastery([attempt(85, 1)]).masteryLevel, "mastered");
  assert.equal(predictMastery([attempt(65, 1)]).masteryLevel, "competent");
  assert.equal(predictMastery([attempt(45, 1)]).masteryLevel, "developing");
  assert.equal(predictMastery([attempt(20, 1)]).masteryLevel, "not_yet_competent");
});

test("predictMastery: attempts out of chronological order are sorted before use", () => {
  const outOfOrder = [attempt(80, 1), attempt(40, 40), attempt(60, 20)];
  const inOrder = [attempt(40, 40), attempt(60, 20), attempt(80, 1)];
  assert.deepEqual(predictMastery(outOfOrder), predictMastery(inOrder));
});
