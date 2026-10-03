import { FormEvent, useState } from "react";
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

type Check = {
  id: string;
  similarityScore: number;
  checkMethod: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  submission: { studentUserId: string };
  // BUGFIX: pairedSubmissionId is nullable (onDelete: SetNull) -- a paired
  // submission can be deleted after the check was recorded, which crashed
  // this page when it read `.studentUserId` off a null relation.
  pairedSubmission: { studentUserId: string } | null;
};

type CheckRunResult = {
  submissionId: string;
  checksPerformed: number;
  highSimilarityCount: number;
  note: string;
};

export default function AdminSimilarityChecking() {
  const userName = useCurrentUserName();
  const [submissionId, setSubmissionId] = useState("");
  const [assessmentId, setAssessmentId] = useState("");
  const [minScore, setMinScore] = useState("");
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [runResult, setRunResult] = useState<CheckRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"run" | "load" | null>(null);

  async function runCheck(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setRunResult(null);
    if (!submissionId.trim()) return;
    setBusy("run");
    try {
      const r = await apiFetch<CheckRunResult>(`/similarity-checking/${submissionId.trim()}/check`, { method: "POST" });
      setRunResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run similarity check.");
    } finally {
      setBusy(null);
    }
  }

  async function loadForAssessment(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!assessmentId.trim()) return;
    setBusy("load");
    try {
      const qs = minScore ? `?minScore=${encodeURIComponent(minScore)}` : "";
      const c = await apiFetch<Check[]>(`/similarity-checking/assessment/${assessmentId.trim()}${qs}`);
      setChecks(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load checks.");
    } finally {
      setBusy(null);
    }
  }

  async function markReviewed(checkId: string) {
    try {
      await apiFetch(`/similarity-checking/${checkId}/review`, { method: "PATCH" });
      loadForAssessment(new Event("submit") as unknown as FormEvent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save review.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Similarity checking</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        This is an <strong>honest word-overlap (Jaccard) implementation</strong>
        , not semantic plagiarism detection — results are evidence for a
        human reviewer, not automatic proof of misconduct. Examination
        Officer / Trainer / Super Admin only.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Run a check on a submission">
          <form onSubmit={runCheck} className="space-y-3">
            <input value={submissionId} onChange={(e) => setSubmissionId(e.target.value)} placeholder="Submission ID" className="input" required />
            <button type="submit" disabled={busy === "run"} className="btn-primary disabled:opacity-50">
              {busy === "run" ? "Checking…" : "Run similarity check"}
            </button>
          </form>
          {runResult && (
            <div className="mt-4 border-t border-line pt-4 text-sm">
              <p>
                Compared against {runResult.checksPerformed} other submission{runResult.checksPerformed === 1 ? "" : "s"} —{" "}
                <Badge tone={runResult.highSimilarityCount > 0 ? "warn" : "ok"}>{runResult.highSimilarityCount} high-similarity match(es)</Badge>
              </p>
              <p className="mt-2 text-xs text-ink/45">{runResult.note}</p>
            </div>
          )}
        </PortalSection>

        <PortalSection title="Review checks for an assessment">
          <form onSubmit={loadForAssessment} className="flex flex-wrap items-end gap-3">
            <input value={assessmentId} onChange={(e) => setAssessmentId(e.target.value)} placeholder="Assessment ID" className="input" required />
            <input value={minScore} onChange={(e) => setMinScore(e.target.value)} placeholder="Min score % (optional)" className="input w-40" />
            <button type="submit" disabled={busy === "load"} className="btn-primary disabled:opacity-50">
              {busy === "load" ? "Loading…" : "Load"}
            </button>
          </form>

          {checks && (
            <ul className="mt-4 divide-y divide-line">
              {checks.map((c) => (
                <li key={c.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      Students {c.submission.studentUserId.slice(0, 8)}… vs{" "}
                      {c.pairedSubmission ? `${c.pairedSubmission.studentUserId.slice(0, 8)}…` : "(deleted submission)"}
                    </span>
                    <div className="flex items-center gap-3">
                      <Badge tone={c.similarityScore > 70 ? "danger" : c.similarityScore > 50 ? "warn" : "neutral"}>
                        {Math.round(c.similarityScore)}%
                      </Badge>
                      {c.reviewedAt ? (
                        <span className="text-xs text-ink/45">Reviewed</span>
                      ) : (
                        <button onClick={() => markReviewed(c.id)} className="text-xs font-medium text-forest hover:underline">
                          Mark reviewed
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
              {checks.length === 0 && <li className="py-3 text-sm text-ink/45">No checks recorded for this assessment yet.</li>}
            </ul>
          )}
        </PortalSection>
      </div>
    </PortalShell>
  );
}
