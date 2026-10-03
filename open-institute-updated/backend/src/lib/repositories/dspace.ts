import { safeFetch } from "../safe-fetch.js";
// DSpace 7+ exposes a real JSON REST API at /server/api. This calls its
// Discovery search endpoint directly — no invented schema. See:
// https://github.com/DSpace/RestContract/blob/main/search.md

export type DspaceResult = {
  id: string;
  title: string;
  handle?: string;
  url?: string;
};

export async function searchDspace(baseUrl: string, query: string, limit = 10): Promise<DspaceResult[]> {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/server/api/discover/search/objects`);
  url.searchParams.set("query", query);
  url.searchParams.set("size", String(limit));
  url.searchParams.set("dsoType", "item");

  const res = await safeFetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`DSpace API returned ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { _embedded?: { searchResult?: { _embedded?: { objects?: unknown[] } } } };

  const objects: unknown[] = data?._embedded?.searchResult?._embedded?.objects ?? [];

  return objects.map((o) => {
    const item = (o as { _embedded?: { indexableObject?: Record<string, unknown> } })._embedded
      ?.indexableObject;
    const metadata = (item?.metadata ?? {}) as Record<string, { value: string }[]>;
    const title = metadata["dc.title"]?.[0]?.value ?? "Untitled";
    const handle = item?.handle as string | undefined;
    return {
      id: String(item?.id ?? ""),
      title,
      handle,
      url: handle ? `${baseUrl.replace(/\/$/, "")}/handle/${handle}` : undefined,
    };
  });
}
