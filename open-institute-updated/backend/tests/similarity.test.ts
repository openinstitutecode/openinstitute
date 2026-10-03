// Unit tests for EX032 similarity-checking pure logic.
// Run: npm test   (uses Node's built-in test runner via tsx; no database needed)
import test from "node:test";
import assert from "node:assert/strict";

import { comparableText, jaccardSimilarity, shingleSimilarity, findOverlappingSegments } from "../src/lib/similarity.js";

test("comparableText: uses textAnswer for assignment-style submissions", () => {
  const text = comparableText({ id: "s1", assessmentId: null, textAnswer: "the quick brown fox" });
  assert.equal(text, "the quick brown fox");
});

test("comparableText: BUGFIX falls back to QuestionResponse rows for exam submissions", () => {
  // Before the fix, exam submissions (textAnswer === null) always compared
  // as empty text and were silently skipped by the checker.
  const text = comparableText({
    id: "s2",
    assessmentId: "a1",
    textAnswer: null,
    questionResponses: [
      { questionId: "q2", answerGiven: "second answer" },
      { questionId: "q1", answerGiven: "first answer" },
    ],
  });
  // Sorted by questionId so the order is stable across runs/DB fetches.
  assert.equal(text, "first answer\nsecond answer");
});

test("comparableText: no textAnswer and no responses -> empty string, not a crash", () => {
  assert.equal(comparableText({ id: "s3", assessmentId: "a1", textAnswer: null }), "");
  assert.equal(comparableText({ id: "s4", assessmentId: "a1", textAnswer: "" , questionResponses: []}), "");
});

test("jaccardSimilarity: identical text scores 100", () => {
  const score = jaccardSimilarity("the quick brown fox jumps", "the quick brown fox jumps");
  assert.equal(score, 100);
});

test("jaccardSimilarity: completely different text scores 0", () => {
  const score = jaccardSimilarity("apples oranges bananas", "trucks planes trains");
  assert.equal(score, 0);
});

test("jaccardSimilarity: empty input never throws, scores 0", () => {
  assert.equal(jaccardSimilarity("", "anything here"), 0);
  assert.equal(jaccardSimilarity("anything here", ""), 0);
});

test("findOverlappingSegments: finds a run of 3+ shared consecutive words", () => {
  const segments = findOverlappingSegments(
    "in conclusion the mitochondria is the powerhouse of the cell overall",
    "as we know the mitochondria is the powerhouse of the cell in every textbook"
  );
  assert.ok(segments.length >= 1);
  assert.ok(segments[0].text.includes("mitochondria is the powerhouse"));
});

test("findOverlappingSegments: no match under 3 consecutive words", () => {
  const segments = findOverlappingSegments("the cat sat", "a dog the cat ran far away");
  // "the cat" is only 2 consecutive words in common -- below the threshold.
  assert.equal(segments.length, 0);
});

// EX032 upgrade — shingleSimilarity (n-gram Jaccard).

test("shingleSimilarity: identical text scores 100", () => {
  const score = shingleSimilarity("the quick brown fox jumps over the lazy dog", "the quick brown fox jumps over the lazy dog");
  assert.equal(score, 100);
});

test("shingleSimilarity: same words, fully reordered, scores lower than jaccardSimilarity", () => {
  const a = "the mitochondria is the powerhouse of the cell";
  const b = "cell the of powerhouse the is mitochondria the";
  const shingleScore = shingleSimilarity(a, b);
  const bagOfWordsScore = jaccardSimilarity(a, b);
  // Same multiset of words -> bag-of-words sees them as identical (100),
  // but no genuine 3-word run survives the shuffle -> shingle score is
  // much lower. This is exactly the case shingleSimilarity exists to tell
  // apart from real copying.
  assert.equal(bagOfWordsScore, 100);
  assert.ok(shingleScore < bagOfWordsScore);
});

test("shingleSimilarity: completely different text scores 0", () => {
  assert.equal(shingleSimilarity("apples oranges bananas grapes", "trucks planes trains cars"), 0);
});

test("shingleSimilarity: empty input never throws, scores 0", () => {
  assert.equal(shingleSimilarity("", "anything here at all"), 0);
  assert.equal(shingleSimilarity("anything here at all", ""), 0);
});

test("shingleSimilarity: short text (under n words) still compares without throwing", () => {
  const score = shingleSimilarity("hi there", "hi there");
  assert.equal(score, 100);
});
