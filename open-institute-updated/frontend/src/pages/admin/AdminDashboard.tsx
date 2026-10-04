import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Table, Badge } from "../../components/portal/Primitives";
import { apiFetch, getRole, useCurrentUserName } from "../../lib/api";
import { LoadingState } from "../../components/portal/StateViews";
import { canAccessPath, portalHomeForRole } from "../../lib/role-access";

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
  { to: "/admin/courses", label: "Courses & Trainers" },
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
  { to: "/admin/insights", label: "Insights & Reminders" },
  { to: "/admin/settings", label: "System Settings" },
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

type StudentRow = { programme: string; academicStatus: string };
type ActiveTerm = { id: string; programme: { name: string }; semesterNumber: number; academicYear: string };

export default function AdminDashboard() {
  const userName = useCurrentUserName();
  const role = getRole();
  const canViewStudents = canAccessPath(role, "/admin/students");
  const canManageCourses = canAccessPath(role, "/admin/courses");
  const canManageTerms = canAccessPath(role, "/admin/semesters");
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [activeTerms, setActiveTerms] = useState<ActiveTerm[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (canViewStudents) {
      apiFetch<StudentRow[]>("/students")
        .then(setStudents)
        .catch((err) => setError(err instanceof Error ? err.message : "Could not load enrollment data."));
    }
    if (canManageTerms) {
      apiFetch<ActiveTerm[]>("/semesters?isActive=true")
        .then(setActiveTerms)
        .catch((err) => setError(err instanceof Error ? err.message : "Could not load current term status."));
    }
  }, [canManageTerms, canViewStudents]);

  const byProgramme = students?.reduce<Record<string, number>>((acc, s) => {
    acc[s.programme] = (acc[s.programme] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Institutional overview</h1>
      <p className="mt-1 text-sm text-ink/60">
        This workspace shows only the tools and information available to your role.
      </p>

      {error && <p className="mt-6 text-sm text-navy-dark">{error}</p>}

      {canManageCourses && <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-line bg-white p-5">
        <div>
          <h2 className="font-display text-lg">Course management</h2>
          <p className="mt-1 text-sm text-ink/60">
            Create or remove courses and assign trainers from Courses &amp; Trainers.
          </p>
        </div>
        <Link to="/admin/courses" className="btn-primary">Manage courses &amp; trainers</Link>
      </div>}

      {canManageTerms && <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border border-gold/50 bg-gold/10 p-5">
        <div>
          <h2 className="font-display text-lg">Term setup and student registration</h2>
          {activeTerms && activeTerms.length > 0 ? (
            <p className="mt-1 text-sm text-ink/65">
              Current terms: {activeTerms.map((term) => `${term.programme.name} — Term ${term.semesterNumber}, ${term.academicYear}`).join("; ")}
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink/65">
              {activeTerms ? "No current term is set. Students cannot register until a term is created and activated." : "Checking current term status…"}
            </p>
          )}
        </div>
        <Link to="/admin/semesters" className="btn-primary">
          {activeTerms?.length ? "Manage or set a term" : "Set current term"}
        </Link>
      </div>}

      {canViewStudents && <div className="mt-8">
        <PortalSection title="Enrollment by programme">
          {!students && !error && <LoadingState />}
          {byProgramme && Object.keys(byProgramme).length === 0 && (
            <p className="text-sm text-ink/50">No students on file yet.</p>
          )}
          {byProgramme && Object.keys(byProgramme).length > 0 && (
            <Table
              columns={["Programme", "Students"]}
              rows={Object.entries(byProgramme).map(([name, count]) => [name, <Badge tone="neutral">{count}</Badge>])}
            />
          )}
        </PortalSection>
      </div>}

      {role && portalHomeForRole(role) !== "/admin/dashboard" && (
        <div className="mt-6 border border-line bg-white p-5">
          <h2 className="font-display text-lg">Your role workspace</h2>
          <p className="mt-1 text-sm text-ink/60">Open your main workspace to continue your role-specific tasks.</p>
          <Link to={portalHomeForRole(role)} className="btn-primary mt-4">Open my workspace</Link>
        </div>
      )}
    </PortalShell>
  );
}
