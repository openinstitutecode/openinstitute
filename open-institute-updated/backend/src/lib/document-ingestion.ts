// AI008 — document ingestion.
//
// Orchestrates the real pipeline: raw upload → text extraction
// (pdf-extract.ts) → chunking (chunking.ts) → embedding (embeddings.ts) →
// storage (KnowledgeSource + DocumentChunk). Nothing here is a stub — a
// PDF uploaded through routes/knowledge-base.ts genuinely comes out the
// other end as real, searchable DocumentChunk rows, and a bad or
// unreadable document genuinely ends up `status: "failed"` with a real
// error message rather than a silently-empty success.

import { prisma } from "./prisma.js";
import { extractPdfText, looksLikePdf } from "./pdf-extract.js";
import { neutraliseRetrieved } from "./batch72.js";
import { chunkText } from "./chunking.js";
import { embedText } from "./embeddings.js";
import { searchChunks } from "./vector-search.js";

export type IngestInput = {
  title: string;
  unitId?: string;
  sourceType: "pdf" | "text" | "markdown";
  /** For sourceType "pdf": base64-encoded file bytes. For "text"/"markdown": the raw text itself. */
  content: string;
  originalUrl?: string;
  uploadedById: string;
};

export type IngestResult =
  | { ok: true; sourceId: string; chunkCount: number; charCount: number; embeddingProvider: string }
  | { ok: false; sourceId: string; errorMessage: string };

function extractRawText(input: IngestInput): { text: string; errorMessage?: string } {
  if (input.sourceType === "pdf") {
    let buffer: Buffer;
    try {
      buffer = Buffer.from(input.content, "base64");
    } catch {
      return { text: "", errorMessage: "Could not decode the uploaded file as base64." };
    }
    if (!looksLikePdf(buffer)) {
      return { text: "", errorMessage: "The uploaded file doesn't start with a %PDF- header — it isn't a PDF." };
    }
    const result = extractPdfText(buffer);
    if (result.isEncrypted) {
      return { text: "", errorMessage: "This PDF is password-protected/encrypted — extraction can't read an encrypted document without the password, and none was provided." };
    }
    if (!result.sawAnyContentStream || result.charCount === 0) {
      return {
        text: "",
        errorMessage:
          "No extractable text was found in this PDF. Most likely this is a scanned/image-only PDF with no real text layer — this pipeline does OCR-free text extraction, not OCR (see lib/pdf-extract.ts's module note), so a scanned document needs a separate OCR step this environment doesn't have.",
      };
    }
    return { text: result.text };
  }
  // "text" / "markdown" — already plain text.
  const text = input.content.trim();
  if (text.length === 0) return { text: "", errorMessage: "The provided text content was empty." };
  return { text };
}

const MIN_CHARS_TO_INGEST = 20;

export async function ingestSource(input: IngestInput): Promise<IngestResult> {
  const { text, errorMessage } = extractRawText(input);

  if (errorMessage || text.length < MIN_CHARS_TO_INGEST) {
    const failed = await prisma.knowledgeSource.create({
      data: {
        title: input.title,
        unitId: input.unitId,
        sourceType: input.sourceType,
        originalUrl: input.originalUrl,
        rawText: text,
        status: "failed",
        errorMessage: errorMessage ?? "Extracted text was too short to be useful (under 20 characters).",
        charCount: text.length,
        uploadedById: input.uploadedById,
      },
    });
    return { ok: false, sourceId: failed.id, errorMessage: failed.errorMessage! };
  }

  const source = await prisma.knowledgeSource.create({
    data: {
      title: input.title,
      unitId: input.unitId,
      sourceType: input.sourceType,
      originalUrl: input.originalUrl,
      rawText: text,
      status: "pending",
      charCount: text.length,
      uploadedById: input.uploadedById,
    },
  });

  return chunkAndEmbedSource(source.id, text);
}

/**
 * The shared second half of ingestion (chunk + embed + store), factored
 * out so `reindexSource()` below can re-run it against a KnowledgeSource's
 * already-extracted `rawText` without re-running PDF extraction — e.g.
 * after a chunking-size change or an embedding-provider change.
 */
async function chunkAndEmbedSource(sourceId: string, text: string): Promise<IngestResult> {
  try {
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      const updated = await prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: { status: "failed", errorMessage: "Chunking produced zero chunks from the extracted text." },
      });
      return { ok: false, sourceId, errorMessage: updated.errorMessage! };
    }

    await prisma.documentChunk.deleteMany({ where: { sourceId } });

    let providerUsed = "local-tfidf";
    let dims = 0;
    // Sequential, not Promise.all — a real embeddings API (the "openai"
    // branch) has real per-request rate limits; a document with hundreds
    // of chunks should not fan out hundreds of concurrent calls to it.
    for (const chunk of chunks) {
      const embedded = await embedText(chunk.text);
      providerUsed = embedded.provider;
      dims = embedded.dims;
      await prisma.documentChunk.create({
        data: {
          sourceId,
          ordinal: chunk.ordinal,
          text: chunk.text,
          charCount: chunk.text.length,
          vector: embedded.vector,
          vectorDims: embedded.dims,
        },
      });
    }

    const updated = await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: "ingested", chunkCount: chunks.length, embeddingProvider: providerUsed, embeddingDims: dims, errorMessage: null },
    });

    return { ok: true, sourceId, chunkCount: chunks.length, charCount: text.length, embeddingProvider: updated.embeddingProvider };
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : "Unknown error during chunking/embedding.";
    await prisma.knowledgeSource.update({ where: { id: sourceId }, data: { status: "failed", errorMessage: message } }).catch(() => undefined);
    return { ok: false, sourceId, errorMessage: message };
  }
}

/** Re-chunks and re-embeds a source's already-extracted text — no re-upload needed. */
export async function reindexSource(sourceId: string): Promise<IngestResult> {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source) return { ok: false, sourceId, errorMessage: "Source not found." };
  if (source.rawText.length < MIN_CHARS_TO_INGEST) {
    return { ok: false, sourceId, errorMessage: "This source has no usable extracted text to re-index." };
  }
  return chunkAndEmbedSource(sourceId, source.rawText);
}

// AI007/AI012 — the tutor-facing retrieval call. Same {title, summary,
// sourceRef} shape as curriculum.ts's findRelevantTopics()/
// getKnowledgeBaseTopics(), so routes/ai.ts can slot this in as one more
// grounding source ahead of the library fallback with no shape mismatch.
// This is what upgrades AI007 from "library catalogue metadata as a
// fallback" to "real retrieval over actual document content", within the
// honest lexical-not-semantic limits embeddings.ts's module note states.
export async function searchIngestedTopics(
  unitName: string,
  question: string
): Promise<{ title: string; summary: string; sourceRef: string }[]> {
  const unit = await prisma.unit.findFirst({ where: { title: { equals: unitName, mode: "insensitive" } }, select: { id: true } });
  if (!unit) return [];

  try {
    const hits = await searchChunks(question, { unitId: unit.id, limit: 3 });
    return hits.map((h) => ({
      title: `${h.sourceTitle} — passage ${h.ordinal + 1}`,
      summary: neutraliseRetrieved(h.text).text, // KAI-018
      sourceRef: `${h.sourceTitle} (ingested document, passage ${h.ordinal + 1})`,
    }));
  } catch {
    return [];
  }
}
