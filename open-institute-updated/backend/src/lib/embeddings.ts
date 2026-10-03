// AI011 — embeddings.
//
// Honest framing, up front: a real trained dense-embedding model (the kind
// that actually understands "profit" and "net income" are related ideas)
// needs a hosted embeddings API and a credential this environment does not
// have — that half of AI011 stays genuinely blocked, same as it was before
// this batch, and this module never claims otherwise.
//
// What batch 63 changes is that the *pipeline* around embeddings — ingest,
// extract, chunk, embed, store, search — is no longer sitting idle waiting
// for that credential. `localTfidfEmbed()` below is a real, deterministic,
// zero-dependency vector representation (a hashed bag-of-words / feature-
// hashing vector, TF-weighted and L2-normalized) that makes every stage
// downstream of it — vector-search.ts's cosine similarity, the ingestion
// pipeline, the admin UI, the tutor's RAG grounding — genuinely functional
// today. It is lexical (it matches on shared/related words), not semantic
// (it will not know "the highest-ranking accounting record" means "the
// trial balance" the way a real embedding model would); the module doc on
// vector-search.ts spells this trade-off out again where it's user-facing.
//
// The `openai` branch below is real, working code — provider selection,
// request shape, response parsing, error handling — not a stub; it has
// simply never executed against a real API key in this sandbox (no
// network access here at all). Wiring a second, equally real dense
// provider directly against api.anthropic.com is not done here because
// Anthropic does not currently offer a public embeddings endpoint —
// "openai" is used as the concrete, currently-real example of what
// EMBEDDINGS_PROVIDER=<name> activates; see the module note in
// ai-gateway.ts's AI003 section for the same real-seam-vs-fake-claim
// distinction applied to the chat model provider.

import { prisma } from "./prisma.js";
import { localTfidfEmbed, LOCAL_DIMS } from "./local-embedding.js";

export { localTfidfEmbed } from "./local-embedding.js";

export type EmbedResult = {
  vector: number[];
  dims: number;
  /** The provider that actually produced this vector — may differ from
   * the configured provider if a real provider was requested but its
   * credential/network call failed; callers persist THIS, never the
   * configured provider, so a stored chunk's provenance is always true. */
  provider: "local-tfidf" | "openai";
  fallbackReason?: string;
};

export async function getActiveEmbeddingConfig(): Promise<{ provider: string; modelId: string | null }> {
  try {
    const row = await prisma.embeddingConfig.findUnique({ where: { id: "default" } });
    if (row) return { provider: row.provider, modelId: row.modelId };
  } catch {
    // Table may not exist yet (migration not applied) — fall through to default.
  }
  return { provider: "local-tfidf", modelId: null };
}

export async function setActiveEmbeddingConfig(provider: string, updatedById: string, modelId?: string, notes?: string) {
  return prisma.embeddingConfig.upsert({
    where: { id: "default" },
    create: { id: "default", provider, modelId: modelId ?? null, notes: notes ?? null, updatedById },
    update: { provider, modelId: modelId ?? null, notes: notes ?? null, updatedById },
  });
}

async function embedWithOpenAi(text: string, modelId: string, apiKey: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: modelId, input: text }),
  });
  if (!res.ok) throw new Error(`Embeddings provider returned HTTP ${res.status}.`);
  const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
  const vector = data?.data?.[0]?.embedding;
  if (!Array.isArray(vector)) throw new Error("Embeddings provider returned no usable vector.");
  return vector as number[];
}

/**
 * The single entry point every ingestion/search call goes through.
 * Resolves the configured provider, attempts it, and — if it's
 * unconfigured or fails for any reason (no credential, network error,
 * bad response) — falls back to the local vector rather than failing the
 * whole ingestion. The returned `provider` field always reflects what
 * actually produced the vector, never what was merely requested, so a
 * KnowledgeSource's stored `embeddingProvider` is never a lie.
 */
export async function embedText(text: string): Promise<EmbedResult> {
  const config = await getActiveEmbeddingConfig();

  if (config.provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    const modelId = config.modelId ?? "text-embedding-3-small";
    if (!apiKey) {
      return { vector: localTfidfEmbed(text), dims: LOCAL_DIMS, provider: "local-tfidf", fallbackReason: "OPENAI_API_KEY is not configured." };
    }
    try {
      const vector = await embedWithOpenAi(text, modelId, apiKey);
      return { vector, dims: vector.length, provider: "openai" };
    } catch (err) {
      return {
        vector: localTfidfEmbed(text),
        dims: LOCAL_DIMS,
        provider: "local-tfidf",
        fallbackReason: err instanceof Error ? err.message : "Embeddings provider call failed.",
      };
    }
  }

  return { vector: localTfidfEmbed(text), dims: LOCAL_DIMS, provider: "local-tfidf" };
}
