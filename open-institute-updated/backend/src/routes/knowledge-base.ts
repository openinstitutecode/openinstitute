import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { ingestSource, reindexSource } from "../lib/document-ingestion.js";
import { searchChunks } from "../lib/vector-search.js";
import { getActiveEmbeddingConfig, setActiveEmbeddingConfig } from "../lib/embeddings.js";

// AI006 — Institutional Knowledge Base. Trainers author entries against a
// real Unit; a QA officer or programme coordinator approves them before the
// AI tutor (ai.ts / lib/curriculum.ts:getKnowledgeBaseTopics) is allowed to
// cite them. This is a managed, database-backed KB replacing the static
// curriculum.ts array as the primary source.
//
// AI008–012 (Batch 63) — the `/sources` routes below are the second,
// document-level tier of the knowledge base: instead of a trainer
// hand-typing a title/summary/sourceRef per topic, a trainer uploads a
// whole PDF or pastes a block of text, and the real ingestion pipeline
// (lib/document-ingestion.ts) extracts, chunks, embeds, and stores it so
// the tutor can retrieve actual passages from it — real RAG infrastructure,
// not the "library catalogue metadata as a fallback" AI007 used to mean.
// See lib/embeddings.ts's module note for the honest lexical-vs-semantic
// scope of what "embeddings" means without a dense-embedding credential
// configured.
export const knowledgeBaseRouter = Router();

// List entries. Trainers/QA/admins see everything (including unapproved
// drafts, so they can review); anyone else sees only approved entries.
knowledgeBaseRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const { unitId } = req.query;
  const canSeeDrafts = ["TRAINER", "QA_OFFICER", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"].includes(req.user!.role);

  const entries = await prisma.knowledgeBaseEntry.findMany({
    where: {
      ...(typeof unitId === "string" ? { unitId } : {}),
      ...(canSeeDrafts ? {} : { isApproved: true }),
    },
    include: {
      unit: { select: { id: true, title: true, code: true } },
      createdBy: { select: { id: true, email: true } },
      approvedBy: { select: { id: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(entries);
});

const createSchema = z.object({
  unitId: z.string(),
  title: z.string().min(2),
  summary: z.string().min(10),
  sourceRef: z.string().min(2),
});

knowledgeBaseRouter.post(
  "/",
  requireAuth,
  requireRole("TRAINER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide unitId, title, summary and sourceRef." });

    const unit = await prisma.unit.findUnique({ where: { id: parsed.data.unitId } });
    if (!unit) return res.status(404).json({ message: "Unit not found." });

    const entry = await prisma.knowledgeBaseEntry.create({
      data: { ...parsed.data, createdById: req.user!.id },
    });
    res.status(201).json(entry);
  }
);

// A QA officer or programme coordinator approves a draft before the AI
// tutor can cite it — mirrors the human-review discipline the rest of the
// AI surface already follows (nothing auto-publishes).
knowledgeBaseRouter.patch(
  "/:id/approve",
  requireAuth,
  requireRole("QA_OFFICER", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    try {
      const entry = await prisma.knowledgeBaseEntry.update({
        where: { id: req.params.id },
        data: { isApproved: true, approvedById: req.user!.id, approvedAt: new Date() },
      });
      res.json(entry);
    } catch {
      res.status(404).json({ message: "Knowledge base entry not found." });
    }
  }
);

knowledgeBaseRouter.delete(
  "/:id",
  requireAuth,
  requireRole("TRAINER", "QA_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    try {
      await prisma.knowledgeBaseEntry.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch {
      res.status(404).json({ message: "Knowledge base entry not found." });
    }
  }
);

// ---------------------------------------------------------------------------
// AI008–012 — document-level ingestion (upload a source, retrieve chunks).
// ---------------------------------------------------------------------------

const ingestSchema = z.object({
  title: z.string().min(2),
  unitId: z.string().optional(),
  sourceType: z.enum(["pdf", "text", "markdown"]),
  // For "pdf": base64-encoded file bytes. For "text"/"markdown": raw text.
  // Capped well under Express's 2mb JSON body limit (index.ts) so a
  // realistically-sized trainer document (lecture notes, a past paper,
  // a short reference chapter) fits, while a mistakenly-huge upload fails
  // fast with a clear message instead of a generic body-parser error.
  content: z.string().min(1).max(1_800_000),
  originalUrl: z.string().url().optional(),
});

// Ingests a new source document. Same authoring roles as a manual KB entry
// (TRAINER/SUPER_ADMIN) — this is a heavier-weight version of the same
// authoring act, not a different permission model.
knowledgeBaseRouter.post(
  "/sources",
  requireAuth,
  requireRole("TRAINER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = ingestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Provide a title, sourceType (pdf/text/markdown), and content." });
    }
    if (parsed.data.unitId) {
      const unit = await prisma.unit.findUnique({ where: { id: parsed.data.unitId } });
      if (!unit) return res.status(404).json({ message: "Unit not found." });
    }

    const result = await ingestSource({ ...parsed.data, uploadedById: req.user!.id });
    if (result.ok) {
      res.status(201).json(result);
    } else {
      // A failed extraction/chunking is still a real, recorded row (so the
      // trainer can see WHY it failed in the list below) — 422, not a
      // silent 201 pretending it worked.
      res.status(422).json(result);
    }
  }
);

knowledgeBaseRouter.get("/sources", requireAuth, async (req: AuthedRequest, res) => {
  const { unitId, status } = req.query;
  const sources = await prisma.knowledgeSource.findMany({
    where: {
      ...(typeof unitId === "string" ? { unitId } : {}),
      ...(typeof status === "string" ? { status } : {}),
    },
    select: {
      id: true, title: true, unitId: true, sourceType: true, status: true, errorMessage: true,
      charCount: true, chunkCount: true, embeddingProvider: true, uploadedById: true, createdAt: true, updatedAt: true,
      unit: { select: { id: true, title: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(sources);
});

knowledgeBaseRouter.get("/sources/:id", requireAuth, async (req: AuthedRequest, res) => {
  const source = await prisma.knowledgeSource.findUnique({
    where: { id: req.params.id },
    include: { chunks: { select: { id: true, ordinal: true, charCount: true }, orderBy: { ordinal: "asc" } } },
  });
  if (!source) return res.status(404).json({ message: "Source not found." });
  const { rawText, ...rest } = source;
  res.json({ ...rest, rawTextPreview: rawText.slice(0, 500) });
});

knowledgeBaseRouter.post(
  "/sources/:id/reindex",
  requireAuth,
  requireRole("TRAINER", "QA_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const result = await reindexSource(req.params.id);
    res.status(result.ok ? 200 : 422).json(result);
  }
);

knowledgeBaseRouter.delete(
  "/sources/:id",
  requireAuth,
  requireRole("TRAINER", "QA_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    try {
      await prisma.knowledgeSource.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch {
      res.status(404).json({ message: "Source not found." });
    }
  }
);

const searchSchema = z.object({ query: z.string().min(2), unitId: z.string().optional(), limit: z.number().int().min(1).max(20).optional() });

// A direct, staff-facing test bench for the retrieval step itself — lets a
// trainer check what the tutor would actually retrieve for a real
// question before trusting it in front of students. Not exposed to
// students directly; the tutor route (routes/ai.ts) calls
// lib/document-ingestion.ts's searchIngestedTopics() internally instead of
// this endpoint.
knowledgeBaseRouter.post(
  "/sources/search",
  requireAuth,
  requireRole("TRAINER", "QA_OFFICER", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = searchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide a query (min 2 characters)." });
    const hits = await searchChunks(parsed.data.query, { unitId: parsed.data.unitId, limit: parsed.data.limit });
    res.json({ hits });
  }
);

// AI002-style admin-editable embedding provider config.
knowledgeBaseRouter.get(
  "/embedding-config",
  requireAuth,
  requireRole("TRAINER", "QA_OFFICER", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    res.json(await getActiveEmbeddingConfig());
  }
);

const configSchema = z.object({ provider: z.enum(["local-tfidf", "openai"]), modelId: z.string().optional(), notes: z.string().optional() });

knowledgeBaseRouter.patch(
  "/embedding-config",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = configSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide a valid provider (local-tfidf | openai)." });
    const updated = await setActiveEmbeddingConfig(parsed.data.provider, req.user!.id, parsed.data.modelId, parsed.data.notes);
    res.json(updated);
  }
);
