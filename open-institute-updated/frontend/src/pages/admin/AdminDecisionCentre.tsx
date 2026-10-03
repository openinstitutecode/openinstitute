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

type Alert = { level: "ok" | "warn" | "danger" | "neutral"; message: string };
type CommandCentreData = { alerts: Alert[] };

type Definition = { id: string; name: string; isActive: boolean; stages: { id: string }[] };

type Decision = {
  id: string;
  title: string;
  sourceAlert: string;
  rationale: string | null;
  ownerId: string;
  priority: string;
  dueDate: string | null;
  status: string;
  outcome: string | null;
  workflowInstance: { id: string; status: string; currentStageOrder: number; definition: { name: string; stages: { order: number; name: string }[] } } | null;
};

export default function AdminDecisionCentre() {
  const userName = useCurrentUserName();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [sourceAlert, setSourceAlert] = useState("");
  const [rationale, setRationale] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [dueDate, setDueDate] = useState("");
  const [workflowDefinitionId, setWorkflowDefinitionId] = useState("");

  function load() {
    apiFetch<CommandCentreData>("/command-centre").then((d) => setAlerts(d.alerts)).catch(() => undefined);
    apiFetch<Decision[]>("/decisions").then(setDecisions).catch(() => undefined);
    apiFetch<Definition[]>("/workflows/definitions").then(setDefinitions).catch(() => undefined);
  }
  useEffect(load, []);

  async function createDecision(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/decisions", {
        method: "POST",
        body: JSON.stringify({
          title,
          sourceAlert,
          rationale: rationale || undefined,
          ownerId,
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          workflowDefinitionId: workflowDefinitionId || undefined,
        }),
      });
      setTitle("");
      setSourceAlert("");
      setRationale("");
      setOwnerId("");
      setDueDate("");
      setWorkflowDefinitionId("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create decision.");
    }
  }

  async function resolveManually(id: string, status: "resolved" | "dismissed") {
    const outcome = window.prompt("Outcome / notes:") ?? undefined;
    try {
      await apiFetch(`/decisions/${id}`, { method: "PATCH", body: JSON.stringify({ status, outcome }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update decision.");
    }
  }

  async function actOnWorkflow(instanceId: string, action: "approve" | "reject" | "comment") {
    const comment = window.prompt("Comment (optional):") ?? undefined;
    try {
      await apiFetch(`/workflows/instances/${instanceId}/act`, { method: "POST", body: JSON.stringify({ action, comment }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record that action.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Executive decision centre</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Command Centre alerts are live signals, not tasks — nothing tracks them once you look
        away. This turns one into a real, owned record: an owner, a due date, a priority, and —
        for anything needing cross-functional sign-off — a real workflow driving it to
        resolution instead of a single unaudited status flip.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Current Command Centre alerts">
          {alerts.length === 0 ? (
            <p className="text-sm text-ink/50">Nothing needs attention right now.</p>
          ) : (
            <ul className="space-y-3">
              {alerts.map((a, i) => (
                <li key={i} className="flex items-start justify-between gap-3 text-sm">
                  <span>
                    <Badge tone={a.level}>{a.level}</Badge> {a.message}
                  </span>
                  <button
                    onClick={() => { setTitle(a.message.slice(0, 80)); setSourceAlert(a.message); }}
                    className="shrink-0 text-xs text-navy underline decoration-dotted"
                  >
                    Track as decision
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PortalSection>

        <PortalSection title="New decision">
          <form onSubmit={createDecision} className="space-y-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Decision title" className="input" required />
            <input value={sourceAlert} onChange={(e) => setSourceAlert(e.target.value)} placeholder="Source signal / alert" className="input" required />
            <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Rationale (optional)" className="input" rows={2} />
            <input value={ownerId} onChange={(e) => setOwnerId(e.target.value)} placeholder="Owner (user ID)" className="input" required />
            <div className="flex gap-2">
              <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className="input">
                <option value="low">Low priority</option>
                <option value="medium">Medium priority</option>
                <option value="high">High priority</option>
              </select>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
            </div>
            <select value={workflowDefinitionId} onChange={(e) => setWorkflowDefinitionId(e.target.value)} className="input">
              <option value="">No workflow — track manually</option>
              {definitions.filter((d) => d.isActive && d.stages.length > 0).map((d) => (
                <option key={d.id} value={d.id}>Route through: {d.name}</option>
              ))}
            </select>
            <button type="submit" className="btn-primary">Create decision</button>
          </form>
        </PortalSection>
      </div>

      <div className="mt-8">
        <PortalSection title="Decisions">
          <ul className="divide-y divide-line">
            {decisions?.map((d) => (
              <li key={d.id} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>
                    <strong>{d.title}</strong>{" "}
                    <Badge tone={d.priority === "high" ? "danger" : d.priority === "medium" ? "warn" : "neutral"}>{d.priority}</Badge>
                  </span>
                  <Badge tone={d.status === "resolved" ? "ok" : d.status === "dismissed" ? "neutral" : "warn"}>{d.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink/50">
                  From: {d.sourceAlert} {d.dueDate && `· Due ${new Date(d.dueDate).toLocaleDateString()}`}
                </p>
                {d.workflowInstance ? (
                  <div className="mt-2 flex items-center justify-between rounded-sm bg-navy/[0.04] p-2 text-xs">
                    <span>
                      Workflow: {d.workflowInstance.definition.name} — stage {d.workflowInstance.currentStageOrder} of{" "}
                      {d.workflowInstance.definition.stages.length} ({d.workflowInstance.status})
                    </span>
                    {d.workflowInstance.status === "in_progress" && (
                      <div className="flex gap-2">
                        <button onClick={() => actOnWorkflow(d.workflowInstance!.id, "approve")} className="text-forest underline decoration-dotted">Approve</button>
                        <button onClick={() => actOnWorkflow(d.workflowInstance!.id, "reject")} className="text-navy-dark underline decoration-dotted">Reject</button>
                      </div>
                    )}
                  </div>
                ) : (
                  d.status !== "resolved" && d.status !== "dismissed" && (
                    <div className="mt-2 flex gap-2 text-xs">
                      <button onClick={() => resolveManually(d.id, "resolved")} className="text-forest underline decoration-dotted">Mark resolved</button>
                      <button onClick={() => resolveManually(d.id, "dismissed")} className="text-ink/50 underline decoration-dotted">Dismiss</button>
                    </div>
                  )
                )}
                {d.outcome && <p className="mt-1 text-xs text-ink/45">Outcome: {d.outcome}</p>}
              </li>
            ))}
            {decisions?.length === 0 && <p className="text-sm text-ink/50">No decisions tracked yet.</p>}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
