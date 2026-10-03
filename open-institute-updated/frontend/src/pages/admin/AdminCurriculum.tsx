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
  { to: "/admin/courses", label: "Courses & Moodle" },
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

type Unit = { id: string; code: string; title: string };
type Programme = {
  id: string;
  slug: string;
  name: string;
  qualificationLevel: string;
  durationSemesters: number;
  deliveryMode: string;
  requiresAttachment: boolean;
  version: number;
  approvalStatus: string;
  awardingBody: { name: string } | null;
  units: Unit[];
};

type ComplianceCheck = {
  unitCount: number;
  unitsMissingLearningOutcomes: { id: string; code: string; title: string }[];
  hasExamBlueprint: boolean;
  lastProgrammeReviewDate: string | null;
  programmeReviewStale: boolean;
  compliant: boolean;
};

export default function AdminCurriculum() {
  const userName = useCurrentUserName();
  const [programmes, setProgrammes] = useState<Programme[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ unitId: string; title: string } | null>(null);

  // AD010 — new programme
  const [showNewProgramme, setShowNewProgramme] = useState(false);
  const [npSlug, setNpSlug] = useState("");
  const [npName, setNpName] = useState("");
  const [npLevel, setNpLevel] = useState("");
  const [npDuration, setNpDuration] = useState(6);
  const [npMode, setNpMode] = useState("Full-time");
  const [npAttachment, setNpAttachment] = useState(false);
  const [npMsg, setNpMsg] = useState<string | null>(null);

  // AD010 — programme core-field editing
  const [editingProgramme, setEditingProgramme] = useState<string | null>(null);
  const [epName, setEpName] = useState("");
  const [epLevel, setEpLevel] = useState("");
  const [epDuration, setEpDuration] = useState(6);
  const [epMode, setEpMode] = useState("");
  const [epStatus, setEpStatus] = useState("pending");
  const [epMsg, setEpMsg] = useState<string | null>(null);

  // AD010 — new unit within a programme
  const [addingUnitTo, setAddingUnitTo] = useState<string | null>(null);
  const [nuCode, setNuCode] = useState("");
  const [nuTitle, setNuTitle] = useState("");
  const [nuSemester, setNuSemester] = useState(1);
  const [nuMsg, setNuMsg] = useState<string | null>(null);

  // QA013 — curriculum compliance check
  const [complianceChecks, setComplianceChecks] = useState<Record<string, ComplianceCheck>>({});
  const [complianceBusy, setComplianceBusy] = useState<string | null>(null);

  async function runComplianceCheck(programmeId: string) {
    setComplianceBusy(programmeId);
    try {
      const result = await apiFetch<ComplianceCheck>(`/curriculum/programmes/${programmeId}/compliance-check`);
      setComplianceChecks((c) => ({ ...c, [programmeId]: result }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run compliance check.");
    } finally {
      setComplianceBusy(null);
    }
  }

  function load() {
    apiFetch<Programme[]>("/curriculum/programmes")
      .then(setProgrammes)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load curriculum."));
  }
  useEffect(load, []);

  async function saveTitle() {
    if (!editing) return;
    try {
      await apiFetch(`/curriculum/units/${editing.unitId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: editing.title }),
      });
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  async function createProgramme(e: FormEvent) {
    e.preventDefault();
    setNpMsg(null);
    try {
      await apiFetch("/curriculum/programmes", {
        method: "POST",
        body: JSON.stringify({
          slug: npSlug,
          name: npName,
          qualificationLevel: npLevel,
          durationSemesters: npDuration,
          deliveryMode: npMode,
          requiresAttachment: npAttachment,
        }),
      });
      setNpMsg("Programme created.");
      setNpSlug("");
      setNpName("");
      setNpLevel("");
      setNpDuration(6);
      setNpMode("Full-time");
      setNpAttachment(false);
      load();
    } catch (err) {
      setNpMsg(err instanceof Error ? err.message : "Could not create programme.");
    }
  }

  function startEditProgramme(p: Programme) {
    setEditingProgramme(p.id);
    setEpName(p.name);
    setEpLevel(p.qualificationLevel);
    setEpDuration(p.durationSemesters);
    setEpMode(p.deliveryMode);
    setEpStatus(p.approvalStatus);
    setEpMsg(null);
  }

  async function saveProgramme(id: string) {
    setEpMsg(null);
    try {
      await apiFetch(`/curriculum/programmes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: epName,
          qualificationLevel: epLevel,
          durationSemesters: epDuration,
          deliveryMode: epMode,
          approvalStatus: epStatus,
        }),
      });
      setEditingProgramme(null);
      load();
    } catch (err) {
      setEpMsg(err instanceof Error ? err.message : "Could not save programme.");
    }
  }

  async function createUnit(programmeId: string) {
    setNuMsg(null);
    if (!nuCode || !nuTitle) {
      setNuMsg("Provide a code and title.");
      return;
    }
    try {
      await apiFetch("/curriculum/units", {
        method: "POST",
        body: JSON.stringify({ programmeId, code: nuCode, title: nuTitle, semester: nuSemester }),
      });
      setAddingUnitTo(null);
      setNuCode("");
      setNuTitle("");
      setNuSemester(1);
      load();
    } catch (err) {
      setNuMsg(err instanceof Error ? err.message : "Could not add unit.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Curriculum &amp; programme versions</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Any programme or unit edit bumps the programme's version number and
        is logged to the audit trail — curriculum drift is always visible.
      </p>

      {error && <p className="mt-6 text-sm text-navy-dark">{error}</p>}

      <div className="mt-6">
        <button onClick={() => setShowNewProgramme((v) => !v)} className="btn-secondary">
          {showNewProgramme ? "Cancel" : "New programme"}
        </button>
        {showNewProgramme && (
          <form onSubmit={createProgramme} className="mt-3 grid gap-3 border border-line bg-white p-4 sm:grid-cols-2">
            <input value={npSlug} onChange={(e) => setNpSlug(e.target.value)} placeholder="Slug, e.g. diploma-business-management" className="input" required />
            <input value={npName} onChange={(e) => setNpName(e.target.value)} placeholder="Programme name" className="input" required />
            <input value={npLevel} onChange={(e) => setNpLevel(e.target.value)} placeholder='Qualification level, e.g. "TVET Level 6 Diploma"' className="input" required />
            <input
              type="number"
              min={1}
              value={npDuration}
              onChange={(e) => setNpDuration(Number(e.target.value))}
              placeholder="Duration (semesters)"
              className="input"
              required
            />
            <input value={npMode} onChange={(e) => setNpMode(e.target.value)} placeholder="Delivery mode, e.g. Full-time" className="input" required />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={npAttachment} onChange={(e) => setNpAttachment(e.target.checked)} />
              Requires industrial attachment
            </label>
            <button type="submit" className="btn-primary sm:col-span-2">Create programme</button>
            {npMsg && <p className="text-xs text-ink/60 sm:col-span-2">{npMsg}</p>}
          </form>
        )}
      </div>

      <div className="mt-8 space-y-6">
        {programmes?.map((p) => (
          <PortalSection key={p.id} title={p.name}>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Badge tone="neutral">v{p.version}</Badge>
              <Badge tone={p.approvalStatus === "accredited" ? "ok" : "warn"}>{p.approvalStatus}</Badge>
              <span className="text-xs text-ink/50">
                {p.qualificationLevel} · {p.durationSemesters} semesters · {p.deliveryMode}
                {p.awardingBody ? ` · ${p.awardingBody.name}` : ""}
              </span>
              <button
                onClick={() => (editingProgramme === p.id ? setEditingProgramme(null) : startEditProgramme(p))}
                className="ml-auto text-xs font-medium text-navy hover:underline"
              >
                {editingProgramme === p.id ? "Cancel" : "Edit programme"}
              </button>
              <button
                onClick={() => runComplianceCheck(p.id)}
                disabled={complianceBusy === p.id}
                className="text-xs font-medium text-navy hover:underline disabled:opacity-50"
              >
                {complianceBusy === p.id ? "Checking…" : "Check QA compliance"}
              </button>
            </div>

            {complianceChecks[p.id] && (
              <div className="mb-4 border border-line bg-sand/30 p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={complianceChecks[p.id].compliant ? "ok" : "warn"}>
                    {complianceChecks[p.id].compliant ? "Compliant" : "Gaps found"}
                  </Badge>
                  <Badge tone={complianceChecks[p.id].hasExamBlueprint ? "ok" : "danger"}>
                    {complianceChecks[p.id].hasExamBlueprint ? "Has exam blueprint" : "No exam blueprint"}
                  </Badge>
                  <Badge tone={complianceChecks[p.id].programmeReviewStale ? "warn" : "ok"}>
                    {complianceChecks[p.id].lastProgrammeReviewDate
                      ? `Reviewed ${new Date(complianceChecks[p.id].lastProgrammeReviewDate as string).toLocaleDateString()}`
                      : "Never reviewed"}
                  </Badge>
                </div>
                {complianceChecks[p.id].unitsMissingLearningOutcomes.length > 0 && (
                  <p className="mt-2 text-ink/60">
                    Units missing learning outcomes: {complianceChecks[p.id].unitsMissingLearningOutcomes.map((u) => u.code).join(", ")}
                  </p>
                )}
              </div>
            )}

            {editingProgramme === p.id && (
              <div className="mb-4 grid gap-3 border border-line bg-sand/30 p-3 sm:grid-cols-2">
                <input value={epName} onChange={(e) => setEpName(e.target.value)} className="input" placeholder="Name" />
                <input value={epLevel} onChange={(e) => setEpLevel(e.target.value)} className="input" placeholder="Qualification level" />
                <input
                  type="number"
                  min={1}
                  value={epDuration}
                  onChange={(e) => setEpDuration(Number(e.target.value))}
                  className="input"
                  placeholder="Duration (semesters)"
                />
                <input value={epMode} onChange={(e) => setEpMode(e.target.value)} className="input" placeholder="Delivery mode" />
                <select value={epStatus} onChange={(e) => setEpStatus(e.target.value)} className="input">
                  <option value="pending">pending</option>
                  <option value="accredited">accredited</option>
                  <option value="withdrawn">withdrawn</option>
                </select>
                <button onClick={() => saveProgramme(p.id)} className="btn-primary">Save</button>
                {epMsg && <p className="text-xs text-navy-dark sm:col-span-2">{epMsg}</p>}
              </div>
            )}

            <ul className="divide-y divide-line">
              {p.units.map((u) => (
                <li key={u.id} className="flex items-center justify-between py-3 text-sm">
                  {editing?.unitId === u.id ? (
                    <input
                      value={editing.title}
                      onChange={(e) => setEditing({ unitId: u.id, title: e.target.value })}
                      className="input mr-3 flex-1"
                    />
                  ) : (
                    <span>
                      <span className="font-mono text-xs text-ink/40">{u.code}</span> {u.title}
                    </span>
                  )}
                  {editing?.unitId === u.id ? (
                    <div className="flex gap-2">
                      <button onClick={saveTitle} className="text-xs font-medium text-forest hover:underline">Save</button>
                      <button onClick={() => setEditing(null)} className="text-xs text-ink/50 hover:underline">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditing({ unitId: u.id, title: u.title })}
                      className="text-xs font-medium text-navy hover:underline"
                    >
                      Edit title
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-3 border-t border-line pt-3">
              {addingUnitTo === p.id ? (
                <div className="flex flex-wrap items-end gap-2">
                  <input value={nuCode} onChange={(e) => setNuCode(e.target.value)} placeholder="Unit code" className="input w-32" />
                  <input value={nuTitle} onChange={(e) => setNuTitle(e.target.value)} placeholder="Unit title" className="input flex-1" />
                  <input
                    type="number"
                    min={1}
                    value={nuSemester}
                    onChange={(e) => setNuSemester(Number(e.target.value))}
                    placeholder="Semester #"
                    className="input w-24"
                  />
                  <button onClick={() => createUnit(p.id)} className="btn-primary">Add unit</button>
                  <button onClick={() => setAddingUnitTo(null)} className="btn-secondary">Cancel</button>
                  {nuMsg && <p className="w-full text-xs text-navy-dark">{nuMsg}</p>}
                </div>
              ) : (
                <button onClick={() => setAddingUnitTo(p.id)} className="text-xs font-medium text-navy hover:underline">
                  + Add a unit to this programme
                </button>
              )}
            </div>
          </PortalSection>
        ))}
      </div>
    </PortalShell>
  );
}
