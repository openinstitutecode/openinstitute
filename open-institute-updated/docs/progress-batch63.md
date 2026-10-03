# Batch 63 progress notes

Scope for this batch, per the brief: an infra-heavy batch — pick up the
items that are blocked on real infrastructure and **write the code
anyway**, documenting precisely where the real boundary sits rather than
leaving the row unbuilt. That's exactly what AI008–012 were: the entire
RAG (retrieval-augmented generation) infrastructure stack, all six rows
marked ⬜ or 🟡 and blocked on "missing embeddings-model credentials" —
the single largest genuinely-infra-blocked cluster left in the audit.

Same investigation discipline as batches 61–62: every module was written
against the real repo (checked `routes/ai.ts`'s actual tutor grounding
chain, `lib/curriculum.ts`'s existing `{title, summary, sourceRef}` shape,
`prisma/schema.prisma`'s existing model patterns) before writing anything,
and every new pure-logic module has a real, run test file — not just
written and assumed correct.

## The honest framing this batch is built around

A trained dense-embedding model (the kind that knows "profit" and "net
income" are the same idea even with zero shared words) genuinely needs a
hosted embeddings API and a credential this sandbox does not have. That
half of AI011 stays blocked — this batch does not, and cannot, pretend
otherwise.

What **was** genuinely infrastructure-independent, and therefore buildable
today with real, working code:

- PDF text extraction — a content-stream parser needs `zlib` (built into
  Node) and regex, not a credentialed model.
- Chunking — pure text processing.
- A **local, deterministic embedding** — a hashed bag-of-words vector is
  real linear algebra, not a neural network, and needs no API key.
- Vector search — cosine similarity over arrays of numbers is math,
  regardless of whether those numbers came from a neural network or a
  hash function.
- The orchestration tying all four together, plus real database storage.

So batch 63 built all five stages as genuinely working code, with the
local embedding as the honest default and a real (if never-executed-here)
dense-provider branch as the documented upgrade path — the same
established pattern this codebase already used for AI025 (a heuristic
trend projection standing in for a trained mastery model) and AI037 (a
regex safety screen standing in for a trained classifier). Nothing here
is a stub; nothing here claims to be more than it is.

## What was built

### AI009 — PDF extraction (`lib/pdf-extract.ts`)
A real, zero-new-dependency PDF content-stream parser using only Node's
built-in `zlib`:
- Finds every `stream...endstream` block, inflates FlateDecode-compressed
  ones (`zlib.inflateSync` — PDF streams use RFC 1950 framing, so no raw-
  deflate handling needed), falls back to treating unfiltered streams as
  already-plain-text.
- Only treats a decoded stream as *content* (as opposed to an image or
  embedded font program that also happens to deflate cleanly) if it
  contains a real `BT...ET` text block — the main defence against ever
  emitting binary garbage as "extracted text".
- Walks the real text-showing operators — `(...) Tj`, `(...) '`,
  `(...) "`, `[...] TJ` (the interleaved-string-and-kerning array form),
  hex-string operands — with real PDF string-escape decoding (`\n \r \t
  \b \f \( \) \\`, octal `\ddd`).
- `Td`/`TD`/`T*`/`ET` become line breaks so output isn't one run-on line.
- Reports `isEncrypted` (via `/Encrypt` in the trailer) and
  `sawAnyContentStream` honestly rather than silently returning empty text
  for either an encrypted PDF or a scanned/image-only one with no real
  text layer — **this is text extraction, not OCR**, and the module's own
  doc comment says so in as many words. CID-keyed/Identity-H embedded
  fonts (a real, separate limitation of not parsing a font's own embedded
  CMap) are named too, not glossed over.

**10/10 unit tests passing**, including a genuine round trip — a real PDF
content stream is built by hand, deflated with Node's own `zlib`, and fed
through the same code path a real uploaded PDF would take — covering
literal strings, `TJ` arrays, escapes, hex strings, uncompressed streams,
encryption detection, and (critically) that random non-text binary
inside a `stream...endstream` block is correctly *not* surfaced as text.

### AI010 — Chunking engine (`lib/chunking.ts`)
Deterministic, paragraph- and sentence-aware chunking with configurable
size and overlap: splits on paragraph breaks first (so a chunk never
silently merges two unrelated paragraphs' first/last sentences), then
packs sentences up to `maxChars`, seeding each new chunk with the tail of
the previous one (`overlapChars`) so retrieval doesn't lose context right
at a boundary. A single sentence-punctuation-free run-on paragraph still
gets hard-wrapped rather than becoming one giant chunk that would skew
similarity scores.

**8/8 unit tests passing** — including one that caught a real test-design
bug during this batch (a `maxChars: 20` test case was small enough to
trigger the hard-wrap path mid-sentence, contradicting what the test was
actually trying to check) and was fixed by actually running the suite,
same discipline batch 62's mastery-prediction tests followed.

### AI011 — Embeddings (`lib/local-embedding.ts` + `lib/embeddings.ts`)
- `localTfidfEmbed()` — a real feature-hashing (hashing-trick) sparse
  vector: each token is hashed (FNV-1a) into one of 512 dimensions with a
  sign bit (the standard refinement that keeps hash collisions from all
  pushing the same direction), weighted by in-document term frequency,
  L2-normalized. Deterministic — the same text always produces the same
  vector, which matters for reproducible search results.
- `embedText()` is the single entry point: resolves the configured
  provider (`EmbeddingConfig`, an AI002-style admin-editable singleton
  row), and for `provider: "openai"` calls a real (never-executed-here, no
  network in this sandbox) `fetch` against `api.openai.com/v1/embeddings`.
  Any failure — no credential, network error, bad response — falls back
  to the local vector rather than failing ingestion, and the *actual*
  provider that produced the vector is what gets recorded on the
  `KnowledgeSource` row, never what was merely requested. Model
  configuration must never be the reason ingestion breaks, same principle
  AI002's `getActiveModelConfig()` established for the chat model.
- Split into a separate zero-dependency file (`local-embedding.ts`) from
  the Prisma-touching config lookup (`embeddings.ts`) specifically so the
  math itself — the part with real correctness risk — could be unit
  tested without a database, the same separation `lib/weakness-
  detection.ts` and `lib/mastery-prediction.ts` already established.

**8/8 unit tests passing**, including determinism, L2-normalization, and
— the test that actually matters for whether this is a useful retrieval
signal at all — that a passage sharing real vocabulary with a query scores
measurably higher than an unrelated one, and near-duplicate passages score
higher against each other than against a different topic.

### AI012 — Vector search (`lib/vector-search.ts` + `lib/vector-math.ts`)
Real cosine-similarity ranking over `DocumentChunk.vector`: embed the
query with the same pipeline as ingestion, score every candidate chunk
(optionally scoped to one unit), filter by a minimum score, return the
top N. Deliberately a linear scan, not an ANN index (HNSW/IVF/pgvector) —
stated as a real, considered choice for this institution's real document
volume (a TVET college's trainer-authored notes, not a web-scale corpus),
the same "institutional scale, not web-scale" reasoning `ai-gateway.ts`'s
`getAiUsageStats` already uses for its own in-JS aggregation, with the
real pgvector/HNSW upgrade path named for if that ever changes.

**8/8 unit tests passing** on the cosine-similarity math itself (identity,
orthogonality, the zero-vector edge case that would otherwise produce
`NaN`).

### AI008 — Document ingestion (`lib/document-ingestion.ts`)
Orchestrates the whole pipeline: `ingestSource()` extracts (PDF via
AI009, or accepts plain text/markdown directly), chunks (AI010), embeds
each chunk (AI011), and stores real `KnowledgeSource` + `DocumentChunk`
rows — with an honest `status: "failed"` and a real, specific
`errorMessage` for every real failure mode (encrypted PDF, scanned PDF
with no text layer, empty/too-short content, a chunking or embedding
error mid-pipeline) rather than a silently-empty success. `reindexSource()`
re-runs chunking+embedding against a source's already-extracted text
without re-uploading — for when chunking parameters or the embedding
provider change later.

`searchIngestedTopics(unitName, question)` returns the exact same
`{title, summary, sourceRef}` shape `lib/curriculum.ts`'s
`findRelevantTopics()`/`getKnowledgeBaseTopics()` already use, specifically
so it could be slotted into `routes/ai.ts`'s tutor grounding chain with no
shape mismatch and no changes needed on the frontend (`AiTutor.tsx`
already renders whatever `sourceRefs` comes back, generically).

### Wiring into the AI tutor (`routes/ai.ts`)
The grounding chain was: QA-approved knowledge base → static
`curriculum.ts` array → library catalogue metadata (titles only, no real
content). This batch inserts real document retrieval between the second
and third steps: if neither the knowledge base nor curriculum.ts has a
match, `searchIngestedTopics()` is tried before falling all the way back
to the library. A failure at this new stage (no ingested sources for the
unit, or the search itself erroring) falls through to the library step
exactly as if the stage didn't exist — it can never block a reply.

### Admin UI (`AdminKnowledgeBase.tsx`)
Extended the existing knowledge-base page (rather than adding a new
route) with a second section: upload a PDF (read client-side as base64 —
this backend has no multipart upload middleware, so it goes over the same
JSON `apiFetch` every other write in this app uses) or paste text/
markdown, see ingestion status and any real failure reason per source,
re-index or delete a source, and a staff-only "test what the tutor would
retrieve" search box so a trainer can sanity-check retrieval quality
against a real question before trusting it in front of students.

## Schema changes

Three new models in `backend/prisma/schema.prisma`: `KnowledgeSource`,
`DocumentChunk` (vector stored as a JSON number array, not a native
`vector` column — this environment has no pgvector extension available to
confirm a migration against, same caveat every schema-touching batch
carries), `EmbeddingConfig`. One new back-relation on `Unit`
(`knowledgeSources`). No changes to any existing model's shape.

## New routes (`routes/knowledge-base.ts`)

- `POST /knowledge-base/sources` — ingest (TRAINER/SUPER_ADMIN)
- `GET /knowledge-base/sources`, `GET /knowledge-base/sources/:id`
- `POST /knowledge-base/sources/:id/reindex` (TRAINER/QA_OFFICER/SUPER_ADMIN)
- `DELETE /knowledge-base/sources/:id`
- `POST /knowledge-base/sources/search` — staff-only retrieval test bench
- `GET`/`PATCH /knowledge-base/embedding-config` — PATCH is SUPER_ADMIN only,
  same AI002-established pattern of read access wider than write access

## Zero new dependencies

Every new module uses only Node's standard library (`node:zlib`) plus
what was already in `backend/package.json` (`express`, `zod`,
`@prisma/client`). This was a deliberate choice, not an accident — this
sandbox has no network access to run `npm install`, so anything requiring
a new package (a real PDF-parsing library, a local ML embedding model)
could be written but never verified end-to-end here. Writing the
extraction and embedding logic directly against built-in Node instead
meant every new pure-logic module could actually be run and tested this
session, same as every batch before this one has prioritized.

## IMPORTANT — what has and has not been verified

Same sandbox constraints as every prior batch: no network, no Docker, no
Postgres, no Node dependencies installed beyond what batch 1 already had
(`backend/node_modules` is still empty for anything not already present),
so `npm install`/`prisma generate`/`prisma db push` could not be run, and
neither could a real `tsc` type-check. What *was* actually run:

- Every new/edited backend `.ts` file syntax-checked with
  `node --experimental-strip-types --check` — passes on all nine files
  touched or added this batch.
- `AdminKnowledgeBase.tsx` bundle-checked with the `esbuild` binary
  bundled inside the globally-installed `tsx` package (same approach
  batches 60–62 used) — passes cleanly.
- Three new test files, **26/26 tests passing**, actually run with
  `tsx --test`, not just written and assumed correct:
  - `tests/pdf-extract.test.ts` (10/10) — including a real deflated-
    content-stream round trip built by hand with Node's own `zlib`.
  - `tests/chunking.test.ts` (8/8) — one test's initial `maxChars` value
    was too small and hit an unrelated code path (the hard-wrap
    fallback); caught and fixed by running the suite, not by inspection.
  - `tests/embeddings-and-vector-search.test.ts` (8/8) — against
    `local-embedding.ts` and `vector-math.ts` specifically (the pure-math
    files split out of `embeddings.ts`/`vector-search.ts` for exactly
    this reason: testing them without a database).
- The full existing backend test suite was re-run after these changes:
  **84/85 passing**. The one failure (`tests/tp-libs.test.ts`) is
  pre-existing and unrelated to this batch — it fails on
  `Cannot find package 'zod'` when resolving `lib/lesson-blocks.ts`, a
  file this batch never touched; it is the same "dependency not installed
  in this sandbox" constraint as everything else here, not a regression.
- `ingestSource()`, `reindexSource()`, the new routes, and
  `searchIngestedTopics()`'s wiring into `routes/ai.ts` all touch Prisma
  and have **not** run against a real database in this session — same
  "unverified until first real boot" caveat every schema-touching batch
  before this one has carried. The `try/catch` fallbacks in
  `getActiveEmbeddingConfig()` and `searchIngestedTopics()` exist
  specifically so a migration that hasn't been applied yet doesn't take
  down the tutor or the rest of the AI surface.
- The `openai` branch of `embeddings.ts` has never executed against a
  real API key — no network access in this sandbox, same constraint the
  `ANTHROPIC_API_KEY` path in `ai-gateway.ts` has always carried. The
  request shape, error handling, and fallback logic were written and
  reviewed carefully, but "works against a real OpenAI account" is
  asserted here, not independently verified this session.

## What's still open after this batch

- The one real remaining piece of AI007/AI011: true dense-embeddings
  semantic retrieval. The pipeline that would carry it end to end is now
  fully built and would need zero further code changes to use it — only
  a real embeddings-API credential and `EmbeddingConfig.provider` set to
  `"openai"` (or a future second provider branch, same real-seam pattern
  `AI_PROVIDER` already established for the chat model in AI003).
- AI033 (AI viva) — unchanged, needs real conversational speech
  infrastructure.
- AI003 (a second *chat-model* provider) — unchanged, real seam, no
  second provider's credentials to implement against.
- AI014 (full-course AI delivery) — unchanged, a real separate
  lesson-planning-engine scope, not a wiring gap.
- SP034/FN006/FN007 (M-Pesa/Daraja) — needs real production credentials.
- EX013–015 (deliberately-scoped permanent exam-security limits, not
  gaps).

None of the above should be read as done. Full current counts are at the
bottom of `docs/feature-audit-400.md`.
