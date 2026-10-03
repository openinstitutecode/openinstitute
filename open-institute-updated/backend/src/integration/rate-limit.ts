import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";

// VBI044 — Integration Rate Limiting, backed by Postgres (Batch 66).
//
// Batch 65's limiter kept its counters in a per-process Map, so the limit was per-instance and was
// lost on every restart. The counters now live in IntegrationRateLimitBucket and the fixed window is
// advanced by ONE atomic statement (INSERT ... ON CONFLICT DO UPDATE), which is what makes the limit
// correct across any number of portal instances: two requests racing on the same key are serialised
// by the row lock and each sees a distinct count.
//
// Failure policy (deliberate, documented): if the database itself is unreachable the limiter FAILS
// OPEN and logs. Signature verification still guards the webhook and the SSO route is behind JWT
// auth, so a limiter outage must not become an integration outage on top of a database outage.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any; // a PrismaClient or a $transaction client — only $queryRaw / $executeRaw are used

export interface RateLimitDecision {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

/**
 * Registers one hit against `key` and reports whether it is within `max` for the current window.
 * A hit that lands after the window has elapsed atomically starts a new window at count = 1.
 */
export async function consumeRateLimit(key: string, windowMs: number, max: number, db: Db = prisma): Promise<RateLimitDecision> {
  const windowSeconds = windowMs / 1000;
  const rows = (await db.$queryRaw`
    INSERT INTO "IntegrationRateLimitBucket" ("key", "count", "windowStart")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "IntegrationRateLimitBucket"."windowStart" <= now() - (${windowSeconds}::double precision * interval '1 second')
          THEN 1
        ELSE "IntegrationRateLimitBucket"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "IntegrationRateLimitBucket"."windowStart" <= now() - (${windowSeconds}::double precision * interval '1 second')
          THEN now()
        ELSE "IntegrationRateLimitBucket"."windowStart"
      END
    RETURNING "count", GREATEST(0, CEIL(EXTRACT(EPOCH FROM ("windowStart" + (${windowSeconds}::double precision * interval '1 second') - now()))))::int AS "retryAfter"
  `) as Array<{ count: number; retryAfter: number }>;
  const row = rows[0];
  const count = Number(row.count);
  return { allowed: count <= max, count, retryAfterSeconds: Number(row.retryAfter) };
}

export function rateLimit(options: { windowMs: number; max: number; keyFn?: (req: Request) => string; scope?: string }) {
  const keyFn = options.keyFn ?? ((req: Request) => req.ip ?? "unknown");
  // The scope keeps two limiters that happen to see the same caller (e.g. the same IP) from
  // sharing one counter.
  const scope = options.scope ?? `${options.windowMs}:${options.max}`;
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const decision = await consumeRateLimit(`${scope}|${keyFn(req)}`, options.windowMs, options.max);
      if (!decision.allowed) {
        res.setHeader("Retry-After", String(Math.max(1, decision.retryAfterSeconds)));
        return res.status(429).json({ message: "Too many requests to the Virtual Business Lab integration API. Try again shortly." });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Rate limiter could not reach Postgres — failing open", err);
    }
    next();
  };
}

/** Deletes buckets whose window ended long ago. Safe to run from any instance, any number of times. */
export async function purgeStaleRateLimitBuckets(olderThanMs = 60 * 60 * 1000, db: Db = prisma): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const res = await db.integrationRateLimitBucket.deleteMany({ where: { windowStart: { lt: cutoff } } });
  return res.count;
}
