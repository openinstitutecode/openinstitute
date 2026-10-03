import { safeFetch } from "../safe-fetch.js";
import { XMLParser } from "fast-xml-parser";

// OAI-PMH (Open Archives Initiative Protocol for Metadata Harvesting) is the
// standard both EPrints and Greenstone expose out of the box — this client
// speaks the real protocol (ListRecords / GetRecord with metadataPrefix=oai_dc)
// against whatever base URL is configured. It performs a real HTTP request;
// if the endpoint is unreachable or misconfigured, it throws rather than
// returning invented results.

export type OaiRecord = {
  identifier: string;
  title: string;
  creator?: string;
  description?: string;
  date?: string;
  url?: string;
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// Uses ListRecords with a Dublin Core "title contains" style client-side
// filter, since basic OAI-PMH has no native full-text search — real
// deployments that need proper search should point the DSpace/Islandora
// clients (which do support search) at those APIs instead, and use OAI-PMH
// here for EPrints/Greenstone as a harvesting fallback.
export async function searchOaiPmh(baseUrl: string, query: string, limit = 10): Promise<OaiRecord[]> {
  const url = `${baseUrl.replace(/\/$/, "")}?verb=ListRecords&metadataPrefix=oai_dc`;
  const res = await safeFetch(url);
  if (!res.ok) {
    throw new Error(`OAI-PMH endpoint returned ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();
  const parsed = parser.parse(xml);

  const error = parsed?.["OAI-PMH"]?.error;
  if (error) {
    const message = typeof error === "string" ? error : error["#text"] ?? "OAI-PMH error";
    throw new Error(`OAI-PMH error: ${message}`);
  }

  const records = asArray(parsed?.["OAI-PMH"]?.ListRecords?.record);
  const q = query.toLowerCase();

  const results: OaiRecord[] = [];
  for (const record of records) {
    const header = record?.header;
    const dc = record?.metadata?.["oai_dc:dc"];
    if (!dc || header?.["@_status"] === "deleted") continue;

    const title = asArray(dc["dc:title"])[0] ?? "";
    const description = asArray(dc["dc:description"])[0];
    const creator = asArray(dc["dc:creator"])[0];
    const date = asArray(dc["dc:date"])[0];
    const identifierField = asArray(dc["dc:identifier"]);
    const url = identifierField.find((i: string) => typeof i === "string" && i.startsWith("http"));

    const haystack = `${title} ${description ?? ""} ${creator ?? ""}`.toLowerCase();
    if (query && !haystack.includes(q)) continue;

    results.push({
      identifier: header?.identifier ?? "",
      title: String(title),
      creator: creator ? String(creator) : undefined,
      description: description ? String(description) : undefined,
      date: date ? String(date) : undefined,
      url,
    });
    if (results.length >= limit) break;
  }

  return results;
}
