import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { QrCode } from "../../components/portal/QrCode";
import { LogoOnDark, COLLEGE_NAME } from "../../components/Logo";

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

type StudentId = {
  studentNumber: string;
  fullName: string;
  programme: string;
  academicStatus: string;
  verificationUrl: string;
};

export default function StudentIdCard() {
  const userName = useCurrentUserName();
  const [id, setId] = useState<StudentId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<StudentId>("/credentials/student-id/mine")
      .then(setId)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your ID."));
  }, []);

  return (
    <PortalShell role="Student portal" links={links} userName={id?.fullName ?? (userName || "…")}>
      <h1 className="font-display text-2xl">Digital student ID</h1>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {id && (
        <div className="mt-8 max-w-md">
          <div className="border border-line bg-navy p-6 text-paper">
            <div className="flex items-center justify-between">
              <LogoOnDark className="h-14 w-auto" />
              <Badge tone={id.academicStatus === "ACTIVE" ? "ok" : "warn"}>{id.academicStatus}</Badge>
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gold-light">{COLLEGE_NAME} · Student ID</p>
            <p className="mt-3 font-display text-xl">{id.fullName}</p>
            <p className="mt-1 font-mono text-sm text-paper/70">{id.studentNumber}</p>
            <p className="mt-3 text-sm text-paper/80">{id.programme}</p>
          </div>

          <PortalSection title="Verification">
            <p className="text-sm text-ink/65">
              Anyone can confirm your enrollment status (not your grades or
              contact details) by scanning this code or using the link below:
            </p>
            <div className="mt-3">
              <QrCode data={id.verificationUrl} alt="Scan to verify this student ID" />
            </div>
            <p className="mt-3 break-all font-mono text-xs text-navy">{id.verificationUrl}</p>
          </PortalSection>
        </div>
      )}
    </PortalShell>
  );
}
