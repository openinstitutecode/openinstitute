// KSEC-013 — FRONTEND_ORIGIN may list several origins (comma-separated). Exact match only; never "*".
export function parseOrigins(raw: string | undefined): string[] {
  const list = (raw ?? "http://localhost:5173").split(",").map((s) => s.trim().replace(/\/$/, "")).filter((s) => s && s !== "*");
  return list.length ? list : ["http://localhost:5173"];
}

/** Callback shape used by the `cors` package. Requests with no Origin (curl, server-to-server webhooks) are allowed through; CORS only governs browsers. */
export function originChecker(allowed: string[]) {
  return (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) => cb(null, !origin || allowed.includes(origin));
}

/** First allowed origin — used to build links in emails (e.g. password reset). */
export function primaryOrigin(raw: string | undefined): string {
  return parseOrigins(raw)[0];
}
