// AI010 — chunking engine.
//
// Splits extracted document text into overlapping, sentence-aware chunks
// sized for retrieval (small enough that a single chunk is a focused,
// on-topic passage to hand the tutor as grounding; not so small that a
// sentence gets cut mid-thought). Purely deterministic text processing —
// no model, no credentials, nothing infrastructure-dependent — which is
// exactly why this stage (unlike AI011's embedding stage) has no honest
// "needs infra" caveat at all: it's real, complete, and fully testable
// today.

export type Chunk = {
  ordinal: number;
  text: string;
  charStart: number;
  charEnd: number;
};

export type ChunkingOptions = {
  /** Target maximum size of a chunk, in characters. */
  maxChars?: number;
  /** How much of the end of one chunk is repeated at the start of the
   * next, in characters — gives the embedding/retrieval step some shared
   * context across a chunk boundary instead of a hard cut. */
  overlapChars?: number;
};

const DEFAULT_MAX_CHARS = 1200; // ≈ 200–300 words, a reasonable single-topic passage
const DEFAULT_OVERLAP_CHARS = 150;

// Splits on sentence-ending punctuation followed by whitespace and a
// capital letter/digit/opening quote — deliberately conservative so it
// doesn't fire on abbreviations like "e.g." or "Mr." as often (it still
// will occasionally; that's a real, documented limitation of a regex
// sentence splitter without a trained sentence-boundary model, and one
// extra sentence break costs nothing here since sentences are re-packed
// into chunks immediately after).
const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z0-9"'“(])/g;

function splitIntoSentences(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (normalized.length === 0) return [];
  // Keep paragraph breaks as their own boundary so a chunk never silently
  // merges two unrelated paragraphs' first/last sentences together.
  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const sentences: string[] = [];
  for (const para of paragraphs) {
    const parts = para.split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean);
    sentences.push(...(parts.length > 0 ? parts : [para]));
  }
  return sentences;
}

/**
 * Packs sentences into chunks up to `maxChars`, each new chunk seeded with
 * the last `overlapChars` worth of the previous chunk's text so retrieval
 * doesn't lose context right at a chunk boundary.
 */
export function chunkText(text: string, options: ChunkingOptions = {}): Chunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = Math.min(options.overlapChars ?? DEFAULT_OVERLAP_CHARS, Math.floor(maxChars / 2));

  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) return [];

  const chunks: Chunk[] = [];
  let current = "";
  let ordinal = 0;
  let charStart = 0;
  let cursor = 0; // running offset into the (whitespace-normalized) source text

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed.length > 0) {
      chunks.push({ ordinal, text: trimmed, charStart, charEnd: charStart + trimmed.length });
      ordinal++;
    }
  };

  for (const sentence of sentences) {
    const candidate = current.length > 0 ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxChars && current.length > 0) {
      flush();
      // Seed the next chunk with the trailing `overlapChars` of the chunk
      // just flushed, so shared context survives the boundary.
      const tail = current.slice(Math.max(0, current.length - overlapChars)).trim();
      current = tail.length > 0 ? `${tail} ${sentence}` : sentence;
      charStart = cursor - tail.length;
    } else {
      current = candidate;
    }
    cursor += sentence.length + 1;
  }
  flush();

  // A single oversized "sentence" (e.g. a run-on paragraph with no
  // detected punctuation) can still exceed maxChars — hard-wrap it rather
  // than silently emitting one giant chunk that skews similarity scores.
  const result: Chunk[] = [];
  let nextOrdinal = 0;
  for (const c of chunks) {
    if (c.text.length <= maxChars * 1.5) {
      result.push({ ...c, ordinal: nextOrdinal++ });
      continue;
    }
    for (let i = 0; i < c.text.length; i += maxChars - overlapChars) {
      const slice = c.text.slice(i, i + maxChars).trim();
      if (slice.length === 0) continue;
      result.push({ ordinal: nextOrdinal++, text: slice, charStart: c.charStart + i, charEnd: c.charStart + i + slice.length });
    }
  }

  return result;
}
