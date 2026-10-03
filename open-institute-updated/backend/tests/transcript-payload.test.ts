// Printable transcript: the registrar's signed content is stored as TEXT and re-verified on every read.
// Pure logic, no database. (Postgres jsonb would reorder keys and break this; that is why the column is a String.)
import test from "node:test";
import assert from "node:assert/strict";
import { signDocument, verifyDocument } from "../src/lib/credentials.js";

const payload = {
  documentId: "TRX-ABC123",
  studentNumber: "S-001",
  fullName: "Amina Otieno",
  programme: "Business Administration",
  units: [
    { code: "BUS101", title: "Business Communication", grade: "A", semester: "2026-1" },
    { code: "BUS102", title: "Entrepreneurship", grade: null, semester: "2026-1" },
  ],
  issuedAt: "2026-09-30T08:00:00.000Z",
};

test("transcript payload: a stored-and-reparsed copy still verifies against the issued signature", () => {
  const signedHash = signDocument(payload);
  const stored = JSON.stringify(payload); // what the TEXT column holds
  assert.equal(verifyDocument(JSON.parse(stored), signedHash), true);
});

test("transcript payload: any edit to a stored grade fails verification", () => {
  const signedHash = signDocument(payload);
  const tampered = JSON.parse(JSON.stringify(payload));
  tampered.units[1].grade = "A";
  assert.equal(verifyDocument(tampered, signedHash), false);
});
