import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge, StatCard } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { LoadingState } from "../../components/portal/StateViews";

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

type CourseRow = {
  id: string;
  title: string;
  unitCode: string;
  trainerName: string | null;
  courseFeedbackCount: number;
  trainerFeedbackCount: number;
};

type Summary = {
  course: { count: number; average: number | null; comments: (string | null)[] };
  trainer: { count: number; average: number | null; comments: (string | null)[] };
};

// QA033/QA034 — the summary endpoint (GET /feedback/course/:courseId/summary)
// has existed since course surveys shipped; this page is the missing entry
// point QA/programme staff need to actually reach it, starting from a real
// list of courses that have feedback rather than requiring a course ID to
// already be known.
export default function AdminCourseEvaluations() {
  const userName = useCurrentUserName();
  const [courses, setCourses] = useState<CourseRow[] | null>(null);
  const [selected, setSelected] = useState<CourseRow | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<CourseRow[]>("/feedback/courses-with-feedback")
      .then(setCourses)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load courses."));
  }, []);

  async function select(course: CourseRow) {
    setSelected(course);
    setSummary(null);
    try {
      setSummary(await apiFetch<Summary>(`/feedback/course/${course.id}/summary`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load summary.");
    }
  }

  return (
    <PortalShell role="Administration portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Course &amp; Trainer Evaluations</h1>
      <p className="mt-2 text-sm text-ink/60">
        Aggregated, anonymized student feedback per course and trainer. Individual ratings are never
        attributed to a specific student.
      </p>

      {error && <p className="mt-3 text-sm text-navy-dark">{error}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <PortalSection title="Courses with feedback">
          {courses === null && <LoadingState />}
          {courses && courses.length === 0 && (
            <p className="text-sm text-ink/50">No course feedback has been submitted yet.</p>
          )}
          <ul className="divide-y divide-line">
            {courses?.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => select(c)}
                  className={`flex w-full items-center justify-between py-2.5 text-left text-sm hover:text-navy ${
                    selected?.id === c.id ? "text-navy font-medium" : ""
                  }`}
                >
                  <span>
                    {c.title} <span className="text-ink/40">({c.unitCode})</span>
                    {c.trainerName && <span className="block text-xs text-ink/50">{c.trainerName}</span>}
                  </span>
                  <Badge tone="neutral">
                    {c.courseFeedbackCount + c.trainerFeedbackCount} responses
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        </PortalSection>

        <PortalSection title={selected ? `Summary — ${selected.title}` : "Summary"}>
          {!selected && <p className="text-sm text-ink/50">Select a course to view its evaluation summary.</p>}
          {selected && !summary && <LoadingState />}
          {summary && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <StatCard
                  label="Course rating"
                  value={summary.course.average !== null ? summary.course.average.toFixed(1) : "—"}
                />
                <StatCard
                  label="Trainer rating"
                  value={summary.trainer.average !== null ? summary.trainer.average.toFixed(1) : "—"}
                />
              </div>
              <div>
                <h3 className="text-sm font-medium text-ink/80">
                  Course comments ({summary.course.count})
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {summary.course.comments.length === 0 && (
                    <li className="text-xs text-ink/40">No comments.</li>
                  )}
                  {summary.course.comments.map((c, i) => (
                    <li key={i} className="rounded-lg bg-paper px-3 py-2 text-sm text-ink/70">{c}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-medium text-ink/80">
                  Trainer comments ({summary.trainer.count})
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {summary.trainer.comments.length === 0 && (
                    <li className="text-xs text-ink/40">No comments.</li>
                  )}
                  {summary.trainer.comments.map((c, i) => (
                    <li key={i} className="rounded-lg bg-paper px-3 py-2 text-sm text-ink/70">{c}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </PortalSection>
      </div>
    </PortalShell>
  );
}
