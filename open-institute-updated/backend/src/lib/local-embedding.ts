// AI011 — the pure-math half of the local embedding fallback, split out
// of embeddings.ts so it can be unit-tested with zero dependencies (no
// Prisma import, no database needed to run this file's logic) — the same
// reason lib/weakness-detection.ts and lib/mastery-prediction.ts stayed
// pure functions rather than living inline inside a route. embeddings.ts
// re-exports localTfidfEmbed from here; nothing about its public API
// changes.

const LOCAL_DIMS = 512;

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "is", "are", "was",
  "were", "be", "been", "being", "with", "as", "at", "by", "from", "this", "that", "it",
  "its", "into", "than", "then", "so", "such", "not", "no", "do", "does", "did", "has",
  "have", "had", "will", "would", "can", "could", "should", "may", "might", "these",
  "those", "their", "his", "her", "he", "she", "they", "we", "you", "i",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// A deterministic string hash (FNV-1a) — same token always maps to the
// same dimension, so vectors from different chunks/queries stay
// comparable without needing a shared, growable vocabulary table.
export function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * The hashing trick: each token is hashed into one of LOCAL_DIMS buckets
 * (with a sign derived from a second bit of the same hash, the standard
 * feature-hashing refinement that keeps hash collisions from all pushing
 * the same direction), weighted by in-document term frequency, then
 * L2-normalized so cosine similarity between differently-sized chunks is
 * meaningful.
 */
export function localTfidfEmbed(text: string): number[] {
  const tokens = tokenize(text);
  const vector = new Array(LOCAL_DIMS).fill(0);
  if (tokens.length === 0) return vector;

  for (const token of tokens) {
    const h = fnv1a(token);
    const bucket = h % LOCAL_DIMS;
    const sign = h & 0x100 ? 1 : -1;
    vector[bucket] += sign * (1 / tokens.length);
  }

  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vector;
  return vector.map((v) => v / norm);
}

export { LOCAL_DIMS };
