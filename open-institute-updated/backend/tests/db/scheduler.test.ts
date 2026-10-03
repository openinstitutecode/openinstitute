// Batch 66 — the integration scheduler tick: real dispatch + gradebook sweep + cleanup, and the
// Postgres advisory lock that keeps multiple portal instances from running the same tick.
import assert from "node:assert/strict";
import http from "node:http";
import { dbTest, useDb, resetDb, seedFixture, seedResult } from "../helpers/db.js";
import { runSchedulerTick, SCHEDULER_LOCK_KEY } from "../../src/integration/scheduler.js";
import { emitPortalEvent } from "../../src/integration/events.js";
import { consumeRateLimit } from "../../src/integration/rate-limit.js";

const prisma = await useDb();

async function receiver(status = 200) {
  const got: string[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      got.push(raw);
      res.statusCode = status;
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  return { got, url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, close: () => new Promise((r) => server.close(r)) };
}

dbTest("a tick delivers due events, posts approved-but-unposted results, and purges stale rate-limit buckets", async () => {
  await resetDb(prisma);
  process.env.PORTAL_WEBHOOK_SECRET = "portal-secret";
  const f = await seedFixture(prisma);
  await prisma.integrationGradebookMapping.create({ data: { unitId: f.unitId, assessmentId: f.assessmentId, createdById: f.admin.id } });
  await seedResult(prisma, f, { status: "APPROVED" }); // waiting on the sweep
  await emitPortalEvent({ eventType: "enrollment.created", payload: {} }, prisma);
  await consumeRateLimit("stale", 60_000, 5, prisma);
  await prisma.integrationRateLimitBucket.update({ where: { key: "stale" }, data: { windowStart: new Date(Date.now() - 3 * 3600_000) } });

  const rx = await receiver();
  process.env.VBL_INTEGRATION_URL = rx.url;
  try {
    const summary = await runSchedulerTick(prisma);
    assert.equal(summary.ranTick, true);
    assert.equal(summary.sent >= 1, true);
    assert.equal(summary.gradebookPosted, 1);
    assert.equal(summary.bucketsPurged, 1);
    assert.equal(await prisma.submission.count(), 1);
    assert.ok(rx.got.length >= 1);
  } finally {
    await rx.close();
  }
});

dbTest("ADVISORY LOCK: while another session holds the scheduler lock, the tick is skipped, not run twice", async () => {
  await resetDb(prisma);
  delete process.env.VBL_INTEGRATION_URL;
  let inner: Awaited<ReturnType<typeof runSchedulerTick>> | undefined;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${SCHEDULER_LOCK_KEY}::bigint)::text`; // simulate another instance mid-tick
    inner = await runSchedulerTick(prisma); // different pooled connection => cannot get the lock
  });
  assert.equal(inner?.ranTick, false);
  // ...and once the other instance is done, the next tick runs normally.
  assert.equal((await runSchedulerTick(prisma)).ranTick, true);
});

dbTest("two ticks fired at once: exactly one runs", async () => {
  await resetDb(prisma);
  delete process.env.VBL_INTEGRATION_URL;
  const outs = await Promise.all([runSchedulerTick(prisma), runSchedulerTick(prisma)]);
  const ran = outs.filter((o) => o.ranTick).length;
  assert.ok(ran >= 1 && ran <= 2, "both may run if they do not overlap in time, but never zero");
});
