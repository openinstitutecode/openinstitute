// KOBS-011 — per-request correlation id, carried through async calls with AsyncLocalStorage so the
// logger (and any service) can tag lines without threading `req` everywhere.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type RequestContext = { requestId: string; userId?: string };
export const requestStore = new AsyncLocalStorage<RequestContext>();

const SAFE_ID = /^[A-Za-z0-9._-]{8,80}$/;

/** Accept a caller-supplied id only if it is harmless to log/echo (no CR/LF, bounded length). */
export function resolveRequestId(incoming: unknown): string {
  const v = Array.isArray(incoming) ? incoming[0] : incoming;
  return typeof v === "string" && SAFE_ID.test(v) ? v : randomUUID();
}

export function currentRequestId(): string | undefined {
  return requestStore.getStore()?.requestId;
}
