// Tests the pure, DB-free pieces of AI011 (local-tfidf embeddings) and
// AI012 (cosine similarity ranking). embedText()/searchChunks() themselves
// touch Prisma (config lookup / chunk table) and aren't exercised here —
// same "no Postgres in this sandbox" boundary every batch has had; what's
// tested is the actual math, which is where correctness bugs would hide.
import test from "node:test";
import assert from "node:assert/strict";

import { localTfidfEmbed } from "../src/lib/local-embedding.js";
import { cosineSimilarity } from "../src/lib/vector-math.js";

test("localTfidfEmbed is deterministic — same text always produces the same vector", () => {
  const a = localTfidfEmbed("The trial balance lists every ledger balance.");
  const b = localTfidfEmbed("The trial balance lists every ledger balance.");
  assert.deepEqual(a, b);
});

test("localTfidfEmbed returns a unit-length (L2-normalized) vector for non-empty text", () => {
  const v = localTfidfEmbed("Assets equal liabilities plus owners equity in double entry bookkeeping.");
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  assert.ok(Math.abs(norm - 1) < 1e-9, `expected unit norm, got ${norm}`);
});

test("localTfidfEmbed returns an all-zero vector for empty/stopword-only text", () => {
  const v = localTfidfEmbed("the a an of");
  assert.ok(v.every((x) => x === 0));
});

test("cosineSimilarity of a vector with itself is 1", () => {
  const v = localTfidfEmbed("Marketing mix: product, price, place, promotion.");
  const score = cosineSimilarity(v, v);
  assert.ok(Math.abs(score - 1) < 1e-9);
});

test("cosineSimilarity of two orthogonal-ish vectors is near zero, not near 1", () => {
  const zeroA = [1, 0, 0, 0];
  const zeroB = [0, 1, 0, 0];
  assert.equal(cosineSimilarity(zeroA, zeroB), 0);
});

test("cosineSimilarity returns 0 rather than NaN for an all-zero vector", () => {
  const zero = [0, 0, 0];
  const other = [1, 2, 3];
  assert.equal(cosineSimilarity(zero, other), 0);
  assert.equal(Number.isNaN(cosineSimilarity(zero, other)), false);
});

test("localTfidfEmbed: a passage sharing real vocabulary scores higher than an unrelated passage", () => {
  const query = localTfidfEmbed("What is the trial balance used for in accounting?");
  const relevant = localTfidfEmbed(
    "A trial balance is a list of all ledger account balances used to check that total debits equal total credits before preparing financial statements."
  );
  const unrelated = localTfidfEmbed(
    "The marketing mix covers product, price, place and promotion decisions a business makes to reach its target market."
  );
  const relevantScore = cosineSimilarity(query, relevant);
  const unrelatedScore = cosineSimilarity(query, unrelated);
  assert.ok(
    relevantScore > unrelatedScore,
    `expected the on-topic passage (${relevantScore}) to outscore the unrelated one (${unrelatedScore})`
  );
});

test("localTfidfEmbed: near-duplicate passages score higher than genuinely different ones on the same topic", () => {
  const a = localTfidfEmbed("Double entry bookkeeping records a debit in one account and a credit in another.");
  const aRepeated = localTfidfEmbed("Double entry bookkeeping records a debit in one account and an equal credit in another account.");
  const differentTopic = localTfidfEmbed("A business plan covers the opportunity, the market, the team and financial projections.");
  assert.ok(cosineSimilarity(a, aRepeated) > cosineSimilarity(a, differentTopic));
});
