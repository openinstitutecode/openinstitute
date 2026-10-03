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

type Alert = { severity: "info" | "warn" | "danger"; category: string; message: string; occurredAt: string };

const toneFor: Record<Alert["severity"], "ok" | "warn" | "danger" | "neutral"> = {
  info: "neutral",
  warn: "warn",
  danger: "danger",
};

const categoryLabel: Record<string, string> = {
  notification: "Notice",
  failed_unit: "Failed unit",
  missing_work: "Missing work",
  failed_assessment: "Below pass mark",
};

export default function StudentAlerts() {
  const userName = useCurrentUserName();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Alert[]>("/me/alerts")
      .then(setAlerts)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load alerts."));
  }, []);

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Academic alerts</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Computed live from your own records — unread notices, units recorded
        as failed, overdue work with no submission, and published results
        below the pass mark. Nothing here is a guess about you; each item
        points to a specific record.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8">
        <PortalSection title="Your alerts">
          {alerts && alerts.length === 0 && <p className="text-sm text-ink/50">Nothing to flag right now.</p>}
          {alerts && alerts.length > 0 && (
            <ul className="divide-y divide-line">
              {alerts.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span>{a.message}</span>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-ink/45">{new Date(a.occurredAt).toLocaleDateString()}</span>
                    <Badge tone={toneFor[a.severity]}>{categoryLabel[a.category] ?? a.category}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PortalSection>
      </div>
    </PortalShell>
  );
}
