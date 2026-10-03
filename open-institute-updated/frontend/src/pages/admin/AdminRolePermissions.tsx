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

type Override = {
  id: string;
  roleName: string;
  resourceType: string;
  action: string;
  isGranted: boolean;
};

export default function AdminRolePermissions() {
  const userName = useCurrentUserName();
  const [overrides, setOverrides] = useState<Override[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleName, setRoleName] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [action, setAction] = useState("");
  const [isGranted, setIsGranted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filterRole, setFilterRole] = useState("");

  function load() {
    const qs = filterRole ? `?roleName=${encodeURIComponent(filterRole)}` : "";
    apiFetch<Override[]>(`/role-permissions${qs}`)
      .then(setOverrides)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load permission overrides."));
  }
  useEffect(load, [filterRole]);

  async function saveOverride(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch("/role-permissions", {
        method: "POST",
        body: JSON.stringify({ roleName, resourceType, action, isGranted }),
      });
      setRoleName("");
      setResourceType("");
      setAction("");
      setIsGranted(true);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save override.");
    } finally {
      setBusy(false);
    }
  }

  async function removeOverride(id: string) {
    setError(null);
    try {
      await apiFetch(`/role-permissions/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove override.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Role permissions</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Fine-grained overrides on top of the built-in role checks. Each row
        is a (role, resource, action) triple with a granted/denied flag —
        other features consult this before gating access. Super Admin only.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Add or update an override">
          <form onSubmit={saveOverride} className="space-y-3">
            <input value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder='Role name, e.g. "TRAINER"' className="input" required />
            <input
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value)}
              placeholder='Resource type, e.g. "EXAM_SECURITY"'
              className="input"
              required
            />
            <input value={action} onChange={(e) => setAction(e.target.value)} placeholder='Action, e.g. "review"' className="input" required />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isGranted} onChange={(e) => setIsGranted(e.target.checked)} />
              Granted (unchecked = explicitly denied)
            </label>
            <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
              {busy ? "Saving…" : "Save override"}
            </button>
          </form>
        </PortalSection>

        <PortalSection title="Existing overrides">
          <input
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            placeholder="Filter by role name"
            className="input mb-3"
          />
          {overrides && overrides.length === 0 && <p className="text-sm text-ink/50">No overrides configured.</p>}
          <ul className="divide-y divide-line">
            {overrides?.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  {o.roleName} · {o.resourceType} · {o.action}
                </span>
                <div className="flex items-center gap-3">
                  <Badge tone={o.isGranted ? "ok" : "danger"}>{o.isGranted ? "Granted" : "Denied"}</Badge>
                  <button onClick={() => removeOverride(o.id)} className="text-xs font-medium text-red-700 hover:underline">
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
