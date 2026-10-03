// Unit tests for EX018 exam accommodations: attemptDeadline's new
// extraMinutes argument.
import test from "node:test";
import assert from "node:assert/strict";

import { attemptDeadline, isPastDeadline } from "../src/lib/quiz-scoring.js";

test("attemptDeadline: no accommodation (default) behaves exactly as before", () => {
  const start = new Date("2026-01-01T10:00:00.000Z");
  const deadline = attemptDeadline(start, 30);
  assert.equal(deadline?.toISOString(), "2026-01-01T10:30:00.000Z");
});

test("attemptDeadline: extraMinutes extends the window by exactly that much", () => {
  const start = new Date("2026-01-01T10:00:00.000Z");
  const deadline = attemptDeadline(start, 30, 15);
  assert.equal(deadline?.toISOString(), "2026-01-01T10:45:00.000Z");
});

test("attemptDeadline: a negative extraMinutes can never shorten the window", () => {
  // Defensive: a caller passing a bad value should never make an exam
  // *shorter* than its normal duration.
  const start = new Date("2026-01-01T10:00:00.000Z");
  const deadline = attemptDeadline(start, 30, -20);
  assert.equal(deadline?.toISOString(), "2026-01-01T10:30:00.000Z");
});

test("attemptDeadline: still null when there's no fixed duration, accommodation or not", () => {
  const start = new Date("2026-01-01T10:00:00.000Z");
  assert.equal(attemptDeadline(start, null, 15), null);
  assert.equal(attemptDeadline(start, undefined, 15), null);
});

test("isPastDeadline: an accommodation genuinely buys extra real time before the grace cutoff", () => {
  const start = new Date("2026-01-01T10:00:00.000Z");
  const noAccommodation = attemptDeadline(start, 30);
  const withAccommodation = attemptDeadline(start, 30, 15);

  // 40 minutes in: past the plain deadline (30 min + 60s grace), but still
  // comfortably inside the accommodated one (45 min).
  const fortyMinutesIn = new Date(start.getTime() + 40 * 60_000);
  assert.equal(isPastDeadline(noAccommodation, fortyMinutesIn), true);
  assert.equal(isPastDeadline(withAccommodation, fortyMinutesIn), false);
});
