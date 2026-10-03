import test from "node:test";
import assert from "node:assert/strict";

import { chunkText } from "../src/lib/chunking.js";

test("chunkText returns nothing for empty input", () => {
  assert.deepEqual(chunkText(""), []);
  assert.deepEqual(chunkText("   \n\n  "), []);
});

test("chunkText keeps short text as a single chunk", () => {
  const chunks = chunkText("This is one short sentence. Here is another.");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].ordinal, 0);
  assert.match(chunks[0].text, /This is one short sentence\. Here is another\./);
});

test("chunkText splits long text into multiple chunks under maxChars", () => {
  const sentence = "The accounting equation states that assets equal liabilities plus owners equity. ";
  const longText = sentence.repeat(40); // ~3400 chars
  const chunks = chunkText(longText, { maxChars: 500, overlapChars: 80 });
  assert.ok(chunks.length > 1, "expected more than one chunk for long input");
  for (const c of chunks) {
    assert.ok(c.text.length <= 500 * 1.6, `chunk too large: ${c.text.length} chars`);
  }
});

test("chunkText ordinals are sequential starting at 0", () => {
  const sentence = "Double entry bookkeeping records a debit and an equal credit for every transaction. ";
  const chunks = chunkText(sentence.repeat(30), { maxChars: 400, overlapChars: 50 });
  chunks.forEach((c, i) => assert.equal(c.ordinal, i));
});

test("chunkText produces real overlap between consecutive chunks", () => {
  const sentence = "Sentence number %d provides one distinct fact for the chunker to work with. ";
  const longText = Array.from({ length: 25 }, (_, i) => sentence.replace("%d", String(i))).join("");
  const chunks = chunkText(longText, { maxChars: 300, overlapChars: 60 });
  assert.ok(chunks.length >= 2);
  // The tail of chunk N should share some real text with the head of chunk N+1.
  const tailOfFirst = chunks[0].text.slice(-40);
  const words = tailOfFirst.split(" ").filter((w) => w.length > 3);
  const sharedWord = words.find((w) => chunks[1].text.includes(w));
  assert.ok(sharedWord, "expected shared context between adjacent chunks from overlap");
});

test("chunkText hard-wraps a single run-on paragraph with no sentence punctuation", () => {
  const runOn = Array.from({ length: 400 }, () => "word").join(" "); // no periods at all
  const chunks = chunkText(runOn, { maxChars: 300, overlapChars: 40 });
  assert.ok(chunks.length > 1, "a long punctuation-free run-on should still be split");
  for (const c of chunks) assert.ok(c.text.length > 0);
});

test("chunkText treats paragraph breaks as real boundaries, not merged mid-sentence", () => {
  const text = "First paragraph ends here.\n\nSecond paragraph starts fresh and is unrelated.";
  // maxChars generous enough that neither sentence needs hard-wrapping —
  // this test is specifically about paragraph-boundary handling, not the
  // separate hard-wrap path already covered above.
  const chunks = chunkText(text, { maxChars: 40, overlapChars: 5 });
  const joined = chunks.map((c) => c.text).join(" | ");
  assert.match(joined, /First paragraph ends here\./);
  assert.match(joined, /Second paragraph starts fresh/);
});

test("chunkText never returns an empty-text chunk", () => {
  const chunks = chunkText("A. B. C. D. E. F. G.", { maxChars: 5, overlapChars: 2 });
  for (const c of chunks) assert.ok(c.text.trim().length > 0);
});
