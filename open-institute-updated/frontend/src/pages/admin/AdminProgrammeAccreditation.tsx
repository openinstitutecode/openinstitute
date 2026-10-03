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

type ProgrammeRow = {
  id: string;
  name: string;
  approvalStatus: string;
  accreditationReviews: { id: string; decision: string; reviewDate: string }[];
};

type Review = {
  id: string;
  decision: string;
  feedbackSummary: string | null;
  conditions: string | null;
  reviewDate: string;
  validUntil: string | null;
  reviewer: { id: string; email: string };
};

const statusTone: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  accredited: "ok",
  pending: "warn",
  withdrawn: "danger",
};

export default function AdminProgrammeAccreditation() {
  const userName = useCurrentUserName();
  const [programmes, setProgrammes] = useState<ProgrammeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProgrammeRow | null>(null);
  const [history, setHistory] = useState<Review[] | null>(null);
  const [decision, setDecision] = useState<"accredited" | "conditional" | "rejected">("accredited");
  const [feedbackSummary, setFeedbackSummary] = useState("");
  const [conditions, setConditions] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<ProgrammeRow[]>("/programme-accreditation/status")
      .then(setProgrammes)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load programmes."));
  }
  useEffect(load, []);

  function openProgramme(p: ProgrammeRow) {
    setSelected(p);
    setHistory(null);
    setNotice(null);
    apiFetch<Review[]>(`/programme-accreditation/${p.id}/history`)
      .then(setHistory)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load history."));
  }

  async function submitForReview(p: ProgrammeRow) {
    setError(null);
    try {
      await apiFetch(`/programme-accreditation/${p.id}/submit`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit for review.");
    }
  }

  async function recordDecision(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/programme-accreditation/${selected.id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          feedbackSummary: feedbackSummary || undefined,
          conditions: conditions || undefined,
          validUntil: validUntil || undefined,
        }),
      });
      setNotice("Decision recorded.");
      setFeedbackSummary("");
      setConditions("");
      setValidUntil("");
      load();
      openProgramme(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record decision.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Programme accreditation</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Programme coordinators submit a programme for review; QA officers
        record accredited / conditional / rejected decisions here, which
        updates the programme's live approval status.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}
      {notice && <p className="mt-4 text-sm text-forest">{notice}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Programmes">
          <ul className="divide-y divide-line">
            {programmes?.map((p) => {
              const latest = p.accreditationReviews[0];
              return (
                <li key={p.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <button onClick={() => openProgramme(p)} className="text-sm font-medium hover:underline">
                        {p.name}
                      </button>
                      {latest && (
                        <p className="mt-1 text-xs text-ink/45">
                          Last decision: {latest.decision} on {new Date(latest.reviewDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge tone={statusTone[p.approvalStatus] ?? "neutral"}>{p.approvalStatus}</Badge>
                      <button onClick={() => submitForReview(p)} className="text-xs font-medium text-forest hover:underline">
                        Submit for review
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </PortalSection>

        <PortalSection title={selected ? `Decision — ${selected.name}` : "Select a programme"}>
          {!selected && <p className="text-sm text-ink/50">Choose a programme on the left.</p>}
          {selected && (
            <>
              <form onSubmit={recordDecision} className="space-y-3">
                <select value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)} className="input">
                  <option value="accredited">Accredited</option>
                  <option value="conditional">Conditional</option>
                  <option value="rejected">Rejected</option>
                </select>
                <textarea
                  value={feedbackSummary}
                  onChange={(e) => setFeedbackSummary(e.target.value)}
                  placeholder="Feedback summary"
                  rows={3}
                  className="input"
                />
                <input value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="Conditions (if any)" className="input" />
                <label className="block">
                  <span className="text-xs text-ink/60">Valid until</span>
                  <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="input mt-1" />
                </label>
                <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
                  {busy ? "Saving…" : "Record decision"}
                </button>
              </form>

              <div className="mt-6 border-t border-line pt-4">
                <p className="text-sm font-medium">History</p>
                <ul className="mt-2 divide-y divide-line">
                  {history?.map((r) => (
                    <li key={r.id} className="py-2 text-sm">
                      <Badge tone={statusTone[r.decision === "accredited" ? "accredited" : r.decision === "rejected" ? "withdrawn" : "pending"] ?? "neutral"}>
                        {r.decision}
                      </Badge>{" "}
                      by {r.reviewer.email} on {new Date(r.reviewDate).toLocaleDateString()}
                      {r.feedbackSummary && <p className="mt-1 text-xs text-ink/55">{r.feedbackSummary}</p>}
                    </li>
                  ))}
                  {history?.length === 0 && <li className="py-2 text-sm text-ink/45">No prior reviews.</li>}
                </ul>
              </div>
            </>
          )}
        </PortalSection>
      </div>
    </PortalShell>
  );
}
