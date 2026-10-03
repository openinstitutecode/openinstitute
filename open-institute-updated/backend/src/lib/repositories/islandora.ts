import { safeFetch } from "../safe-fetch.js";
// Islandora runs on Drupal + Fedora, and Drupal's built-in JSON:API module
// (enabled by default on modern Islandora installs) is the real, documented
// way to query content programmatically — no separate Islandora-specific API
// needed. See https://www.drupal.org/docs/core-modules-and-themes/core-modules/jsonapi-module

export type IslandoraResult = {
  id: string;
  title: string;
  url?: string;
};

export async function searchIslandora(
  baseUrl: string,
  query: string,
  limit = 10
): Promise<IslandoraResult[]> {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/jsonapi/node/islandora_object`);
  url.searchParams.set("filter[title][operator]", "CONTAINS");
  url.searchParams.set("filter[title][value]", query);
  url.searchParams.set("page[limit]", String(limit));

  const res = await safeFetch(url.toString(), {
    headers: { Accept: "application/vnd.api+json" },
  });
  if (!res.ok) {
    throw new Error(`Islandora (Drupal JSON:API) returned ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { data?: unknown[] };

  const items: unknown[] = data?.data ?? [];
  return items.map((item) => {
    const attrs = (item as { attributes?: Record<string, unknown> }).attributes ?? {};
    return {
      id: String((item as { id?: string }).id ?? ""),
      title: String(attrs.title ?? "Untitled"),
      url: attrs.path && typeof attrs.path === "object"
        ? `${baseUrl.replace(/\/$/, "")}${(attrs.path as { alias?: string }).alias ?? ""}`
        : undefined,
    };
  });
}
