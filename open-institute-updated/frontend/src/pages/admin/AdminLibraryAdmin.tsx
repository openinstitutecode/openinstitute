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

type Resource = { id: string; title: string; author: string | null; type: string; licence: string | null; metadata: Record<string, string> | null };
type UsageRow = { resourceId: string; title: string; views: number; bookmarks: number; checkouts: number };

// LB005–010 — the fields a librarian can record per resource type, kept in
// sync with resourceMetadataKeysByType in backend/src/routes/library.ts.
const metadataFieldsByType: Record<string, { key: string; label: string }[]> = {
  ebook: [
    { key: "isbn", label: "ISBN" },
    { key: "edition", label: "Edition" },
    { key: "publisher", label: "Publisher" },
  ],
  journal: [
    { key: "volume", label: "Volume" },
    { key: "issue", label: "Issue" },
    { key: "doi", label: "DOI" },
    { key: "publisher", label: "Publisher" },
  ],
  oer: [
    { key: "license", label: "Open licence (e.g. CC-BY)" },
    { key: "format", label: "Format" },
  ],
  video: [
    { key: "durationMinutes", label: "Duration (minutes)" },
    { key: "transcriptUrl", label: "Transcript URL" },
  ],
  case_study: [
    { key: "industry", label: "Industry" },
    { key: "organisation", label: "Organisation" },
  ],
  government_doc: [
    { key: "agency", label: "Issuing agency" },
    { key: "referenceNumber", label: "Reference number" },
    { key: "publicationDate", label: "Publication date" },
  ],
};

export default function AdminLibraryAdmin() {
  const userName = useCurrentUserName();
  const [resources, setResources] = useState<Resource[] | null>(null);
  const [usage, setUsage] = useState<UsageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [type, setType] = useState<"ebook" | "journal" | "oer" | "video" | "case_study" | "government_doc">("ebook");
  const [licence, setLicence] = useState<"open" | "licensed" | "restricted">("open");
  const [content, setContent] = useState("");
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [grantUserId, setGrantUserId] = useState("");
  const [grantResourceId, setGrantResourceId] = useState("");

  function load() {
    apiFetch<Resource[]>("/library").then(setResources).catch((err) => setError(err instanceof Error ? err.message : "Could not load resources."));
    apiFetch<UsageRow[]>("/library/analytics/usage").then(setUsage).catch(() => undefined);
  }
  useEffect(load, []);

  async function addResource(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/library", {
        method: "POST",
        body: JSON.stringify({
          title,
          author: author || undefined,
          type,
          licence,
          content: content || undefined,
          metadata: Object.keys(metadata).length ? metadata : undefined,
        }),
      });
      setTitle(""); setAuthor(""); setContent(""); setMetadata({});
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add resource.");
    }
  }

  async function grantAccess(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch(`/library/${grantResourceId}/grant-access`, { method: "POST", body: JSON.stringify({ userId: grantUserId }) });
      setGrantUserId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not grant access.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Library administration</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Manage the catalogue, grant access to restricted resources, and see real usage analytics.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Catalogue">
          <ul className="divide-y divide-line">
            {resources?.map((r) => (
              <li key={r.id} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>{r.title} {r.author ? `— ${r.author}` : ""}</span>
                  <Badge tone={r.licence === "restricted" ? "danger" : r.licence === "licensed" ? "warn" : "ok"}>{r.licence ?? "open"}</Badge>
                </div>
                {/* LB005–010 — per-type fields, when a librarian recorded any. */}
                {r.metadata && Object.keys(r.metadata).length > 0 && (
                  <p className="mt-0.5 text-xs text-ink/45">
                    {Object.entries(r.metadata).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <form onSubmit={addResource} className="mt-4 space-y-2 border-t border-line pt-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="input" />
            <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author (optional)" className="input" />
            <select
              value={type}
              onChange={(e) => { setType(e.target.value as typeof type); setMetadata({}); }}
              className="input"
            >
              <option value="ebook">E-book</option>
              <option value="journal">Journal</option>
              <option value="oer">OER</option>
              <option value="video">Video</option>
              <option value="case_study">Case study</option>
              <option value="government_doc">Government document</option>
            </select>
            <select value={licence} onChange={(e) => setLicence(e.target.value as typeof licence)} className="input">
              <option value="open">Open</option>
              <option value="licensed">Licensed</option>
              <option value="restricted">Restricted</option>
            </select>
            {/* LB005–010 — fields specific to the chosen type. */}
            {metadataFieldsByType[type]?.map((f) => (
              <input
                key={f.key}
                value={metadata[f.key] ?? ""}
                onChange={(e) => setMetadata((m) => ({ ...m, [f.key]: e.target.value }))}
                placeholder={f.label}
                className="input"
              />
            ))}
            {/* LB004 — optional plain-text excerpt/abstract so this resource
                becomes findable by real full-text search. */}
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Abstract or excerpt (optional — enables full-text search)"
              rows={2}
              className="input"
            />
            <button type="submit" className="btn-primary">Add resource</button>
          </form>
        </PortalSection>

        <div className="space-y-6">
          <PortalSection title="Grant restricted access">
            <form onSubmit={grantAccess} className="space-y-2">
              <input value={grantResourceId} onChange={(e) => setGrantResourceId(e.target.value)} placeholder="Resource ID" className="input" />
              <input value={grantUserId} onChange={(e) => setGrantUserId(e.target.value)} placeholder="User ID" className="input" />
              <button type="submit" className="btn-secondary">Grant access</button>
            </form>
          </PortalSection>

          <PortalSection title="Usage analytics">
            {usage && usage.length === 0 && <p className="text-sm text-ink/50">No usage recorded yet.</p>}
            <ul className="divide-y divide-line">
              {usage?.map((u) => (
                <li key={u.resourceId} className="py-2 text-sm">
                  <p>{u.title}</p>
                  <p className="text-xs text-ink/45">{u.views} views · {u.bookmarks} bookmarks · {u.checkouts} checkouts</p>
                </li>
              ))}
            </ul>
          </PortalSection>
        </div>
      </div>
    </PortalShell>
  );
}
