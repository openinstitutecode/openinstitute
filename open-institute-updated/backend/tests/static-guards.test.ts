// Batch 75 — KSEC-010/011 regression guards: fail if unsafe patterns are introduced. Static text scan, no DB.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, exts: string[], out: string[] = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === "dist") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, exts, out); else if (exts.some((e) => n.endsWith(e))) out.push(p);
  }
  return out;
}
const scan = (files: string[], re: RegExp) => files.filter((f) => re.test(readFileSync(f, "utf8")));

test("no unsafe raw SQL in the backend (only tagged-template $queryRaw / $executeRaw)", () => {
  assert.deepEqual(scan(walk("src", [".ts"]), /\$(queryRawUnsafe|executeRawUnsafe)|Prisma\.raw\(/), []);
});
test("frontend never injects raw HTML or evals strings", () => {
  const dir = "../frontend/src";
  assert.deepEqual(scan(walk(dir, [".tsx", ".ts"]), /dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(|new Function\(/), []);
});
