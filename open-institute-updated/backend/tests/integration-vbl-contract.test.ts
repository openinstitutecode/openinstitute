// VBI048 — consumer-side contract test. Validates (1) the shared contract's own examples, and
// (2) that every payload field routeVblEvent() actually reads for each event type is declared in
// the contract — so the portal can't quietly start depending on a field VBL isn't promised to send.
// Reads the real handler source, so it fails if someone adds `event.newField` without updating the contract.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(readFileSync(join(here, "..", "contracts", "vbl-portal-events.json"), "utf8"));
const source = readFileSync(join(here, "..", "src", "integration", "vbl-events.ts"), "utf8");

function typeOk(value: unknown, spec: string): boolean {
  return spec.split("|").some((alt) => {
    if (alt === "string") return typeof value === "string";
    if (alt === "number") return typeof value === "number";
    if (alt === "boolean") return typeof value === "boolean";
    if (alt === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
    if (alt === "null") return value === null;
    return false;
  });
}

test("every contract example satisfies its own required fields and types", () => {
  for (const [name, spec] of Object.entries<any>(contract.events)) {
    for (const [field, t] of Object.entries<string>(spec.required)) {
      assert.ok(field in spec.example, `${name}: example missing ${field}`);
      assert.ok(typeOk(spec.example[field], t), `${name}: example ${field} is not ${t}`);
    }
  }
});

// Fields on the event that are envelope/bookkeeping rather than payload, plus optional extras the
// handler tolerates being absent.
const OPTIONAL_OK = new Set(["feedback", "eventId", "eventType"]);

test("every field the portal handler reads for an event type is declared in the contract", () => {
  const fnStart = source.indexOf("async function routeVblEvent");
  assert.ok(fnStart > 0, "routeVblEvent not found");
  const body = source.slice(fnStart);
  const caseRe = /case "([a-z]+\.[a-z]+)": \{([\s\S]*?)\n    \}/g;
  let m: RegExpExecArray | null;
  let checked = 0;
  while ((m = caseRe.exec(body))) {
    const [, eventType, block] = m;
    const spec = contract.events[eventType];
    if (!spec) continue;
    const fields = new Set([...block.matchAll(/event\.([a-zA-Z]+)/g)].map((x) => x[1]));
    for (const f of fields) {
      if (OPTIONAL_OK.has(f)) continue;
      assert.ok(f in spec.required || f in (spec.optional ?? {}), `${eventType}: handler reads event.${f} but the contract does not declare it`);
    }
    checked++;
  }
  assert.ok(checked >= 3, `expected to check at least 3 contracted event handlers, checked ${checked}`);
});
