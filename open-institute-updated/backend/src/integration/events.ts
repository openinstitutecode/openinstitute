import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { hashPayload, signPayload } from "./signing.js";
import { activeSigningCredential } from "./credentials.js";
import { MAX_ATTEMPTS, backoffSeconds } from "./backoff.js";

// VBI011 — Portal-to-Lab events, VBI014 — idempotency, VBI015 — retry,
// VBI017 — event ledger. emitPortalEvent() only ever writes the ledger row
// (fast, always succeeds even if VBL is down); dispatchPendingEvents() does
// the actual network call. Batch 66: delivery no longer depends on anyone
// calling it — integration/scheduler.ts runs it on a timer (one instance per
// tick, Postgres advisory lock), and claimDueEvents() uses FOR UPDATE SKIP
// LOCKED so a manual POST /outbox/dispatch, the scheduler and a second portal
// instance can all run at once without sending the same event twice.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any; // a PrismaClient (default) or a transaction client — there is no in-memory substitute

export async function emitPortalEvent(params: {
  eventType: string;
  entityType?: string;
  entityId?: string;
  payload: Record<string, unknown>;
}, db: Db = prisma) {
  const eventId = `evt_${randomUUID()}`;
  const payload = { eventId, eventType: params.eventType, occurredAt: new Date().toISOString(), ...params.payload };
  return db.integrationEvent.create({
    data: {
      eventId,
      direction: "PORTAL_TO_VBL",
      eventType: params.eventType,
      entityType: params.entityType,
      entityId: params.entityId,
      payload,
      payloadHash: hashPayload(payload),
      status: "PENDING",
    },
  });
}

export { MAX_ATTEMPTS, backoffSeconds };
const LEASE_SECONDS = 120; // must comfortably exceed FETCH_TIMEOUT_MS
const FETCH_TIMEOUT_MS = 15_000;

interface ClaimedEvent { id: string; eventId: string; payload: unknown; attempts: number; createdAt: Date }

// Batch 66 — claims up to `limit` due outbound events in ONE statement. FOR UPDATE SKIP LOCKED
// makes concurrent dispatchers (two portal instances, the scheduler and an admin's manual
// POST /outbox/dispatch) take DISJOINT sets of rows; each claimed row's nextAttemptAt is pushed
// LEASE_SECONDS into the future, so a dispatcher that crashes mid-send just lets the lease lapse
// and the event is retried — never sent twice at the same time, never lost.
export async function claimDueEvents(limit: number, db: Db = prisma): Promise<ClaimedEvent[]> {
  const rows = (await db.$queryRaw`
    UPDATE "IntegrationEvent"
    SET "nextAttemptAt" = now() + (${LEASE_SECONDS}::double precision * interval '1 second')
    WHERE "id" IN (
      SELECT "id" FROM "IntegrationEvent"
      WHERE "direction" = 'PORTAL_TO_VBL'
        AND "status" IN ('PENDING', 'FAILED')
        AND "attempts" < ${MAX_ATTEMPTS}
        AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now())
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "eventId", "payload", "attempts", "createdAt"
  `) as ClaimedEvent[];
  return rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

// VBI015/016 — attempts each due PENDING/FAILED outbound event once. Backoff is per event
// (nextAttemptAt), so the caller's polling cadence no longer decides retry spacing.
export async function dispatchPendingEvents(limit = 25, db: Db = prisma): Promise<{ sent: number; failed: number }> {
  const vblUrl = process.env.VBL_INTEGRATION_URL;
  if (!vblUrl) {
    return { sent: 0, failed: 0 }; // not configured — nothing to do, not an error
  }
  // VBI010/045 — sign with whichever PORTAL_TO_VBL credential is currently active (DB-issued,
  // rotating); activeSigningCredential() falls back to PORTAL_WEBHOOK_SECRET when none exists.
  let keyId: string;
  let secret: string;
  try {
    ({ keyId, secret } = await activeSigningCredential("PORTAL_TO_VBL", db));
  } catch {
    return { sent: 0, failed: 0 }; // no credential and no fallback configured — nothing to do yet
  }

  const events = await claimDueEvents(limit, db);

  let sent = 0;
  let failed = 0;
  for (const event of events) {
    const rawBody = JSON.stringify(event.payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signPayload(secret, timestamp, rawBody);
    try {
      const res = await fetch(`${vblUrl.replace(/\/$/, "")}/integration/v1/webhooks/portal`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-portal-timestamp": String(timestamp),
          "x-portal-signature": signature,
          "x-portal-key-id": keyId,
        },
        body: rawBody,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.ok) {
        await db.integrationEvent.update({
          where: { id: event.id },
          data: { status: "SENT", attempts: { increment: 1 }, processedAt: new Date(), lastError: null, nextAttemptAt: null },
        });
        sent++;
      } else {
        const text = await res.text().catch(() => "");
        await markFailed(db, event.id, event.attempts + 1, `HTTP ${res.status}: ${text.slice(0, 500)}`);
        failed++;
      }
    } catch (err) {
      await markFailed(db, event.id, event.attempts + 1, err instanceof Error ? err.message : String(err));
      failed++;
    }
  }
  return { sent, failed };
}

async function markFailed(db: Db, id: string, attempts: number, lastError: string) {
  const dead = attempts >= MAX_ATTEMPTS;
  await db.integrationEvent.update({
    where: { id },
    data: {
      attempts,
      lastError,
      status: dead ? "DEAD_LETTER" : "FAILED",
      nextAttemptAt: dead ? null : new Date(Date.now() + backoffSeconds(attempts) * 1000),
    },
  });
}
