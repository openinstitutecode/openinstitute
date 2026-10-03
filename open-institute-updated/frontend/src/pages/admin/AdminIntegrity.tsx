import { useEffect, useState } from "react";
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

type Case = {
  id: string;
  student: { fullName: string; studentNumber: string };
  raisedBy: string;
  description: string;
  status: string;
};

export default function AdminIntegrity() {
  const userName = useCurrentUserName();
  const [cases, setCases] = useState<Case[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Case[]>("/integrity/cases")
      .then(setCases)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load cases."));
  }
  useEffect(load, []);

  async function decide(id: string, status: "dismissed" | "upheld") {
    try {
      await apiFetch(`/integrity/cases/${id}/decision`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save decision.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Academic integrity cases</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Every case here needs a human decision — an AI flag on its own is
        never treated as a finding of misconduct.
      </p>

      {error && <p className="mt-6 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8">
        <PortalSection title="Open cases">
          {cases && cases.length === 0 && <p className="text-sm text-ink/50">No open cases.</p>}
          <ul className="divide-y divide-line">
            {cases?.map((c) => (
              <li key={c.id} className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {c.student.fullName} <span className="text-xs text-ink/40">({c.student.studentNumber})</span>
                    </p>
                    <p className="mt-1 text-sm text-ink/65">{c.description}</p>
                    <p className="mt-1 text-xs text-ink/40">Raised by: {c.raisedBy.replace("_", " ")}</p>
                  </div>
                  <Badge tone={c.status === "under_review" ? "warn" : c.status === "upheld" ? "danger" : "ok"}>
                    {c.status.replace("_", " ")}
                  </Badge>
                </div>
                {c.status === "under_review" && (
                  <div className="mt-3 flex gap-3">
                    <button onClick={() => decide(c.id, "dismissed")} className="text-xs font-medium text-forest hover:underline">
                      Dismiss
                    </button>
                    <button onClick={() => decide(c.id, "upheld")} className="text-xs font-medium text-red-700 hover:underline">
                      Uphold
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
