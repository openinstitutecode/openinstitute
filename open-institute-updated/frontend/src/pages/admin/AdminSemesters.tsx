import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, getRole, useCurrentUserName } from "../../lib/api";

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
  { to: "/admin/semesters", label: "Term Setup & Management" },
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

type ProgrammeOption = { id: string; name: string };

type Semester = {
  id: string;
  semesterNumber: number;
  academicYear: string;
  startDate: string;
  endDate: string;
  registrationOpen: string;
  registrationClose: string;
  assessmentStart: string;
  assessmentEnd: string;
  resultsDueDate: string;
  termWeeks: number;
  maxCreditsPerTerm: number;
  creditRate: number;
  adminFee: string;
  isActive: boolean;
  programme: { id: string; name: string };
};

const blankForm = {
  programmeId: "",
  semesterNumber: "1",
  academicYear: "",
  startDate: "",
  endDate: "",
  registrationOpen: "",
  registrationClose: "",
  assessmentStart: "",
  assessmentEnd: "",
  resultsDueDate: "",
  maxCreditsPerTerm: "24",
  creditRate: "300",
};

export default function AdminSemesters() {
  const userName = useCurrentUserName();
  const canManageTerms = ["REGISTRAR", "SUPER_ADMIN", "ICT_ADMIN", "PRINCIPAL"].includes(getRole() ?? "");
  const [semesters, setSemesters] = useState<Semester[] | null>(null);
  const [programmes, setProgrammes] = useState<ProgrammeOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Semester[]>("/semesters")
      .then(setSemesters)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load semesters."));
  }
  useEffect(load, []);
  useEffect(() => {
    apiFetch<ProgrammeOption[]>("/curriculum/programmes")
      .then((items) => {
        setProgrammes(items);
        setForm((current) => current.programmeId || !items.length ? current : { ...current, programmeId: items[0].id });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load programmes for term setup."));
  }, []);

  function setField(name: keyof typeof blankForm, value: string) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function createSemester(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = await apiFetch<{ programme: { name: string }; semesterNumber: number; academicYear: string; reusedExisting?: boolean }>(
        "/semesters",
        { method: "POST", body: JSON.stringify({ ...form, setCurrent: true }) },
      );
      setNotice(result.reusedExisting
        ? `The existing ${result.programme.name} Term ${result.semesterNumber} (${result.academicYear}) has been set as current. Its settings were preserved because students already have records in it.`
        : `Current term set for ${result.programme.name}: Term ${result.semesterNumber}, ${result.academicYear}. Missing or invalid dates and settings are corrected to safe 8-week defaults.`);
      setForm({ ...blankForm, programmeId: form.programmeId });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create semester.");
    } finally {
      setBusy(false);
    }
  }

  async function activate(id: string) {
    setError(null);
    try {
      await apiFetch(`/semesters/${id}/activate`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not activate semester.");
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await apiFetch(`/semesters/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete semester — it may have dependent records.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Term setup and management</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Create and set the current continuous 8-week term for a programme. Setting a term current makes it available immediately for student course registration.
        Students must register for at least 8 credits and can be capped at 24-36 credits.
        Each term adds a KES 1,000 administration fee; industrial fees are configured separately in Fee Structure.
        Registrar and authorized administrator access. Terms that already have student registrations or invoices can be deactivated but not deleted.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}
      {notice && <p role="status" className="mt-4 border border-forest/20 bg-forest/5 p-3 text-sm text-forest">{notice}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {canManageTerms && <PortalSection title="Create and set the current term">
          <form onSubmit={createSemester} className="space-y-3">
            <label className="block">
              <span className="text-xs text-ink/60">Programme</span>
              <select value={form.programmeId} onChange={(e) => setField("programmeId", e.target.value)} className="input mt-1" disabled={!programmes?.length}>
                <option value="">{programmes ? "Select a programme" : "Loading programmes…"}</option>
                {programmes?.map((programme) => <option key={programme.id} value={programme.id}>{programme.name}</option>)}
              </select>
            </label>
            <div className="flex gap-3">
              <input type="number" value={form.semesterNumber} onChange={(e) => setField("semesterNumber", e.target.value)} aria-label="Term number" className="input w-28" />
              <input value={form.academicYear} onChange={(e) => setField("academicYear", e.target.value)} placeholder="Academic year, e.g. 2026/2027" className="input" />
            </div>
            <p className="text-xs text-ink/55">Term dates must span exactly 56 calendar days (8 weeks, inclusive).</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="text-xs text-ink/60">Maximum credits (24-36)</span>
                <input type="number" value={form.maxCreditsPerTerm} onChange={(e) => setField("maxCreditsPerTerm", e.target.value)} className="input mt-1" />
              </label>
              <label>
                <span className="text-xs text-ink/60">KES per credit (300-500)</span>
                <input type="number" value={form.creditRate} onChange={(e) => setField("creditRate", e.target.value)} className="input mt-1" />
              </label>
            </div>
            <p className="text-xs text-ink/55">KES 1,000 term administration fee is added automatically. Industrial fees are pulled from the programme's Fee Structure.</p>
            {(
              [
                ["startDate", "Start date"],
                ["endDate", "End date"],
                ["registrationOpen", "Registration opens"],
                ["registrationClose", "Registration closes"],
                ["assessmentStart", "Assessment window opens"],
                ["assessmentEnd", "Assessment window closes"],
                ["resultsDueDate", "Results due"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                <span className="text-xs text-ink/60">{label}</span>
                <input type="date" value={form[key]} onChange={(e) => setField(key, e.target.value)} className="input mt-1" />
              </label>
            ))}
            <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
              {busy ? "Setting current term…" : "Create and set current term"}
            </button>
          </form>
        </PortalSection>}

        <PortalSection title="All terms">
          {semesters && semesters.length === 0 && <p className="text-sm text-ink/50">None configured yet.</p>}
          <ul className="divide-y divide-line">
            {semesters?.map((s) => (
              <li key={s.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                            {s.programme.name} — Term {s.semesterNumber}, {s.academicYear}
                    </p>
                    <p className="mt-1 text-xs text-ink/50">
                            {new Date(s.startDate).toLocaleDateString()} – {new Date(s.endDate).toLocaleDateString()} · {s.termWeeks} weeks · max {s.maxCreditsPerTerm} credits · KES {s.creditRate}/credit · KES {Number(s.adminFee).toLocaleString()} admin fee · results due{" "}
                      {new Date(s.resultsDueDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge tone={s.isActive ? "ok" : "neutral"}>{s.isActive ? "Active" : "Inactive"}</Badge>
                    <div className="flex gap-3">
                      {canManageTerms && !s.isActive && (
                        <button onClick={() => activate(s.id)} className="text-xs font-medium text-forest hover:underline">
                          Activate
                        </button>
                      )}
                      {canManageTerms && <button onClick={() => remove(s.id)} className="text-xs font-medium text-red-700 hover:underline">
                        Delete term
                      </button>}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
