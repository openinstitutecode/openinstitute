// Batch 70 — KFEAT-054 / KFX-021 / KFX-048 / KDB-010: opt-in `Idempotency-Key` header. A retry (double click, flaky mobile network)
// with the same key + same body replays the first response instead of creating a second record.
import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "./prisma.js";

export const STALE_AFTER_MS = 60_000; // an "in progress" row older than this belonged to a request that died
export const isValidKey = (k: string) => /^[A-Za-z0-9_\-:.]{8,100}$/.test(k);
export const hashBody = (b: unknown) => createHash("sha256").update(JSON.stringify(b ?? {})).digest("hex");

export type Existing = { route: string; bodyHash: string; status: string; createdAt: Date };
/** What to do when a key has been seen before. Pure so it can be tested without a database. */
export function classifyExisting(e: Existing, route: string, bodyHash: string, now = new Date()): "mismatch" | "replay" | "busy" | "stale" {
  if (e.route !== route || e.bodyHash !== bodyHash) return "mismatch";
  if (e.status === "done") return "replay";
  return now.getTime() - e.createdAt.getTime() > STALE_AFTER_MS ? "stale" : "busy";
}

export function idempotent() {
  return async (req: Request & { user?: { id: string } }, res: Response, next: NextFunction) => {
    const key = req.header("Idempotency-Key");
    if (!key) return next(); // opt-in: clients that don't send a key behave exactly as before
    if (!isValidKey(key)) return res.status(400).json({ message: "Idempotency-Key must be 8-100 letters, digits or _-:.", code: "BAD_REQUEST" });
    const scope = req.user?.id ?? `ip:${req.ip}`;
    const route = `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`;
    const bodyHash = hashBody(req.body);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await prisma.idempotencyRecord.create({ data: { scope, key, route, bodyHash } });
        break; // first time we see this key — we own it
      } catch (e) {
        if ((e as { code?: string }).code !== "P2002") throw e;
        const existing = await prisma.idempotencyRecord.findUnique({ where: { scope_key: { scope, key } } });
        if (!existing) continue; // deleted between the two calls — try to claim it again
        const verdict = classifyExisting(existing, route, bodyHash);
        if (verdict === "mismatch") return res.status(422).json({ message: "That Idempotency-Key was already used for a different request.", code: "IDEMPOTENCY_MISMATCH" });
        if (verdict === "busy") return res.status(409).json({ message: "The original request is still being processed. Retry shortly.", code: "CONFLICT" });
        if (verdict === "replay") { res.setHeader("Idempotent-Replay", "true"); return res.status(existing.responseStatus ?? 200).json(existing.responseBody); }
        await prisma.idempotencyRecord.delete({ where: { id: existing.id } }).catch(() => undefined); // stale: reclaim on the next loop
        if (attempt === 1) return res.status(409).json({ message: "Please retry.", code: "CONFLICT" });
      }
    }
    const send = res.json.bind(res);
    res.json = (body?: unknown) => {
      // Successful outcomes are remembered. Errors are forgotten so the caller can fix the request and reuse the key.
      const done = res.statusCode < 400
        ? prisma.idempotencyRecord.update({ where: { scope_key: { scope, key } }, data: { status: "done", responseStatus: res.statusCode, responseBody: (body ?? null) as object } })
        : prisma.idempotencyRecord.delete({ where: { scope_key: { scope, key } } });
      void done.catch(() => undefined).finally(() => send(body));
      return res;
    };
    next();
  };
}
