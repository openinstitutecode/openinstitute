import { XMLParser } from "fast-xml-parser";

// arXiv's API is free and requires no registration or API key (confirmed in
// arXiv's own API docs at https://arxiv.org/help/api/index). It's the
// standout ICT source here: arXiv's cs.* categories (cs.AI, cs.SE, cs.CR,
// cs.DB, cs.NI, ...) cover almost every ICT/computer-science topic this
// college teaches, with full preprint text linked, not just metadata.
//
// Endpoint: GET http://export.arxiv.org/api/query?search_query=all:...
// Response: Atom XML feed, one <entry> per result.

export type ArxivResult = {
  id: string;
  title: string;
  author?: string;
  summary?: string;
  url?: string;
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export async function searchArxiv(query: string, limit = 10): Promise<ArxivResult[]> {
  const url = new URL("http://export.arxiv.org/api/query");
  url.searchParams.set("search_query", `all:${query}`);
  url.searchParams.set("max_results", String(limit));

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`arXiv API returned ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();
  const parsed = parser.parse(xml);
  const entries = asArray(parsed?.feed?.entry);

  return entries.map((entry) => {
    const authors = asArray(entry?.author).map((a: { name?: string }) => a?.name).filter(Boolean);
    const links = asArray(entry?.link);
    const htmlLink = links.find((l: { "@_rel"?: string }) => l["@_rel"] === "alternate");
    return {
      id: String(entry?.id ?? ""),
      title: String(entry?.title ?? "Untitled").replace(/\s+/g, " ").trim(),
      author: authors.length ? authors.join(", ") : undefined,
      summary: entry?.summary ? String(entry.summary).replace(/\s+/g, " ").trim() : undefined,
      url: htmlLink?.["@_href"] ?? entry?.id,
    };
  });
}
