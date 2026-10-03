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

type Item = { id: string; dueDate: string; amount: string; paidAt: string | null };
type Plan = { id: string; invoiceId: string; items: Item[] };

export default function AdminInstallments() {
  const userName = useCurrentUserName();
  const [invoiceId, setInvoiceId] = useState("");
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState([{ dueDate: "", amount: 0 }]);

  async function load() {
    if (!invoiceId) return;
    setError(null);
    try {
      setPlan(await apiFetch<Plan | null>(`/finance/installment-plans/${invoiceId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load plan.");
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/finance/installment-plans", {
        method: "POST",
        body: JSON.stringify({
          invoiceId,
          installments: rows.map((r) => ({ dueDate: new Date(r.dueDate).toISOString(), amount: r.amount })),
        }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create plan — check the amounts sum to the outstanding balance.");
    }
  }

  async function markPaid(id: string) {
    await apiFetch(`/finance/installment-plans/items/${id}/pay`, { method: "PATCH" }).catch(() => undefined);
    load();
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Installment plans</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        A real, persisted payment schedule — validated at creation against the invoice's actual outstanding balance.
      </p>

      <div className="mt-4 flex gap-2 max-w-md">
        <input value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} placeholder="Invoice ID" className="input flex-1" />
        <button onClick={load} className="btn-secondary shrink-0">Load</button>
      </div>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {plan === null && (
          <PortalSection title="Create a plan">
            <form onSubmit={create} className="space-y-3">
              {rows.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <input type="date" value={r.dueDate} onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, dueDate: e.target.value } : x))} className="input" />
                  <input type="number" min={1} value={r.amount || ""} onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, amount: Number(e.target.value) } : x))} placeholder="Amount" className="input" />
                </div>
              ))}
              <button type="button" onClick={() => setRows((rs) => [...rs, { dueDate: "", amount: 0 }])} className="text-xs text-navy underline decoration-dotted">
                + Add installment
              </button>
              <button type="submit" className="btn-primary w-full justify-center">Create plan</button>
            </form>
          </PortalSection>
        )}

        {plan && (
          <PortalSection title="Schedule">
            <ul className="divide-y divide-line">
              {plan.items.map((it) => (
                <li key={it.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{new Date(it.dueDate).toLocaleDateString()} — KES {Number(it.amount).toLocaleString()}</span>
                  {it.paidAt ? <Badge tone="ok">Paid</Badge> : (
                    <button onClick={() => markPaid(it.id)} className="text-xs text-navy underline decoration-dotted">Mark paid</button>
                  )}
                </li>
              ))}
            </ul>
          </PortalSection>
        )}
      </div>
    </PortalShell>
  );
}
