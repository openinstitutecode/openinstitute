import { searchInternalCatalogue } from "./internal-fulltext.js";
import { searchOaiPmh } from "./oai-pmh.js";
import { searchDspace } from "./dspace.js";
import { searchIslandora } from "./islandora.js";
import { searchDoaj } from "./doaj.js";
import { searchCrossref } from "./crossref.js";
import { searchArxiv } from "./arxiv.js";
import { searchCore } from "./core.js";
import { searchInternetArchive } from "./internet-archive.js";

export type FederatedSource =
  | "internal"
  | "dspace"
  | "eprints"
  | "islandora"
  | "greenstone"
  | "doaj"
  | "crossref"
  | "arxiv"
  | "core"
  | "internet_archive";

export type FederatedResult = {
  source: FederatedSource;
  id?: string; // only present for internal-catalogue results (bookmarkable)
  title: string;
  author?: string;
  url?: string;
  // Real abstract/summary text as returned by the source API itself (DOAJ,
  // Crossref, arXiv, CORE, and Internet Archive all return one). Used by
  // LB020's literature summarizer, which is only ever grounded in text
  // actually retrieved here — never the resource's full body, which this
  // platform does not fetch or store.
  abstract?: string;
  // Internal-catalogue only (LB005–010): the resource's own type and any
  // type-scoped fields a librarian recorded for it.
  resourceType?: string;
  metadata?: Record<string, unknown>;
  raw?: unknown;
};

export type RepositoryStatus = {
  source: FederatedSource;
  configured: boolean;
  ok: boolean | null; // null = not checked (not configured, or a no-key source skipped on an empty status ping)
  error?: string;
};

// Institution-configured repositories (DSpace/EPrints/Islandora/Greenstone)
// stay opt-in via their own env var, unchanged from Batch 53. Batch 54 adds
// five real, publicly documented digital-library/scholarly APIs that need
// no institutional deployment of their own — four are free with no key at
// all (DOAJ, Crossref, arXiv, Internet Archive); CORE is free but requires
// a personal API key from https://core.ac.uk/services/api, set as
// CORE_API_KEY. Any of the five can be turned off per-institution with its
// own LIBRARY_DISABLE_* flag if a college wants a narrower default search.
// Every source is wrapped independently, same as Batch 53: one failing or
// rate-limited connector never breaks the others or the internal catalogue.
export async function federatedLibrarySearch(query: string): Promise<{
  results: FederatedResult[];
  statuses: RepositoryStatus[];
}> {
  const statuses: RepositoryStatus[] = [];
  const results: FederatedResult[] = [];

  // Internal catalogue — always searched. LB003/LB004: real Postgres
  // full-text search (title/author/subject/content), not a second layer of
  // `contains` — see internal-fulltext.ts for what "real" means here.
  const internal = await searchInternalCatalogue(query, 20);
  results.push(
    ...internal.map((r) => ({
      source: "internal" as const,
      id: r.id,
      title: r.title,
      author: r.author ?? undefined,
      url: r.externalUrl ?? undefined,
      // Type/metadata/abstract-snippet let the UI render LB005–010's
      // per-type fields for internal results only — external sources keep
      // their own shape and are never given a fabricated type.
      resourceType: r.type,
      metadata: (r.metadata as Record<string, unknown> | null) ?? undefined,
      abstract: r.content ? r.content.slice(0, 400) : undefined,
    }))
  );

  const dspaceUrl = process.env.DSPACE_BASE_URL;
  statuses.push({ source: "dspace", configured: Boolean(dspaceUrl), ok: null });
  if (dspaceUrl) {
    try {
      const items = await searchDspace(dspaceUrl, query);
      results.push(...items.map((i) => ({ source: "dspace" as const, title: i.title, url: i.url })));
      statuses[statuses.length - 1].ok = true;
    } catch (err) {
      statuses[statuses.length - 1].ok = false;
      statuses[statuses.length - 1].error = err instanceof Error ? err.message : "Unknown error";
    }
  }

  const eprintsOaiUrl = process.env.EPRINTS_OAI_URL;
  statuses.push({ source: "eprints", configured: Boolean(eprintsOaiUrl), ok: null });
  if (eprintsOaiUrl) {
    try {
      const items = await searchOaiPmh(eprintsOaiUrl, query);
      results.push(
        ...items.map((i) => ({ source: "eprints" as const, title: i.title, author: i.creator, url: i.url }))
      );
      statuses[statuses.length - 1].ok = true;
    } catch (err) {
      statuses[statuses.length - 1].ok = false;
      statuses[statuses.length - 1].error = err instanceof Error ? err.message : "Unknown error";
    }
  }

  const islandoraUrl = process.env.ISLANDORA_BASE_URL;
  statuses.push({ source: "islandora", configured: Boolean(islandoraUrl), ok: null });
  if (islandoraUrl) {
    try {
      const items = await searchIslandora(islandoraUrl, query);
      results.push(...items.map((i) => ({ source: "islandora" as const, title: i.title, url: i.url })));
      statuses[statuses.length - 1].ok = true;
    } catch (err) {
      statuses[statuses.length - 1].ok = false;
      statuses[statuses.length - 1].error = err instanceof Error ? err.message : "Unknown error";
    }
  }

  const greenstoneOaiUrl = process.env.GREENSTONE_OAI_URL;
  statuses.push({ source: "greenstone", configured: Boolean(greenstoneOaiUrl), ok: null });
  if (greenstoneOaiUrl) {
    try {
      const items = await searchOaiPmh(greenstoneOaiUrl, query);
      results.push(
        ...items.map((i) => ({ source: "greenstone" as const, title: i.title, author: i.creator, url: i.url }))
      );
      statuses[statuses.length - 1].ok = true;
    } catch (err) {
      statuses[statuses.length - 1].ok = false;
      statuses[statuses.length - 1].error = err instanceof Error ? err.message : "Unknown error";
    }
  }

  // --- Batch 54: free digital-library / scholarly-metadata connectors ---

  const doajEnabled = process.env.LIBRARY_DISABLE_DOAJ !== "true";
  statuses.push({ source: "doaj", configured: doajEnabled, ok: null });
  if (doajEnabled && query) {
    try {
      const items = await searchDoaj(query);
      results.push(
        ...items.map((i) => ({
          source: "doaj" as const,
          title: i.title,
          author: i.author,
          abstract: i.abstract,
          url: i.url,
        }))
      );
      statuses[statuses.length - 1].ok = true;
    } catch (err) {
      statuses[statuses.length - 1].ok = false;
      statuses[statuses.length - 1].error = err instanceof Error ? err.message : "Unknown error";
    }
  }

  const crossrefEnabled = process.env.LIBRARY_DISABLE_CROSSREF !== "true";
  statuses.push({ source: "crossref", configured: crossrefEnabled, ok: null });
  if (crossrefEnabled && query) {
    try {
      const items = await searchCrossref(query);
      results.push(
        ...items.map((i) => ({
          source: "crossref" as const,
          title: i.title,
          author: i.author,
          abstract: i.abstract,
          url: i.url,
        }))
      );
      statuses[statuses.length - 1].ok = true;
    } catch (err) {
      statuses[statuses.length - 1].ok = false;
      statuses[statuses.length - 1].error = err instanceof Error ? err.message : "Unknown error";
    }
  }

  const arxivEnabled = process.env.LIBRARY_DISABLE_ARXIV !== "true";
  statuses.push({ source: "arxiv", configured: arxivEnabled, ok: null });
  if (arxivEnabled && query) {
    try {
      const items = await searchArxiv(query);
      results.push(
        ...items.map((i) => ({
          source: "arxiv" as const,
          title: i.title,
          author: i.author,
          abstract: i.summary,
          url: i.url,
        }))
      );
      statuses[statuses.length - 1].ok = true;
    } catch (err) {
      statuses[statuses.length - 1].ok = false;
      statuses[statuses.length - 1].error = err instanceof Error ? err.message : "Unknown error";
    }
  }

  const coreApiKey = process.env.CORE_API_KEY;
  statuses.push({ source: "core", configured: Boolean(coreApiKey), ok: null });
  if (coreApiKey && query) {
    try {
      const items = await searchCore(coreApiKey, query);
      results.push(
        ...items.map((i) => ({
          source: "core" as const,
          title: i.title,
          author: i.author,
          abstract: i.abstract,
          url: i.url,
        }))
      );
      statuses[statuses.length - 1].ok = true;
    } catch (err) {
      statuses[statuses.length - 1].ok = false;
      statuses[statuses.length - 1].error = err instanceof Error ? err.message : "Unknown error";
    }
  }

  const iaEnabled = process.env.LIBRARY_DISABLE_INTERNET_ARCHIVE !== "true";
  statuses.push({ source: "internet_archive", configured: iaEnabled, ok: null });
  if (iaEnabled && query) {
    try {
      const items = await searchInternetArchive(query);
      results.push(
        ...items.map((i) => ({
          source: "internet_archive" as const,
          title: i.title,
          author: i.author,
          abstract: i.description,
          url: i.url,
        }))
      );
      statuses[statuses.length - 1].ok = true;
    } catch (err) {
      statuses[statuses.length - 1].ok = false;
      statuses[statuses.length - 1].error = err instanceof Error ? err.message : "Unknown error";
    }
  }

  return { results, statuses };
}
