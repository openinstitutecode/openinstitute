import { useEffect, useState, FormEvent } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { toApaCitation } from "../../lib/citations";
import { LoadingState } from "../../components/portal/StateViews";

const links = [
  { to: "/student/dashboard", label: "Dashboard" },
  { to: "/student/profile", label: "My Profile" },
  { to: "/student/id-card", label: "Digital ID" },
  { to: "/student/roadmap", label: "Programme Roadmap" },
  { to: "/student/courses", label: "My Courses" },
  { to: "/student/assignments", label: "Assignment Centre" },
  { to: "/student/exams", label: "Assessment Centre" },
  { to: "/student/alerts", label: "Academic Alerts" },
  { to: "/student/notebook", label: "Knowledge Notebook" },
  { to: "/student/portfolio", label: "Digital Portfolio" },
  { to: "/student/advisor", label: "AI Study Advisor" },
  { to: "/student/letters", label: "Official Letters" },
  { to: "/student/receipts", label: "Payment Receipts" },
  { to: "/student/research", label: "Research Workspace" },
  { to: "/student/messages", label: "Messages & Office Hours" },
  { to: "/student/forums", label: "Discussion Forums" },
  { to: "/student/timetable", label: "Timetable" },
  { to: "/student/attendance", label: "Attendance" },
  { to: "/student/achievements", label: "Achievements" },
  { to: "/student/library", label: "Digital Library" },
  { to: "/student/tutor", label: "AI Tutor" },
  { to: "/student/career", label: "Career Services" },
  { to: "/student/job-matches", label: "Job Matches" },
  { to: "/student/simulation", label: "Business Simulation Lab" },
  { to: "/student/virtual-lab", label: "Virtual Business Lab" },
  { to: "/student/viva", label: "AI Viva Practice" },
  { to: "/student/passport", label: "Competency Passport" },
  { to: "/student/grades", label: "Grades & Transcript" },
  { to: "/student/appeals", label: "Appeals" },
  { to: "/student/fees", label: "Fees" },
  { to: "/student/attachment", label: "Industrial Attachment" },
  { to: "/student/graduation", label: "Graduation Status" },
  { to: "/student/wellbeing", label: "Counselling & Support" },
  { to: "/student/events", label: "Clubs & Events" },
  { to: "/student/support", label: "Support" },
  { to: "/student/accessibility", label: "Accessibility Settings" },
  { to: "/student/credit-transfer", label: "Credit Transfer" },
  { to: "/student/tutor-sessions", label: "Tutor Session History" },
];

type FederatedResult = {
  source:
    | "internal"
    | "dspace"
    | "eprints"
    | "islandora"
    | "greenstone"
    | "doaj"
    | "crossref"
    | "arxiv"
    | "core"
    | "internet_archive";
  id?: string;
  title: string;
  author?: string;
  url?: string;
  abstract?: string;
  // LB005–010 — internal-catalogue only: the resource's own type and any
  // type-scoped fields a librarian recorded for it.
  resourceType?: string;
  metadata?: Record<string, string>;
};

type RepoStatus = {
  source: FederatedResult["source"];
  configured: boolean;
  ok: boolean | null;
  error?: string;
};

const sourceLabels: Record<FederatedResult["source"], string> = {
  internal: "College catalogue",
  dspace: "DSpace",
  eprints: "EPrints",
  islandora: "Islandora",
  greenstone: "Greenstone",
  doaj: "DOAJ",
  crossref: "Crossref",
  arxiv: "arXiv",
  core: "CORE",
  internet_archive: "Internet Archive",
};

// LB005–010 — display labels for the internal catalogue's resource types.
const resourceTypeLabels: Record<string, string> = {
  ebook: "E-book",
  journal: "Journal",
  oer: "OER",
  video: "Video",
  case_study: "Case study",
  government_doc: "Government document",
};

export default function StudentLibrary() {
  const userName = useCurrentUserName();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FederatedResult[] | null>(null);
  const [statuses, setStatuses] = useState<RepoStatus[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  // LB003 — semantic search is opt-in: default results stay the plain
  // federated search (internal full-text + external repositories); the
  // toggle swaps just the internal-catalogue results for the model's
  // meaning-based ranking.
  const [semantic, setSemantic] = useState(false);
  const [semanticNote, setSemanticNote] = useState<string | null>(null);
  const [viewerFor, setViewerFor] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ id: string; resourceId: string }[]>("/library/bookmarks/mine")
      .then((bs) => setBookmarkedIds(new Set(bs.map((b) => b.resourceId))))
      .catch(() => setBookmarkedIds(new Set()));
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSemanticNote(null);
      if (semantic && query.trim()) {
        apiFetch<{
          results: { id: string; title: string; author: string | null; type: string; metadata: Record<string, string> | null }[];
          mode: "semantic" | "fulltext_fallback";
          note?: string;
        }>(`/library/semantic-search?q=${encodeURIComponent(query)}`)
          .then((data) => {
            setResults(
              data.results.map((r) => ({
                source: "internal" as const,
                id: r.id,
                title: r.title,
                author: r.author ?? undefined,
                resourceType: r.type,
                metadata: r.metadata ?? undefined,
              }))
            );
            setStatuses([]);
            if (data.note) setSemanticNote(data.note);
          })
          .catch((err) => setError(err instanceof Error ? err.message : "Could not run semantic search."));
        return;
      }
      apiFetch<{ results: FederatedResult[]; statuses: RepoStatus[] }>(
        `/library/federated${query ? `?q=${encodeURIComponent(query)}` : ""}`
      )
        .then((data) => {
          setResults(data.results);
          setStatuses(data.statuses);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Could not load the library."));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, semantic]);

  async function toggleBookmark(resourceId: string) {
    const isBookmarked = bookmarkedIds.has(resourceId);
    try {
      if (isBookmarked) {
        await apiFetch(`/library/bookmarks/${resourceId}`, { method: "DELETE" });
        setBookmarkedIds((s) => { const next = new Set(s); next.delete(resourceId); return next; });
      } else {
        await apiFetch(`/library/bookmarks/${resourceId}`, { method: "POST" });
        setBookmarkedIds((s) => new Set(s).add(resourceId));
      }
    } catch {
      // best-effort — swallow, the toggle just won't visually update
    }
  }

  function copyCitation(r: FederatedResult) {
    const citation = toApaCitation({ title: r.title, author: r.author, url: r.url });
    navigator.clipboard?.writeText(citation);
    setCopiedFor(r.title);
    setTimeout(() => setCopiedFor(null), 2000);
  }

  const externalConfigured = statuses.filter((s) => s.configured);

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl">Digital library</h1>
        <div className="flex items-center gap-3">
          {/* LB003 — semantic search toggle, off by default. */}
          <label className="flex items-center gap-1.5 text-xs text-ink/50">
            <input type="checkbox" checked={semantic} onChange={(e) => setSemantic(e.target.checked)} />
            Semantic search
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, author, subject…"
            className="input w-72"
          />
        </div>
      </div>
      {semantic && (
        <p className="mt-2 text-xs text-ink/45">
          {semanticNote ?? "Ranking the college catalogue by meaning, not just shared words — external repositories aren't included in this mode."}
        </p>
      )}

      {externalConfigured.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {statuses.map((s) => (
            <span key={s.source} className="inline-flex items-center gap-1.5 text-xs text-ink/45">
              <span className={`h-1.5 w-1.5 rounded-full ${
                !s.configured ? "bg-ink/20" : s.ok ? "bg-forest" : "bg-red-500"
              }`} />
              {sourceLabels[s.source]}
            </span>
          ))}
        </div>
      )}

      <div className="mt-8">
        <PortalSection title="Results">
          {error && <p className="text-sm text-navy-dark">{error}</p>}
          {!results && !error && <LoadingState />}
          {results && results.length === 0 && (
            <p className="text-sm text-ink/50">No resources match yet.</p>
          )}
          {results && results.length > 0 && (
            <ul className="divide-y divide-line">
              {results.map((r, i) => (
                <li key={i} className="py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{r.title}</p>
                      <p className="mt-1 flex items-center gap-2 text-xs text-ink/45">
                        <Badge tone="neutral">{sourceLabels[r.source]}</Badge>
                        {r.resourceType && (
                          <Badge tone="neutral">{resourceTypeLabels[r.resourceType] ?? r.resourceType}</Badge>
                        )}
                        {r.author ?? "Unknown author"}
                      </p>
                      {r.abstract && (
                        <p className="mt-1 max-w-xl text-xs text-ink/50 line-clamp-2">{r.abstract}</p>
                      )}
                      {/* LB005–010 — per-type fields, when recorded. */}
                      {r.metadata && Object.keys(r.metadata).length > 0 && (
                        <p className="mt-1 max-w-xl text-xs text-ink/40">
                          {Object.entries(r.metadata).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => copyCitation(r)} className="text-xs text-ink/50 hover:text-navy">
                        {copiedFor === r.title ? "Copied!" : "Cite"}
                      </button>
                      {r.id && (
                        <button onClick={() => toggleBookmark(r.id!)} className="text-xs text-ink/50 hover:text-navy">
                          {bookmarkedIds.has(r.id) ? "★ Saved" : "☆ Save"}
                        </button>
                      )}
                      {/* LB011 — inline viewer for internal-catalogue items,
                          instead of only opening a new tab. */}
                      {r.source === "internal" && r.id && (
                        <button
                          onClick={() => setViewerFor(viewerFor === r.id ? null : r.id!)}
                          className="text-xs text-navy hover:underline"
                        >
                          {viewerFor === r.id ? "Close" : "View inline"}
                        </button>
                      )}
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-navy hover:underline">
                          Open
                        </a>
                      )}
                    </div>
                  </div>
                  {r.source === "internal" && r.id && viewerFor === r.id && (
                    <ResourceViewer resourceId={r.id} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </PortalSection>
      </div>

      <div className="mt-6">
        <ReadingLists />
      </div>

      {/* LB037 — resource recommendations: rule-based subject overlap with
          the student's programme/units, not an AI or invented ranking. */}
      <div className="mt-6">
        <Recommendations />
      </div>

      {/* AI019/LB036 — AI librarian, grounded only in real catalogue
          metadata, never claiming to have read a resource's actual content. */}
      <div className="mt-6">
        <Librarian />
      </div>

      {/* LB020 — Literature summarizer, grounded only in real abstracts
          fetched from DOAJ/Crossref/arXiv/CORE for the given topic. */}
      <div className="mt-6">
        <LiteratureSummary />
      </div>
    </PortalShell>
  );
}

// LB011/LB012 — inline viewer + real page-anchored annotations. The
// resource is still just served from its own fileUrl (the browser's
// native PDF rendering does the work; this platform doesn't parse or
// manipulate PDF pages), and an annotation is a genuine note tied to a
// page number, not simulated highlighting drawn over content this app
// doesn't actually read.
type Annotation = { id: string; page: number | null; note: string; createdAt: string };

function ResourceViewer({ resourceId }: { resourceId: string }) {
  const [fileUrl, setFileUrl] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [page, setPage] = useState<number | "">("");
  const [note, setNote] = useState("");

  useEffect(() => {
    apiFetch<{ fileUrl: string | null }>(`/library/${resourceId}/view`)
      .then((r) => setFileUrl(r.fileUrl))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not open this resource."));
    apiFetch<Annotation[]>(`/library/${resourceId}/annotations/mine`).then(setAnnotations).catch(() => setAnnotations([]));
  }, [resourceId]);

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    try {
      await apiFetch<Annotation>(`/library/${resourceId}/annotations`, {
        method: "POST",
        body: JSON.stringify({ page: page === "" ? undefined : page, note }),
      });
      setNote(""); setPage("");
      apiFetch<Annotation[]>(`/library/${resourceId}/annotations/mine`).then(setAnnotations).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the note.");
    }
  }

  async function removeNote(id: string) {
    await apiFetch(`/library/annotations/${id}`, { method: "DELETE" }).catch(() => undefined);
    setAnnotations((a) => a.filter((x) => x.id !== id));
  }

  return (
    <div className="mt-3 grid gap-4 border-t border-line pt-3 lg:grid-cols-[2fr_1fr]">
      <div>
        {error && <p className="text-xs text-navy-dark">{error}</p>}
        {fileUrl === undefined && <LoadingState />}
        {fileUrl === null && !error && (
          <p className="text-xs text-ink/45">No file is attached to this resource yet.</p>
        )}
        {fileUrl && (
          <iframe src={fileUrl} title="Resource viewer" className="h-[520px] w-full rounded border border-line" />
        )}
      </div>
      <div>
        <p className="text-xs font-medium text-ink/60">Your notes</p>
        <ul className="mt-2 space-y-2">
          {annotations.map((a) => (
            <li key={a.id} className="text-xs text-ink/70">
              <div className="flex items-start justify-between gap-2">
                <span>{a.page ? `p.${a.page} — ` : ""}{a.note}</span>
                <button onClick={() => removeNote(a.id)} className="shrink-0 text-ink/30 hover:text-navy-dark">✕</button>
              </div>
            </li>
          ))}
          {annotations.length === 0 && <li className="text-xs text-ink/40">No notes yet.</li>}
        </ul>
        <form onSubmit={addNote} className="mt-3 space-y-2 border-t border-line pt-2">
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              value={page}
              onChange={(e) => setPage(e.target.value ? Number(e.target.value) : "")}
              placeholder="Page"
              className="input w-16 text-xs"
            />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" className="input flex-1 text-xs" />
          </div>
          <button type="submit" className="btn-secondary w-full text-xs">Save note</button>
        </form>
      </div>
    </div>
  );
}

function LiteratureSummary() {
  const [topic, setTopic] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [sources, setSources] = useState<{ number: number; title: string; source: string; url?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setReply(null);
    try {
      const res = await apiFetch<{
        reply: string;
        sources: { number: number; title: string; source: string; url?: string }[];
      }>("/ai/literature-summary", { method: "POST", body: JSON.stringify({ topic }) });
      setReply(res.reply);
      setSources(res.sources ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not summarize this topic.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalSection title="Literature summarizer">
      <p className="text-xs text-ink/50">
        Summarizes only the real abstracts DOAJ/Crossref/arXiv/CORE return for a topic — every
        point in the summary is traceable to a numbered source below, never to a paper's full text.
      </p>
      <form onSubmit={submit} className="mt-3 flex gap-3">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. mobile money adoption among SMEs"
          className="input flex-1"
        />
        <button type="submit" className="btn-primary" disabled={loading}>Summarize</button>
      </form>
      {loading && <p className="mt-3 text-sm text-ink/40">Reading abstracts…</p>}
      {error && <p className="mt-3 text-sm text-navy-dark">{error}</p>}
      {reply && <p className="mt-3 whitespace-pre-wrap text-sm text-ink/75">{reply}</p>}
      {sources.length > 0 && (
        <ol className="mt-3 space-y-1 text-xs text-ink/50">
          {sources.map((s) => (
            <li key={s.number}>
              [{s.number}] {s.title} — {sourceLabels[s.source as FederatedResult["source"]] ?? s.source}
              {s.url && (
                <a href={s.url} target="_blank" rel="noreferrer" className="ml-1 text-navy hover:underline">
                  link
                </a>
              )}
            </li>
          ))}
        </ol>
      )}
    </PortalSection>
  );
}

function Librarian() {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const userMessage = { role: "user" as const, content: input };
    setMessages((m) => [...m, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ reply: string }>("/ai/librarian", { method: "POST", body: JSON.stringify({ message: userMessage.content }) });
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the librarian.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalSection title="AI librarian">
      <p className="text-xs text-ink/50">
        Can only see catalogue metadata (title/author/subject), not the actual content of any resource.
      </p>
      <div className="mt-3 space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === "user" ? "font-medium" : "text-ink/75"}`}>{m.content}</div>
        ))}
        {loading && <p className="text-sm text-ink/40">Thinking…</p>}
        {error && <p className="text-sm text-navy-dark">{error}</p>}
      </div>
      <form onSubmit={submit} className="mt-3 flex gap-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Do we have anything on marketing management?" className="input flex-1" />
        <button type="submit" className="btn-primary" disabled={loading}>Ask</button>
      </form>
    </PortalSection>
  );
}

function Recommendations() {
  type Rec = { id: string; title: string; author: string | null; subject: string | null; matchCount: number };
  const [recs, setRecs] = useState<Rec[] | null>(null);

  useEffect(() => {
    apiFetch<Rec[]>("/library/recommendations/mine").then(setRecs).catch(() => setRecs([]));
  }, []);

  return (
    <PortalSection title="Recommended for your programme">
      {recs && recs.length === 0 && <p className="text-sm text-ink/50">No matches found yet — try browsing the catalogue directly.</p>}
      <ul className="divide-y divide-line">
        {recs?.map((r) => (
          <li key={r.id} className="py-2 text-sm">
            <p>{r.title} {r.author ? `— ${r.author}` : ""}</p>
            <p className="text-xs text-ink/45">{r.subject} · matched on {r.matchCount} keyword(s)</p>
          </li>
        ))}
      </ul>
    </PortalSection>
  );
}

type ReadingListType = {
  id: string;
  title: string;
  items: { id: string; resource: { title: string } }[];
};

function ReadingLists() {
  const [lists, setLists] = useState<ReadingListType[] | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<ReadingListType[]>("/library/reading-lists/mine")
      .then(setLists)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load reading lists."));
  }
  useEffect(load, []);

  async function createList(e: FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      await apiFetch("/library/reading-lists", { method: "POST", body: JSON.stringify({ title: newTitle }) });
      setNewTitle("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create list.");
    }
  }

  return (
    <PortalSection title="Reading lists">
      {error && <p className="text-sm text-navy-dark">{error}</p>}
      <ul className="divide-y divide-line">
        {lists?.map((l) => (
          <li key={l.id} className="py-3 text-sm">
            <p className="font-medium">{l.title}</p>
            <p className="mt-1 text-xs text-ink/45">{l.items.length} resource(s)</p>
          </li>
        ))}
        {lists && lists.length === 0 && <p className="text-sm text-ink/50">No reading lists yet.</p>}
      </ul>
      <form onSubmit={createList} className="mt-4 flex gap-2">
        <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="New list title…" className="input flex-1" />
        <button type="submit" className="btn-secondary shrink-0">Create</button>
      </form>
    </PortalSection>
  );
}
