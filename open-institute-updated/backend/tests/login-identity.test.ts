import { test } from "node:test";
import assert from "node:assert/strict";
import { loginIdentityWhere } from "../src/lib/login-identity.js";

test("login identity matches email without case sensitivity", () => {
  assert.deepEqual(loginIdentityWhere("  Admin@Example.org  "), {
    email: { equals: "Admin@Example.org", mode: "insensitive" },
  });
});

test("login identity matches a student or admission number", () => {
  assert.deepEqual(loginIdentityWhere("STU-2026-000009"), {
    student: {
      is: {
        OR: [
          { studentNumber: { equals: "STU-2026-000009", mode: "insensitive" } },
          { admissionNumber: { equals: "STU-2026-000009", mode: "insensitive" } },
        ],
      },
    },
  });
});
