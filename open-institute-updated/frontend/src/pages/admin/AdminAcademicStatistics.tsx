import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection } from "../../components/portal/Primitives";
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

type Stats = {
  totalStudents: number;
  totalProgrammes: number;
  overallStatusCounts: Record<string, number>;
  byProgramme: { programmeId: string; programmeName: string; totalStudents: number; unitCount: number; statusCounts: Record<string, number> }[];
};

export default function AdminAcademicStatistics() {
  const userName = useCurrentUserName();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Stats>("/registry/statistics")
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load statistics."));
  }, []);

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Academic statistics</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Direct counts from current records — no forecasting or projection.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {stats && (
        <div className="mt-8 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatBlock label="Total students" value={stats.totalStudents} />
            <StatBlock label="Programmes" value={stats.totalProgrammes} />
            <StatBlock
              label="Active"
              value={stats.overallStatusCounts["ACTIVE"] ?? 0}
            />
          </div>

          <PortalSection title="By academic status">
            <ul className="divide-y divide-line">
              {Object.entries(stats.overallStatusCounts).map(([status, count]) => (
                <li key={status} className="flex items-center justify-between py-2 text-sm">
                  <span>{status.replace("_", " ")}</span>
                  <span>{count}</span>
                </li>
              ))}
            </ul>
          </PortalSection>

          <PortalSection title="By programme">
            <ul className="divide-y divide-line">
              {stats.byProgramme.map((p) => (
                <li key={p.programmeId} className="py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{p.programmeName}</span>
                    <span>{p.totalStudents} students · {p.unitCount} units</span>
                  </div>
                  <p className="mt-1 text-xs text-ink/50">
                    {Object.entries(p.statusCounts).map(([s, c]) => `${s}: ${c}`).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </PortalSection>
        </div>
      )}

      {/* AD003 — student population analytics: by intake cohort and study
          mode, distinct from the by-programme/by-status view above. */}
      <div className="mt-8">
        <PopulationAnalytics />
      </div>
    </PortalShell>
  );
}

function PopulationAnalytics() {
  type Pop = { totalStudents: number; byIntake: Record<string, number>; byStudyMode: Record<string, number> };
  const [pop, setPop] = useState<Pop | null>(null);

  useEffect(() => {
    apiFetch<Pop>("/registry/population-analytics").then(setPop).catch(() => undefined);
  }, []);

  return (
    <PortalSection title="Population analytics — by intake & study mode">
      {pop && (
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink/50">By intake</p>
            <ul className="mt-2 space-y-1">
              {Object.entries(pop.byIntake).map(([intake, count]) => (
                <li key={intake} className="text-sm">{intake}: {count}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink/50">By study mode</p>
            <ul className="mt-2 space-y-1">
              {Object.entries(pop.byStudyMode).map(([mode, count]) => (
                <li key={mode} className="text-sm">{mode}: {count}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </PortalSection>
  );
}

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-line bg-white p-6">
      <p className="text-sm text-ink/55">{label}</p>
      <p className="mt-2 font-display text-3xl">{value}</p>
    </div>
  );
}
