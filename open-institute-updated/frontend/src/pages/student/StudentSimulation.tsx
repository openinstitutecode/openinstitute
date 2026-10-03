import { FormEvent, useEffect, useState } from "react";
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

const scenarios = [
  { id: "virtual_shop_customer", title: "Serve a customer at your virtual shop", role: "Customer" },
  { id: "investor_pitch", title: "Pitch your business to an investor", role: "Investor" },
  { id: "supplier_negotiation", title: "Negotiate bulk pricing with a supplier", role: "Supplier" },
  { id: "difficult_customer_service", title: "Handle a frustrated customer", role: "Customer" },
] as const;

type Msg = { from: "me" | "them"; text: string };
type PastSession = { id: string; scenario: string; startedAt: string; endedAt: string | null; score: number | null; feedback: string | null };

export default function StudentSimulation() {
  const userName = useCurrentUserName();
  const [activeId, setActiveId] = useState<(typeof scenarios)[number]["id"] | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [pastSessions, setPastSessions] = useState<PastSession[] | null>(null);

  function loadHistory() {
    apiFetch<PastSession[]>("/simulation/sessions/mine").then(setPastSessions).catch(() => undefined);
  }
  useEffect(loadHistory, []);

  async function start(id: (typeof scenarios)[number]["id"]) {
    setActiveId(id);
    setMessages([]);
    setSessionId(null);
    setEnded(false);
    setError(null);
    try {
      // EX036 — the first /turn call in a scenario now creates a real,
      // persisted SimulationSession instead of the whole conversation
      // living only in this page's state and vanishing on refresh.
      const res = await apiFetch<{ reply: string; sessionId: string }>("/simulation/turn", {
        method: "POST",
        body: JSON.stringify({ scenario: id }),
      });
      setMessages([{ from: "them", text: res.reply }]);
      setSessionId(res.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the simulation.");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || !activeId || !sessionId) return;
    const mine = input;
    setMessages((m) => [...m, { from: "me", text: mine }]);
    setInput("");
    try {
      const res = await apiFetch<{ reply: string; sessionId: string }>("/simulation/turn", {
        method: "POST",
        body: JSON.stringify({ scenario: activeId, studentMessage: mine, sessionId }),
      });
      setMessages((m) => [...m, { from: "them", text: res.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue.");
    }
  }

  async function endSession() {
    if (!sessionId) return;
    try {
      await apiFetch(`/simulation/sessions/${sessionId}/end`, { method: "PATCH" });
      setEnded(true);
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not end the session.");
    }
  }

  const active = scenarios.find((s) => s.id === activeId);

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Business simulation lab</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Practice real business situations against an AI playing the other side. End a session when you're done
        to send the transcript to your trainer for feedback and a score — the AI counterpart never scores its
        own conversation.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {scenarios.map((s) => (
          <button
            key={s.id}
            onClick={() => start(s.id)}
            className={`border p-5 text-left transition-colors ${
              activeId === s.id ? "border-navy bg-navy/[0.04]" : "border-line bg-white hover:border-navy"
            }`}
          >
            <p className="font-medium">{s.title}</p>
            <p className="mt-1 text-xs text-ink/45">AI plays: {s.role}</p>
          </button>
        ))}
      </div>

      {active && (
        <div className="mt-8">
          <PortalSection title={active.title}>
            <div className="max-h-80 space-y-3 overflow-y-auto">
              {messages.map((m, i) => (
                <div key={i} className={`text-sm ${m.from === "me" ? "text-right" : ""}`}>
                  <span
                    className={`inline-block max-w-[85%] rounded-sm px-4 py-2 ${
                      m.from === "me" ? "bg-navy text-paper" : "bg-navy/[0.05]"
                    }`}
                  >
                    {m.text}
                  </span>
                </div>
              ))}
            </div>
            {ended ? (
              <p className="mt-4 text-sm text-ink/60">Session ended — sent for your trainer's review.</p>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
                  <input value={input} onChange={(e) => setInput(e.target.value)} className="input flex-1" placeholder="Your response…" />
                  <button type="submit" className="btn-primary">Send</button>
                </form>
                <button type="button" onClick={endSession} className="btn-secondary mt-3 px-3 py-1 text-xs">
                  End session & submit for review
                </button>
              </>
            )}
          </PortalSection>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {pastSessions && pastSessions.length > 0 && (
        <div className="mt-8">
          <PortalSection title="Past sessions">
            <ul className="divide-y divide-line">
              {pastSessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {scenarios.find((sc) => sc.id === s.scenario)?.title ?? s.scenario} —{" "}
                    {new Date(s.startedAt).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-ink/50">
                    {s.score !== null ? `Scored: ${s.score}/100` : s.endedAt ? "Awaiting review" : "In progress"}
                  </span>
                </li>
              ))}
            </ul>
          </PortalSection>
        </div>
      )}
    </PortalShell>
  );
}
