import { FormEvent, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { programmes } from "../../lib/programmes";

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

export default function AdminFeeStructure() {
  const userName = useCurrentUserName();
  const [programmeId, setProgrammeId] = useState("");
  const [semester, setSemester] = useState(1);
  const [item, setItem] = useState("Tuition");
  const [amount, setAmount] = useState(25000);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [studentId, setStudentId] = useState("");
  const [sponsorName, setSponsorName] = useState("");
  const [type, setType] = useState<"scholarship" | "sponsorship" | "discount">("scholarship");
  const [scholarshipAmount, setScholarshipAmount] = useState(5000);
  const [scholarshipSemester, setScholarshipSemester] = useState("");
  const [scholarshipSaved, setScholarshipSaved] = useState(false);

  async function addFeeItem(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/fee-structure", {
        method: "POST",
        body: JSON.stringify({ programmeId, semester, item, amount }),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save fee item.");
    }
  }

  async function addScholarship(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setScholarshipSaved(false);
    try {
      await apiFetch("/scholarships", {
        method: "POST",
        body: JSON.stringify({
          studentId,
          sponsorName,
          type,
          amount: scholarshipAmount,
          semester: scholarshipSemester,
        }),
      });
      setScholarshipSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Fee structure &amp; financial support</h1>
      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Add a fee structure item">
          <form onSubmit={addFeeItem} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Programme</span>
              <select required value={programmeId} onChange={(e) => setProgrammeId(e.target.value)} className="input mt-1.5">
                <option value="">Select…</option>
                {programmes.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.name}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-ink/40">
                Note: pass the programme's database ID here in production — slugs shown for readability.
              </span>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-ink/80">Semester</span>
                <input required type="number" min={1} value={semester} onChange={(e) => setSemester(Number(e.target.value))} className="input mt-1.5" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink/80">Amount (KES)</span>
                <input required type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input mt-1.5" />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Item</span>
              <input required value={item} onChange={(e) => setItem(e.target.value)} className="input mt-1.5" />
            </label>
            <button type="submit" className="btn-primary w-full justify-center">Save fee item</button>
            {saved && <p className="text-xs text-forest">Saved.</p>}
          </form>
        </PortalSection>

        <PortalSection title="Award scholarship / sponsorship / discount">
          <form onSubmit={addScholarship} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Student ID</span>
              <input required value={studentId} onChange={(e) => setStudentId(e.target.value)} className="input mt-1.5" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Sponsor / scheme name</span>
              <input required value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} className="input mt-1.5" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Type</span>
              <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="input mt-1.5">
                <option value="scholarship">Scholarship</option>
                <option value="sponsorship">Sponsorship</option>
                <option value="discount">Discount</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-ink/80">Amount (KES)</span>
                <input required type="number" min={1} value={scholarshipAmount} onChange={(e) => setScholarshipAmount(Number(e.target.value))} className="input mt-1.5" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink/80">Semester</span>
                <input required value={scholarshipSemester} onChange={(e) => setScholarshipSemester(e.target.value)} placeholder="e.g. Sem2-2026" className="input mt-1.5" />
              </label>
            </div>
            <button type="submit" className="btn-primary w-full justify-center">Apply to student account</button>
            {scholarshipSaved && <p className="text-xs text-forest">Applied — the student's open invoice balance was reduced.</p>}
          </form>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
