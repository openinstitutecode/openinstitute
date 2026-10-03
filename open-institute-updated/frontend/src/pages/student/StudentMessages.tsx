import { FormEvent, useState } from "react";
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

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Message = { id: string; senderId: string; recipientId: string; body: string; sentAt: string };
type Slot = { id: string; dayOfWeek: number; startTime: string; endTime: string; link: string | null };

export default function StudentMessages() {
  const userName = useCurrentUserName();
  const [trainerId, setTrainerId] = useState("");
  const [thread, setThread] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadThread() {
    if (!trainerId) return;
    try {
      setThread(await apiFetch<Message[]>(`/trainer-self/messages/thread/${trainerId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load thread.");
    }
  }

  async function loadOfficeHours() {
    if (!trainerId) return;
    try {
      setSlots(await apiFetch<Slot[]>(`/trainer-self/office-hours/${trainerId}`));
    } catch {
      setSlots([]);
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || !trainerId) return;
    try {
      await apiFetch("/trainer-self/messages", { method: "POST", body: JSON.stringify({ recipientId: trainerId, body }) });
      setBody("");
      loadThread();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message.");
    }
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Messages &amp; office hours</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Direct message a trainer and check their real published office-hours availability.
      </p>

      <div className="mt-4 flex gap-2 max-w-md">
        <input value={trainerId} onChange={(e) => setTrainerId(e.target.value)} placeholder="Trainer user ID" className="input flex-1" />
        <button onClick={() => { loadThread(); loadOfficeHours(); }} className="btn-secondary shrink-0">Open</button>
      </div>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Conversation">
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {thread.map((m) => (
              <li key={m.id} className={`text-sm ${m.senderId === trainerId ? "text-ink/70" : "font-medium"}`}>{m.body}</li>
            ))}
          </ul>
          <form onSubmit={send} className="mt-3 flex gap-2">
            <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type a message…" className="input flex-1" />
            <button type="submit" className="btn-primary shrink-0">Send</button>
          </form>
        </PortalSection>

        <PortalSection title="Office hours">
          {slots && slots.length === 0 && <p className="text-sm text-ink/50">No office hours published yet.</p>}
          <ul className="divide-y divide-line">
            {slots?.map((s) => (
              <li key={s.id} className="py-2 text-sm">
                {DAYS[s.dayOfWeek]} {s.startTime}–{s.endTime}{" "}
                {s.link && <a href={s.link} target="_blank" rel="noreferrer" className="text-navy underline">Join link</a>}
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
