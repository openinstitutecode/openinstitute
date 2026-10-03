// CORE (core.ac.uk) aggregates full text (not just metadata) from
// thousands of open-access repositories and journals worldwide — including
// PubMed OA, archive.org, and DOAJ's own sources — and is one of the
// largest open-access full-text search surfaces that exists. Unlike the
// other connectors in this module, CORE requires a free API key: register
// at https://core.ac.uk/services/api, then set CORE_API_KEY. Nothing here
// invents a key or bypasses that requirement.
//
// Endpoint: GET https://api.core.ac.uk/v3/search/works?q=...
// Auth: Authorization: Bearer <CORE_API_KEY>
// Response: { totalHits, results: [{ id, title, authors[], abstract,
//   downloadUrl, sourceFulltextUrls[] }] }

export type CoreResult = {
  id: string;
  title: string;
  author?: string;
  abstract?: string;
  url?: string;
};

export async function searchCore(apiKey: string, query: string, limit = 10): Promise<CoreResult[]> {
  const url = new URL("https://api.core.ac.uk/v3/search/works");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`CORE API returned ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { results?: unknown[] };
  const items: unknown[] = data?.results ?? [];

  return items.map((item) => {
    const rec = item as Record<string, unknown>;
    const authors = (rec.authors as { name?: string }[] | string[] | undefined) ?? [];
    const authorNames = Array.isArray(authors)
      ? authors.map((a) => (typeof a === "string" ? a : a?.name)).filter(Boolean)
      : [];
    const fulltextUrls = (rec.sourceFulltextUrls as string[] | undefined) ?? [];
    return {
      id: String(rec.id ?? ""),
      title: String(rec.title ?? "Untitled"),
      author: authorNames.length ? authorNames.join(", ") : undefined,
      abstract: rec.abstract ? String(rec.abstract) : undefined,
      url: (rec.downloadUrl as string | undefined) ?? fulltextUrls[0],
    };
  });
}
