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

type RepoStatus = {
  source:
    | "internal"
    | "dspace"
    | "eprints"
    | "islandora"
    | "greenstone"
    | "doaj"
    | "crossref"
    | "arxiv"
    | "core"
    | "internet_archive";
  configured: boolean;
  ok: boolean | null;
  error?: string;
};

const labels: Record<RepoStatus["source"], string> = {
  internal: "College catalogue",
  dspace: "DSpace",
  eprints: "EPrints (OAI-PMH)",
  islandora: "Islandora (Drupal JSON:API)",
  greenstone: "Greenstone (OAI-PMH)",
  doaj: "DOAJ — Directory of Open Access Journals",
  crossref: "Crossref — scholarly metadata",
  arxiv: "arXiv — ICT/CS preprints",
  core: "CORE — open-access full text",
  internet_archive: "Internet Archive — e-books",
};

const envVars: Record<RepoStatus["source"], string> = {
  internal: "—",
  dspace: "DSPACE_BASE_URL",
  eprints: "EPRINTS_OAI_URL",
  islandora: "ISLANDORA_BASE_URL",
  greenstone: "GREENSTONE_OAI_URL",
  doaj: "free, no key (LIBRARY_DISABLE_DOAJ=true to turn off)",
  crossref: "free, no key (LIBRARY_DISABLE_CROSSREF=true to turn off)",
  arxiv: "free, no key (LIBRARY_DISABLE_ARXIV=true to turn off)",
  core: "CORE_API_KEY (free signup at core.ac.uk/services/api)",
  internet_archive: "free, no key (LIBRARY_DISABLE_INTERNET_ARCHIVE=true to turn off)",
};

export default function AdminLibrary() {
  const userName = useCurrentUserName();
  const [statuses, setStatuses] = useState<RepoStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<RepoStatus[]>("/library/repository-status")
      .then(setStatuses)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not check repository status."));
  }, []);

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Digital library connectors</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Federated search reaches every repository configured below via its
        real API (DSpace REST, OAI-PMH for EPrints/Greenstone, Drupal
        JSON:API for Islandora), plus five public digital-library/scholarly
        APIs that need no institutional deployment of their own — DOAJ,
        Crossref, arXiv, and Internet Archive work with no key at all; CORE
        needs a free key. Set the listed environment variable to connect or
        disable one.
      </p>

      {error && <p className="mt-6 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8">
        <PortalSection title="Connector status">
          {!statuses && !error && <p className="text-sm text-ink/50">Checking…</p>}
          {statuses && (
            <ul className="divide-y divide-line">
              {statuses.map((s) => (
                <li key={s.source} className="flex items-center justify-between py-4 text-sm">
                  <div>
                    <p className="font-medium">{labels[s.source]}</p>
                    <p className="mt-1 font-mono text-xs text-ink/40">{envVars[s.source]}</p>
                    {s.error && <p className="mt-1 text-xs text-navy-dark">{s.error}</p>}
                  </div>
                  <Badge tone={!s.configured ? "neutral" : s.ok ? "ok" : "danger"}>
                    {!s.configured ? "Not configured" : s.ok ? "Reachable" : "Unreachable"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </PortalSection>
      </div>

      <p className="mt-6 text-xs text-ink/45">
        See <code>docs/digital-library-integration.md</code> for exactly what
        each connector expects.
      </p>
    </PortalShell>
  );
}
