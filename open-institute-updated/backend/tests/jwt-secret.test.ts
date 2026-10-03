import test from "node:test";
import assert from "node:assert/strict";
import { resolveJwtSecret } from "../src/lib/jwt-secret.js";

test("development uses an ephemeral fallback; a set secret always wins", () => {
  const fallback = resolveJwtSecret({ NODE_ENV: "development" } as never);
  assert.equal(fallback.length, 64);
  assert.equal(resolveJwtSecret({ JWT_SECRET: "abc" } as never), "abc");
});

test("production refuses a missing, placeholder, or too-short secret", () => {
  for (const JWT_SECRET of [undefined, "replace-with-a-long-random-string", "change-me", "short"]) {
    assert.throws(() => resolveJwtSecret({ NODE_ENV: "production", JWT_SECRET } as never), /JWT_SECRET/);
  }
});

test("production accepts a real secret", () => {
  assert.equal(resolveJwtSecret({ NODE_ENV: "production", JWT_SECRET: "x".repeat(40) } as never), "x".repeat(40));
});
