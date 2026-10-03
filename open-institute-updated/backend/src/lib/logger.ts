// KOBS-001 structured logging · KSEC-021 / KOBS-015 secret redaction · KSEC-027 security events.
// JSON lines in production (or LOG_FORMAT=json), readable lines in development.
import { currentRequestId } from "./request-context.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;

// Keys whose values must never reach a log line.
const SENSITIVE_KEY = /pass(word|wd)?|secret|token|authorization|api[-_]?key|cookie|credential|signature|otp|private|national.?id|id.?number|card.?number|cvv/i;
const SENSITIVE_QUERY = /token|key|secret|signature|sig|code|password/i;
const MAX_DEPTH = 6;

export function redact(value: unknown, depth = 0): unknown {
  if (value == null || typeof value !== "object") {
    return typeof value === "string" && value.length > 2000 ? value.slice(0, 2000) + "…[truncated]" : value;
  }
  if (depth >= MAX_DEPTH) return "[depth-limit]";
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : redact(v, depth + 1);
  }
  return out;
}

/** Strip sensitive query-string values (?token=…) from a request URL before logging it. */
export function redactUrl(url: string): string {
  const i = url.indexOf("?");
  if (i === -1) return url;
  const params = new URLSearchParams(url.slice(i + 1));
  for (const k of [...params.keys()]) if (SENSITIVE_QUERY.test(k)) params.set(k, "[REDACTED]");
  return `${url.slice(0, i)}?${params.toString()}`;
}

function threshold(): number {
  const l = (process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  return LEVELS[l] ?? LEVELS.info;
}
function useJson(): boolean {
  return process.env.LOG_FORMAT ? process.env.LOG_FORMAT === "json" : process.env.NODE_ENV === "production";
}

export function log(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
  if (LEVELS[level] < threshold()) return;
  const requestId = currentRequestId();
  const safe = redact(fields) as Record<string, unknown>;
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (useJson()) {
    sink(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(requestId ? { requestId } : {}), ...safe }));
  } else {
    const extra = Object.keys(safe).length ? " " + JSON.stringify(safe) : "";
    sink(`${level.toUpperCase().padEnd(5)} ${requestId ? `[${requestId.slice(0, 8)}] ` : ""}${msg}${extra}`);
  }
}

export const logger = {
  debug: (m: string, f?: Record<string, unknown>) => log("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => log("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => log("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => log("error", m, f),
};

/** KSEC-027 — one greppable shape for security-relevant events (lockouts, denied access, resets). */
export function securityEvent(event: string, fields: Record<string, unknown> = {}): void {
  log("warn", "security_event", { event, ...fields });
}
