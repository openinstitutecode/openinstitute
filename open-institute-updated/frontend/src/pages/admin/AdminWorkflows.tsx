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

type Stage = { id: string; order: number; name: string; approverRole: string };
type Definition = { id: string; name: string; description: string | null; category: string; isActive: boolean; stages: Stage[] };
type Action = { id: string; stageOrder: number; action: string; actedById: string; comment: string | null; actedAt: string };
type Instance = {
  id: string;
  title: string;
  entityType: string | null;
  entityId: string | null;
  currentStageOrder: number;
  status: string;
  startedAt: string;
  definition: Definition;
  actions: Action[];
};

const ROLE_OPTIONS = [
  "SUPER_ADMIN", "BOARD_MEMBER", "PRINCIPAL", "DEPUTY_PRINCIPAL", "REGISTRAR",
  "FINANCE_OFFICER", "ACCOUNTANT", "HR_OFFICER", "QA_OFFICER", "ICT_ADMIN",
  "LIBRARIAN", "ADMISSIONS_OFFICER", "EXAMINATION_OFFICER", "DEPARTMENT_HEAD",
  "PROGRAMME_COORDINATOR", "TRAINER", "COUNSELLOR", "CAREER_OFFICER",
  "ATTACHMENT_OFFICER",
];

export default function AdminWorkflows() {
  const userName = useCurrentUserName();
  const [definitions, setDefinitions] = useState<Definition[] | null>(null);
  const [instances, setInstances] = useState<Instance[] | null>(null);
  const [myQueue, setMyQueue] = useState<Instance[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [defName, setDefName] = useState("");
  const [defCategory, setDefCategory] = useState("general");
  const [stageRows, setStageRows] = useState<{ name: string; approverRole: string }[]>([
    { name: "", approverRole: ROLE_OPTIONS[0] },
  ]);

  const [startDefinitionId, setStartDefinitionId] = useState("");
  const [startTitle, setStartTitle] = useState("");
  const [startEntityType, setStartEntityType] = useState("");
  const [startEntityId, setStartEntityId] = useState("");

  function load() {
    apiFetch<Definition[]>("/workflows/definitions").then(setDefinitions).catch(() => undefined);
    apiFetch<Instance[]>("/workflows/instances").then(setInstances).catch(() => undefined);
    apiFetch<Instance[]>("/workflows/instances/mine-to-act").then(setMyQueue).catch(() => undefined);
  }
  useEffect(load, []);

  function updateStageRow(i: number, field: "name" | "approverRole", value: string) {
    setStageRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  async function createDefinition(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/workflows/definitions", {
        method: "POST",
        body: JSON.stringify({
          name: defName,
          category: defCategory,
          stages: stageRows.filter((s) => s.name.trim().length > 0),
        }),
      });
      setDefName("");
      setStageRows([{ name: "", approverRole: ROLE_OPTIONS[0] }]);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create workflow definition.");
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await apiFetch(`/workflows/definitions/${id}/active`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !isActive }),
    }).catch(() => undefined);
    load();
  }

  async function startInstance(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/workflows/instances", {
        method: "POST",
        body: JSON.stringify({
          definitionId: startDefinitionId,
          title: startTitle,
          entityType: startEntityType || undefined,
          entityId: startEntityId || undefined,
        }),
      });
      setStartTitle("");
      setStartEntityType("");
      setStartEntityId("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start workflow instance.");
    }
  }

  async function act(id: string, action: "approve" | "reject" | "comment") {
    const comment = action === "comment" || action === "reject" ? window.prompt("Comment (optional):") ?? undefined : undefined;
    try {
      await apiFetch(`/workflows/instances/${id}/act`, { method: "POST", body: JSON.stringify({ action, comment }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record that action.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Workflow engine</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        A reusable, role-gated, multi-stage approval engine. Define a template once, then start
        real instances against any record. Existing hardcoded approval chains elsewhere in the
        system (results, credit transfer, programme accreditation) are not migrated onto this —
        this is the general-purpose engine for everything that isn't already built as its own
        dedicated chain.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="New workflow definition">
          <form onSubmit={createDefinition} className="space-y-3">
            <input value={defName} onChange={(e) => setDefName(e.target.value)} placeholder="Workflow name" className="input" required />
            <input value={defCategory} onChange={(e) => setDefCategory(e.target.value)} placeholder="Category (e.g. programme_approval)" className="input" />
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-ink/50">Stages, in order</p>
              {stageRows.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={row.name}
                    onChange={(e) => updateStageRow(i, "name", e.target.value)}
                    placeholder={`Stage ${i + 1} name`}
                    className="input flex-1"
                  />
                  <select value={row.approverRole} onChange={(e) => updateStageRow(i, "approverRole", e.target.value)} className="input">
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setStageRows((rows) => [...rows, { name: "", approverRole: ROLE_OPTIONS[0] }])}
                className="text-xs text-navy underline decoration-dotted"
              >
                + Add stage
              </button>
            </div>
            <button type="submit" className="btn-primary">Create workflow</button>
          </form>
        </PortalSection>

        <PortalSection title="Start an instance">
          <form onSubmit={startInstance} className="space-y-3">
            <select value={startDefinitionId} onChange={(e) => setStartDefinitionId(e.target.value)} className="input" required>
              <option value="">Choose a workflow…</option>
              {definitions?.filter((d) => d.isActive).map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.stages.length} stage{d.stages.length === 1 ? "" : "s"})</option>
              ))}
            </select>
            <input value={startTitle} onChange={(e) => setStartTitle(e.target.value)} placeholder="Title for this run" className="input" required />
            <input value={startEntityType} onChange={(e) => setStartEntityType(e.target.value)} placeholder="Entity type (optional, e.g. programme)" className="input" />
            <input value={startEntityId} onChange={(e) => setStartEntityId(e.target.value)} placeholder="Entity ID (optional)" className="input" />
            <button type="submit" className="btn-primary">Start workflow</button>
          </form>
        </PortalSection>
      </div>

      <div className="mt-8">
        <PortalSection title="Workflow definitions">
          <ul className="divide-y divide-line">
            {definitions?.map((d) => (
              <li key={d.id} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>
                    <strong>{d.name}</strong>{" "}
                    <Badge tone={d.isActive ? "ok" : "neutral"}>{d.isActive ? "active" : "inactive"}</Badge>{" "}
                    <span className="text-xs text-ink/50">({d.category})</span>
                  </span>
                  <button onClick={() => toggleActive(d.id, d.isActive)} className="text-xs text-navy underline decoration-dotted">
                    {d.isActive ? "Deactivate" : "Activate"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-ink/50">
                  {d.stages.map((s) => `${s.order}. ${s.name} (${s.approverRole})`).join(" → ")}
                </p>
              </li>
            ))}
            {definitions?.length === 0 && <p className="text-sm text-ink/50">No workflows defined yet.</p>}
          </ul>
        </PortalSection>
      </div>

      <div className="mt-8">
        <PortalSection title="Awaiting your action">
          {myQueue && myQueue.length === 0 && <p className="text-sm text-ink/50">Nothing waiting on your role right now.</p>}
          <ul className="space-y-3">
            {myQueue?.map((inst) => {
              const stage = inst.definition.stages.find((s) => s.order === inst.currentStageOrder);
              return (
                <li key={inst.id} className="border border-line p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span>
                      <strong>{inst.title}</strong> — stage {inst.currentStageOrder}: {stage?.name}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => act(inst.id, "approve")} className="text-xs text-forest underline decoration-dotted">Approve</button>
                      <button onClick={() => act(inst.id, "reject")} className="text-xs text-navy-dark underline decoration-dotted">Reject</button>
                      <button onClick={() => act(inst.id, "comment")} className="text-xs text-ink/60 underline decoration-dotted">Comment</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </PortalSection>
      </div>

      <div className="mt-8">
        <PortalSection title="All instances">
          <ul className="divide-y divide-line">
            {instances?.map((inst) => (
              <li key={inst.id} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>
                    <strong>{inst.title}</strong>{" "}
                    {inst.entityType && <span className="text-xs text-ink/50">({inst.entityType})</span>}
                  </span>
                  <Badge tone={inst.status === "approved" ? "ok" : inst.status === "rejected" ? "danger" : "warn"}>
                    {inst.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-ink/50">
                  {inst.definition.name} — currently at stage {inst.currentStageOrder} of {inst.definition.stages.length}
                </p>
                {inst.actions.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-ink/45">
                    {inst.actions.map((a) => (
                      <li key={a.id}>
                        Stage {a.stageOrder}: {a.action}{a.comment ? ` — "${a.comment}"` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            {instances?.length === 0 && <p className="text-sm text-ink/50">No workflow instances yet.</p>}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
