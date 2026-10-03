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

type Action = {
  id: string;
  description: string;
  status: string;
  dueDate: string | null;
  requirement: { requirement: string } | null;
};

export default function AdminCorrectiveActions() {
  const userName = useCurrentUserName();
  const [actions, setActions] = useState<Action[] | null>(null);
  const [description, setDescription] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Action[]>("/compliance/corrective-actions")
      .then(setActions)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load corrective actions."));
  }
  useEffect(load, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/compliance/corrective-actions", {
        method: "POST",
        body: JSON.stringify({
          description,
          assignedToId,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        }),
      });
      setDescription("");
      setAssignedToId("");
      setDueDate("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create action.");
    }
  }

  async function advance(id: string, status: "in_progress" | "verified" | "closed") {
    try {
      await apiFetch(`/compliance/corrective-actions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Corrective actions</h1>
      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <PortalSection title="Open actions">
          {actions && actions.length === 0 && <p className="text-sm text-ink/50">No corrective actions raised.</p>}
          <ul className="divide-y divide-line">
            {actions?.map((a) => (
              <li key={a.id} className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">{a.description}</p>
                    {a.requirement && <p className="mt-1 text-xs text-navy">Re: {a.requirement.requirement}</p>}
                    {a.dueDate && <p className="mt-1 text-xs text-ink/40">Due {new Date(a.dueDate).toLocaleDateString()}</p>}
                  </div>
                  <Badge tone={a.status === "closed" ? "ok" : a.status === "verified" ? "warn" : "neutral"}>{a.status.replace("_", " ")}</Badge>
                </div>
                {a.status !== "closed" && (
                  <div className="mt-2 flex gap-3">
                    {a.status === "open" && (
                      <button onClick={() => advance(a.id, "in_progress")} className="text-xs font-medium text-navy hover:underline">Start</button>
                    )}
                    {a.status === "in_progress" && (
                      <button onClick={() => advance(a.id, "verified")} className="text-xs font-medium text-gold-dark hover:underline">Mark verified</button>
                    )}
                    {a.status === "verified" && (
                      <button onClick={() => advance(a.id, "closed")} className="text-xs font-medium text-forest hover:underline">Close</button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </PortalSection>

        <PortalSection title="Raise a corrective action">
          <form onSubmit={create} className="space-y-4">
            <textarea required rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What needs fixing?" className="input" />
            <input required value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} placeholder="Assign to (user ID)" className="input" />
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
            <button type="submit" className="btn-primary w-full justify-center">Raise action</button>
          </form>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
