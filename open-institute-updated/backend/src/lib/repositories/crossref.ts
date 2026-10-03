// Crossref's REST API is free, public, and requires no key or registration.
// It resolves DOI-registered scholarly metadata (journal articles, books,
// conference proceedings, datasets) across every field, including business,
// management, and computer science. Including a `mailto` contact param puts
// requests in Crossref's faster "polite pool" — real, documented behaviour,
// not an auth requirement. See https://api.crossref.org/swagger-ui/
//
// Endpoint: GET https://api.crossref.org/works?query=...&rows=...
// Response: { message: { items: [{ DOI, title[], author[], abstract,
//   container-title[], URL }] } }

export type CrossrefResult = {
  doi: string;
  title: string;
  author?: string;
  abstract?: string;
  containerTitle?: string;
  url?: string;
};

export async function searchCrossref(query: string, limit = 10): Promise<CrossrefResult[]> {
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("query", query);
  url.searchParams.set("rows", String(limit));
  // Optional contact email for the polite pool — set CROSSREF_CONTACT_EMAIL
  // to identify this institution's traffic; Crossref works fine without it.
  const contact = process.env.CROSSREF_CONTACT_EMAIL;
  if (contact) url.searchParams.set("mailto", contact);

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Crossref API returned ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { message?: { items?: unknown[] } };
  const items: unknown[] = data?.message?.items ?? [];

  return items.map((item) => {
    const rec = item as Record<string, unknown>;
    const titleArr = (rec.title as string[] | undefined) ?? [];
    const authors = (rec.author as { given?: string; family?: string }[] | undefined) ?? [];
    const containerTitle = (rec["container-title"] as string[] | undefined) ?? [];
    // Crossref sometimes returns an abstract wrapped in JATS XML tags —
    // stripped here to plain text rather than shown with markup.
    const rawAbstract = rec.abstract ? String(rec.abstract).replace(/<[^>]+>/g, "").trim() : undefined;
    return {
      doi: String(rec.DOI ?? ""),
      title: titleArr[0] ?? "Untitled",
      author: authors.length
        ? authors.map((a) => [a.given, a.family].filter(Boolean).join(" ")).join(", ")
        : undefined,
      abstract: rawAbstract || undefined,
      containerTitle: containerTitle[0],
      url: rec.DOI ? `https://doi.org/${rec.DOI}` : (rec.URL as string | undefined),
    };
  });
}
