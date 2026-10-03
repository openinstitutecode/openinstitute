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

type Finding = { id: string; description: string; severity: string; status: string; evidenceUrl: string | null };
type Audit = { id: string; title: string; scope: string; scheduledAt: string; status: string; findings: Finding[] };

export default function AdminInternalAudits() {
  const userName = useCurrentUserName();
  const [audits, setAudits] = useState<Audit[] | null>(null);
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [findingDrafts, setFindingDrafts] = useState<Record<string, { description: string; severity: string; evidenceUrl: string }>>({});
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<string, string>>({});

  function load() {
    apiFetch<Audit[]>("/compliance/audits")
      .then(setAudits)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load audits."));
  }
  useEffect(load, []);

  async function createAudit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/compliance/audits", {
        method: "POST",
        body: JSON.stringify({ title, scope, scheduledAt: new Date(scheduledAt).toISOString() }),
      });
      setTitle("");
      setScope("");
      setScheduledAt("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create audit.");
    }
  }

  async function setAuditStatus(auditId: string, status: "in_progress" | "completed") {
    setError(null);
    try {
      await apiFetch(`/compliance/audits/${auditId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update audit status.");
    }
  }

  async function addFinding(auditId: string, e: FormEvent) {
    e.preventDefault();
    const draft = findingDrafts[auditId];
    if (!draft?.description) return;
    try {
      await apiFetch(`/compliance/audits/${auditId}/findings`, {
        method: "POST",
        body: JSON.stringify({
          description: draft.description,
          severity: draft.severity ?? "minor",
          ...(draft.evidenceUrl ? { evidenceUrl: draft.evidenceUrl } : {}),
        }),
      });
      setFindingDrafts((d) => ({ ...d, [auditId]: { description: "", severity: "minor", evidenceUrl: "" } }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save finding.");
    }
  }

  // QA030 — attach/replace evidence on an existing finding without
  // reopening it, then mark it resolved once evidence is on file.
  async function attachEvidence(findingId: string) {
    const url = evidenceDrafts[findingId];
    if (!url) return;
    setError(null);
    try {
      await apiFetch(`/compliance/audits/findings/${findingId}`, { method: "PATCH", body: JSON.stringify({ evidenceUrl: url }) });
      setEvidenceDrafts((d) => ({ ...d, [findingId]: "" }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach evidence.");
    }
  }

  async function toggleFindingStatus(findingId: string, status: "open" | "resolved") {
    setError(null);
    try {
      await apiFetch(`/compliance/audits/findings/${findingId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update finding.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Internal audits</h1>
      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {audits?.map((a) => (
            <PortalSection key={a.id} title={a.title}>
              <p className="text-sm text-ink/60">{a.scope}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="text-xs text-ink/45">{new Date(a.scheduledAt).toLocaleDateString()}</span>
                <Badge tone={a.status === "completed" ? "ok" : a.status === "in_progress" ? "warn" : "neutral"}>{a.status.replace("_", " ")}</Badge>
                {a.status === "planned" && (
                  <button onClick={() => setAuditStatus(a.id, "in_progress")} className="btn-secondary text-xs">Mark in progress</button>
                )}
                {a.status === "in_progress" && (
                  <button onClick={() => setAuditStatus(a.id, "completed")} className="btn-secondary text-xs">Mark completed</button>
                )}
              </div>

              <ul className="mt-4 divide-y divide-line">
                {a.findings.map((f) => (
                  <li key={f.id} className="py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span>{f.description}</span>
                      <div className="flex items-center gap-2">
                        <Badge tone={f.severity === "critical" ? "danger" : f.severity === "major" ? "warn" : "neutral"}>{f.severity}</Badge>
                        <Badge tone={f.status === "resolved" ? "ok" : "warn"}>{f.status}</Badge>
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      {f.evidenceUrl ? (
                        <a href={f.evidenceUrl} target="_blank" rel="noreferrer" className="text-navy hover:underline">Evidence</a>
                      ) : (
                        <span className="text-ink/30">No evidence filed</span>
                      )}
                      <input
                        value={evidenceDrafts[f.id] ?? ""}
                        onChange={(e) => setEvidenceDrafts((d) => ({ ...d, [f.id]: e.target.value }))}
                        placeholder="Evidence URL"
                        className="input h-7 flex-1 py-0 text-xs"
                      />
                      <button onClick={() => attachEvidence(f.id)} className="btn-secondary shrink-0 px-2 py-1 text-xs">Attach</button>
                      {f.status === "open" ? (
                        <button onClick={() => toggleFindingStatus(f.id, "resolved")} className="btn-primary shrink-0 px-2 py-1 text-xs">Mark resolved</button>
                      ) : (
                        <button onClick={() => toggleFindingStatus(f.id, "open")} className="btn-secondary shrink-0 px-2 py-1 text-xs">Reopen</button>
                      )}
                    </div>
                  </li>
                ))}
                {a.findings.length === 0 && <p className="text-sm text-ink/50">No findings recorded.</p>}
              </ul>

              <form onSubmit={(e) => addFinding(a.id, e)} className="mt-4 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={findingDrafts[a.id]?.description ?? ""}
                    onChange={(e) => setFindingDrafts((d) => ({ ...d, [a.id]: { description: e.target.value, severity: d[a.id]?.severity ?? "minor", evidenceUrl: d[a.id]?.evidenceUrl ?? "" } }))}
                    placeholder="Add a finding…"
                    className="input flex-1"
                  />
                  <select
                    value={findingDrafts[a.id]?.severity ?? "minor"}
                    onChange={(e) => setFindingDrafts((d) => ({ ...d, [a.id]: { description: d[a.id]?.description ?? "", severity: e.target.value, evidenceUrl: d[a.id]?.evidenceUrl ?? "" } }))}
                    className="input w-28"
                  >
                    <option value="minor">Minor</option>
                    <option value="major">Major</option>
                    <option value="critical">Critical</option>
                  </select>
                  <button type="submit" className="btn-secondary shrink-0">Add</button>
                </div>
                <input
                  value={findingDrafts[a.id]?.evidenceUrl ?? ""}
                  onChange={(e) => setFindingDrafts((d) => ({ ...d, [a.id]: { description: d[a.id]?.description ?? "", severity: d[a.id]?.severity ?? "minor", evidenceUrl: e.target.value } }))}
                  placeholder="Evidence URL (optional, can attach later)"
                  className="input"
                />
              </form>
            </PortalSection>
          ))}
          {audits && audits.length === 0 && <p className="text-sm text-ink/50">No audits planned yet.</p>}
        </div>

        <PortalSection title="Plan an audit">
          <form onSubmit={createAudit} className="space-y-3">
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Audit title" className="input" />
            <textarea required rows={2} value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Scope" className="input" />
            <input required type="date" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="input" />
            <button type="submit" className="btn-primary w-full justify-center">Schedule audit</button>
          </form>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
