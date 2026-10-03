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

type Appeal = {
  id: string;
  type: string;
  reason: string;
  status: string;
  decision: string | null;
  student: { fullName: string; studentNumber: string };
};

export default function AdminAppeals() {
  const userName = useCurrentUserName();
  const [appeals, setAppeals] = useState<Appeal[] | null>(null);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Appeal[]>("/appeals")
      .then(setAppeals)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load appeals."));
  }
  useEffect(load, []);

  async function decide(id: string, e: FormEvent) {
    e.preventDefault();
    const decision = decisions[id];
    if (!decision) return;
    try {
      await apiFetch(`/appeals/${id}/decision`, {
        method: "PATCH",
        body: JSON.stringify({ decision }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save decision.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Appeals</h1>
      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8">
        <PortalSection title="Open appeals">
          {appeals && appeals.length === 0 && <p className="text-sm text-ink/50">No appeals filed.</p>}
          <ul className="divide-y divide-line">
            {appeals?.map((a) => (
              <li key={a.id} className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {a.student.fullName} <span className="text-xs text-ink/40">({a.student.studentNumber})</span>
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-navy">{a.type.replace("_", " ")}</p>
                    <p className="mt-2 text-sm text-ink/65">{a.reason}</p>
                  </div>
                  <Badge tone={a.status === "decided" ? "ok" : "warn"}>{a.status}</Badge>
                </div>
                {a.status !== "decided" ? (
                  <form onSubmit={(e) => decide(a.id, e)} className="mt-3 flex gap-2">
                    <input
                      placeholder="Decision notes…"
                      value={decisions[a.id] ?? ""}
                      onChange={(e) => setDecisions((d) => ({ ...d, [a.id]: e.target.value }))}
                      className="input flex-1"
                    />
                    <button type="submit" className="btn-secondary shrink-0">Record decision</button>
                  </form>
                ) : (
                  <p className="mt-2 text-xs text-ink/50">Decision: {a.decision}</p>
                )}
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
