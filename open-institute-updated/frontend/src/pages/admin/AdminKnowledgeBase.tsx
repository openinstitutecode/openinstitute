import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";

const links = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/command-centre", label: "Command Centre" },
  { to: "/admin/admissions", label: "Admissions" },
  { to: "/admin/students", label: "Students" },
  { to: "/admin/staff", label: "Staff Management" },
  { to: "/admin/academic-calendar", label: "Academic Calendar" },
  { to: "/admin/timetable-admin", label: "Timetable Management" },
  { to: "/admin/communication", label: "Communication Centre" },
  { to: "/admin/permission-audit", label: "Permission Audit" },
  { to: "/admin/security", label: "Security Centre" },
  { to: "/admin/reports", label: "Report Builder" },
  { to: "/admin/admin-assistant", label: "AI Admin Assistant" },
  { to: "/admin/ai-governance", label: "AI Governance Centre" },
  { to: "/admin/registry", label: "Registry Actions" },
  { to: "/admin/statistics", label: "Academic Statistics" },
  { to: "/admin/qualifications", label: "Qualification Register" },
  { to: "/admin/exams", label: "Examinations" },
  { to: "/admin/results-approval", label: "Results Approval" },
  { to: "/admin/curriculum", label: "Curriculum" },
  { to: "/admin/library", label: "Digital Library" },
  { to: "/admin/library-admin", label: "Library Administration" },
  { to: "/admin/finance", label: "Finance" },
  { to: "/admin/ledger", label: "General Ledger" },
  { to: "/admin/receivable-payable", label: "AR / AP" },
  { to: "/admin/installments", label: "Installment Plans" },
  { to: "/admin/budgets", label: "Budgets" },
  { to: "/admin/inventory", label: "Inventory" },
  { to: "/admin/financial-planning", label: "Financial Planning" },
  { to: "/admin/fee-structure", label: "Fee Structure" },
  { to: "/admin/procurement", label: "Procurement & Assets" },
  { to: "/admin/compliance", label: "Compliance & QA" },
  { to: "/admin/qa-governance", label: "QA Governance" },
  { to: "/admin/course-evaluations", label: "Course & Trainer Evaluations" },
  { to: "/admin/internal-audits", label: "Internal Audits" },
  { to: "/admin/corrective-actions", label: "Corrective Actions" },
  { to: "/admin/complaints", label: "Complaints" },
  { to: "/admin/governance", label: "Governance" },
  { to: "/admin/integrity", label: "Academic Integrity" },
  { to: "/admin/appeals", label: "Appeals" },
  { to: "/admin/rpl", label: "RPL Applications" },
  { to: "/admin/graduation", label: "Graduation Audit" },
  { to: "/admin/kuccps", label: "KUCCPS Exchange" },
  { to: "/admin/users", label: "Users & RBAC" },
  { to: "/admin/audit-log", label: "Audit Log" },
  { to: "/admin/operations", label: "Operations & Data Governance" },
  { to: "/admin/departments", label: "Departments & Tasks" },
  { to: "/admin/research", label: "Research & Innovation" },
  { to: "/admin/trainers", label: "Trainers & HR" },
  { to: "/admin/support-tickets", label: "Support Tickets" },
  { to: "/admin/documents", label: "Document Management" },
  { to: "/admin/data-export", label: "Data Export" },
  { to: "/admin/data-import", label: "Data Import" },
  { to: "/admin/integrations", label: "Integration Centre" },
  { to: "/admin/role-permissions", label: "Role Permissions" },
  { to: "/admin/semesters", label: "Semester Management" },
  { to: "/admin/programme-accreditation", label: "Programme Accreditation" },
  { to: "/admin/credit-transfer", label: "Credit Transfer" },
  { to: "/admin/exam-security", label: "Exam Security" },
  { to: "/admin/similarity-checking", label: "Similarity Checking" },
  { to: "/admin/knowledge-base", label: "Knowledge Base" },
  { to: "/admin/notifications", label: "Notifications" },
  { to: "/admin/workflows", label: "Workflow Engine" },
  { to: "/admin/institutional-analytics", label: "Institutional Analytics" },
  { to: "/admin/decision-centre", label: "Executive Decision Centre" },
];

type Entry = {
  id: string;
  title: string;
  summary: string;
  sourceRef: string;
  isApproved: boolean;
  unit: { id: string; title: string; code: string };
  createdBy: { id: string; email: string };
  approvedBy?: { id: string; email: string } | null;
};

// AI008–012 (Batch 63) — the document-level tier of the knowledge base.
type Source = {
  id: string;
  title: string;
  unitId: string | null;
  sourceType: "pdf" | "text" | "markdown";
  status: "pending" | "ingested" | "failed";
  errorMessage: string | null;
  charCount: number;
  chunkCount: number;
  embeddingProvider: string;
  unit: { id: string; title: string; code: string } | null;
  createdAt: string;
};

type SearchHit = { chunkId: string; sourceId: string; sourceTitle: string; ordinal: number; text: string; score: number };

export default function AdminKnowledgeBase() {
  const userName = useCurrentUserName();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unitId, setUnitId] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [busy, setBusy] = useState(false);

  // AI008–012 — document ingestion state.
  const [sources, setSources] = useState<Source[] | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [ingestUnitId, setIngestUnitId] = useState("");
  const [ingestTitle, setIngestTitle] = useState("");
  const [ingestKind, setIngestKind] = useState<"pdf" | "text" | "markdown">("pdf");
  const [ingestFile, setIngestFile] = useState<File | null>(null);
  const [ingestText, setIngestText] = useState("");
  const [ingestBusy, setIngestBusy] = useState(false);
  const [searchUnitId, setSearchUnitId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[] | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);

  function load() {
    apiFetch<Entry[]>("/knowledge-base")
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load knowledge base entries."));
  }
  useEffect(load, []);

  function loadSources() {
    apiFetch<Source[]>("/knowledge-base/sources")
      .then(setSources)
      .catch((err) => setSourceError(err instanceof Error ? err.message : "Could not load ingested sources."));
  }
  useEffect(loadSources, []);

  async function createEntry(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch("/knowledge-base", {
        method: "POST",
        body: JSON.stringify({ unitId, title, summary, sourceRef }),
      });
      setUnitId("");
      setTitle("");
      setSummary("");
      setSourceRef("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create entry.");
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    try {
      await apiFetch(`/knowledge-base/${id}/approve`, { method: "PATCH" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve entry.");
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch(`/knowledge-base/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete entry.");
    }
  }

  // AI008–012 — ingest a whole document (PDF upload or pasted text) rather
  // than a hand-typed topic. A PDF is read client-side as base64 (no
  // multipart upload middleware in this backend — see routes/
  // knowledge-base.ts's ingestSchema note) and sent as JSON, same as every
  // other write in this app.
  async function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.slice(result.indexOf(",") + 1)); // strip the data: URL prefix
      };
      reader.onerror = () => reject(new Error("Could not read the selected file."));
      reader.readAsDataURL(file);
    });
  }

  async function ingest(e: FormEvent) {
    e.preventDefault();
    setSourceError(null);
    setIngestBusy(true);
    try {
      const content = ingestKind === "pdf" ? (ingestFile ? await readFileAsBase64(ingestFile) : "") : ingestText;
      if (!content) throw new Error(ingestKind === "pdf" ? "Choose a PDF file first." : "Paste some text first.");
      await apiFetch("/knowledge-base/sources", {
        method: "POST",
        body: JSON.stringify({
          title: ingestTitle,
          unitId: ingestUnitId || undefined,
          sourceType: ingestKind,
          content,
        }),
      });
      setIngestTitle("");
      setIngestFile(null);
      setIngestText("");
      loadSources();
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "Ingestion failed.");
    } finally {
      setIngestBusy(false);
    }
  }

  async function reindex(id: string) {
    try {
      await apiFetch(`/knowledge-base/sources/${id}/reindex`, { method: "POST" });
      loadSources();
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "Could not re-index this source.");
    }
  }

  async function removeSource(id: string) {
    try {
      await apiFetch(`/knowledge-base/sources/${id}`, { method: "DELETE" });
      loadSources();
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "Could not delete this source.");
    }
  }

  async function runTestSearch(e: FormEvent) {
    e.preventDefault();
    setSearchBusy(true);
    setSourceError(null);
    try {
      const result = await apiFetch<{ hits: SearchHit[] }>("/knowledge-base/sources/search", {
        method: "POST",
        body: JSON.stringify({ query: searchQuery, unitId: searchUnitId || undefined, limit: 5 }),
      });
      setSearchHits(result.hits);
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearchBusy(false);
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Institutional knowledge base</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Trainers author entries against a real unit; a QA officer or
        programme coordinator approves them before the AI tutor is allowed
        to cite them. Nothing here is auto-published. Your role determines
        which actions succeed — create needs Trainer/Super Admin, approve
        needs QA Officer/Programme Coordinator/Super Admin.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Author a new entry">
          <form onSubmit={createEntry} className="space-y-3">
            <input value={unitId} onChange={(e) => setUnitId(e.target.value)} placeholder="Unit ID" className="input" required />
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="input" required />
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Summary (min 10 characters)"
              rows={4}
              className="input"
              required
            />
            <input
              value={sourceRef}
              onChange={(e) => setSourceRef(e.target.value)}
              placeholder='Source, e.g. "Module 2, Lesson 3"'
              className="input"
              required
            />
            <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
              {busy ? "Saving…" : "Submit for review"}
            </button>
          </form>
        </PortalSection>

        <PortalSection title="All entries">
          {entries && entries.length === 0 && <p className="text-sm text-ink/50">No entries yet.</p>}
          <ul className="divide-y divide-line">
            {entries?.map((e) => (
              <li key={e.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{e.title}</p>
                    <p className="mt-1 text-xs text-ink/55">{e.summary}</p>
                    <p className="mt-1 text-xs text-ink/40">
                      {e.unit.code} · {e.unit.title} · source: {e.sourceRef} · by {e.createdBy.email}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge tone={e.isApproved ? "ok" : "warn"}>{e.isApproved ? "Approved" : "Pending"}</Badge>
                    <div className="flex gap-3">
                      {!e.isApproved && (
                        <button onClick={() => approve(e.id)} className="text-xs font-medium text-forest hover:underline">
                          Approve
                        </button>
                      )}
                      <button onClick={() => remove(e.id)} className="text-xs font-medium text-red-700 hover:underline">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>

      <div className="mt-10 border-t border-line pt-8">
        <h2 className="font-display text-xl">Document ingestion — real RAG (AI008–012)</h2>
        <p className="mt-2 max-w-prose text-sm text-ink/60">
          Upload a whole PDF (or paste text/markdown) and it's genuinely extracted, chunked, and
          embedded — not just catalogued by title. The AI tutor retrieves real passages from these
          when a unit has no manually-authored entry above. Default embedding is a deterministic
          local vector (real, working lexical matching); a dense-embedding provider is an admin-
          configurable upgrade path, not a requirement for this to work today.
        </p>

        {sourceError && <p className="mt-4 text-sm text-navy-dark">{sourceError}</p>}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <PortalSection title="Ingest a document">
            <form onSubmit={ingest} className="space-y-3">
              <input value={ingestTitle} onChange={(e) => setIngestTitle(e.target.value)} placeholder="Title" className="input" required />
              <input value={ingestUnitId} onChange={(e) => setIngestUnitId(e.target.value)} placeholder="Unit ID (optional)" className="input" />
              <select value={ingestKind} onChange={(e) => setIngestKind(e.target.value as typeof ingestKind)} className="input">
                <option value="pdf">PDF file</option>
                <option value="text">Plain text</option>
                <option value="markdown">Markdown</option>
              </select>
              {ingestKind === "pdf" ? (
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setIngestFile(e.target.files?.[0] ?? null)}
                  className="input"
                />
              ) : (
                <textarea
                  value={ingestText}
                  onChange={(e) => setIngestText(e.target.value)}
                  placeholder="Paste the document's text here"
                  rows={6}
                  className="input"
                />
              )}
              <button type="submit" disabled={ingestBusy} className="btn-primary disabled:opacity-50">
                {ingestBusy ? "Ingesting…" : "Ingest document"}
              </button>
            </form>
          </PortalSection>

          <PortalSection title="Ingested sources">
            {sources && sources.length === 0 && <p className="text-sm text-ink/50">No sources ingested yet.</p>}
            <ul className="divide-y divide-line">
              {sources?.map((s) => (
                <li key={s.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="mt-1 text-xs text-ink/40">
                        {s.unit ? `${s.unit.code} · ${s.unit.title}` : "No unit assigned"} · {s.sourceType} ·{" "}
                        {s.chunkCount} chunk{s.chunkCount === 1 ? "" : "s"} · {s.charCount.toLocaleString()} chars · {s.embeddingProvider}
                      </p>
                      {s.status === "failed" && s.errorMessage && (
                        <p className="mt-1 text-xs text-navy-dark">{s.errorMessage}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge tone={s.status === "ingested" ? "ok" : s.status === "failed" ? "warn" : "neutral"}>{s.status}</Badge>
                      <div className="flex gap-3">
                        <button onClick={() => reindex(s.id)} className="text-xs font-medium text-forest hover:underline">
                          Re-index
                        </button>
                        <button onClick={() => removeSource(s.id)} className="text-xs font-medium text-red-700 hover:underline">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </PortalSection>
        </div>

        <PortalSection title="Test what the tutor would retrieve">
          <form onSubmit={runTestSearch} className="flex flex-wrap items-end gap-3">
            <input value={searchUnitId} onChange={(e) => setSearchUnitId(e.target.value)} placeholder="Unit ID (optional)" className="input" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="A question a student might ask"
              className="input flex-1"
              required
            />
            <button type="submit" disabled={searchBusy} className="btn-primary disabled:opacity-50">
              {searchBusy ? "Searching…" : "Search"}
            </button>
          </form>
          {searchHits && (
            <ul className="mt-4 space-y-3">
              {searchHits.length === 0 && <p className="text-sm text-ink/50">No passage scored above the relevance threshold.</p>}
              {searchHits.map((h) => (
                <li key={h.chunkId} className="rounded border border-line p-3 text-sm">
                  <p className="text-xs text-ink/40">
                    {h.sourceTitle} — passage {h.ordinal + 1} · score {h.score.toFixed(3)}
                  </p>
                  <p className="mt-1 text-ink/70">{h.text}</p>
                </li>
              ))}
            </ul>
          )}
        </PortalSection>
      </div>
    </PortalShell>
  );
}
