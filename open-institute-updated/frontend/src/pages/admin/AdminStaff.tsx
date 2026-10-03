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
  id: string; staffNumber: string | null; fullName: string; department: string | null; title: string | null; photoUrl?: string | null;
  contractType: string | null; user: { email: string; role: string; isActive: boolean };
};

const staffRoles = [
  "BOARD_MEMBER", "PRINCIPAL", "DEPUTY_PRINCIPAL", "REGISTRAR", "FINANCE_OFFICER", "ACCOUNTANT",
  "HR_OFFICER", "QA_OFFICER", "ICT_ADMIN", "LIBRARIAN", "ADMISSIONS_OFFICER", "EXAMINATION_OFFICER",
  "DEPARTMENT_HEAD", "PROGRAMME_COORDINATOR", "TRAINER", "COUNSELLOR", "CAREER_OFFICER",
  "ATTACHMENT_OFFICER", "EXTERNAL_EXAMINER", "AUDITOR", "REGULATORY_INSPECTOR",
];

export default function AdminStaff() {
  const userName = useCurrentUserName();
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("TRAINER");
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [title, setTitle] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [created, setCreated] = useState<{ staffNumber: string; emailStatus: string } | null>(null);

  function load() {
    apiFetch<Staff[]>("/staff").then(setStaff).catch((err) => setError(err instanceof Error ? err.message : "Could not load staff."));
  }
  useEffect(load, []);

  async function addStaff(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    try {
      const result = await apiFetch<{ staffNumber: string; emailStatus: string }>("/staff", {
        method: "POST",
        body: JSON.stringify({ email, password, role, fullName, department: department || undefined, title: title || undefined, photoDataUrl: photoDataUrl || undefined }),
      });
      setCreated(result);
      setEmail(""); setPassword(""); setFullName(""); setDepartment(""); setTitle(""); setPhotoDataUrl("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create staff profile.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Staff management</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Create staff or trainer logins with role-scoped profiles. IDs are generated immediately. Email delivery is not configured.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Staff directory">
          <ul className="divide-y divide-line">
            {staff?.map((s) => (
              <li key={s.id} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-3">
                    {s.photoUrl?.startsWith("data:image/") && <img src={s.photoUrl} alt="" className="h-9 w-9 rounded-full object-cover" />}
                    {s.fullName}
                  </span>
                  <Badge tone={s.user.isActive ? "ok" : "neutral"}>{s.user.role}</Badge>
                </div>
                <p className="text-xs text-ink/45">{s.staffNumber ?? "No staff ID"} · {s.title ?? "Staff"} · {s.department ?? "No department"} · {s.user.email}</p>
              </li>
            ))}
          </ul>
        </PortalSection>

        <PortalSection title="Create a staff or trainer account">
          <form onSubmit={addStaff} className="space-y-3">
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Work email" className="input" />
            <input required type="password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temporary password" className="input" autoComplete="new-password" />
            <select value={role} onChange={(e) => setRole(e.target.value)} className="input">{staffRoles.map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}</select>
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="input" />
            <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" className="input" />
            {role !== "TRAINER" && <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title" className="input" />}
            <label className="block text-sm">Profile photo (PNG/JPEG)
              <input type="file" accept="image/png,image/jpeg" className="input mt-1" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return setPhotoDataUrl("");
                if (file.size > 300_000) { setError("Photo must be 300 KB or smaller."); event.target.value = ""; return; }
                const reader = new FileReader();
                reader.onload = () => setPhotoDataUrl(String(reader.result));
                reader.readAsDataURL(file);
              }} />
            </label>
            {created && <p role="status" className="text-sm text-forest">Created staff ID {created.staffNumber}. Email status: not configured; no email was sent.</p>}
            <button type="submit" className="btn-primary">Create account and profile</button>
          </form>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
