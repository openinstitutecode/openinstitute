// VBI044 — Postgres-backed rate limiter (Batch 66). The window is advanced by ONE atomic
// INSERT ... ON CONFLICT statement, so it must hold under concurrency and across "instances"
// (separate calls sharing only the database).
import assert from "node:assert/strict";
import { dbTest, useDb, resetDb } from "../helpers/db.js";
import { consumeRateLimit, purgeStaleRateLimitBuckets } from "../../src/integration/rate-limit.js";

const prisma = await useDb();

dbTest("allows requests up to the limit, then blocks with a Retry-After", async () => {
  await resetDb(prisma);
  for (let i = 1; i <= 3; i++) assert.equal((await consumeRateLimit("k1", 60_000, 3, prisma)).allowed, true);
  const blocked = await consumeRateLimit("k1", 60_000, 3, prisma);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.count, 4);
  assert.ok(blocked.retryAfterSeconds >= 1 && blocked.retryAfterSeconds <= 60);
});

dbTest("tracks separate keys independently", async () => {
  await resetDb(prisma);
  for (let i = 0; i < 3; i++) await consumeRateLimit("a", 60_000, 3, prisma);
  assert.equal((await consumeRateLimit("a", 60_000, 3, prisma)).allowed, false);
  assert.equal((await consumeRateLimit("b", 60_000, 3, prisma)).allowed, true);
});

dbTest("CONCURRENCY: 50 simultaneous hits against max=10 admit exactly 10", async () => {
  await resetDb(prisma);
  const results = await Promise.all(Array.from({ length: 50 }, () => consumeRateLimit("burst", 60_000, 10, prisma)));
  assert.equal(results.filter((r) => r.allowed).length, 10);
  assert.equal(new Set(results.map((r) => r.count)).size, 50, "each request saw a distinct count (row-locked)");
});

dbTest("a new window starts once the old one has elapsed", async () => {
  await resetDb(prisma);
  for (let i = 0; i < 4; i++) await consumeRateLimit("w", 60_000, 3, prisma);
  await prisma.integrationRateLimitBucket.update({ where: { key: "w" }, data: { windowStart: new Date(Date.now() - 61_000) } });
  const fresh = await consumeRateLimit("w", 60_000, 3, prisma);
  assert.equal(fresh.allowed, true);
  assert.equal(fresh.count, 1);
});

dbTest("state survives a 'restart': counters live in Postgres, not the process", async () => {
  await resetDb(prisma);
  for (let i = 0; i < 3; i++) await consumeRateLimit("persist", 60_000, 3, prisma);
  // A different module instance / process would see the same row:
  assert.equal((await prisma.integrationRateLimitBucket.findUniqueOrThrow({ where: { key: "persist" } })).count, 3);
});

dbTest("purgeStaleRateLimitBuckets removes only long-expired buckets", async () => {
  await resetDb(prisma);
  await consumeRateLimit("fresh", 60_000, 3, prisma);
  await consumeRateLimit("old", 60_000, 3, prisma);
  await prisma.integrationRateLimitBucket.update({ where: { key: "old" }, data: { windowStart: new Date(Date.now() - 2 * 3600_000) } });
  assert.equal(await purgeStaleRateLimitBuckets(3600_000, prisma), 1);
  assert.deepEqual((await prisma.integrationRateLimitBucket.findMany()).map((b) => b.key), ["fresh"]);
});
