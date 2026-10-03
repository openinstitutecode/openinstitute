import { prisma } from "../lib/prisma.js";
import { dispatchPendingEvents, emitPortalEvent } from "./events.js";
import { purgeStaleRateLimitBuckets } from "./rate-limit.js";
import { postPendingApprovedResults } from "./gradebook.js";

// Batch 66 — the in-process scheduler Batch 65 lacked ("nothing runs delivery by itself").
//
// Every tick runs, in order: outbox dispatch, gradebook sweep for approved-but-unposted results,
// and rate-limit bucket cleanup. Ticks are guarded by a Postgres ADVISORY LOCK
// (pg_try_advisory_xact_lock), so with N portal instances exactly one runs any given tick and the
// rest skip it — no leader election, no extra infrastructure. A transaction-level lock is used
// (not the session-level pg_try_advisory_lock) because Prisma's pool hands out arbitrary
// connections: an xact lock is tied to the interactive transaction that took it and is released
// automatically on commit, rollback or crash.
//
// Env: INTEGRATION_SCHEDULER_ENABLED ("false" to disable; default on when VBL_INTEGRATION_URL is
// set), INTEGRATION_SCHEDULER_INTERVAL_SECONDS (default 30, min 5).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

// Arbitrary but stable 64-bit key for this job ("KVBDTC" + VBL as digits).
export const SCHEDULER_LOCK_KEY = 5_784_284_001n;
const SYSTEM_ACTOR = "system:integration-scheduler";

export interface TickSummary {
  ranTick: boolean; // false => another instance held the lock
  sent: number;
  failed: number;
  gradebookPosted: number;
  bucketsPurged: number;
}

/** One scheduler tick. Exported so an admin endpoint or a test can run exactly what the timer runs. */
export async function runSchedulerTick(db: Db = prisma): Promise<TickSummary> {
  return db.$transaction(
    async (tx: Db): Promise<TickSummary> => {
      const [{ locked }] = (await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${SCHEDULER_LOCK_KEY}::bigint) AS locked`) as Array<{ locked: boolean }>;
      if (!locked) return { ranTick: false, sent: 0, failed: 0, gradebookPosted: 0, bucketsPurged: 0 };

      // Work below uses the base client (own short transactions); the xact lock held by `tx` is
      // what serialises instances. The tx itself stays open only for the tick's duration.
      const { sent, failed } = await dispatchPendingEvents(25, db);
      const swept = await postPendingApprovedResults(undefined, SYSTEM_ACTOR, { db, emit: (e) => emitPortalEvent(e, db) });
      const bucketsPurged = await purgeStaleRateLimitBuckets(undefined, db);
      return { ranTick: true, sent, failed, gradebookPosted: swept.filter((r) => r.posted).length, bucketsPurged };
    },
    { timeout: 10 * 60 * 1000, maxWait: 5_000 }
  );
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startIntegrationScheduler(db: Db = prisma): boolean {
  if (timer) return true;
  const enabledFlag = process.env.INTEGRATION_SCHEDULER_ENABLED;
  const enabled = enabledFlag ? enabledFlag.toLowerCase() !== "false" : Boolean(process.env.VBL_INTEGRATION_URL);
  if (!enabled) return false;
  const seconds = Math.max(5, Number(process.env.INTEGRATION_SCHEDULER_INTERVAL_SECONDS ?? 30) || 30);
  timer = setInterval(async () => {
    if (running) return; // never overlap ticks inside one process
    running = true;
    try {
      const summary = await runSchedulerTick(db);
      if (summary.ranTick && (summary.sent || summary.failed || summary.gradebookPosted)) {
        // eslint-disable-next-line no-console
        console.log("[integration-scheduler]", summary);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[integration-scheduler] tick failed", err);
    } finally {
      running = false;
    }
  }, seconds * 1000);
  timer.unref?.();
  return true;
}

export function stopIntegrationScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
