import { FormEvent, useEffect, useState } from "react";
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

type SessionSummary = {
  id: string;
  isActive: boolean;
  messagesCount: number;
  lastMessageAt: string;
  sessionNotes: string | null;
  messages: { id: string; role: string; timestamp: string }[];
};

type Message = { id: string; role: string; content: string; timestamp: string };
type SessionDetail = Omit<SessionSummary, "messages"> & { messages: Message[] };

export default function StudentTutorSessions() {
  const userName = useCurrentUserName();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [active, setActive] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<SessionSummary[]>("/tutor-sessions")
      .then(setSessions)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your tutor sessions."));
  }
  useEffect(load, []);

  function openSession(id: string) {
    setError(null);
    apiFetch<SessionDetail>(`/tutor-sessions/${id}`)
      .then((s) => {
        setActive(s);
        setNote(s.sessionNotes ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not open session."));
  }

  async function startSession() {
    setBusy(true);
    setError(null);
    try {
      const s = await apiFetch<SessionDetail>("/tutor-sessions", { method: "POST" });
      load();
      openSession(s.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a session.");
    } finally {
      setBusy(false);
    }
  }

  async function saveNote(e: FormEvent) {
    e.preventDefault();
    if (!active) return;
    setBusy(true);
    try {
      await apiFetch(`/tutor-sessions/${active.id}`, { method: "PATCH", body: JSON.stringify({ sessionNotes: note }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save notes.");
    } finally {
      setBusy(false);
    }
  }

  async function closeSession() {
    if (!active) return;
    setBusy(true);
    try {
      await apiFetch(`/tutor-sessions/${active.id}`, { method: "PATCH", body: JSON.stringify({ isActive: false }) });
      load();
      setActive(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Tutor session history</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Every conversation you've had with the AI tutor, kept for up to 24
        hours of continuous activity before a new session starts
        automatically. This page is a history and notes viewer — start a
        conversation from the AI Tutor page itself.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Your sessions">
          <button onClick={startSession} disabled={busy} className="btn-primary mb-4 disabled:opacity-50">
            {busy ? "Working…" : "Get / start current session"}
          </button>
          {sessions && sessions.length === 0 && <p className="text-sm text-ink/50">No sessions yet.</p>}
          <ul className="divide-y divide-line">
            {sessions?.map((s) => (
              <li key={s.id} className="py-3">
                <button onClick={() => openSession(s.id)} className="flex w-full items-center justify-between gap-3 text-left">
                  <span className="text-sm">
                    {s.messagesCount} message{s.messagesCount === 1 ? "" : "s"} · last activity{" "}
                    {new Date(s.lastMessageAt).toLocaleString()}
                  </span>
                  <Badge tone={s.isActive ? "ok" : "neutral"}>{s.isActive ? "Active" : "Closed"}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </PortalSection>

        <PortalSection title={active ? "Session detail" : "Select a session"}>
          {!active && <p className="text-sm text-ink/50">Choose a session on the left to view its messages.</p>}
          {active && (
            <>
              <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
                {active.messages.map((m) => (
                  <li key={m.id} className={m.role === "student" ? "text-right" : "text-left"}>
                    <span
                      className={
                        "inline-block rounded-2xl px-3 py-1.5 " +
                        (m.role === "student" ? "bg-forest/10 text-ink" : "bg-cream text-ink/80")
                      }
                    >
                      {m.content}
                    </span>
                    <p className="mt-0.5 text-[10px] text-ink/35">{new Date(m.timestamp).toLocaleTimeString()}</p>
                  </li>
                ))}
                {active.messages.length === 0 && <li className="text-ink/45">No messages in this session.</li>}
              </ul>

              <form onSubmit={saveNote} className="mt-4 space-y-2 border-t border-line pt-4">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Personal notes for this session" className="input" />
                <div className="flex gap-3">
                  <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
                    Save notes
                  </button>
                  {active.isActive && (
                    <button
                      type="button"
                      onClick={closeSession}
                      disabled={busy}
                      className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink/70 hover:bg-cream"
                    >
                      Close session
                    </button>
                  )}
                </div>
              </form>
            </>
          )}
        </PortalSection>
      </div>
    </PortalShell>
  );
}
