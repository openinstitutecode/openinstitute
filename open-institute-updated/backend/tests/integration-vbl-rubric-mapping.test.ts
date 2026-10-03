// VBI027 — criterion-level mapping rules (Batch 66). Pure.
import test from "node:test";
import assert from "node:assert/strict";
import { buildCriteriaScores, parseLabCriteria, describeLabCriteria } from "../src/integration/rubric-mapping.js";

const rubric = [
  { name: "Records", maxMarks: 50 },
  { name: "Reconciles", maxMarks: 50 },
];
const maps = [
  { labCriterionCode: "CR-1", rubricCriterionName: "Records" },
  { labCriterionCode: "CR-2", rubricCriterionName: "Reconciles" },
];

test("met => full marks, not met => zero, in rubric order", () => {
  const r = buildCriteriaScores(rubric, maps, [{ code: "CR-1", met: true }, { code: "CR-2", met: false }]);
  assert.deepEqual(r.criteriaScores, [{ name: "Records", maxMarks: 50, score: 50 }, { name: "Reconciles", maxMarks: 50, score: 0 }]);
});

test("a portal criterion fed by several Lab criteria is met only if ALL are met", () => {
  const many = [...maps, { labCriterionCode: "CR-3", rubricCriterionName: "Records" }];
  const r = buildCriteriaScores(rubric, many, [{ code: "CR-1", met: true }, { code: "CR-2", met: true }, { code: "CR-3", met: false }]);
  assert.equal(r.criteriaScores?.[0].score, 0);
  assert.equal(r.criteriaScores?.[1].score, 50);
});

test("an unmapped rubric criterion withholds the WHOLE breakdown rather than guessing", () => {
  const r = buildCriteriaScores(rubric, [maps[0]], [{ code: "CR-1", met: true }]);
  assert.equal(r.criteriaScores, null);
  assert.deepEqual(r.unmappedRubricCriteria, ["Reconciles"]);
});

test("a mapped Lab code the Lab did not report on withholds the breakdown", () => {
  const r = buildCriteriaScores(rubric, maps, [{ code: "CR-1", met: true }]);
  assert.equal(r.criteriaScores, null);
  assert.deepEqual(r.missingLabVerdicts, ["CR-2"]);
});

test("an empty rubric never produces a breakdown", () => {
  assert.equal(buildCriteriaScores([], maps, [{ code: "CR-1", met: true }]).criteriaScores, null);
});

test("parseLabCriteria drops malformed entries, keeps the first verdict per code, truncates comments", () => {
  const out = parseLabCriteria([{ code: "A", met: true }, { code: "A", met: false }, { code: "", met: true }, { code: "B" }, null, "x", { code: "C", met: false, comment: "y".repeat(900) }]);
  assert.equal(out.length, 2);
  assert.equal(out[0].met, true);
  assert.equal(out[1].comment?.length, 500);
  assert.deepEqual(parseLabCriteria("nope"), []);
});

test("describeLabCriteria is readable and null when there is nothing to say", () => {
  assert.equal(describeLabCriteria([]), null);
  assert.equal(describeLabCriteria([{ code: "CR-1", name: "Records", met: true }, { code: "CR-2", met: false, comment: "late" }]), "Lab criteria: Records met; CR-2 NOT met (late).");
});
