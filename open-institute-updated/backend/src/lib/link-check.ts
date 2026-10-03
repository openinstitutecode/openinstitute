// Batch 69 — KFEAT-098: broken-link monitoring for library resources. fetch and the URL guard are injectable for tests.
export type LinkResult = { ok: boolean; status?: number; error?: string };
export async function checkUrl(url: string, o: { fetchImpl?: typeof fetch; guard?: (u: string) => Promise<unknown>; timeoutMs?: number } = {}): Promise<LinkResult> {
  const f = o.fetchImpl ?? fetch;
  try {
    if (o.guard) await o.guard(url);
    for (const method of ["HEAD", "GET"] as const) {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), o.timeoutMs ?? 8000);
      try {
        const r = await f(url, { method, redirect: "follow", signal: ctl.signal, headers: { "User-Agent": "MeasurBusinessCollege-LinkCheck/1.0" } });
        if (method === "HEAD" && (r.status === 405 || r.status === 501 || r.status === 403)) continue; // some servers refuse HEAD
        return { ok: r.status >= 200 && r.status < 400, status: r.status };
      } finally { clearTimeout(t); }
    }
    return { ok: false, status: 405 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? (e.name === "AbortError" ? "timeout" : e.message.slice(0, 120)) : "failed" };
  }
}
export async function checkLinks<T extends { id: string; url: string }>(items: T[], check: (u: string) => Promise<LinkResult>, concurrency = 5) {
  const out: (T & LinkResult)[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) { const it = items[i++]; out.push({ ...it, ...(await check(it.url)) }); }
  }));
  return out;
}
