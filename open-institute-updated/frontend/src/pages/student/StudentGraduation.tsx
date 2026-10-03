import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";

const links = [
  { to: "/student/dashboard", label: "Dashboard" },
  { to: "/student/profile", label: "My Profile" },
  { to: "/student/id-card", label: "Digital ID" },
  { to: "/student/roadmap", label: "Programme Roadmap" },
  { to: "/student/courses", label: "My Courses" },
  { to: "/student/assignments", label: "Assignment Centre" },
  { to: "/student/exams", label: "Assessment Centre" },
  { to: "/student/alerts", label: "Academic Alerts" },
  { to: "/student/notebook", label: "Knowledge Notebook" },
  { to: "/student/portfolio", label: "Digital Portfolio" },
  { to: "/student/advisor", label: "AI Study Advisor" },
  { to: "/student/letters", label: "Official Letters" },
  { to: "/student/receipts", label: "Payment Receipts" },
  { to: "/student/research", label: "Research Workspace" },
  { to: "/student/messages", label: "Messages & Office Hours" },
  { to: "/student/forums", label: "Discussion Forums" },
  { to: "/student/timetable", label: "Timetable" },
  { to: "/student/attendance", label: "Attendance" },
  { to: "/student/achievements", label: "Achievements" },
  { to: "/student/library", label: "Digital Library" },
  { to: "/student/tutor", label: "AI Tutor" },
  { to: "/student/career", label: "Career Services" },
  { to: "/student/job-matches", label: "Job Matches" },
  { to: "/student/simulation", label: "Business Simulation Lab" },
  { to: "/student/virtual-lab", label: "Virtual Business Lab" },
  { to: "/student/viva", label: "AI Viva Practice" },
  { to: "/student/passport", label: "Competency Passport" },
  { to: "/student/grades", label: "Grades & Transcript" },
  { to: "/student/appeals", label: "Appeals" },
  { to: "/student/fees", label: "Fees" },
  { to: "/student/attachment", label: "Industrial Attachment" },
  { to: "/student/graduation", label: "Graduation Status" },
  { to: "/student/wellbeing", label: "Counselling & Support" },
  { to: "/student/events", label: "Clubs & Events" },
  { to: "/student/support", label: "Support" },
  { to: "/student/accessibility", label: "Accessibility Settings" },
  { to: "/student/credit-transfer", label: "Credit Transfer" },
  { to: "/student/tutor-sessions", label: "Tutor Session History" },
];

type Status = {
  eligible: boolean;
  checks: {
    academicClearance: { met: boolean; completedUnits: number; requiredUnitCount: number };
    financeClearance: { met: boolean; feeBalance: number };
    attachmentClearance: { met: boolean; required: boolean };
    disciplinaryClearance: { met: boolean };
  };
};

export default function StudentGraduation() {
  const userName = useCurrentUserName();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Status>("/me/graduation-status")
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your graduation status."));
  }, []);

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Graduation status</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Computed live from your actual academic, finance, attachment, and
        disciplinary records — the same numbers the registrar sees.
      </p>

      {error && <p className="mt-6 text-sm text-navy-dark">{error}</p>}

      {status && (
        <>
          <div className="mt-8 border border-line bg-white p-6">
            <div className="flex items-center justify-between">
              <p className="font-display text-xl">
                {status.eligible ? "You're eligible to graduate" : "Not yet eligible"}
              </p>
              <Badge tone={status.eligible ? "ok" : "warn"}>
                {status.eligible ? "Eligible" : "Pending"}
              </Badge>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <PortalSection title="Academic">
              <p className="text-sm text-ink/70">
                {status.checks.academicClearance.completedUnits} of{" "}
                {status.checks.academicClearance.requiredUnitCount} units completed
              </p>
              <Badge tone={status.checks.academicClearance.met ? "ok" : "warn"}>
                {status.checks.academicClearance.met ? "Cleared" : "In progress"}
              </Badge>
            </PortalSection>

            <PortalSection title="Finance">
              <p className="text-sm text-ink/70">
                Balance: KES {status.checks.financeClearance.feeBalance.toLocaleString()}
              </p>
              <Badge tone={status.checks.financeClearance.met ? "ok" : "warn"}>
                {status.checks.financeClearance.met ? "Cleared" : "Outstanding balance"}
              </Badge>
            </PortalSection>

            <PortalSection title="Industrial attachment">
              <p className="text-sm text-ink/70">
                {status.checks.attachmentClearance.required ? "Required for your programme" : "Not required"}
              </p>
              <Badge tone={status.checks.attachmentClearance.met ? "ok" : "warn"}>
                {status.checks.attachmentClearance.met ? "Cleared" : "Not yet complete"}
              </Badge>
            </PortalSection>

            <PortalSection title="Disciplinary">
              <p className="text-sm text-ink/70">No upheld integrity cases</p>
              <Badge tone={status.checks.disciplinaryClearance.met ? "ok" : "danger"}>
                {status.checks.disciplinaryClearance.met ? "Clear" : "Review needed"}
              </Badge>
            </PortalSection>
          </div>
        </>
      )}
    </PortalShell>
  );
}
