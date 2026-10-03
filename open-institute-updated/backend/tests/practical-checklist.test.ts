import test from "node:test";
import assert from "node:assert/strict";

import { computeOverallOutcome, ChecklistValidationError } from "../src/lib/practical-checklist.js";

const criteria = [
  { name: "ppe", description: "Wears correct PPE", mandatory: true },
  { name: "cleanup", description: "Cleans workstation after", mandatory: false },
  { name: "torque", description: "Applies correct torque", mandatory: true },
];

test("computeOverallOutcome: competent when every mandatory criterion passes", () => {
  const outcome = computeOverallOutcome(criteria, [
    { name: "ppe", competent: true },
    { name: "cleanup", competent: false },
    { name: "torque", competent: true },
  ]);
  // "cleanup" is not mandatory, so failing it doesn't sink the outcome.
  assert.equal(outcome, "competent");
});

test("computeOverallOutcome: not_yet_competent when any mandatory criterion fails", () => {
  const outcome = computeOverallOutcome(criteria, [
    { name: "ppe", competent: false },
    { name: "cleanup", competent: true },
    { name: "torque", competent: true },
  ]);
  assert.equal(outcome, "not_yet_competent");
});

test("computeOverallOutcome: a missing call for any criterion is rejected, not silently passed", () => {
  assert.throws(
    () => computeOverallOutcome(criteria, [{ name: "ppe", competent: true }, { name: "torque", competent: true }]),
    ChecklistValidationError
  );
});

test("computeOverallOutcome: an invented criterion name is rejected", () => {
  assert.throws(
    () =>
      computeOverallOutcome(criteria, [
        { name: "ppe", competent: true },
        { name: "cleanup", competent: true },
        { name: "torque", competent: true },
        { name: "not-a-real-criterion", competent: true },
      ]),
    ChecklistValidationError
  );
});
