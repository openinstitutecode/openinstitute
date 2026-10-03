import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge, StatCard } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";

export const links = [
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
  { to: "/admin/virtual-lab", label: "Virtual Lab Console" },
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

type Status = {
  digitalLibrary: {
    configuredRepositories: number;
    totalRepositories: number;
    repositories: { name: string; configured: boolean }[];
  };
  kuccps: {
    lastExport: { at: string; recordCount: number; status: string } | null;
    lastImport: { at: string; recordCount: number; matchedCount: number } | null;
  };
  bulkDataTools: {
    totalImportSessions: number;
    lastImport: { at: string; type: string; status: string; successRows: number; errorRows: number } | null;
  };
  payments: { mpesaConfigured: boolean };
  ai: { anthropicApiConfigured: boolean };
};

export default function AdminIntegrations() {
  const userName = useCurrentUserName();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Status>("/integrations/status")
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load integration status."));
  }, []);

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Integration centre</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        One read-only view of everything already connected to the
        institution — digital library repositories, KUCCPS exchange, bulk
        data tools, payments and the AI provider. This page introduces no
        new connectors; it just aggregates what's already there. ICT admin
        only.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {status && (
        <div className="mt-8 space-y-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Library repositories"
              value={`${status.digitalLibrary.configuredRepositories}/${status.digitalLibrary.totalRepositories}`}
              hint="configured"
            />
            <StatCard label="Bulk import sessions" value={status.bulkDataTools.totalImportSessions} />
            <StatCard label="M-Pesa (Daraja)" value={status.payments.mpesaConfigured ? "Configured" : "Not configured"} />
            <StatCard label="AI provider" value={status.ai.anthropicApiConfigured ? "Configured" : "Not configured"} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <PortalSection title="Digital library repositories">
              <ul className="divide-y divide-line">
                {status.digitalLibrary.repositories.map((r) => (
                  <li key={r.name} className="flex items-center justify-between py-2 text-sm">
                    <span>{r.name}</span>
                    <Badge tone={r.configured ? "ok" : "neutral"}>{r.configured ? "Configured" : "Not configured"}</Badge>
                  </li>
                ))}
                {status.digitalLibrary.repositories.length === 0 && (
                  <li className="py-2 text-sm text-ink/50">No repositories registered.</li>
                )}
              </ul>
            </PortalSection>

            <PortalSection title="KUCCPS exchange">
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium">Last export</p>
                  {status.kuccps.lastExport ? (
                    <p className="text-ink/60">
                      {new Date(status.kuccps.lastExport.at).toLocaleString()} · {status.kuccps.lastExport.recordCount} records ·{" "}
                      <Badge tone={status.kuccps.lastExport.status === "success" ? "ok" : "warn"}>{status.kuccps.lastExport.status}</Badge>
                    </p>
                  ) : (
                    <p className="text-ink/45">No exports yet.</p>
                  )}
                </div>
                <div>
                  <p className="font-medium">Last import</p>
                  {status.kuccps.lastImport ? (
                    <p className="text-ink/60">
                      {new Date(status.kuccps.lastImport.at).toLocaleString()} · {status.kuccps.lastImport.matchedCount}/
                      {status.kuccps.lastImport.recordCount} matched
                    </p>
                  ) : (
                    <p className="text-ink/45">No imports yet.</p>
                  )}
                </div>
              </div>
            </PortalSection>

            <PortalSection title="Bulk data tools">
              {status.bulkDataTools.lastImport ? (
                <p className="text-sm text-ink/60">
                  Last: <strong>{status.bulkDataTools.lastImport.type}</strong> on{" "}
                  {new Date(status.bulkDataTools.lastImport.at).toLocaleString()} —{" "}
                  {status.bulkDataTools.lastImport.successRows} succeeded / {status.bulkDataTools.lastImport.errorRows} failed
                </p>
              ) : (
                <p className="text-sm text-ink/45">No imports yet.</p>
              )}
              <a href="/admin/data-import" className="mt-3 inline-block text-xs font-medium text-forest hover:underline">
                Go to Data Import →
              </a>
            </PortalSection>
          </div>
        </div>
      )}
    </PortalShell>
  );
}
