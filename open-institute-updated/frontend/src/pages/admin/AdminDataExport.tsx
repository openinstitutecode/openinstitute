import { FormEvent, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection } from "../../components/portal/Primitives";
import { useCurrentUserName } from "../../lib/api";

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

// AD034 — Data Export. Every button below streams a real CSV built from a
// live Prisma query on the backend; this page just triggers the download.
// Downloads are plain browser navigations (with the auth token attached as
// a query fallback isn't supported server-side, so we rely on the same
// cookie-less bearer-token flow via a fetch + blob so the Authorization
// header actually reaches the server).

type ExportDef = {
  key: string;
  label: string;
  description: string;
  path: string;
  extraFields?: { name: string; placeholder: string }[];
};

const exportDefs: ExportDef[] = [
  {
    key: "students",
    label: "Students",
    description: "Every student record — programme, intake, study mode, academic status.",
    path: "/data-export/students.csv",
    extraFields: [
      { name: "programmeId", placeholder: "Filter by programme ID (optional)" },
      { name: "academicStatus", placeholder: "Filter by academic status (optional)" },
    ],
  },
  {
    key: "staff",
    label: "Staff",
    description: "All staff profiles with role, department and active status.",
    path: "/data-export/staff.csv",
  },
  {
    key: "courses",
    label: "Courses",
    description: "Every course with its unit, assigned trainer and publish state.",
    path: "/data-export/courses.csv",
  },
  {
    key: "results",
    label: "Assessment results",
    description: "Graded submissions for one assessment.",
    path: "/data-export/results.csv",
    extraFields: [{ name: "assessmentId", placeholder: "Assessment ID (required)" }],
  },
];

export default function AdminDataExport() {
  const userName = useCurrentUserName();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, Record<string, string>>>({});

  function setField(defKey: string, name: string, value: string) {
    setFields((prev) => ({ ...prev, [defKey]: { ...prev[defKey], [name]: value } }));
  }

  async function runExport(e: FormEvent, def: ExportDef) {
    e.preventDefault();
    setError(null);
    if (def.key === "results" && !fields.results?.assessmentId) {
      setError("Provide an assessment ID to export results.");
      return;
    }
    setBusyKey(def.key);
    try {
      const token = localStorage.getItem("kvbdtc_token");
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(fields[def.key] ?? {})) {
        if (v) params.set(k, v);
      }
      const qs = params.toString();
      const res = await fetch(`/api${def.path}${qs ? `?${qs}` : ""}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename=([^;]+)/);
      const filename = match ? match[1].trim() : `${def.key}-export.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Data export</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Every export below is a live CSV built from the current database —
        not a placeholder file. Access to each is role-gated on the backend
        (registrar/admissions for students, HR for staff, and so on), so
        you'll see an error here if your role isn't permitted.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {exportDefs.map((def) => (
          <PortalSection key={def.key} title={def.label}>
            <p className="text-sm text-ink/60">{def.description}</p>
            <form onSubmit={(e) => runExport(e, def)} className="mt-4 space-y-3">
              {def.extraFields?.map((f) => (
                <input
                  key={f.name}
                  value={fields[def.key]?.[f.name] ?? ""}
                  onChange={(ev) => setField(def.key, f.name, ev.target.value)}
                  placeholder={f.placeholder}
                  className="input"
                />
              ))}
              <button type="submit" disabled={busyKey === def.key} className="btn-primary disabled:opacity-50">
                {busyKey === def.key ? "Preparing…" : `Download ${def.label}.csv`}
              </button>
            </form>
          </PortalSection>
        ))}
      </div>
    </PortalShell>
  );
}
