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

type Report = { id: string; name: string; entity: string };

export default function AdminReports() {
  const userName = useCurrentUserName();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [name, setName] = useState("");
  const [entity, setEntity] = useState<"students" | "finance" | "compliance" | "research">("students");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [runResult, setRunResult] = useState<{ rowCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Report[]>("/reports").then(setReports).catch((err) => setError(err instanceof Error ? err.message : "Could not load reports."));
  }
  useEffect(load, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/reports", { method: "POST", body: JSON.stringify({ name, entity }) });
      setName("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create report.");
    }
  }

  async function run(id: string) {
    setRunResult(null);
    try {
      const res = await apiFetch<{ rowCount: number }>(`/reports/${id}/run`);
      setRunResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run report.");
    }
  }

  async function subscribe(id: string) {
    await apiFetch("/reports/subscriptions", { method: "POST", body: JSON.stringify({ reportId: id, frequency }) }).catch(() => undefined);
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Report builder</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Real data, run on demand. A subscription only records your intent — this sandbox has no
        scheduler, so nothing fires automatically; a real deployment would run a subscribed report
        on a timer instead of you pressing "Run" yourself.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Saved reports">
          <ul className="divide-y divide-line">
            {reports?.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span>{r.name} <Badge tone="neutral">{r.entity}</Badge></span>
                <div className="flex gap-2">
                  <button onClick={() => run(r.id)} className="text-xs text-navy underline decoration-dotted">Run now</button>
                  <button onClick={() => subscribe(r.id)} className="text-xs text-navy underline decoration-dotted">Subscribe ({frequency})</button>
                </div>
              </li>
            ))}
          </ul>
          {runResult && <p className="mt-2 text-xs text-forest">Returned {runResult.rowCount} row(s).</p>}
        </PortalSection>

        <PortalSection title="New report">
          <form onSubmit={create} className="space-y-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Report name" className="input" />
            <select value={entity} onChange={(e) => setEntity(e.target.value as typeof entity)} className="input">
              <option value="students">Students</option>
              <option value="finance">Finance</option>
              <option value="compliance">Compliance</option>
              <option value="research">Research</option>
            </select>
            <button type="submit" className="btn-primary">Create report</button>
          </form>
          <label className="mt-4 block text-sm">
            <span className="text-ink/70">Default subscription frequency</span>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)} className="input mt-1.5">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
