// KSEC-018 — context-appropriate input hygiene applied once, to every JSON body:
//  * NUL bytes / other control characters are removed (they break Postgres text columns and log lines),
//  * prototype-pollution keys are dropped,
//  * absurd nesting is rejected. HTML is NOT stripped here — output encoding is React's job, and
//    stripping would corrupt legitimate content (e.g. "a < b" in a maths question).
import type { NextFunction, Request, Response } from "express";

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g; // keeps \t \n \r
const MAX_DEPTH = 20;

export class InputTooDeepError extends Error {}

export function sanitizeValue(v: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) throw new InputTooDeepError("Request body is nested too deeply.");
  if (typeof v === "string") return v.replace(CONTROL, "");
  if (Array.isArray(v)) return v.map((x) => sanitizeValue(x, depth + 1));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (BLOCKED_KEYS.has(k)) continue;
      out[k.replace(CONTROL, "")] = sanitizeValue(val, depth + 1);
    }
    return out;
  }
  return v;
}

export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  if (!req.body || Buffer.isBuffer(req.body) || typeof req.body !== "object") return next();
  try {
    req.body = sanitizeValue(req.body);
    next();
  } catch (e) {
    if (e instanceof InputTooDeepError) {
      res.status(400).json({ message: e.message, code: "BAD_REQUEST" });
      return;
    }
    next(e);
  }
}
