// Batch 73 — KSEC-017 / KPERF-015: outbound fetch for admin-configured URLs. Checks the target with the SSRF guard,
// refuses redirects (a redirect could point at an internal address) and times out.
import { assertSafeOutboundUrl } from "./ssrf-guard.js";
export async function safeFetch(url: string | URL, init: RequestInit = {}, timeoutMs = 10_000, guard: (u: string) => Promise<unknown> = (u) => assertSafeOutboundUrl(u)): Promise<Response> {
  await guard(String(url));
  return fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
}
