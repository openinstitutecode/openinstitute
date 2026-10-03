// VBI011/015/016 (portal -> VBL) — the REAL dispatchPendingEvents() against a real loopback HTTP
// receiver AND a real Postgres outbox (Batch 66: replaces the in-memory table fake). Also covers the
// new per-event backoff (nextAttemptAt) and the SKIP LOCKED claim.
import assert from "node:assert/strict";
import http from "node:http";
import { dbTest, useDb, resetDb } from "../helpers/db.js";
import { dispatchPendingEvents, emitPortalEvent, claimDueEvents, MAX_ATTEMPTS } from "../../src/integration/events.js";
import { verifySignedPayload } from "../../src/integration/signing.js";

const prisma = await useDb();

async function withServer(script: number[], fn: (url: string, received: Array<{ headers: http.IncomingHttpHeaders; raw: string }>) => Promise<void>) {
  const received: Array<{ headers: http.IncomingHttpHeaders; raw: string }> = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      received.push({ headers: req.headers, raw });
      res.statusCode = script.length ? (script.shift() as number) : 200;
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  try {
    await fn(`http://127.0.0.1:${port}`, received);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

async function setup() {
  process.env.PORTAL_WEBHOOK_SECRET = "portal-secret";
  await resetDb(prisma); // no credential rows => dispatcher falls back to PORTAL_WEBHOOK_SECRET
}
const makeDue = () => prisma.integrationEvent.updateMany({ data: { nextAttemptAt: null } });
const only = () => prisma.integrationEvent.findFirstOrThrow();

dbTest("a pending event is delivered, signed with a verifiable signature, and marked SENT", async () => {
  await setup();
  await emitPortalEvent({ eventType: "enrollment.created", payload: { portalStudentId: "s1" } }, prisma);
  await withServer([], async (url, received) => {
    process.env.VBL_INTEGRATION_URL = url;
    assert.deepEqual(await dispatchPendingEvents(25, prisma), { sent: 1, failed: 0 });
    const row = await only();
    assert.equal(row.status, "SENT");
    assert.equal(row.attempts, 1);
    assert.equal(row.nextAttemptAt, null);
    const h = received[0].headers;
    assert.equal(h["x-portal-key-id"], "env-fallback");
    assert.equal(verifySignedPayload("portal-secret", Number(h["x-portal-timestamp"]), received[0].raw, h["x-portal-signature"] as string), true);
    assert.equal(JSON.parse(received[0].raw).eventType, "enrollment.created");
  });
});

dbTest("a failing receiver leaves the event FAILED and BACKED OFF; once due again a later pass delivers it", async () => {
  await setup();
  await emitPortalEvent({ eventType: "staff.assigned", payload: {} }, prisma);
  await withServer([500], async (url) => {
    process.env.VBL_INTEGRATION_URL = url;
    assert.deepEqual(await dispatchPendingEvents(25, prisma), { sent: 0, failed: 1 });
    let row = await only();
    assert.equal(row.status, "FAILED");
    assert.equal(row.attempts, 1);
    assert.match(row.lastError ?? "", /HTTP 500/);
    assert.ok(row.nextAttemptAt && row.nextAttemptAt.getTime() > Date.now(), "retry is scheduled in the future");

    // Backoff: an immediate second pass must NOT touch it.
    assert.deepEqual(await dispatchPendingEvents(25, prisma), { sent: 0, failed: 0 });
    assert.equal((await only()).attempts, 1);

    await makeDue();
    assert.deepEqual(await dispatchPendingEvents(25, prisma), { sent: 1, failed: 0 });
    row = await only();
    assert.equal(row.status, "SENT");
    assert.equal(row.lastError, null);
  });
});

dbTest("after 8 consecutive failures the event becomes DEAD_LETTER and is no longer picked up", async () => {
  await setup();
  await emitPortalEvent({ eventType: "staff.assigned", payload: {} }, prisma);
  await withServer(Array(20).fill(503), async (url, received) => {
    process.env.VBL_INTEGRATION_URL = url;
    for (let i = 0; i < 10; i++) {
      await makeDue();
      await dispatchPendingEvents(25, prisma);
    }
    const row = await only();
    assert.equal(row.status, "DEAD_LETTER");
    assert.equal(row.attempts, MAX_ATTEMPTS);
    assert.equal(row.nextAttemptAt, null);
    assert.equal(received.length, MAX_ATTEMPTS); // stopped retrying — did not keep hammering the receiver
  });
});

dbTest("an unreachable receiver is a recorded failure, not a thrown error", async () => {
  await setup();
  await emitPortalEvent({ eventType: "staff.assigned", payload: {} }, prisma);
  process.env.VBL_INTEGRATION_URL = "http://127.0.0.1:1"; // nothing listens on port 1
  assert.deepEqual(await dispatchPendingEvents(25, prisma), { sent: 0, failed: 1 });
  assert.equal((await only()).status, "FAILED");
});

dbTest("not configured (no URL) is a quiet no-op", async () => {
  await setup();
  await emitPortalEvent({ eventType: "staff.assigned", payload: {} }, prisma);
  delete process.env.VBL_INTEGRATION_URL;
  assert.deepEqual(await dispatchPendingEvents(25, prisma), { sent: 0, failed: 0 });
  assert.equal((await only()).status, "PENDING");
});

dbTest("emitPortalEvent writes a PENDING PORTAL_TO_VBL ledger row with a unique eventId and a payload hash", async () => {
  await setup();
  const a = await emitPortalEvent({ eventType: "x", payload: { k: 1 } }, prisma);
  const b = await emitPortalEvent({ eventType: "x", payload: { k: 1 } }, prisma);
  assert.equal(a.status, "PENDING");
  assert.equal(a.direction, "PORTAL_TO_VBL");
  assert.notEqual(a.eventId, b.eventId);
  assert.match(a.payloadHash, /^[0-9a-f]{64}$/);
});

dbTest("claimDueEvents: two concurrent claimers receive DISJOINT sets and the rows are leased", async () => {
  await setup();
  for (let i = 0; i < 20; i++) await emitPortalEvent({ eventType: "x", payload: { i } }, prisma);
  const [a, b] = await Promise.all([claimDueEvents(12, prisma), claimDueEvents(12, prisma)]);
  const ids = new Set([...a, ...b].map((e) => e.id));
  assert.equal(ids.size, a.length + b.length, "no event was claimed by both");
  assert.equal(a.length + b.length, 20, "together they cover every due event exactly once");
  // Leased: a third claimer right now gets nothing.
  assert.equal((await claimDueEvents(50, prisma)).length, 0);
  const leased = await prisma.integrationEvent.findFirstOrThrow();
  assert.ok(leased.nextAttemptAt && leased.nextAttemptAt.getTime() > Date.now());
});

dbTest("an expired lease (crashed dispatcher) makes the event claimable again", async () => {
  await setup();
  await emitPortalEvent({ eventType: "x", payload: {} }, prisma);
  assert.equal((await claimDueEvents(5, prisma)).length, 1);
  assert.equal((await claimDueEvents(5, prisma)).length, 0);
  await prisma.integrationEvent.updateMany({ data: { nextAttemptAt: new Date(Date.now() - 1000) } }); // lease lapsed
  assert.equal((await claimDueEvents(5, prisma)).length, 1);
});

dbTest("two dispatchers running at once never deliver the same event twice", async () => {
  await setup();
  for (let i = 0; i < 10; i++) await emitPortalEvent({ eventType: "x", payload: { i } }, prisma);
  await withServer([], async (url, received) => {
    process.env.VBL_INTEGRATION_URL = url;
    const [a, b] = await Promise.all([dispatchPendingEvents(25, prisma), dispatchPendingEvents(25, prisma)]);
    assert.equal(a.sent + b.sent, 10);
    assert.equal(received.length, 10);
    assert.equal(new Set(received.map((r) => JSON.parse(r.raw).eventId ?? r.raw)).size, 10);
  });
});
