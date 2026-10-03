# Digital library: external repository integration

The library module federates search across the college's own catalogue
(`LibraryResource` table) and up to four external repository platforms.
Each connector speaks that platform's real, documented API — nothing here
is a mock protocol.

## Supported platforms

| Platform | Protocol used | Env var | Notes |
|---|---|---|---|
| DSpace (7+) | REST Discovery API (`/server/api/discover/search/objects`) | `DSPACE_BASE_URL` | JSON, supports real full-text search server-side. |
| EPrints | OAI-PMH (`ListRecords`, `metadataPrefix=oai_dc`) | `EPRINTS_OAI_URL` | Point at the repository's `/cgi/oai2` endpoint. Search is filtered client-side (OAI-PMH has no native query param). |
| Islandora | Drupal JSON:API (`/jsonapi/node/islandora_object`) | `ISLANDORA_BASE_URL` | Requires the site's JSON:API module enabled (default on modern Islandora) and anonymous read access, or a service account token added to the fetch call in `islandora.ts`. |
| Greenstone | OAI-PMH | `GREENSTONE_OAI_URL` | Point at the collection's OAI interface, typically `/greenstone3/oai`. |

## How it behaves

- Nothing is queried unless its env var is set — an institution using only
  DSpace sees only DSpace results alongside the internal catalogue.
- `GET /api/library/federated?q=...` returns both `results` (merged,
  tagged by `source`) and `statuses` (per-repository: configured, reachable,
  and any error) — so a broken connector is visible to whoever's debugging
  it, not silently empty.
- A repository being unreachable never breaks the internal catalogue search;
  each connector is wrapped independently.

## Batch 54 — public free APIs (no institutional deployment needed)

The four platforms above all require the *institution* to already be
running that repository software somewhere. Batch 54 adds five more
sources that are just publicly available APIs — nothing to install, and
four of them need no key at all. Chosen because this college teaches
Business and ICT: DOAJ/Crossref cover business, management, and economics
journals broadly; arXiv covers ICT/computer science specifically; CORE and
Internet Archive add open-access full text and e-books respectively.

| Platform | Protocol used | Env var | Key needed? |
|---|---|---|---|
| DOAJ (Directory of Open Access Journals) | REST (`/api/search/articles/{q}`) | `LIBRARY_DISABLE_DOAJ` to opt out | No — fully public |
| Crossref | REST (`/works?query=`) | `LIBRARY_DISABLE_CROSSREF`, optional `CROSSREF_CONTACT_EMAIL` | No — fully public |
| arXiv | Atom/XML (`export.arxiv.org/api/query`) | `LIBRARY_DISABLE_ARXIV` to opt out | No — fully public |
| CORE | REST (`api.core.ac.uk/v3/search/works`) | `CORE_API_KEY` | **Yes** — free signup at core.ac.uk/services/api |
| Internet Archive | REST (`archive.org/advancedsearch.php`) | `LIBRARY_DISABLE_INTERNET_ARCHIVE` to opt out | No — fully public |

Source code: `backend/src/lib/repositories/{doaj,crossref,arxiv,core,internet-archive}.ts`.

Unlike the four institution-hosted connectors, these five are **on by
default** — nothing to configure to get real results, since none of them
belong to an institution that has to opt in. CORE is the only one where
"remaining work" is genuinely just entering a key: register for free,
paste it into `CORE_API_KEY`, done.

These five also return a real `abstract`/`summary` field from their own
APIs (the institution-hosted connectors above generally don't). That's
what powers LB020 (`POST /ai/literature-summary`) — a literature-review
summarizer grounded ONLY in abstracts actually fetched at request time,
never in a resource's full body, which this platform never downloads or
stores. See the route's comment in `backend/src/routes/ai.ts` for the
exact grounding rule enforced in the prompt.

## What's not done here

- Authentication against a private/restricted repository — the Islandora and
  DSpace clients call public read endpoints. Add a bearer token or API key
  header in the relevant `fetch` call in `backend/src/lib/repositories/` if
  your instance requires one.
- Bulk harvesting/indexing into the local catalogue — this is live federated
  search on every request, not a sync job. For a large EPrints/Greenstone
  archive, a scheduled OAI-PMH harvest into `LibraryResource` would perform
  better than querying live on each search; that harvester isn't built yet.
- Full-text content proxying — results link out to the source repository's
  own item page rather than serving the file through this platform.
- LB003 (semantic search) — search is still keyword/substring matching
  (`ILIKE` on the internal catalogue; each external API's own keyword
  search). True semantic search needs a vector embedding model and an
  embeddings index (e.g. pgvector) — real infrastructure this batch didn't
  add, not a config flag. The closest existing thing is LB036's AI
  librarian, which understands a natural-language question but still
  matches it against the catalogue by keyword under the hood.
- LB004 (full-text search) — CORE genuinely searches full text server-side
  (it indexes the actual paper body, not just metadata), so it's the one
  source where LB004 is real today. The internal `LibraryResource` table
  has no content field, so the college's own catalogue still can't be
  full-text searched; that would need the file content stored and indexed
  (e.g. Postgres `tsvector` over extracted text), not built here.
- LB011/LB012 (PDF viewer/annotation) — not built this batch. Out of scope
  for "which free library APIs exist" — these need a PDF rendering/
  annotation library wired into the frontend and, for annotation, a place
  to persist annotations, independent of which repositories are searched.
