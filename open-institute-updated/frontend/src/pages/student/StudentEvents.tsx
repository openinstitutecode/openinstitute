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

type EventRow = { id: string; title: string; description: string | null; startsAt: string; location: string | null };
type Club = { id: string; name: string; description: string | null; _count: { memberships: number } };

export default function StudentEvents() {
  const userName = useCurrentUserName();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<EventRow[]>("/community/events").then(setEvents).catch(() => setEvents([]));
    apiFetch<Club[]>("/community/clubs").then(setClubs).catch(() => setClubs([]));
  }, []);

  async function joinClub(id: string) {
    try {
      await apiFetch(`/community/clubs/${id}/join`, { method: "POST" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join club.");
    }
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Clubs &amp; events</h1>
      {error && <p className="mt-2 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Upcoming events">
          {events && events.length === 0 && <p className="text-sm text-ink/50">No upcoming events yet.</p>}
          <ul className="divide-y divide-line">
            {events?.map((e) => (
              <li key={e.id} className="py-4">
                <p className="font-medium">{e.title}</p>
                <p className="mt-1 text-xs text-ink/45">
                  {new Date(e.startsAt).toLocaleString()} · {e.location ?? "Virtual"}
                </p>
                {e.description && <p className="mt-2 text-sm text-ink/65">{e.description}</p>}
              </li>
            ))}
          </ul>
        </PortalSection>

        <PortalSection title="Student clubs">
          {clubs && clubs.length === 0 && <p className="text-sm text-ink/50">No clubs registered yet.</p>}
          <ul className="divide-y divide-line">
            {clubs?.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="mt-1 text-xs text-ink/45">{c._count.memberships} members</p>
                </div>
                <button onClick={() => joinClub(c.id)} className="btn-secondary">
                  Join
                </button>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
