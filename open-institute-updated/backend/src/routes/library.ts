import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { federatedLibrarySearch } from "../lib/repositories/federated.js";
import { searchInternalCatalogue } from "../lib/repositories/internal-fulltext.js";
import { hasPermission } from "../lib/permissions.js";
import { callAiModel } from "../lib/ai-gateway.js";

export const libraryRouter = Router();

// Repository connector status only, no query — lets ICT admin verify
// configuration without running a search.
libraryRouter.get(
  "/repository-status",
  requireAuth,
  requireRole("LIBRARIAN", "ICT_ADMIN", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const { statuses } = await federatedLibrarySearch("");
    res.json(statuses);
  }
);

// Federated search: internal catalogue plus any configured external
// repository (DSpace, EPrints, Islandora, Greenstone). Each source is
// queried live and independently — a down or misconfigured repository
// shows up in `statuses` rather than silently vanishing or faking results.
libraryRouter.get("/federated", requireAuth, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const { results, statuses } = await federatedLibrarySearch(q);
  res.json({ results, statuses });
});

// Any signed-in user can search the library. LB038 — a "restricted"
// resource's fileUrl is withheld from this response unless the requester
// is library/ICT staff or holds an explicit LibraryAccessGrant — the
// licence field is now actually enforced, not just stored.
// LB003/LB004 — real full-text search (title/author/subject/content) via
// Postgres, not a second `contains` filter — see internal-fulltext.ts.
libraryRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  // KFEAT-092 — optional filters on top of the full-text search. Fetch a wider set first so filtering does not hide matches.
  const pick = (k: string) => (typeof req.query[k] === "string" && req.query[k] ? String(req.query[k]).toLowerCase() : null);
  const [fType, fLicence, fSubject] = [pick("type"), pick("licence"), pick("subject")];
  const wide = await searchInternalCatalogue(q, fType || fLicence || fSubject ? 400 : 100);
  const resources = wide.filter((r) => (!fType || r.type === fType) && (!fLicence || (r.licence ?? "") === fLicence) && (!fSubject || (r.subject ?? "").toLowerCase().includes(fSubject))).slice(0, 100);

  const isStaff = req.user!.role === "LIBRARIAN" || req.user!.role === "ICT_ADMIN" || req.user!.role === "SUPER_ADMIN";
  const restrictedIds = resources.filter((r) => r.licence === "restricted").map((r) => r.id);
  const grants = isStaff
    ? []
    : await prisma.libraryAccessGrant.findMany({ where: { userId: req.user!.id, resourceId: { in: restrictedIds } } });
  const grantedIds = new Set(grants.map((g) => g.resourceId));

  const filtered = resources.map((r) => {
    if (r.licence === "restricted" && !isStaff && !grantedIds.has(r.id)) {
      return { ...r, fileUrl: null, accessRestricted: true };
    }
    return { ...r, accessRestricted: false };
  });

  res.json(filtered);
});

// LB038 — grant a specific user access to a restricted resource.
const grantAccessSchema = z.object({ userId: z.string() });

libraryRouter.post(
  "/:resourceId/grant-access",
  requireAuth,
  requireRole("LIBRARIAN", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = grantAccessSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide userId." });
    const grant = await prisma.libraryAccessGrant
      .create({ data: { userId: parsed.data.userId, resourceId: req.params.resourceId, grantedById: req.user!.id } })
      .catch(() => null);
    if (!grant) return res.status(409).json({ message: "Access was already granted to this user." });
    res.status(201).json(grant);
  }
);

// LB039 — usage analytics: logs a real view event, then anyone with
// librarian access can see aggregate counts computed straight from these
// rows — a view, bookmark, or checkout is only counted here because it
// really happened.
libraryRouter.get("/:id/view", requireAuth, async (req: AuthedRequest, res) => {
  const resource = await prisma.libraryResource.findUnique({ where: { id: req.params.id } });
  if (!resource) return res.status(404).json({ message: "Resource not found." });

  // LB038 — this endpoint hands back fileUrl directly (for LB011's inline
  // viewer), so it must enforce the same restricted-access check as the
  // catalogue listing, not just log the view. Previously it returned the
  // resource unfiltered, which would have leaked a restricted fileUrl to
  // anyone signed in.
  const isStaff = req.user!.role === "LIBRARIAN" || req.user!.role === "ICT_ADMIN" || req.user!.role === "SUPER_ADMIN";
  if (resource.licence === "restricted" && !isStaff) {
    const grant = await prisma.libraryAccessGrant.findUnique({
      where: { userId_resourceId: { userId: req.user!.id, resourceId: resource.id } },
    });
    if (!grant) return res.status(403).json({ message: "You don't have access to this restricted resource." });
  }

  await prisma.libraryUsageEvent.create({ data: { resourceId: resource.id, userId: req.user!.id, action: "view" } });
  res.json(resource);
});

libraryRouter.get(
  "/analytics/usage",
  requireAuth,
  requireRole("LIBRARIAN", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const events = await prisma.libraryUsageEvent.groupBy({
      by: ["resourceId", "action"],
      _count: { _all: true },
    });
    const resources = await prisma.libraryResource.findMany({
      where: { id: { in: [...new Set(events.map((e) => e.resourceId))] } },
      select: { id: true, title: true },
    });
    const titleById = new Map(resources.map((r) => [r.id, r.title]));

    const byResource = new Map<string, { resourceId: string; title: string; views: number; bookmarks: number; checkouts: number }>();
    for (const e of events) {
      const key = e.resourceId;
      if (!byResource.has(key)) {
        byResource.set(key, { resourceId: key, title: titleById.get(key) ?? "Unknown", views: 0, bookmarks: 0, checkouts: 0 });
      }
      const row = byResource.get(key)!;
      if (e.action === "view") row.views = e._count._all;
      if (e.action === "bookmark") row.bookmarks = e._count._all;
      if (e.action === "checkout") row.checkouts = e._count._all;
    }

    const rows = [...byResource.values()].sort((a, b) => b.views - a.views);
    res.json(rows);
  }
);

// ---------------------------------------------------------------------------
// LB037 — resource recommendations: rule-based subject overlap between a
// student's programme/unit titles and a resource's subject tag — real
// keyword matching, explicitly not an AI or collaborative-filtering claim.
// ---------------------------------------------------------------------------
libraryRouter.get("/recommendations/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({
    where: { userId: req.user!.id },
    include: { programme: true, enrollments: { include: { unit: true } } },
  });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const keywords = [student.programme.name, ...student.enrollments.map((e) => e.unit.title)]
    .flatMap((s) => s.split(/\s+/))
    .filter((w) => w.length > 3)
    .map((w) => w.toLowerCase());
  const uniqueKeywords = [...new Set(keywords)];

  const resources = await prisma.libraryResource.findMany({ where: { subject: { not: null } } });
  const scored = resources
    .map((r) => {
      const subjectWords = (r.subject ?? "").toLowerCase().split(/\s+/);
      const matchCount = uniqueKeywords.filter((k) => subjectWords.some((w) => w.includes(k) || k.includes(w))).length;
      return { resource: r, matchCount };
    })
    .filter((s) => s.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, 10);

  res.json(scored.map((s) => ({ ...s.resource, matchCount: s.matchCount })));
});

// LB005–010 — the known metadata keys per type. Not enforced at the DB
// layer (metadata is JSON), but validated here so a librarian can't save
// junk keys and the frontend has a fixed set of fields to render/edit.
export const resourceMetadataKeysByType: Record<string, string[]> = {
  ebook: ["isbn", "edition", "publisher"],
  journal: ["volume", "issue", "doi", "publisher"],
  oer: ["license", "format"],
  video: ["durationMinutes", "transcriptUrl"],
  case_study: ["industry", "organisation"],
  government_doc: ["agency", "referenceNumber", "publicationDate"],
};

const resourceSchema = z.object({
  title: z.string().min(1),
  author: z.string().optional(),
  type: z.enum(["ebook", "journal", "oer", "video", "case_study", "government_doc"]),
  subject: z.string().optional(),
  fileUrl: z.string().url().optional(),
  externalUrl: z.string().url().optional(),
  licence: z.enum(["open", "licensed", "restricted"]).default("open"),
  // LB004 — optional plain-text body a librarian pastes in (an abstract or
  // OCR'd excerpt) so this resource becomes findable by real full-text
  // search, not just its metadata.
  content: z.string().optional(),
  // LB005–010 — arbitrary string values, keyed by the fields listed above
  // for this resource's type. Unknown keys for the given type are dropped
  // rather than silently stored, so the catalogue never accumulates fields
  // no UI will ever show.
  metadata: z.record(z.string()).optional(),
});

function cleanMetadata(type: string, metadata?: Record<string, string>) {
  if (!metadata) return undefined;
  const allowedKeys = resourceMetadataKeysByType[type] ?? [];
  const cleaned: Record<string, string> = {};
  for (const key of allowedKeys) {
    if (metadata[key]) cleaned[key] = metadata[key];
  }
  return Object.keys(cleaned).length ? cleaned : undefined;
}

libraryRouter.post(
  "/",
  requireAuth,
  requireRole("LIBRARIAN", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = resourceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid resource." });
    const { metadata, ...rest } = parsed.data;
    const resource = await prisma.libraryResource.create({
      data: { ...rest, metadata: cleanMetadata(parsed.data.type, metadata) },
    });
    res.status(201).json(resource);
  }
);

// ---------------------------------------------------------------------------
// LB003 — semantic search. This catalogue is small and has no vector index,
// so "semantic" here means: send the model the real catalogue metadata
// (title/author/subject/content excerpt) plus the student's natural-language
// query, and ask it to pick genuinely relevant matches by meaning (a query
// for "workplace safety" should surface a resource titled "Occupational
// Hazard Management" even with zero shared keywords) — never inventing a
// resource that isn't in the list handed to it. Without an API key this
// falls back to real full-text search and says so, rather than silently
// pretending to be semantic.
// ---------------------------------------------------------------------------
libraryRouter.get("/semantic-search", requireAuth, async (req: AuthedRequest, res) => {
  // AI005
  if (!(await hasPermission(req.user!.role, "AI", "SEMANTIC_SEARCH"))) {
    return res.status(403).json({ message: "AI semantic search is disabled for your role." });
  }
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) return res.status(400).json({ message: "Provide a query." });

  const catalogue = await prisma.libraryResource.findMany({ take: 300 });

  if (catalogue.length === 0) {
    const fallback = await searchInternalCatalogue(q, 20);
    return res.json({ results: fallback, mode: "fulltext_fallback" as const, note: "The catalogue is empty." });
  }

  const catalogueList = catalogue
    .map((r) => `${r.id} :: "${r.title}"${r.author ? ` by ${r.author}` : ""} (${r.type}, subject: ${r.subject ?? "unspecified"})`)
    .join("\n");

  const result = await callAiModel({
    feature: "semantic-search",
    userId: req.user!.id,
    role: req.user!.role,
    maxTokens: 400,
    system:
      "You are a catalogue relevance ranker. Given a list of real library resources (id :: title, author, type, subject) and a search query, return ONLY a JSON array of the ids that are genuinely relevant to the query's meaning — including resources that match by concept or synonym, not just shared words. Never invent an id that isn't in the list. Return at most 15 ids, most relevant first. Respond with ONLY the JSON array, nothing else.",
    messages: [{ role: "user", content: `Catalogue:\n${catalogueList}\n\nQuery: ${q}` }],
    screenInput: q,
  });

  if (!result.ok) {
    const fallback = await searchInternalCatalogue(q, 20);
    return res.json({
      results: fallback,
      mode: "fulltext_fallback" as const,
      note:
        result.reason === "no_api_key"
          ? "Semantic search needs ANTHROPIC_API_KEY — showing full-text search results instead."
          : result.reason === "blocked_by_safety"
          ? result.message
          : "Semantic ranking failed — showing full-text search results instead.",
    });
  }

  try {
    const idsRaw = JSON.parse(result.text.replace(/```json|```/g, "").trim());
    const ids: string[] = Array.isArray(idsRaw) ? idsRaw.filter((id) => typeof id === "string") : [];
    const byId = new Map(catalogue.map((r) => [r.id, r]));
    const ranked = ids.map((id) => byId.get(id)).filter((r): r is (typeof catalogue)[number] => Boolean(r));
    res.json({ results: ranked, mode: "semantic" as const });
  } catch {
    const fallback = await searchInternalCatalogue(q, 20);
    res.json({
      results: fallback,
      mode: "fulltext_fallback" as const,
      note: "Semantic ranking failed — showing full-text search results instead.",
    });
  }
});

// ---------------------------------------------------------------------------
// LB011/LB012 — inline PDF viewing + real page-anchored annotations. The
// resource itself is still just served from its fileUrl (this platform
// doesn't render or manipulate PDF content), but the frontend now embeds
// it inline instead of only opening a new tab, and a reader can attach a
// genuine note to a page number here.
// ---------------------------------------------------------------------------
const annotationSchema = z.object({
  page: z.number().int().positive().optional(),
  note: z.string().min(1).max(2000),
});

libraryRouter.get("/:id/annotations/mine", requireAuth, async (req: AuthedRequest, res) => {
  const annotations = await prisma.libraryAnnotation.findMany({
    where: { resourceId: req.params.id, userId: req.user!.id },
    orderBy: [{ page: "asc" }, { createdAt: "asc" }],
  });
  res.json(annotations);
});

libraryRouter.post("/:id/annotations", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = annotationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide note text (and optionally a page number)." });
  const annotation = await prisma.libraryAnnotation.create({
    data: { resourceId: req.params.id, userId: req.user!.id, page: parsed.data.page, note: parsed.data.note },
  });
  res.status(201).json(annotation);
});

libraryRouter.delete("/annotations/:id", requireAuth, async (req: AuthedRequest, res) => {
  await prisma.libraryAnnotation.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
  res.status(204).send();
});

// LB013/LB015 — bookmarks (a simple "personal library" of saved resources).
libraryRouter.post("/bookmarks/:resourceId", requireAuth, async (req: AuthedRequest, res) => {
  const bookmark = await prisma.libraryBookmark.upsert({
    where: { userId_resourceId: { userId: req.user!.id, resourceId: req.params.resourceId } },
    update: {},
    create: { userId: req.user!.id, resourceId: req.params.resourceId },
  });
  res.status(201).json(bookmark);
});

libraryRouter.delete("/bookmarks/:resourceId", requireAuth, async (req: AuthedRequest, res) => {
  await prisma.libraryBookmark.deleteMany({
    where: { userId: req.user!.id, resourceId: req.params.resourceId },
  });
  res.status(204).send();
});

libraryRouter.get("/bookmarks/mine", requireAuth, async (req: AuthedRequest, res) => {
  const bookmarks = await prisma.libraryBookmark.findMany({
    where: { userId: req.user!.id },
    include: { resource: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(bookmarks);
});

// LB014 — reading lists.
libraryRouter.get("/reading-lists/mine", requireAuth, async (req: AuthedRequest, res) => {
  const lists = await prisma.readingList.findMany({
    where: { userId: req.user!.id },
    include: { items: { include: { resource: true } } },
  });
  res.json(lists);
});

libraryRouter.post("/reading-lists", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({ title: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Give the list a title." });
  const list = await prisma.readingList.create({ data: { userId: req.user!.id, title: parsed.data.title } });
  res.status(201).json(list);
});

libraryRouter.post("/reading-lists/:id/items", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({ resourceId: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Choose a resource." });
  // KSEC-007 — only the list's owner may add to it (anyone else's id looks like a missing list).
  const list = await prisma.readingList.findFirst({ where: { id: req.params.id, userId: req.user!.id }, select: { id: true } });
  if (!list) return res.status(404).json({ message: "Reading list not found.", code: "NOT_FOUND" });
  const item = await prisma.readingListItem.create({
    data: { readingListId: req.params.id, resourceId: parsed.data.resourceId },
  });
  res.status(201).json(item);
});
