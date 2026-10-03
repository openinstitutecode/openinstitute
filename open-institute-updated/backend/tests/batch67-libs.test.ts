// Batch 67 — pure-logic tests for the new libraries (no database). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { validatePassword } from "../src/lib/password-policy.js";
import { lockoutStatus, throttlePolicy } from "../src/lib/login-throttle.js";
import { parseOrigins, originChecker } from "../src/lib/cors-origins.js";
import { isPrivateAddress, assertSafeOutboundUrl } from "../src/lib/ssrf-guard.js";
import { retry, CircuitBreaker, CircuitOpenError, withTimeout, TimeoutError } from "../src/lib/resilience.js";
import { ConcurrencyLimiter, OverloadedError } from "../src/lib/concurrency-limiter.js";
import { TtlCache } from "../src/lib/ttl-cache.js";
import { parsePaging } from "../src/lib/pagination.js";
import { classifyField, classifyModels } from "../src/lib/data-classification.js";
import { redact, redactUrl } from "../src/lib/logger.js";
import { sanitizeValue, InputTooDeepError } from "../src/middleware/sanitize-input.js";
import { mapError, HttpError } from "../src/middleware/error-handler.js";
import { groupDuplicateStudents, findDuplicatePayments, invoiceAnomalies } from "../src/lib/ops-analysis.js";
import { dailyAiLimit, estimateAiCost } from "../src/lib/ai-quota.js";
import { checkEnv } from "../src/lib/env.js";
import { resolveSigningSecret } from "../src/lib/credentials.js";
import { estimateQuantile } from "../src/lib/metrics.js";
import { resolveRequestId } from "../src/lib/request-context.js";
import { withPoolParams } from "../src/lib/prisma-url.js";

test("password policy: length, classes, common, email/name", () => {
  assert.equal(validatePassword("Short1!").ok, false);
  assert.equal(validatePassword("alllowercaseletters").ok, false);
  assert.equal(validatePassword("Password123").ok, false, "common");
  assert.equal(validatePassword("Tr!ainer-Sunrise-42", { email: "jane@x.ke" }).ok, true);
  assert.equal(validatePassword("Jane-Wanjiru-2026!", { email: "janewanjiru@x.ke" }).ok, false, "contains email name");
  assert.equal(validatePassword("Aaaaa1111!bcd").ok, false, "repeats");
});

test("lockout: locks at limit, lifts when oldest counted failure ages out, ignores old", () => {
  const now = new Date("2026-09-29T10:00:00Z");
  const min = (m: number) => new Date(now.getTime() - m * 60_000);
  assert.equal(lockoutStatus([min(1), min(2), min(3), min(4)], now, 5, 15).locked, false);
  const l = lockoutStatus([min(1), min(2), min(3), min(4), min(10)], now, 5, 15);
  assert.equal(l.locked, true);
  assert.equal(l.retryAfterSeconds, 5 * 60, "lifts when the 10-min-old failure leaves the 15-min window");
  assert.equal(lockoutStatus([min(30), min(31), min(32), min(33), min(34)], now, 5, 15).locked, false);
  assert.deepEqual(throttlePolicy({} as NodeJS.ProcessEnv), { maxFailures: 5, windowMinutes: 15, ipMaxFailures: 30 });
});

test("cors: multi-origin, no wildcard, no-origin allowed", () => {
  assert.deepEqual(parseOrigins("https://a.ke/, https://b.ke,*"), ["https://a.ke", "https://b.ke"]);
  const check = originChecker(["https://a.ke"]);
  let ok: boolean | undefined;
  check("https://evil.com", (_e, v) => (ok = v));
  assert.equal(ok, false);
  check("https://a.ke", (_e, v) => (ok = v));
  assert.equal(ok, true);
  check(undefined, (_e, v) => (ok = v));
  assert.equal(ok, true);
});

test("ssrf: private/metadata blocked, public allowed, DNS rebinding to private blocked, allowlist honoured", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1", "0.0.0.0"]) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ["8.8.8.8", "172.32.0.1", "1.1.1.1"]) assert.equal(isPrivateAddress(ip), false, ip);
  await assert.rejects(assertSafeOutboundUrl("http://169.254.169.254/latest/meta-data"));
  await assert.rejects(assertSafeOutboundUrl("file:///etc/passwd"));
  await assert.rejects(assertSafeOutboundUrl("https://user:pw@example.com"));
  await assert.rejects(assertSafeOutboundUrl("https://public.example", { resolver: async () => ["10.0.0.5"] }));
  await assert.doesNotReject(assertSafeOutboundUrl("https://public.example", { resolver: async () => ["93.184.216.34"] }));
  await assert.doesNotReject(assertSafeOutboundUrl("http://vbl:3000/x", { allowHosts: ["vbl"] }));
});

test("resilience: retry succeeds after failures; breaker opens then half-opens; timeout fires", async () => {
  let n = 0;
  const v = await retry(async () => { if (++n < 3) throw new Error("x"); return "ok"; }, { retries: 3, sleep: async () => undefined });
  assert.equal(v, "ok");
  await assert.rejects(retry(async () => { throw new Error("nope"); }, { retries: 1, sleep: async () => undefined }));

  let t = 0;
  const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000, now: () => t });
  for (let i = 0; i < 2; i++) await assert.rejects(cb.run(async () => { throw new Error("down"); }));
  assert.equal(cb.state, "open");
  await assert.rejects(cb.run(async () => "x"), CircuitOpenError);
  t = 1500;
  assert.equal(cb.state, "half-open");
  assert.equal(await cb.run(async () => "recovered"), "recovered");
  assert.equal(cb.state, "closed");

  await assert.rejects(withTimeout((signal) => new Promise((_r, rej) => signal.addEventListener("abort", () => rej(new Error("aborted")))), 20), TimeoutError);
});

test("limiter: never exceeds concurrency, queues, then sheds load", async () => {
  const lim = new ConcurrencyLimiter(2, 1);
  let running = 0, peak = 0;
  const gate: (() => void)[] = [];
  const job = () => lim.run(async () => { running++; peak = Math.max(peak, running); await new Promise<void>((r) => gate.push(r)); running--; });
  const a = job(), b = job(), c = job();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(lim.stats, { active: 2, queued: 1, maxConcurrent: 2, maxQueue: 1 });
  await assert.rejects(job(), OverloadedError);
  while (gate.length) { gate.shift()!(); await new Promise((r) => setTimeout(r, 2)); }
  await Promise.all([a, b, c]);
  assert.equal(peak, 2);
  assert.equal(lim.stats.active, 0);
});

test("ttl cache: hits, expiry, single-flight, eviction", async () => {
  let t = 0, loads = 0;
  const c = new TtlCache<number>(100, 2, () => t);
  const load = async () => { loads++; await new Promise((r) => setTimeout(r, 5)); return loads; };
  const [x, y] = await Promise.all([c.getOrLoad("k", load), c.getOrLoad("k", load)]);
  assert.equal(x, y); assert.equal(loads, 1, "single flight");
  await c.getOrLoad("k", load); assert.equal(loads, 1, "hit");
  t = 200; await c.getOrLoad("k", load); assert.equal(loads, 2, "expired");
  await c.getOrLoad("a", load); await c.getOrLoad("b", load); assert.ok(c.size <= 2);
});

test("pagination clamps", () => {
  assert.deepEqual(parsePaging({ page: "-3", pageSize: "9999" }), { page: 1, pageSize: 100, skip: 0, take: 100 });
  assert.equal(parsePaging({ page: "3", pageSize: "10" }).skip, 20);
  assert.equal(parsePaging({ page: "abc" }).page, 1);
});

test("data classification", () => {
  assert.equal(classifyField("User", "passwordHash"), "credential");
  assert.equal(classifyField("Student", "emergencyContactPhone"), "sensitive_personal");
  assert.equal(classifyField("Invoice", "amountDue"), "financial");
  assert.equal(classifyField("Assignment", "feedback"), "academic", "feedback must not match 'fee'");
  const [m] = classifyModels([{ name: "User", fields: [{ name: "email", kind: "scalar" }, { name: "passwordHash", kind: "scalar" }, { name: "student", kind: "object" }] }]);
  assert.equal(m.highestSensitivity, "credential");
  assert.equal(m.fields.length, 2);
});

test("logger redaction", () => {
  const r = redact({ email: "a@b.c", password: "hunter2", nested: { apiKey: "k", ok: 1 }, authorization: "Bearer x" }) as Record<string, any>;
  assert.equal(r.password, "[REDACTED]"); assert.equal(r.nested.apiKey, "[REDACTED]"); assert.equal(r.authorization, "[REDACTED]");
  assert.equal(r.email, "a@b.c"); assert.equal(r.nested.ok, 1);
  assert.equal(redactUrl("/api/x?token=abc&page=2"), "/api/x?token=%5BREDACTED%5D&page=2");
});

test("sanitize: control chars, proto keys, depth", () => {
  const out = sanitizeValue(JSON.parse('{"a":"x\\u0000y","__proto__":{"admin":true},"n":{"b":["q\\u0007"]}}')) as any;
  assert.equal(out.a, "xy"); assert.equal(Object.keys(out).includes("__proto__"), false); assert.equal(out.n.b[0], "q");
  assert.equal(sanitizeValue("keep\ttabs\nand newlines"), "keep\ttabs\nand newlines");
  let deep: any = {}; const root = deep; for (let i = 0; i < 30; i++) { deep.x = {}; deep = deep.x; }
  assert.throws(() => sanitizeValue(root), InputTooDeepError);
});

test("error mapping", () => {
  assert.equal(mapError(new HttpError(418, "teapot", "TEAPOT")).status, 418);
  assert.equal(mapError({ name: "ZodError", issues: [{ path: ["email"], message: "bad" }] }).code, "VALIDATION_FAILED");
  assert.equal(mapError({ name: "PrismaClientKnownRequestError", code: "P2002" }).status, 409);
  assert.equal(mapError({ name: "PrismaClientKnownRequestError", code: "P2025" }).status, 404);
  assert.equal(mapError({ type: "entity.parse.failed" }).status, 400);
  const boom = mapError(new Error("secret internals"));
  assert.equal(boom.status, 500); assert.ok(!boom.message.includes("secret"));
});

test("duplicate students + financial anomalies", () => {
  const g = groupDuplicateStudents([
    { id: "1", studentNumber: "A", fullName: "Wanjiru  Kamau", programmeId: "p", intake: "2026" },
    { id: "2", studentNumber: "B", fullName: "kamau wanjiru", programmeId: "p", intake: "2026" },
    { id: "3", studentNumber: "C", fullName: "Kamau Wanjiru", programmeId: "q", intake: "2026" },
  ]);
  assert.equal(g.length, 1); assert.equal(g[0].students.length, 2);
  const d = (m: number) => new Date(Date.UTC(2026, 8, 1, 10, m));
  const dups = findDuplicatePayments([
    { id: "1", invoiceId: "i", amount: 500, paidAt: d(0), reference: "r1" },
    { id: "2", invoiceId: "i", amount: 500, paidAt: d(3), reference: "r2" },
    { id: "3", invoiceId: "i", amount: 500, paidAt: d(60), reference: "r3" },
  ]);
  assert.equal(dups.length, 1); assert.deepEqual(dups[0].map((p) => p.id), ["1", "2"]);
  const a = invoiceAnomalies([{ id: "x", amountDue: 100, amountPaid: 150, livePaymentsTotal: 150 }, { id: "y", amountDue: 100, amountPaid: 100, livePaymentsTotal: 60 }]);
  assert.deepEqual(a.overpaid.map((i) => i.id), ["x"]); assert.deepEqual(a.mismatched.map((i) => i.id), ["y"]);
});

test("ai quota + cost", () => {
  assert.equal(dailyAiLimit("STUDENT", {} as NodeJS.ProcessEnv), 100);
  assert.equal(dailyAiLimit("TRAINER", {} as NodeJS.ProcessEnv), 300);
  assert.equal(dailyAiLimit("STUDENT", { AI_DAILY_LIMIT_STUDENT: "0" } as unknown as NodeJS.ProcessEnv), 0);
  assert.equal(estimateAiCost(4000, 4000, {} as NodeJS.ProcessEnv), null);
  assert.equal(estimateAiCost(4000, 2000, { AI_COST_PER_1K_INPUT_TOKENS: "0.003", AI_COST_PER_1K_OUTPUT_TOKENS: "0.015" } as unknown as NodeJS.ProcessEnv), 0.0105);
});

test("env validation", () => {
  const prod = { NODE_ENV: "production", DATABASE_URL: "postgresql://x", JWT_SECRET: "replace-with-a-long-random-string", FRONTEND_ORIGIN: "*" } as unknown as NodeJS.ProcessEnv;
  const errs = checkEnv(prod).filter((i) => i.level === "error").map((i) => i.key);
  assert.ok(errs.includes("JWT_SECRET") && errs.includes("FRONTEND_ORIGIN"));
  const good = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://x",
    JWT_SECRET: "x".repeat(40),
    FRONTEND_ORIGIN: "https://portal.example.ke",
    TRUST_PROXY: "1",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "server-only-secret",
    SUPABASE_STORAGE_BUCKET: "admission-documents",
  } as unknown as NodeJS.ProcessEnv;
  assert.equal(checkEnv(good).filter((i) => i.level === "error").length, 0);
  assert.ok(checkEnv({ ...good, SUPABASE_SERVICE_ROLE_KEY: "" } as unknown as NodeJS.ProcessEnv).some((i) => i.key === "SUPABASE_STORAGE_BUCKET"));
  assert.equal(checkEnv({ NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv).filter((i) => i.level === "error").length, 0);
});

test("credential signing secret: no public fallback in production", () => {
  const devKey = resolveSigningSecret({ NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv);
  assert.equal(devKey.length, 64);
  const prodKey = resolveSigningSecret({ NODE_ENV: "production", JWT_SECRET: "j".repeat(40) } as unknown as NodeJS.ProcessEnv);
  assert.notEqual(prodKey, devKey);
  assert.throws(() => resolveSigningSecret({ NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv));
  assert.equal(resolveSigningSecret({ NODE_ENV: "production", CREDENTIAL_SIGNING_SECRET: "own" } as unknown as NodeJS.ProcessEnv), "own");
});

test("metrics quantile + request id + pool params", () => {
  assert.equal(estimateQuantile([0, 0, 10, 0, 0, 0, 0, 0], 0.95), 250);
  assert.equal(estimateQuantile([0, 0, 0, 0, 0, 0, 0, 0], 0.95), null);
  assert.match(resolveRequestId("abc\r\nInjected: 1"), /^[0-9a-f-]{36}$/);
  assert.equal(resolveRequestId("req-12345678"), "req-12345678");
  assert.equal(withPoolParams("postgresql://h/db", { DB_POOL_SIZE: "10", DB_POOL_TIMEOUT_S: "20" } as unknown as NodeJS.ProcessEnv), "postgresql://h/db?connection_limit=10&pool_timeout=20");
  assert.equal(withPoolParams("postgresql://h/db?connection_limit=3", { DB_POOL_SIZE: "10" } as unknown as NodeJS.ProcessEnv), "postgresql://h/db?connection_limit=3");
});
