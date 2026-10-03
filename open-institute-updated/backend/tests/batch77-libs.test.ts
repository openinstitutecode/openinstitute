// Batch 77 — assignment + gradebook engines (pure logic).
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPenalty, assignmentAnalytics, cleanAnnotations, competencyScore, fileKindOf, latePenaltyPct, moderationSample, resubmitAllowance, scoreRubric,
  submissionWindow, textChange, validateContent, validateCriteria, validateFiles, type AssignmentRules,
} from "../src/lib/assignment-engine.js";
import { classifyCell, gradeDiscrepancy, trend, validateWeights, weightedCourseGrade } from "../src/lib/gradebook-engine.js";

const due = new Date("2026-10-10T12:00:00Z");
const rules = (o: Partial<AssignmentRules> = {}): AssignmentRules => ({
  status: "PUBLISHED", dueAt: due, releaseAt: null, cutoffAt: null, lateMode: "NONE", latePenaltyPctPerDay: 10, latePenaltyMaxPct: 50, maxResubmissions: 0,
  allowText: true, allowFiles: true, maxFiles: 3, maxFileMb: 5, allowedKinds: [], requireEvidence: false, ...o,
});

test("window: open, late with penalty, closed, not open, extension", () => {
  assert.equal(submissionWindow(rules(), new Date("2026-10-10T11:00:00Z")).state, "OPEN");
  assert.equal(submissionWindow(rules(), new Date("2026-10-11T00:00:00Z")).state, "CLOSED");
  const late = submissionWindow(rules({ lateMode: "PENALTY" }), new Date("2026-10-12T13:00:00Z"));
  assert.equal(late.state, "LATE");
  assert.equal(late.lateDays, 3);
  assert.equal(late.penaltyPct, 30);
  assert.equal(submissionWindow(rules({ lateMode: "PENALTY", cutoffAt: new Date("2026-10-11T12:00:00Z") }), new Date("2026-10-12T00:00:00Z")).state, "CLOSED");
  assert.equal(submissionWindow(rules({ status: "DRAFT" }), new Date("2026-10-01T00:00:00Z")).state, "NOT_OPEN");
  assert.equal(submissionWindow(rules({ releaseAt: new Date("2026-10-05T00:00:00Z") }), new Date("2026-10-01T00:00:00Z")).state, "NOT_OPEN");
  assert.equal(submissionWindow(rules(), new Date("2026-10-12T00:00:00Z"), new Date("2026-10-15T00:00:00Z")).state, "OPEN");
});

test("penalty is capped and never negative", () => {
  assert.equal(latePenaltyPct(10, 10, 50), 50);
  assert.equal(latePenaltyPct(0, 10, 50), 0);
  assert.equal(applyPenalty(80, 25), 60);
  assert.equal(applyPenalty(80, 200), 0);
});

test("resubmission allowance counts versions beyond the first", () => {
  assert.deepEqual(resubmitAllowance(0, 1), { allowed: false, remaining: 0 });
  assert.deepEqual(resubmitAllowance(2, 2), { allowed: true, remaining: 1 });
  assert.deepEqual(resubmitAllowance(2, 3), { allowed: false, remaining: 0 });
});

test("files: kind detection, type, size and count rules", () => {
  assert.equal(fileKindOf("Report.DOCX"), "word");
  assert.equal(fileKindOf("data.xlsx"), "excel");
  assert.equal(fileKindOf("noext"), null);
  const r = rules({ allowedKinds: ["pdf"], maxFiles: 1 });
  assert.equal(validateFiles([{ name: "a.pdf", sizeBytes: 100 }], r).length, 0);
  assert.equal(validateFiles([{ name: "a.docx", sizeBytes: 100 }], r).length, 1);
  assert.equal(validateFiles([{ name: "a.pdf", sizeBytes: 6 * 1048576 }], r).length, 1);
  assert.equal(validateFiles([{ name: "a.pdf", sizeBytes: 1 }, { name: "b.pdf", sizeBytes: 1 }], r).length, 1);
  assert.equal(validateFiles([{ name: "a.pdf", sizeBytes: 1 }], rules({ allowFiles: false })).length, 1);
});

test("content: drafts may be empty, hand-ins may not; evidence rule", () => {
  assert.equal(validateContent("", 0, rules(), true).length, 0);
  assert.equal(validateContent("", 0, rules(), false).length, 1);
  assert.equal(validateContent("x", 0, rules({ requireEvidence: true }), false).length, 1);
  assert.equal(validateContent("x", 1, rules({ requireEvidence: true }), false).length, 0);
  assert.equal(validateContent("typed", 0, rules({ allowText: false }), false).length >= 1, true);
});

test("rubric: criteria must add up; scores are bounded", () => {
  assert.equal(validateCriteria([{ name: "A", maxMarks: 10 }, { name: "B", maxMarks: 10 }], 20).ok, true);
  assert.equal(validateCriteria([{ name: "A", maxMarks: 10 }], 20).ok, false);
  assert.equal(validateCriteria([{ name: "A", maxMarks: 10 }, { name: "a", maxMarks: 10 }], 20).ok, false);
  const crit = [{ name: "A", maxMarks: 10 }, { name: "B", maxMarks: 10 }];
  const ok = scoreRubric(crit, [{ name: "A", score: 7 }, { name: "b", score: 9.5 }]);
  assert.equal(ok.total, 16.5);
  assert.equal(ok.errors.length, 0);
  assert.ok(scoreRubric(crit, [{ name: "A", score: 11 }, { name: "B", score: 1 }]).errors.length > 0);
  assert.ok(scoreRubric(crit, [{ name: "A", score: 1 }]).errors.length > 0);
  assert.ok(scoreRubric(crit, [{ name: "A", score: 1 }, { name: "B", score: 1 }, { name: "Z", score: 1 }]).errors.length > 0);
});

test("annotations point inside the text and need a comment", () => {
  const text = "The quick brown fox";
  const ok = cleanAnnotations(text, [{ start: 4, end: 9, comment: "Good" }]);
  assert.equal(ok.ok && ok.annotations[0].quote, "quick");
  assert.equal(cleanAnnotations(text, [{ start: 4, end: 99, comment: "x" }]).ok, false);
  assert.equal(cleanAnnotations(text, [{ start: 4, end: 9, comment: " " }]).ok, false);
});

test("textChange, moderationSample, competencyScore", () => {
  const c = textChange("one two three", "one two four five");
  assert.equal(c.added, 2);
  assert.equal(c.removed, 1);
  const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  assert.deepEqual(moderationSample(ids, 20, "x"), moderationSample(ids, 20, "x"));
  assert.equal(moderationSample(ids, 20, "x").length, 2);
  assert.equal(moderationSample(ids, 0, "x").length, 0);
  assert.equal(competencyScore("COMPETENT", 50), 50);
  assert.equal(competencyScore("NOT_YET_COMPETENT", 50), 0);
});

test("analytics: counts drafts separately and ignores them in rates", () => {
  const at = new Date();
  const out = assignmentAnalytics(100, [
    { studentUserId: "1", score: 80, isLate: false, isDraft: false, submittedAt: at, gradedAt: at },
    { studentUserId: "2", score: null, isLate: true, isDraft: false, submittedAt: at, gradedAt: null },
    { studentUserId: "3", score: null, isLate: false, isDraft: true, submittedAt: at, gradedAt: null },
  ], 5);
  assert.equal(out.handedIn, 2);
  assert.equal(out.drafts, 1);
  assert.equal(out.notSubmitted, 3);
  assert.equal(out.awaitingGrading, 1);
  assert.equal(out.onTimeRatePercent, 50);
  assert.equal(out.stats.mean, 80);
});

test("gradebook: weights, weighted grade, missing cells, trend", () => {
  assert.equal(validateWeights([{ category: "CAT", weightPercent: 30 }, { category: "FINAL_EXAM", weightPercent: 70 }]), null);
  assert.ok(validateWeights([{ category: "CAT", weightPercent: 30 }]));
  assert.ok(validateWeights([{ category: "NOPE", weightPercent: 100 }]));
  const g = weightedCourseGrade([{ category: "CAT", percent: 80 }, { category: "FINAL_EXAM", percent: 50 }], { CAT: 30, FINAL_EXAM: 70 });
  assert.equal(g.percent, 59);
  assert.equal(g.weighted, true);
  // final exam not yet graded: the CAT counts alone, and coverage says so
  const part = weightedCourseGrade([{ category: "CAT", percent: 80 }, { category: "FINAL_EXAM", percent: null }], { CAT: 30, FINAL_EXAM: 70 });
  assert.equal(part.percent, 80);
  assert.equal(part.coveredWeight, 30);
  assert.equal(weightedCourseGrade([{ category: "CAT", percent: 60 }, { category: "ASSIGNMENT", percent: 80 }], {}).percent, 70);
  assert.equal(weightedCourseGrade([{ category: "CAT", percent: null }], {}).percent, null);
  assert.equal(classifyCell({}, undefined, true), "MISSING");
  assert.equal(classifyCell({}, undefined, false), "NOT_DUE");
  assert.equal(classifyCell({}, { itemId: "a", score: null, submitted: true }, true), "AWAITING");
  assert.equal(classifyCell({}, { itemId: "a", score: 3, submitted: true }, true), "GRADED");
  assert.equal(trend([40, 55, 70]).direction, "IMPROVING");
  assert.equal(trend([70, 55, 40]).direction, "DECLINING");
  assert.equal(trend([50, 50]).direction, "INSUFFICIENT");
  assert.equal(gradeDiscrepancy("B", "C").mismatch, true);
  assert.equal(gradeDiscrepancy("b", "B").mismatch, false);
});
