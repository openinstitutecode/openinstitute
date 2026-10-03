import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { useSpeechToText, useTextToSpeech } from "../../lib/voice";

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
  { to: "/student/viva", label: "AI Viva Practice" },
  { to: "/student/career", label: "Career Services" },
  { to: "/student/job-matches", label: "Job Matches" },
  { to: "/student/simulation", label: "Business Simulation Lab" },
  { to: "/student/virtual-lab", label: "Virtual Business Lab" },
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

type Msg = { from: "me" | "them"; text: string };
type PastSession = { id: string; unit: string; startedAt: string; endedAt: string | null; score: number | null; feedback: string | null };

export default function StudentViva() {
  const userName = useCurrentUserName();
  const [unit, setUnit] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [pastSessions, setPastSessions] = useState<PastSession[] | null>(null);

  const stt = useSpeechToText("en");
  const tts = useTextToSpeech("en");

  function loadHistory() {
    apiFetch<PastSession[]>("/viva/sessions/mine").then(setPastSessions).catch(() => undefined);
  }
  useEffect(loadHistory, []);

  // Fill the answer box as the student speaks.
  useEffect(() => {
    if (stt.transcript) setInput(stt.transcript);
  }, [stt.transcript]);

  async function start(e: FormEvent) {
    e.preventDefault();
    if (!unit.trim()) return;
    setMessages([]);
    setSessionId(null);
    setEnded(false);
    setError(null);
    try {
      const res = await apiFetch<{ reply: string; sessionId: string }>("/viva/turn", {
        method: "POST",
        body: JSON.stringify({ unit }),
      });
      setMessages([{ from: "them", text: res.reply }]);
      setSessionId(res.sessionId);
      tts.speak(res.reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the viva.");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || !sessionId) return;
    const mine = input;
    const wasSpoken = stt.transcript.trim().length > 0 && stt.transcript.trim() === mine.trim();
    setMessages((m) => [...m, { from: "me", text: mine }]);
    setInput("");
    stt.stop();
    try {
      const res = await apiFetch<{ reply: string; sessionId: string }>("/viva/turn", {
        method: "POST",
        body: JSON.stringify({ unit, studentAnswer: mine, sessionId, spokenInput: wasSpoken }),
      });
      setMessages((m) => [...m, { from: "them", text: res.reply }]);
      tts.speak(res.reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue.");
    }
  }

  async function endSession() {
    if (!sessionId) return;
    try {
      await apiFetch(`/viva/sessions/${sessionId}/end`, { method: "PATCH" });
      setEnded(true);
      tts.stop();
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not end the session.");
    }
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">AI viva practice</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Practice an oral exam against an AI examiner grounded in your unit's syllabus. Speak your answers aloud
        (or type them, if voice isn't supported in this browser) — end the session when you're done to send the
        transcript to a trainer for a real, human-confirmed score. The AI never scores its own viva.
      </p>
      {!stt.supported && (
        <p className="mt-2 text-xs text-ink/45">
          Voice input isn't supported in this browser — try Chrome or Edge for a spoken viva, or just type your
          answers below.
        </p>
      )}

      {!sessionId && !ended && (
        <form onSubmit={start} className="mt-6 flex max-w-md gap-3">
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="input flex-1"
            placeholder="Unit title, e.g. Financial Accounting I"
          />
          <button type="submit" className="btn-primary">
            Start viva
          </button>
        </form>
      )}

      {sessionId && (
        <div className="mt-8">
          <PortalSection title={`Viva — ${unit}`}>
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
              {tts.speaking && <p className="text-xs italic text-ink/40">Examiner is speaking…</p>}
            </div>
            {ended ? (
              <p className="mt-4 text-sm text-ink/60">Session ended — sent for your trainer's review.</p>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="input flex-1"
                    placeholder="Your spoken (or typed) answer…"
                  />
                  {stt.supported && (
                    <button
                      type="button"
                      onClick={() => (stt.listening ? stt.stop() : stt.start())}
                      className={`btn-secondary px-3 ${stt.listening ? "bg-navy text-paper" : ""}`}
                    >
                      {stt.listening ? "Stop" : "🎙 Speak"}
                    </button>
                  )}
                  <button type="submit" className="btn-primary">
                    Send
                  </button>
                </form>
                {stt.error && <p className="mt-2 text-xs text-navy-dark">{stt.error}</p>}
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
          <PortalSection title="Past viva sessions">
            <ul className="divide-y divide-line">
              {pastSessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {s.unit} — {new Date(s.startedAt).toLocaleDateString()}
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
