// KOBS-011 correlation ids + KOBS-001 access log + KOBS-003 metrics, in one middleware so every
// request is timed exactly once. Replaces morgan("dev") (which logged full URLs incl. ?token=…).
import type { NextFunction, Request, Response } from "express";
import { requestStore, resolveRequestId } from "../lib/request-context.js";
import { logger, redactUrl } from "../lib/logger.js";
import { recordRequest } from "../lib/metrics.js";

const QUIET_PATHS = new Set(["/api/health", "/api/ready"]); // probes every few seconds — don't drown the log

export function observability(req: Request, res: Response, next: NextFunction): void {
  const requestId = resolveRequestId(req.headers["x-request-id"]);
  res.setHeader("X-Request-Id", requestId);
  const started = process.hrtime.bigint();
  const ctx = { requestId } as { requestId: string; userId?: string };

  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    // The matched route pattern keeps metric cardinality bounded (/api/x/:id, not /api/x/123).
    const route = req.route ? `${req.baseUrl}${req.route.path === "/" ? "" : req.route.path}` : "unmatched";
    recordRequest(req.method, route || "/", res.statusCode, ms);
    const user = (req as Request & { user?: { id: string } }).user;
    if (QUIET_PATHS.has(req.path) && res.statusCode < 400) return;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    logger[level]("http_request", {
      method: req.method,
      url: redactUrl(req.originalUrl),
      status: res.statusCode,
      ms: Math.round(ms),
      userId: user?.id ?? ctx.userId,
      ip: req.ip,
    });
  });

  requestStore.run(ctx, next);
}
