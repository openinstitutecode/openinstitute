import { FormEvent, useEffect, useState } from "react";
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

type Sent = { id: string; title: string; body: string; createdAt: string; user: { email: string } };

export default function AdminCommunication() {
  const userName = useCurrentUserName();
  const [sent, setSent] = useState<Sent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ recipientCount: number } | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all_students" | "all_trainers" | "programme" | "role">("all_students");
  const [programmeId, setProgrammeId] = useState("");
  const [role, setRole] = useState("");

  function load() {
    apiFetch<Sent[]>("/communication/sent").then(setSent).catch(() => undefined);
  }
  useEffect(load, []);

  async function send(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<{ recipientCount: number }>("/communication/broadcast", {
        method: "POST",
        body: JSON.stringify({ title, body, audience, programmeId: programmeId || undefined, role: role || undefined }),
      });
      setResult(res);
      setTitle(""); setBody("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send broadcast.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Communication centre</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        A broadcast creates a real notification for every real recipient in
        the chosen audience — the recipient count you see is exact, not estimated.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Compose a broadcast">
          <form onSubmit={send} className="space-y-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="input" />
            <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" className="input" />
            <select value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)} className="input">
              <option value="all_students">All students</option>
              <option value="all_trainers">All trainers</option>
              <option value="programme">A specific programme</option>
              <option value="role">A specific role</option>
            </select>
            {audience === "programme" && (
              <input value={programmeId} onChange={(e) => setProgrammeId(e.target.value)} placeholder="Programme ID" className="input" />
            )}
            {audience === "role" && (
              <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (e.g. TRAINER)" className="input" />
            )}
            <button type="submit" className="btn-primary">Send broadcast</button>
          </form>
          {result && <p className="mt-2 text-xs text-forest">Sent to {result.recipientCount} recipient(s).</p>}
        </PortalSection>

        <PortalSection title="Recently sent">
          <ul className="divide-y divide-line">
            {sent?.slice(0, 20).map((s) => (
              <li key={s.id} className="py-2 text-sm">
                <p>{s.title}</p>
                <p className="text-xs text-ink/45">{s.user.email} · {new Date(s.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
