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

type TrendPoint = { month: string; count: number };
type AmountPoint = { month: string; total: number };

type Analytics = {
  windowMonths: number;
  enrollmentTrend: TrendPoint[];
  applicationsTrend: TrendPoint[];
  applicationsByStatus: Record<string, number>;
  revenueTrend: AmountPoint[];
  integrityCaseTrend: TrendPoint[];
  researchOutputTrend: TrendPoint[];
  complaintsTrend: TrendPoint[];
  complianceRate: { mandatoryTotal: number; mandatoryMet: number; percentMet: number };
  institutionSnapshot: {
    totalStudents: number;
    totalTrainers: number;
    studentTrainerRatio: number | null;
    feeCollectionRate: number;
  };
};

// Simple horizontal-bar trend row — no charting library needed for a
// 6-point series, and it stays legible without extra dependencies.
function TrendRow({ label, points, format }: { label: string; points: { month: string; value: number }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div>
      <p className="text-sm font-medium text-ink/70">{label}</p>
      <div className="mt-2 space-y-1.5">
        {points.map((p) => (
          <div key={p.month} className="flex items-center gap-3 text-xs">
            <span className="w-16 shrink-0 text-ink/50">{p.month}</span>
            <div className="h-3 flex-1 bg-navy/[0.06]">
              <div
                className="h-3 bg-navy"
                style={{ width: `${Math.max(2, (p.value / max) * 100)}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-ink/70">
              {format ? format(p.value) : p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminInstitutionalAnalytics() {
  const userName = useCurrentUserName();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Analytics>("/analytics/institutional")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load institutional analytics."));
  }, []);

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Institutional analytics</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Month-over-month trends computed directly from real record timestamps — the Command
        Centre gives today's snapshot, this shows the trajectory behind it. Trends cover the last{" "}
        {data?.windowMonths ?? 6} months.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {data && (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total students" value={data.institutionSnapshot.totalStudents} />
            <StatCard label="Total trainers" value={data.institutionSnapshot.totalTrainers} />
            <StatCard
              label="Student : trainer ratio"
              value={data.institutionSnapshot.studentTrainerRatio ?? "—"}
            />
            <StatCard
              label="Fee collection rate"
              value={`${data.institutionSnapshot.feeCollectionRate}%`}
              hint="Amount paid / amount due, all invoices"
            />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <PortalSection title="Enrollment trend">
              <TrendRow
                label="New students per month"
                points={data.enrollmentTrend.map((p) => ({ month: p.month, value: p.count }))}
              />
            </PortalSection>

            <PortalSection title="Applications trend">
              <TrendRow
                label="New applications per month"
                points={data.applicationsTrend.map((p) => ({ month: p.month, value: p.count }))}
              />
              <p className="mt-3 text-xs text-ink/50">
                By status:{" "}
                {Object.entries(data.applicationsByStatus)
                  .map(([status, count]) => `${status} (${count})`)
                  .join(", ") || "no applications in this window"}
              </p>
            </PortalSection>

            <PortalSection title="Revenue trend">
              <TrendRow
                label="Payments collected per month (KES)"
                points={data.revenueTrend.map((p) => ({ month: p.month, value: p.total }))}
                format={(n) => n.toLocaleString()}
              />
            </PortalSection>

            <PortalSection title="Compliance">
              <p className="text-sm text-ink/70">
                {data.complianceRate.mandatoryMet} of {data.complianceRate.mandatoryTotal} mandatory
                requirements currently met ({data.complianceRate.percentMet}%).
              </p>
            </PortalSection>

            <PortalSection title="Academic integrity cases">
              <TrendRow
                label="New cases per month"
                points={data.integrityCaseTrend.map((p) => ({ month: p.month, value: p.count }))}
              />
            </PortalSection>

            <PortalSection title="Research output">
              <TrendRow
                label="New research projects per month"
                points={data.researchOutputTrend.map((p) => ({ month: p.month, value: p.count }))}
              />
            </PortalSection>

            <PortalSection title="Complaints">
              <TrendRow
                label="New complaints per month"
                points={data.complaintsTrend.map((p) => ({ month: p.month, value: p.count }))}
              />
            </PortalSection>
          </div>
        </>
      )}
    </PortalShell>
  );
}
