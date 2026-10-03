// KARC-005 one error contract for the whole API · KFX-029/031 consistent bodies + status codes ·
// KFX-049 async handler rejections reach this handler instead of crashing the process.
import type { NextFunction, Request, Response } from "express";
import { createRequire } from "node:module";
import { currentRequestId } from "../lib/request-context.js";
import { logger } from "../lib/logger.js";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "ERROR", public details?: unknown) {
    super(message);
    this.name = "HttpError";
  }
}
export const badRequest = (m: string, details?: unknown) => new HttpError(400, m, "BAD_REQUEST", details);
export const unauthorized = (m = "Not authenticated.") => new HttpError(401, m, "UNAUTHENTICATED");
export const forbidden = (m = "You don't have permission to do that.") => new HttpError(403, m, "FORBIDDEN");
export const notFound = (m = "Not found.") => new HttpError(404, m, "NOT_FOUND");
export const conflict = (m: string) => new HttpError(409, m, "CONFLICT");

/**
 * Express 4 does not forward a rejected promise from an `async (req,res)` handler to the error
 * middleware, and on Node >= 15 the unhandled rejection kills the process — so one bad query took
 * the whole API down. This patches Layer#handle_request (the same technique as express-async-errors)
 * so every existing async route is covered without editing 100+ files.
 */
export function installAsyncErrorForwarding(): void {
  const require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Layer = require("express/lib/router/layer") as any;
  if (Layer.prototype.__asyncPatched) return;
  const original = Layer.prototype.handle_request;
  Layer.prototype.handle_request = function patched(req: Request, res: Response, next: NextFunction) {
    const fn = this.handle;
    if (fn.length > 3) return next(); // error-handling middleware: leave alone
    try {
      const out = fn(req, res, next);
      if (out && typeof out.catch === "function") out.catch(next);
    } catch (err) {
      next(err);
    }
  };
  Layer.prototype.__asyncPatched = true;
  void original;
}

export function installProcessHandlers(): void {
  process.on("unhandledRejection", (reason) => logger.error("unhandledRejection", { reason: reason instanceof Error ? reason : String(reason) }));
  process.on("uncaughtException", (err) => {
    logger.error("uncaughtException", { err });
    setTimeout(() => process.exit(1), 100).unref(); // state is unknown — let the orchestrator restart us
  });
}

/** JSON 404 for unknown /api routes (was Express's HTML "Cannot GET …"). */
export function apiNotFound(req: Request, res: Response): void {
  res.status(404).json({ message: `No such endpoint: ${req.method} ${req.path}`, code: "NOT_FOUND", requestId: currentRequestId() });
}

type Mapped = { status: number; message: string; code: string; issues?: unknown };

/** Pure mapping — exported for tests. Recognises errors by shape so this file has no Prisma/zod import. */
export function mapError(err: unknown): Mapped {
  const e = err as { name?: string; code?: string; type?: string; status?: number; statusCode?: number; issues?: { path: (string | number)[]; message: string }[]; message?: string; meta?: { target?: unknown } };
  if (err instanceof HttpError) return { status: err.status, message: err.message, code: err.code, issues: err.details };
  if (e?.name === "ZodError" && Array.isArray(e.issues)) {
    return { status: 400, message: "Some fields are invalid.", code: "VALIDATION_FAILED", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
  }
  if (e?.type === "entity.parse.failed") return { status: 400, message: "Request body is not valid JSON.", code: "BAD_JSON" };
  if (e?.type === "entity.too.large") return { status: 413, message: "Request body is too large.", code: "PAYLOAD_TOO_LARGE" };
  if (e?.name === "PrismaClientKnownRequestError") {
    if (e.code === "P2002") return { status: 409, message: "A record with those details already exists.", code: "DUPLICATE" };
    if (e.code === "P2025") return { status: 404, message: "Record not found.", code: "NOT_FOUND" };
    if (e.code === "P2003") return { status: 409, message: "That record is linked to other data and cannot be changed this way.", code: "RELATED_RECORD" };
    if (e.code === "P2034") return { status: 409, message: "The request conflicted with another update — please retry.", code: "WRITE_CONFLICT" };
  }
  if (e?.name === "PrismaClientInitializationError") return { status: 503, message: "The database is temporarily unavailable.", code: "DB_UNAVAILABLE" };
  const s = e?.status ?? e?.statusCode;
  if (typeof s === "number" && s >= 400 && s < 500) return { status: s, message: e.message ?? "Bad request.", code: "BAD_REQUEST" };
  return { status: 500, message: "Something went wrong on our end.", code: "INTERNAL" };
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) return next(err);
  const mapped = mapError(err);
  if (mapped.status >= 500) logger.error("unhandled_error", { err, method: req.method, path: req.path });
  res.status(mapped.status).json({ message: mapped.message, code: mapped.code, ...(mapped.issues ? { issues: mapped.issues } : {}), requestId: currentRequestId() });
}
