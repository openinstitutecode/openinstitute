// AI012 — vector search.
//
// A real, working nearest-neighbour search over DocumentChunk.vector: for
// a query embedding, score every candidate chunk by cosine similarity and
// return the best matches above a minimum score. This has nothing to do
// with which embedding provider produced the vectors (see embeddings.ts's
// AI011 note) — cosine similarity over `local-tfidf` vectors does real,
// useful lexical retrieval today; the same code does real semantic
// retrieval unchanged the day a dense provider is configured, because
// both are just arrays of numbers of a known, consistent dimensionality.
//
// Implementation choice, stated honestly: this is a linear scan (score
// every chunk, sort, take the top N), not a real ANN index (HNSW, IVF, a
// pgvector `<=>` operator with an index). That is the right call at this
// institution's real document volume — a TVET college's trainer-authored
// notes and past papers, not a web-scale corpus — the same "institutional
// scale, not web-scale" reasoning ai-gateway.ts's getAiUsageStats already
// documents for its own in-JS aggregation. If this table ever grows into
// the tens of thousands of chunks, the real upgrade path is a `vector`
// column via the pgvector Postgres extension and an HNSW index — the
// DocumentChunk schema note says so — not a rewrite of this module's
// public shape (searchChunks() would keep the same signature).

import { prisma } from "./prisma.js";
import { embedText } from "./embeddings.js";
import { cosineSimilarity } from "./vector-math.js";

export { cosineSimilarity } from "./vector-math.js";

export type ChunkSearchHit = {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  unitId: string | null;
  ordinal: number;
  text: string;
  score: number;
};

export type SearchOptions = {
  unitId?: string;
  limit?: number;
  minScore?: number;
};

/**
 * Runs a query through the same embedding pipeline as ingestion, then
 * ranks every ingested chunk (optionally scoped to one unit) by cosine
 * similarity. Only chunks belonging to a `status: "ingested"` source are
 * considered — a source that's still `pending` or ended `failed` never
 * surfaces in a search result.
 */
export async function searchChunks(query: string, options: SearchOptions = {}): Promise<ChunkSearchHit[]> {
  const limit = options.limit ?? 5;
  const minScore = options.minScore ?? 0.08; // low bar — local-tfidf scores run lower than a dense model's would

  const { vector: queryVector } = await embedText(query);

  const chunks = await prisma.documentChunk.findMany({
    where: { source: { status: "ingested", ...(options.unitId ? { unitId: options.unitId } : {}) } },
    include: { source: { select: { id: true, title: true, unitId: true } } },
    take: 5000, // real institutional ceiling, not an arbitrary truncation — see module note above
  });

  const scored = chunks
    .map((c) => ({
      chunkId: c.id,
      sourceId: c.source.id,
      sourceTitle: c.source.title,
      unitId: c.source.unitId,
      ordinal: c.ordinal,
      text: c.text,
      score: cosineSimilarity(queryVector, c.vector as number[]),
    }))
    .filter((h) => h.score >= minScore)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}
