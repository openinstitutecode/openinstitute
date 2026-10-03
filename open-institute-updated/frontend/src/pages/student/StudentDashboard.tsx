import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { StatCard, PortalSection, Table, Badge } from "../../components/portal/Primitives";
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

type CurrentSemester = {
  semesterNumber: number;
  academicYear: string;
  startDate: string;
  endDate: string;
  registrationOpen: string;
  registrationClose: string;
  assessmentStart: string;
  assessmentEnd: string;
  isActive: boolean;
  isRegistrationOpen: boolean;
  isAssessmentPeriod: boolean;
  daysRemaining: number;
};

type Dashboard = {
  programme: string;
  activeUnits: { unitId: string; title: string; semester: string }[];
  completedUnitsCount: number;
  totalUnitsInProgramme: number;
  progressPercent: number;
  feeBalance: number;
  unreadNotifications: { id: string; title: string; body: string }[];
  upcomingDeadlines: { type: string; title: string; dueAt: string; courseTitle: string }[];
  currentSemester: CurrentSemester | null;
};

export default function StudentDashboard() {
  const userName = useCurrentUserName();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Dashboard>("/me/dashboard")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your dashboard."));
  }, []);

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      {error && <p className="text-sm text-navy-dark">{error}</p>}

      {data && (
        <>
          <h1 className="font-display text-2xl">{data.programme}</h1>
          <p className="mt-1 text-sm text-ink/60">{data.activeUnits.length} active unit(s) this semester</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Units this semester" value={data.activeUnits.length} />
            <StatCard label="Units completed" value={`${data.completedUnitsCount} / ${data.totalUnitsInProgramme}`} />
            <StatCard label="Fees balance" value={`KES ${data.feeBalance.toLocaleString()}`} />
            <StatCard label="Unread notifications" value={data.unreadNotifications.length} />
          </div>

          {data.currentSemester && (
            <PortalSection title="Current semester">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">
                    Semester {data.currentSemester.semesterNumber} · {data.currentSemester.academicYear}
                  </p>
                  <p className="mt-1 text-sm text-ink/60">
                    {new Date(data.currentSemester.startDate).toLocaleDateString()} –{" "}
                    {new Date(data.currentSemester.endDate).toLocaleDateString()}
                    {data.currentSemester.daysRemaining >= 0
                      ? ` · ${data.currentSemester.daysRemaining} day(s) remaining`
                      : " · ended"}
                  </p>
                </div>
                <Badge tone={data.currentSemester.isActive ? "ok" : "neutral"}>
                  {data.currentSemester.isActive ? "Active semester" : "Not yet activated"}
                </Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-sm bg-navy/[0.03] px-4 py-3 text-sm">
                  <p className="font-medium">Registration window</p>
                  <p className="mt-1 text-ink/60">
                    {new Date(data.currentSemester.registrationOpen).toLocaleDateString()} –{" "}
                    {new Date(data.currentSemester.registrationClose).toLocaleDateString()}
                  </p>
                  <Badge tone={data.currentSemester.isRegistrationOpen ? "ok" : "neutral"}>
                    {data.currentSemester.isRegistrationOpen ? "Open now" : "Closed"}
                  </Badge>
                </div>
                <div className="rounded-sm bg-navy/[0.03] px-4 py-3 text-sm">
                  <p className="font-medium">Assessment window</p>
                  <p className="mt-1 text-ink/60">
                    {new Date(data.currentSemester.assessmentStart).toLocaleDateString()} –{" "}
                    {new Date(data.currentSemester.assessmentEnd).toLocaleDateString()}
                  </p>
                  <Badge tone={data.currentSemester.isAssessmentPeriod ? "warn" : "neutral"}>
                    {data.currentSemester.isAssessmentPeriod ? "In progress" : "Not started"}
                  </Badge>
                </div>
              </div>
            </PortalSection>
          )}

          <PortalSection title="Programme progress">
            <div className="flex items-center gap-4">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-navy/10">
                <div
                  className="h-full rounded-full bg-gold"
                  style={{ width: `${Math.min(100, data.progressPercent)}%` }}
                />
              </div>
              <span className="text-sm font-medium text-ink/70">{data.progressPercent}%</span>
            </div>
            <p className="mt-2 text-xs text-ink/50">
              {data.completedUnitsCount} of {data.totalUnitsInProgramme} required units completed
            </p>
          </PortalSection>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <PortalSection title="Your units this semester">
                {data.activeUnits.length === 0 ? (
                  <p className="text-sm text-ink/50">Not registered for any units yet — use Course Registration to add one.</p>
                ) : (
                  <Table
                    columns={["Unit", "Semester", "Status"]}
                    rows={data.activeUnits.map((u) => [u.title, u.semester, <Badge tone="ok">In progress</Badge>])}
                  />
                )}
              </PortalSection>

              <PortalSection title="Upcoming deadlines">
                {data.upcomingDeadlines.length === 0 ? (
                  <p className="text-sm text-ink/50">Nothing due soon.</p>
                ) : (
                  <Table
                    columns={["Item", "Course", "Type", "Due"]}
                    rows={data.upcomingDeadlines.map((d) => [
                      d.title,
                      d.courseTitle,
                      d.type,
                      new Date(d.dueAt).toLocaleDateString(),
                    ])}
                  />
                )}
              </PortalSection>
            </div>

            <PortalSection title="Notifications">
              {data.unreadNotifications.length === 0 ? (
                <p className="text-sm text-ink/50">Nothing new.</p>
              ) : (
                <ul className="space-y-4 text-sm">
                  {data.unreadNotifications.map((n) => (
                    <li key={n.id} className="border-b border-line pb-3 last:border-0">
                      <p className="font-medium">{n.title}</p>
                      <p className="mt-1 text-ink/60">{n.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </PortalSection>
          </div>
        </>
      )}
    </PortalShell>
  );
}
