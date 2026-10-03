import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection } from "../../components/portal/Primitives";
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

type Award = { id: string; awardedAt: string; badge: { name: string; description: string | null; iconEmoji: string } };

export default function StudentAchievements() {
  const userName = useCurrentUserName();
  const [awards, setAwards] = useState<Award[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Award[]>("/badges/mine")
      .then(setAwards)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your achievements."));
  }, []);

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Achievements</h1>
      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8">
        <PortalSection title="Digital badges">
          {awards && awards.length === 0 && <p className="text-sm text-ink/50">No badges yet — keep going.</p>}
          <div className="grid gap-4 sm:grid-cols-3">
            {awards?.map((a) => (
              <div key={a.id} className="border border-line p-5 text-center">
                <p className="text-3xl">{a.badge.iconEmoji}</p>
                <p className="mt-2 font-medium">{a.badge.name}</p>
                {a.badge.description && <p className="mt-1 text-xs text-ink/50">{a.badge.description}</p>}
                <p className="mt-2 text-xs text-ink/40">{new Date(a.awardedAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </PortalSection>
      </div>

      <div className="mt-6">
        <MicrocredentialsSection />
      </div>

      <div className="mt-6">
        <CourseCertificatesSection />
      </div>
    </PortalShell>
  );
}

function MicrocredentialsSection() {
  const [items, setItems] = useState<{ id: string; awardedAt: string; microcredential: { name: string; description: string | null } }[] | null>(null);

  useEffect(() => {
    apiFetch<{ id: string; awardedAt: string; microcredential: { name: string; description: string | null } }[]>("/competency/microcredentials/mine")
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  return (
    <PortalSection title="Microcredentials">
      {items && items.length === 0 && <p className="text-sm text-ink/50">None awarded yet.</p>}
      <ul className="divide-y divide-line">
        {items?.map((i) => (
          <li key={i.id} className="py-3 text-sm">
            <p className="font-medium">{i.microcredential.name}</p>
            {i.microcredential.description && <p className="text-xs text-ink/50">{i.microcredential.description}</p>}
          </li>
        ))}
      </ul>
    </PortalSection>
  );
}

// LMS036 (Batch 45) — course completion certificates now have somewhere to
// actually show up for the student who earned them.
type CourseCertificate = {
  id: string;
  grade: string | null;
  certificateCode: string | null;
  issuedAt: string;
  course: { title: string; unit: { title: string }; trainer: { fullName: string } | null };
};

function CourseCertificatesSection() {
  const [certificates, setCertificates] = useState<CourseCertificate[] | null>(null);

  useEffect(() => {
    apiFetch<CourseCertificate[]>("/courses/mine/certificates")
      .then(setCertificates)
      .catch(() => setCertificates([]));
  }, []);

  return (
    <PortalSection title="Course certificates">
      {certificates && certificates.length === 0 && (
        <p className="text-sm text-ink/50">Complete a course with a passing grade to earn a certificate.</p>
      )}
      <ul className="divide-y divide-line">
        {certificates?.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-3 text-sm">
            <div>
              <p className="font-medium">{c.course.title}</p>
              <p className="text-xs text-ink/50">
                {c.course.unit.title} · Trainer: {c.course.trainer?.fullName ?? "—"} · Issued {new Date(c.issuedAt).toLocaleDateString()}
              </p>
            </div>
            <div className="text-right">
              {c.grade && <p className="text-xs font-medium text-forest">{c.grade}</p>}
              {c.certificateCode && <p className="font-mono text-xs text-ink/40">{c.certificateCode}</p>}
            </div>
          </li>
        ))}
      </ul>
    </PortalSection>
  );
}
