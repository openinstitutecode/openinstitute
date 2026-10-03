import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge, StatCard } from "../../components/portal/Primitives";
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

type ARInvoice = { invoiceId: string; studentName: string; studentNumber: string; balance: number; daysOverdue: number; bucket: string };
type AR = { totalReceivable: number; byBucket: Record<string, number>; invoices: ARInvoice[] };
type APExpense = { id: string; category: string; description: string; amount: string; incurredAt: string };
type AP = { totalPayable: number; byCategory: Record<string, number>; expenses: APExpense[] };

export default function AdminReceivablePayable() {
  const userName = useCurrentUserName();
  const [ar, setAr] = useState<AR | null>(null);
  const [ap, setAp] = useState<AP | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<AR>("/finance/accounts-receivable").then(setAr).catch((err) => setError(err instanceof Error ? err.message : "Could not load AR."));
    apiFetch<AP>("/procurement/accounts-payable").then(setAp).catch(() => undefined);
  }
  useEffect(load, []);

  async function payExpense(id: string) {
    await apiFetch(`/procurement/expenses/${id}/pay`, { method: "PATCH" }).catch(() => undefined);
    load();
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Accounts receivable &amp; payable</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Real balances — receivable is unpaid invoice balances aged by days
        overdue; payable is expenses recorded but not yet marked paid.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <StatCard label="Total receivable" value={ar ? `KES ${ar.totalReceivable.toLocaleString()}` : "—"} />
        <StatCard label="Total payable" value={ap ? `KES ${ap.totalPayable.toLocaleString()}` : "—"} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Accounts receivable (aged)">
          {ar && Object.entries(ar.byBucket).map(([bucket, amt]) => (
            <p key={bucket} className="text-xs text-ink/50">{bucket}: KES {amt.toLocaleString()}</p>
          ))}
          <ul className="mt-3 divide-y divide-line">
            {ar?.invoices.map((i) => (
              <li key={i.invoiceId} className="flex items-center justify-between py-2 text-sm">
                <span>{i.studentName} ({i.studentNumber})</span>
                <div className="flex items-center gap-2">
                  <span>KES {i.balance.toLocaleString()}</span>
                  <Badge tone={i.bucket === "current" ? "neutral" : i.bucket === "90+" ? "danger" : "warn"}>{i.bucket}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </PortalSection>

        <PortalSection title="Accounts payable (unpaid expenses)">
          {ap && Object.entries(ap.byCategory).map(([cat, amt]) => (
            <p key={cat} className="text-xs text-ink/50">{cat}: KES {amt.toLocaleString()}</p>
          ))}
          <ul className="mt-3 divide-y divide-line">
            {ap?.expenses.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                <span>{e.description} ({e.category})</span>
                <div className="flex items-center gap-2">
                  <span>KES {Number(e.amount).toLocaleString()}</span>
                  <button onClick={() => payExpense(e.id)} className="text-xs text-navy underline decoration-dotted">Mark paid</button>
                </div>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
