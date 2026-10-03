import test from "node:test";
import assert from "node:assert/strict";

import { buildResultsCsv, buildResultsSlipHtml } from "../src/lib/exam-reports.js";

test("buildResultsCsv: computes percentage and pass/fail against the 50% line", () => {
  const csv = buildResultsCsv([
    { studentUserId: "s1", score: 80, totalMarks: 100 },
    { studentUserId: "s2", score: 40, totalMarks: 100 },
  ]);
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], "studentUserId,score,totalMarks,percentage,outcome");
  assert.equal(lines[1], "s1,80,100,80,pass");
  assert.equal(lines[2], "s2,40,100,40,fail");
});

test("buildResultsCsv: an ungraded submission is reported as ungraded, not as a false zero", () => {
  const csv = buildResultsCsv([{ studentUserId: "s3", score: null, totalMarks: 100 }]);
  const lines = csv.trim().split("\n");
  assert.equal(lines[1], "s3,,100,,ungraded");
});

test("buildResultsCsv: escapes a comma or quote in a field per RFC 4180", () => {
  const csv = buildResultsCsv([{ studentUserId: 'weird,"id', score: 10, totalMarks: 10 }]);
  const lines = csv.trim().split("\n");
  assert.equal(lines[1].startsWith('"weird,""id"'), true);
});

test("buildResultsSlipHtml: escapes untrusted text fields (no HTML injection from feedback)", () => {
  const html = buildResultsSlipHtml({
    studentUserId: "s1",
    assessmentTitle: "Unit Test <script>",
    unitTitle: "Business & ICT",
    score: 90,
    totalMarks: 100,
    feedback: "<img src=x onerror=alert(1)>",
    gradedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("&lt;script&gt;"), true);
  // The dangerous part is the literal `<img ...>` tag becoming real markup;
  // escaping `<`/`>` neutralizes that even though the harmless text
  // "onerror=alert" still appears (inertly) inside the escaped attribute.
  // The slip's own letterhead carries exactly one <img> (the college logo); the injected one must not exist.
  assert.equal(html.includes("<img src=x"), false);
  assert.equal((html.match(/<img\b/g) ?? []).length, 1);
  assert.equal(html.includes("PASS"), true);
});

test("buildResultsSlipHtml: an ungraded submission shows 'Not yet graded', not a bare 0", () => {
  const html = buildResultsSlipHtml({
    studentUserId: "s1",
    assessmentTitle: "T",
    unitTitle: "U",
    score: null,
    totalMarks: 100,
    feedback: null,
    gradedAt: null,
  });
  assert.equal(html.includes("Not yet graded"), true);
});

test("buildResultsSlipHtml: carries the official college letterhead and logo", () => {
  const html = buildResultsSlipHtml({
    studentUserId: "s1", assessmentTitle: "T", unitTitle: "U", score: 60, totalMarks: 100, feedback: null, gradedAt: null,
  });
  assert.equal(html.includes("Measur Business College"), true);
  assert.equal(html.includes("data:image/jpeg;base64,"), true);
});
