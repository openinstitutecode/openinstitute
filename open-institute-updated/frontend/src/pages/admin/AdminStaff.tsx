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

type Staff = {
  id: string; fullName: string; department: string | null; title: string | null;
  contractType: string | null; user: { email: string; role: string; isActive: boolean };
};

export default function AdminStaff() {
  const userName = useCurrentUserName();
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [title, setTitle] = useState("");

  function load() {
    apiFetch<Staff[]>("/staff").then(setStaff).catch((err) => setError(err instanceof Error ? err.message : "Could not load staff."));
  }
  useEffect(load, []);

  async function addStaff(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/staff", { method: "POST", body: JSON.stringify({ userId, fullName, department: department || undefined, title: title || undefined }) });
      setUserId(""); setFullName(""); setDepartment(""); setTitle("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create staff profile.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Staff management</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Employment details for staff — department, title, contract type —
        distinct from the login/role management on Users & RBAC.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Staff directory">
          <ul className="divide-y divide-line">
            {staff?.map((s) => (
              <li key={s.id} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>{s.fullName}</span>
                  <Badge tone={s.user.isActive ? "ok" : "neutral"}>{s.user.role}</Badge>
                </div>
                <p className="text-xs text-ink/45">{s.title ?? "No title set"} · {s.department ?? "No department set"} · {s.user.email}</p>
              </li>
            ))}
          </ul>
        </PortalSection>

        <PortalSection title="Create a staff profile">
          <form onSubmit={addStaff} className="space-y-3">
            <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User ID (existing login account)" className="input" />
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="input" />
            <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department (optional)" className="input" />
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="input" />
            <button type="submit" className="btn-primary">Create profile</button>
          </form>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
