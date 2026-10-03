// Unit tests for the pure logic behind TP006/TP007/TP011/TP026.
// Run: npm test   (uses Node's built-in test runner via tsx; no database needed)
import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { attemptDeadline, isPastDeadline, scoreQuiz, seededShuffle, validateMcq } from "../src/lib/quiz-scoring.js";
import { classifyUpload, magicMatches, maxBytesFor, sanitizeFilename } from "../src/lib/media-policy.js";
import { signMediaToken, verifyMediaToken } from "../src/lib/signed-url.js";
import { isStaleLive, joinOpensAt, sessionDay } from "../src/lib/live-class-utils.js";
import {
  readAdmissionUpload,
  removeAdmissionUpload,
  resolveStoragePath,
  storeAdmissionUpload,
  streamToDisk,
  UploadTooLargeError,
} from "../src/lib/media-storage.js";
import { blocksSchema, blocksToMarkdown, checkBlockRefs, collectMediaIds, estimateMinutes, isHttpUrl, type LessonBlock } from "../src/lib/lesson-blocks.js";

const mcq = (id: string, marks: number, correct: string) => ({ id, type: "mcq", marks, correctAnswer: correct });

test("scoreQuiz: marks-weighted, unanswered counts as zero", () => {
  const qs = [mcq("a", 1, "X"), mcq("b", 3, "Y")];
  const r = scoreQuiz(qs, [{ questionId: "b", answerGiven: " y " }], 4);
  assert.equal(r.score, 3); // only the 3-mark question right; "a" unanswered = 0
  assert.equal(r.fullyAutoMarkable, true);
  assert.equal(r.correctCount, 1);
});

test("scoreQuiz: scales to totalMarks", () => {
  const r = scoreQuiz([mcq("a", 2, "X"), mcq("b", 2, "Y")], [{ questionId: "a", answerGiven: "x" }, { questionId: "b", answerGiven: "y" }], 10);
  assert.equal(r.score, 10);
});

test("scoreQuiz: a written question means a human must finish marking", () => {
  const qs = [mcq("a", 1, "X"), { id: "e", type: "essay", marks: 4, correctAnswer: null }];
  const r = scoreQuiz(qs, [{ questionId: "a", answerGiven: "X" }], 5);
  assert.equal(r.fullyAutoMarkable, false);
  assert.equal(r.score, null);
  assert.equal(r.autoMarksScaled, 1);
  assert.equal(r.perQuestion[1].isCorrect, null);
});

test("scoreQuiz: empty quiz is never auto-marked", () => {
  assert.equal(scoreQuiz([], [], 0).fullyAutoMarkable, false);
});

test("validateMcq", () => {
  assert.match(validateMcq(["a"], "a")!, /at least two/);
  assert.match(validateMcq(["a", "A"], "a")!, /different/);
  assert.match(validateMcq(["a", "b"], "c")!, /correct answer/);
  assert.equal(validateMcq(["a", "b"], "B"), null);
});

test("seededShuffle is stable per seed and keeps all items", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.deepEqual(seededShuffle(items, "s1"), seededShuffle(items, "s1"));
  assert.deepEqual([...seededShuffle(items, "s1")].sort(), items);
  assert.notDeepEqual(seededShuffle(items, "s1"), seededShuffle(items, "s2"));
});

test("time limit with grace", () => {
  const start = new Date("2026-01-01T10:00:00Z");
  const deadline = attemptDeadline(start, 30)!;
  assert.equal(deadline.toISOString(), "2026-01-01T10:30:00.000Z");
  assert.equal(isPastDeadline(deadline, new Date("2026-01-01T10:30:30Z")), false); // inside 60s grace
  assert.equal(isPastDeadline(deadline, new Date("2026-01-01T10:32:00Z")), true);
  assert.equal(attemptDeadline(start, null), null);
});

test("media policy: allow-list, extension and magic bytes", () => {
  assert.equal(classifyUpload("video/mp4", "lecture.mp4").ok, true);
  assert.equal(classifyUpload("text/html", "x.html").ok, false);
  assert.equal(classifyUpload("image/svg+xml", "x.svg").ok, false);
  assert.equal(classifyUpload("video/mp4", "lecture.exe").ok, false);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  assert.equal(magicMatches("image/png", png), true);
  assert.equal(magicMatches("application/pdf", png), false);
  assert.equal(magicMatches("application/pdf", Buffer.from("%PDF-1.7 ....")), true);
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypisom"), Buffer.alloc(8)]);
  assert.equal(magicMatches("video/mp4", mp4), true);
  assert.equal(sanitizeFilename('..\\..\\evil"name<>.mp4'), "evilname.mp4");
  assert.equal(maxBytesFor("image", 500), 15 * 1024 * 1024);
  assert.equal(maxBytesFor("video", 100), 100 * 1024 * 1024);
});

test("signed media URLs verify, expire and can't be swapped between files", () => {
  const now = Date.now();
  const t = signMediaToken("asset1", 60, now);
  assert.equal(verifyMediaToken("asset1", t, now), true);
  assert.equal(verifyMediaToken("asset2", t, now), false);
  assert.equal(verifyMediaToken("asset1", t, now + 61_000), false);
  assert.equal(verifyMediaToken("asset1", "garbage", now), false);
  assert.equal(verifyMediaToken("asset1", undefined, now), false);
});

test("live class helpers", () => {
  const start = new Date("2026-03-02T09:00:00Z");
  assert.equal(joinOpensAt(start).toISOString(), "2026-03-02T08:50:00.000Z");
  assert.equal(isStaleLive("LIVE", start, 60, new Date("2026-03-02T10:30:00Z")), false);
  assert.equal(isStaleLive("LIVE", start, 60, new Date("2026-03-02T12:00:00Z")), true);
  assert.equal(isStaleLive("SCHEDULED", start, 60, new Date("2026-03-02T12:00:00Z")), false);
  // 23:30 UTC on the 1st is already the 2nd in Nairobi (UTC+3)
  assert.equal(sessionDay(new Date("2026-03-01T23:30:00Z"), "Africa/Nairobi").toISOString(), "2026-03-02T00:00:00.000Z");
});

test("streamToDisk stores, hashes, and enforces the size cap", async () => {
  process.env.UPLOAD_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "kvbdtc-up-"));
  const key = "a".repeat(32) + ".pdf";
  const ok = await streamToDisk(Readable.from([Buffer.from("%PDF-1.4 hello world")]), key, 1024);
  assert.equal(ok.bytes, 20);
  assert.equal(ok.sha256.length, 64);
  assert.ok((await fs.stat(resolveStoragePath(key)!)).isFile());

  const key2 = "b".repeat(32) + ".pdf";
  await assert.rejects(streamToDisk(Readable.from([Buffer.alloc(2000)]), key2, 1000), UploadTooLargeError);
  await assert.rejects(fs.stat(resolveStoragePath(key2)!)); // partial file was removed
  assert.equal(resolveStoragePath("../../etc/passwd"), null);
});

test("admission files move from temporary disk to private Supabase Storage", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "admission-storage-"));
  const previous = {
    uploadDir: process.env.UPLOAD_DIR,
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: process.env.SUPABASE_STORAGE_BUCKET,
    fetch: globalThis.fetch,
  };
  const source = Buffer.from("%PDF-1.7 private admission file");
  const requests: Array<{ url: string; method: string; authorization: string | null }> = [];
  process.env.UPLOAD_DIR = tempDir;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
  process.env.SUPABASE_STORAGE_BUCKET = "admission-documents";
  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      authorization: new Headers(init?.headers).get("Authorization"),
    });
    if (init?.method === "POST") return new Response("{}", { status: 200 });
    if (init?.method === "DELETE") return new Response(null, { status: 200 });
    return new Response(source, { status: 200 });
  };

  try {
    const localKey = `${"c".repeat(32)}.pdf`;
    await streamToDisk(Readable.from([source]), localKey, 1024);
    const storedKey = await storeAdmissionUpload(localKey, "application/pdf");
    assert.equal(storedKey, `sb_${localKey}`);
    assert.equal(resolveStoragePath(storedKey), null);
    await assert.rejects(fs.stat(path.join(tempDir, localKey)));
    assert.deepEqual(await readAdmissionUpload(storedKey), source);
    await removeAdmissionUpload(storedKey);
    assert.equal(requests.length, 3);
    assert.ok(requests.every((request) => request.url.includes("/storage/v1/object/")));
    assert.ok(requests.every((request) => request.url.includes("admission-documents/admissions/")));
    assert.ok(requests.some((request) => request.url.includes("/object/authenticated/")));
    assert.ok(requests.every((request) => request.authorization === "Bearer server-only-test-key"));
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.uploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = previous.uploadDir;
    if (previous.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    if (previous.bucket === undefined) delete process.env.SUPABASE_STORAGE_BUCKET;
    else process.env.SUPABASE_STORAGE_BUCKET = previous.bucket;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("lesson blocks: validation, markdown, media ids, minutes", () => {
  const blocks: LessonBlock[] = [
    { id: "1", type: "heading", level: 2, text: "Safety" },
    { id: "2", type: "text", markdown: "Always **isolate** power first." },
    { id: "3", type: "video", mediaAssetId: "m1", caption: "Demo" },
    { id: "4", type: "callout", tone: "warning", text: "Lock out." },
    { id: "5", type: "file", mediaAssetId: "m2", label: "Checklist" },
  ];
  assert.equal(blocksSchema.safeParse(blocks).success, true);
  assert.equal(checkBlockRefs(blocks), null);
  assert.deepEqual(collectMediaIds(blocks).sort(), ["m1", "m2"]);
  const md = blocksToMarkdown(blocks);
  assert.match(md, /^## Safety/);
  assert.match(md, /\[Video: Demo\]/);
  assert.match(md, /> \*\*Warning:\*\* Lock out\./);
  assert.ok(estimateMinutes(blocks) >= 6); // one video ≈ 5 min + reading
  assert.match(checkBlockRefs([{ id: "x", type: "image", alt: "" } as LessonBlock])!, /needs an uploaded file or a URL/);
  assert.match(checkBlockRefs([{ id: "x", type: "divider" }, { id: "x", type: "divider" }])!, /unique/);
  assert.equal(blocksSchema.safeParse([{ id: "1", type: "link", url: "javascript:alert(1)", label: "x" }]).success, false);
  assert.equal(isHttpUrl("https://example.com/a"), true);
  assert.equal(isHttpUrl("ftp://x"), false);
});
