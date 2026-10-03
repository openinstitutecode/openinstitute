import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, StatCard } from "../../components/portal/Primitives";
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

type ProgrammeEconomics = {
  byProgramme: { programmeId: string; programmeName: string; enrolledCount: number; revenueCollected: number; directExpenses: number; netContribution: number }[];
  unallocatedInstitutionalExpenses: number;
};
type CashflowForecast = {
  windowDays: number; expectedInflow: number; expectedOutflow: number; projectedNetChange: number; note: string;
};

export default function AdminFinancialPlanning() {
  const userName = useCurrentUserName();
  const [economics, setEconomics] = useState<ProgrammeEconomics | null>(null);
  const [forecast, setForecast] = useState<CashflowForecast | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ProgrammeEconomics>("/procurement/programme-economics").then(setEconomics).catch((err) => setError(err instanceof Error ? err.message : "Could not load programme economics."));
    apiFetch<CashflowForecast>("/procurement/cashflow-forecast").then(setForecast).catch(() => undefined);
  }, []);

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Financial planning</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Programme economics and a cash-flow projection — both computed from
        real recorded data, not modeled or invented trends.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {forecast && (
        <div className="mt-8">
          <p className="text-xs text-ink/45">{forecast.note}</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <StatCard label={`Expected inflow (${forecast.windowDays}d)`} value={`KES ${forecast.expectedInflow.toLocaleString()}`} />
            <StatCard label="Expected outflow" value={`KES ${forecast.expectedOutflow.toLocaleString()}`} />
            <StatCard label="Projected net change" value={`KES ${forecast.projectedNetChange.toLocaleString()}`} />
          </div>
        </div>
      )}

      {economics && (
        <div className="mt-8">
          <PortalSection title="Programme economics">
            <ul className="divide-y divide-line">
              {economics.byProgramme.map((p) => (
                <li key={p.programmeId} className="py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{p.programmeName}</span>
                    <span>{p.enrolledCount} enrolled</span>
                  </div>
                  <p className="mt-1 text-xs text-ink/50">
                    Revenue: KES {p.revenueCollected.toLocaleString()} · Direct expenses: KES {p.directExpenses.toLocaleString()} · Net: KES {p.netContribution.toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink/45">
              Unallocated institutional overhead (expenses not tagged to a
              specific programme): KES {economics.unallocatedInstitutionalExpenses.toLocaleString()}
            </p>
          </PortalSection>
        </div>
      )}
    </PortalShell>
  );
}
