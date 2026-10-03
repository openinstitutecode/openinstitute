// DOAJ (Directory of Open Access Journals) exposes a real, fully public
// metadata API — no registration, no API key, no signup. It indexes
// 20,000+ peer-reviewed open-access journals across every discipline,
// including business, management, economics, and computer science/ICT,
// which makes it a strong general-purpose source for this college's two
// programme areas. See https://doaj.org/api/docs
//
// Endpoint: GET https://doaj.org/api/search/articles/{query}
// Response: { total, results: [{ bibjson: { title, abstract, author[],
//   journal: { title }, link[] } }] }

export type DoajResult = {
  id: string;
  title: string;
  author?: string;
  abstract?: string;
  journal?: string;
  url?: string;
};

export async function searchDoaj(query: string, limit = 10): Promise<DoajResult[]> {
  const url = `https://doaj.org/api/search/articles/${encodeURIComponent(query)}?pageSize=${limit}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`DOAJ API returned ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { results?: unknown[] };
  const items: unknown[] = data?.results ?? [];

  return items.map((item) => {
    const bibjson = (item as { bibjson?: Record<string, unknown> }).bibjson ?? {};
    const authors = (bibjson.author as { name?: string }[] | undefined) ?? [];
    const links = (bibjson.link as { url?: string; type?: string }[] | undefined) ?? [];
    const fulltextLink = links.find((l) => l.type === "fulltext") ?? links[0];
    return {
      id: String((item as { id?: string }).id ?? ""),
      title: String(bibjson.title ?? "Untitled"),
      author: authors.length ? authors.map((a) => a.name).filter(Boolean).join(", ") : undefined,
      abstract: bibjson.abstract ? String(bibjson.abstract) : undefined,
      journal: (bibjson.journal as { title?: string } | undefined)?.title,
      url: fulltextLink?.url,
    };
  });
}
