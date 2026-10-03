// The Internet Archive's Advanced Search API is free and requires no key
// or registration (confirmed at https://archive.org/advancedsearch.php —
// public JSON endpoint). Scoped here to its texts/books collection, which
// includes a large volume of public-domain and openly licensed business,
// management, and computing/ICT textbooks — useful e-book coverage the
// journal-focused connectors above don't provide.
//
// Endpoint: GET https://archive.org/advancedsearch.php?q=...&output=json
// Response: { response: { docs: [{ identifier, title, creator, description }] } }

export type InternetArchiveResult = {
  id: string;
  title: string;
  author?: string;
  description?: string;
  url: string;
};

export async function searchInternetArchive(query: string, limit = 10): Promise<InternetArchiveResult[]> {
  const url = new URL("https://archive.org/advancedsearch.php");
  url.searchParams.set("q", `(${query}) AND mediatype:texts`);
  url.searchParams.set("fl[]", "identifier");
  url.searchParams.append("fl[]", "title");
  url.searchParams.append("fl[]", "creator");
  url.searchParams.append("fl[]", "description");
  url.searchParams.set("rows", String(limit));
  url.searchParams.set("output", "json");

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Internet Archive API returned ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { response?: { docs?: unknown[] } };
  const docs: unknown[] = data?.response?.docs ?? [];

  return docs.map((doc) => {
    const rec = doc as Record<string, unknown>;
    const identifier = String(rec.identifier ?? "");
    const creator = rec.creator;
    const description = rec.description;
    return {
      id: identifier,
      title: String(rec.title ?? "Untitled"),
      author: Array.isArray(creator) ? creator.join(", ") : creator ? String(creator) : undefined,
      description: Array.isArray(description) ? description.join(" ") : description ? String(description) : undefined,
      url: `https://archive.org/details/${identifier}`,
    };
  });
}
