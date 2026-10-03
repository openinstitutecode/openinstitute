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
  { to: "/admin/regulatory-reports", label: "Regulatory Reports" },
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

type AuditResult = {
  studentId: string;
  studentNumber: string;
  fullName: string;
  eligible: boolean;
  status: "eligible" | "conditionally_eligible" | "not_eligible";
  outstanding: string[];
  checks: {
    academicClearance: { met: boolean; completedUnits: number; requiredUnitCount: number };
    financeClearance: { met: boolean; feeBalance: number };
    attachmentClearance: { met: boolean; required: boolean };
    disciplinaryClearance: { met: boolean };
  };
};

type ListResult = {
  programmeId: string;
  totalStudents: number;
  eligible: AuditResult[];
  conditionallyEligible: AuditResult[];
  notEligible: AuditResult[];
};

type Clearance = {
  id: string;
  issuedAt: string;
  eligibilityTier: "eligible" | "conditionally_eligible";
};

const statusTone: Record<AuditResult["status"], "ok" | "warn" | "danger"> = {
  eligible: "ok",
  conditionally_eligible: "warn",
  not_eligible: "danger",
};
const statusLabel: Record<AuditResult["status"], string> = {
  eligible: "Eligible",
  conditionally_eligible: "Conditionally eligible",
  not_eligible: "Not eligible",
};

export default function AdminGraduation() {
  const userName = useCurrentUserName();
  const [studentId, setStudentId] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [programmeId, setProgrammeId] = useState("");
  const [list, setList] = useState<ListResult | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [clearances, setClearances] = useState<Clearance[] | null>(null);
  const [clearanceError, setClearanceError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);

  async function loadClearances(id: string) {
    try {
      const res = await apiFetch<Clearance[]>(`/graduation/${id}/clearance-history`);
      setClearances(res);
    } catch {
      setClearances(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setClearanceError(null);
    setLoading(true);
    try {
      const res = await apiFetch<AuditResult>(`/graduation/audit/${studentId}`);
      setResult(res);
      await loadClearances(studentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run the audit.");
    } finally {
      setLoading(false);
    }
  }

  // RG017 — a formal, permanent record that clearance was actually issued
  // at this moment, distinct from re-running the live audit above.
  async function issueClearance() {
    if (!result) return;
    setClearanceError(null);
    setIssuing(true);
    try {
      await apiFetch(`/graduation/${result.studentId}/issue-clearance`, { method: "POST" });
      await loadClearances(result.studentId);
    } catch (err) {
      setClearanceError(err instanceof Error ? err.message : "Could not issue clearance.");
    } finally {
      setIssuing(false);
    }
  }

  async function loadList(e: FormEvent) {
    e.preventDefault();
    setListError(null);
    try {
      const res = await apiFetch<ListResult>(`/graduation/list/${programmeId}`);
      setList(res);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not load the graduation list.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Graduation eligibility audit</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Computed live from academic, finance, attachment, and disciplinary
        records — never a manually maintained flag that can go stale.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex gap-3">
        <input
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          placeholder="Student ID"
          className="input"
        />
        <button type="submit" disabled={loading} className="btn-primary shrink-0">
          {loading ? "Checking…" : "Run audit"}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {result && (
        <div className="mt-8">
          <PortalSection
            title={`${result.studentNumber} — ${statusLabel[result.status]}`}
          >
            <Badge tone={statusTone[result.status]}>{statusLabel[result.status]}</Badge>
            {result.outstanding.length > 0 && (
              <p className="mt-2 text-xs text-ink/55">Outstanding: {result.outstanding.join("; ")}</p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <CheckRow label="Academic" met={result.checks.academicClearance.met}>
                {result.checks.academicClearance.completedUnits} / {result.checks.academicClearance.requiredUnitCount} units completed
              </CheckRow>
              <CheckRow label="Finance" met={result.checks.financeClearance.met}>
                Balance: KES {result.checks.financeClearance.feeBalance.toLocaleString()}
              </CheckRow>
              <CheckRow label="Industrial attachment" met={result.checks.attachmentClearance.met}>
                {result.checks.attachmentClearance.required ? "Required for this programme" : "Not required"}
              </CheckRow>
              <CheckRow label="Disciplinary" met={result.checks.disciplinaryClearance.met}>
                No upheld integrity cases
              </CheckRow>
            </div>

            {/* RG017 — issuing clearance is a distinct, permanent event
                from just viewing the live audit above. */}
            <div className="mt-4 border-t border-line pt-4">
              {result.status === "not_eligible" ? (
                <p className="text-xs text-ink/50">Clearance cannot be issued while not eligible.</p>
              ) : (
                <button onClick={issueClearance} disabled={issuing} className="btn-primary text-sm disabled:opacity-60">
                  {issuing ? "Issuing…" : "Issue clearance"}
                </button>
              )}
              {clearanceError && <p className="mt-2 text-sm text-navy-dark">{clearanceError}</p>}
              {clearances && clearances.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-ink/60">Clearance history</p>
                  <ul className="mt-2 space-y-1">
                    {clearances.map((c) => (
                      <li key={c.id} className="text-xs text-ink/55">
                        {new Date(c.issuedAt).toLocaleString()} — {statusLabel[c.eligibilityTier]}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {clearances && clearances.length === 0 && (
                <p className="mt-2 text-xs text-ink/45">No clearance has been issued for this student yet.</p>
              )}
            </div>
          </PortalSection>
        </div>
      )}

      {/* RG018 — graduation list: every student in a programme, categorized
          by the same three-tier eligibility computation as the single
          audit above. */}
      <div className="mt-10">
        <h2 className="font-display text-xl">Graduation list by programme</h2>
        <form onSubmit={loadList} className="mt-4 flex gap-3">
          <input
            value={programmeId}
            onChange={(e) => setProgrammeId(e.target.value)}
            placeholder="Programme ID"
            className="input"
          />
          <button type="submit" className="btn-primary shrink-0">Load list</button>
        </form>
        {listError && <p className="mt-4 text-sm text-navy-dark">{listError}</p>}
        {list && (
          <div className="mt-6 space-y-6">
            <p className="text-sm text-ink/60">
              {list.totalStudents} students · {list.eligible.length} eligible ·{" "}
              {list.conditionallyEligible.length} conditionally eligible ·{" "}
              {list.notEligible.length} not eligible
            </p>
            {(["eligible", "conditionallyEligible", "notEligible"] as const).map((key) => (
              <PortalSection key={key} title={key === "eligible" ? "Eligible" : key === "conditionallyEligible" ? "Conditionally eligible" : "Not eligible"}>
                {list[key].length === 0 && <p className="text-sm text-ink/45">None.</p>}
                <ul className="divide-y divide-line">
                  {list[key].map((r) => (
                    <li key={r.studentId ?? r.studentNumber} className="py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span>{r.fullName ?? r.studentNumber} ({r.studentNumber})</span>
                        <Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge>
                      </div>
                      {r.outstanding.length > 0 && <p className="mt-1 text-xs text-ink/45">{r.outstanding.join("; ")}</p>}
                    </li>
                  ))}
                </ul>
              </PortalSection>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}

function CheckRow({ label, met, children }: { label: string; met: boolean; children: React.ReactNode }) {
  return (
    <div className="border border-line p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <Badge tone={met ? "ok" : "warn"}>{met ? "Cleared" : "Pending"}</Badge>
      </div>
      <p className="mt-2 text-xs text-ink/55">{children}</p>
    </div>
  );
}
