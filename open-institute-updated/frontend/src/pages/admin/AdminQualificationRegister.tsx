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
  { to: "/admin/regulatory-reports", label: "Regulatory Reports" },
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

type RegisterRow = {
  programmeId: string;
  name: string;
  qualificationLevel: string;
  approvalStatus: string;
  durationSemesters: number;
  enrolledCount: number;
  awardingBody: { id: string; name: string } | null;
};

type AwardingBody = { id: string; name: string; accreditationNumber: string | null; contactEmail: string | null; programmeCount: number };

export default function AdminQualificationRegister() {
  const userName = useCurrentUserName();
  const [register, setRegister] = useState<RegisterRow[] | null>(null);
  const [bodies, setBodies] = useState<AwardingBody[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [accreditationNumber, setAccreditationNumber] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  function loadAll() {
    apiFetch<RegisterRow[]>("/registry/qualification-register").then(setRegister).catch(() => setRegister([]));
    apiFetch<AwardingBody[]>("/registry/awarding-bodies").then(setBodies).catch(() => setBodies([]));
  }
  useEffect(loadAll, []);

  async function addBody(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      await apiFetch("/registry/awarding-bodies", {
        method: "POST",
        body: JSON.stringify({
          name,
          accreditationNumber: accreditationNumber || undefined,
          contactEmail: contactEmail || undefined,
        }),
      });
      setName("");
      setAccreditationNumber("");
      setContactEmail("");
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add awarding body.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Qualification register</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Every programme's real qualification level, approval status, and the
        awarding body that actually confers it — not a separately
        maintained duplicate list.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 space-y-6">
        <PortalSection title="Register">
          {register && register.length === 0 && <p className="text-sm text-ink/50">No programmes yet.</p>}
          <ul className="divide-y divide-line">
            {register?.map((r) => (
              <li key={r.programmeId} className="py-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{r.name}</span>
                  <Badge tone={r.approvalStatus === "accredited" ? "ok" : r.approvalStatus === "withdrawn" ? "danger" : "neutral"}>
                    {r.approvalStatus}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-ink/50">
                  {r.qualificationLevel} · {r.durationSemesters} semesters · {r.enrolledCount} enrolled ·{" "}
                  {r.awardingBody ? `Awarded by ${r.awardingBody.name}` : "No awarding body set"}
                </p>
              </li>
            ))}
          </ul>
        </PortalSection>

        <div className="grid gap-6 lg:grid-cols-2">
          <PortalSection title="Awarding bodies">
            {bodies && bodies.length === 0 && <p className="text-sm text-ink/50">None recorded yet.</p>}
            <ul className="divide-y divide-line">
              {bodies?.map((b) => (
                <li key={b.id} className="py-2 text-sm">
                  <p>{b.name}</p>
                  <p className="text-xs text-ink/45">
                    {b.accreditationNumber ?? "No accreditation number"} · {b.programmeCount} programme(s)
                  </p>
                </li>
              ))}
            </ul>
          </PortalSection>

          <PortalSection title="Add an awarding body">
            <form onSubmit={addBody} className="space-y-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="input" />
              <input value={accreditationNumber} onChange={(e) => setAccreditationNumber(e.target.value)} placeholder="Accreditation number (optional)" className="input" />
              <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Contact email (optional)" className="input" />
              <button type="submit" className="btn-primary">Add</button>
            </form>
          </PortalSection>
        </div>
      </div>
    </PortalShell>
  );
}
