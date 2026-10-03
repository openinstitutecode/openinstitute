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

type Budget = {
  id: string; department: string; category: string; fiscalPeriod: string;
  allocatedAmount: string; status: string; justification: string | null;
};

const statusTone: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  draft: "neutral", submitted: "warn", approved: "ok", rejected: "danger",
};

export default function AdminBudgets() {
  const userName = useCurrentUserName();
  const [budgets, setBudgets] = useState<Budget[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState("");
  const [fiscalPeriod, setFiscalPeriod] = useState("");
  const [allocatedAmount, setAllocatedAmount] = useState(0);
  const [justification, setJustification] = useState("");

  function load() {
    apiFetch<Budget[]>("/budgets").then(setBudgets).catch((err) => setError(err instanceof Error ? err.message : "Could not load budgets."));
  }
  useEffect(load, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/budgets", {
        method: "POST",
        body: JSON.stringify({ department, category, fiscalPeriod, allocatedAmount, justification: justification || undefined }),
      });
      setDepartment(""); setCategory(""); setFiscalPeriod(""); setAllocatedAmount(0); setJustification("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create budget.");
    }
  }

  async function submitBudget(id: string) {
    await apiFetch(`/budgets/${id}/submit`, { method: "PATCH" }).catch((err) => setError(err instanceof Error ? err.message : "Could not submit."));
    load();
  }

  async function decide(id: string, decision: "approved" | "rejected") {
    try {
      await apiFetch(`/budgets/${id}/decide`, { method: "PATCH", body: JSON.stringify({ decision }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not decide — the submitter cannot also approve.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Budgets</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Draft → submitted → approved/rejected. The submitter can never also approve their own budget.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="New budget (draft)">
          <form onSubmit={create} className="space-y-3">
            <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" className="input" />
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="input" />
            <input value={fiscalPeriod} onChange={(e) => setFiscalPeriod(e.target.value)} placeholder="Fiscal period (e.g. 2026-S1)" className="input" />
            <input type="number" min={1} value={allocatedAmount || ""} onChange={(e) => setAllocatedAmount(Number(e.target.value))} placeholder="Allocated amount (KES)" className="input" />
            <textarea rows={2} value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Justification (optional)" className="input" />
            <button type="submit" className="btn-primary">Create draft</button>
          </form>
        </PortalSection>

        <PortalSection title="All budgets">
          <ul className="divide-y divide-line">
            {budgets?.map((b) => (
              <li key={b.id} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>{b.department} — {b.category} ({b.fiscalPeriod})</span>
                  <Badge tone={statusTone[b.status]}>{b.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink/50">KES {Number(b.allocatedAmount).toLocaleString()}</p>
                <div className="mt-2 flex gap-2">
                  {b.status === "draft" && <button onClick={() => submitBudget(b.id)} className="text-xs text-navy underline decoration-dotted">Submit for approval</button>}
                  {b.status === "submitted" && (
                    <>
                      <button onClick={() => decide(b.id, "approved")} className="text-xs text-forest underline decoration-dotted">Approve</button>
                      <button onClick={() => decide(b.id, "rejected")} className="text-xs text-navy-dark underline decoration-dotted">Reject</button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
