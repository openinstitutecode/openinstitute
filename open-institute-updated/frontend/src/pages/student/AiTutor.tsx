import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { useSpeechToText, useTextToSpeech } from "../../lib/voice";
import AiFeedback from "../../components/portal/AiFeedback";

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

type Message = { role: "user" | "assistant"; content: string; sourceRefs?: string[]; messageId?: string };
type SessionMessage = { id: string; role: "student" | "tutor"; content: string; timestamp: string };
type Session = { id: string; unit: string | null; messages: SessionMessage[] };

const UNIT_OPTIONS = [
  "Financial Accounting",
  "Entrepreneurship",
  "Business Law",
  "Marketing Management",
];

export default function AiTutor() {
  const userName = useCurrentUserName();
  const [unit, setUnit] = useState(UNIT_OPTIONS[0]);
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  // AI036 — multilingual AI: the backend has supported a `language` field
  // on /ai/tutor since it was introduced, but no page ever sent it — this
  // is the first real UI control for it.
  const [language, setLanguage] = useState<"en" | "sw">("en");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "I'm your AI tutor for this unit. I only draw on your trainer's approved material — ask me to explain a concept, quiz you, or build a revision plan.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [resuming, setResuming] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedIndex, setSavedIndex] = useState<number | null>(null);
  const [autoSuggested, setAutoSuggested] = useState<string | null>(null);

  // AI034/AI035 — browser-native voice input and read-aloud (Web Speech
  // API — no server infra, see lib/voice.ts for exactly what this is and
  // isn't). Both follow the same language selector as the multilingual
  // tutor itself, so a Kiswahili conversation stays Kiswahili end to end.
  const { supported: sttSupported, listening, transcript, error: sttError, start: startListening, stop: stopListening } = useSpeechToText(language);
  const { supported: ttsSupported, speaking, speak, stop: stopSpeaking } = useTextToSpeech(language);

  useEffect(() => {
    if (transcript) setInput(transcript);
  }, [transcript]);

  // AI024 — adaptive learning: suggest a starting difficulty from this
  // student's own recent graded scores instead of always defaulting to
  // "intermediate". Applied once, on first load only — after that the
  // selector is entirely the student's own choice, same as before.
  useEffect(() => {
    let applied = false;
    apiFetch<{ difficulty: "beginner" | "intermediate" | "advanced"; basedOnAttempts: number }>("/ai/suggested-difficulty")
      .then((r) => {
        if (applied || r.basedOnAttempts === 0) return;
        setDifficulty(r.difficulty);
        setAutoSuggested(r.difficulty);
      })
      .catch(() => undefined);
    return () => {
      applied = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SP024 — persistent, per-unit sessions: opening (or switching to) a
  // unit resumes its real conversation history from the backend instead
  // of starting from a blank slate every time the page loads.
  useEffect(() => {
    let cancelled = false;
    setResuming(true);
    apiFetch<Session>("/tutor-sessions", { method: "POST", body: JSON.stringify({ unit }) })
      .then((session) => {
        if (cancelled) return;
        setSessionId(session.id);
        if (session.messages.length > 0) {
          setMessages(
            session.messages.map((m) => ({
              role: m.role === "student" ? "user" : "assistant",
              content: m.content,
            }))
          );
        } else {
          setMessages([
            {
              role: "assistant",
              content: `I'm your AI tutor for ${unit}. I only draw on your trainer's approved material — ask me to explain a concept, quiz you, or build a revision plan.`,
            },
          ]);
        }
      })
      .catch(() => {
        // Session persistence is a nice-to-have — the chat still works
        // locally even if the backend session couldn't be created/loaded.
        setSessionId(null);
      })
      .finally(() => {
        if (!cancelled) setResuming(false);
      });
    return () => {
      cancelled = true;
    };
  }, [unit]);

  async function saveToNotebook(m: Message) {
    try {
      await apiFetch("/me/notebook", {
        method: "POST",
        body: JSON.stringify({
          title: `${unit} — AI tutor note`,
          content: m.content,
          sourceType: "ai_tutor",
        }),
      });
      setSavedIndex(messages.indexOf(m));
    } catch {
      // Non-fatal — the chat still works even if the save fails.
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const userMessage: Message = { role: "user", content: input };
    setMessages((m) => [...m, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ reply: string; sourceRefs: string[]; sessionId?: string; messageId?: string }>(
        "/ai/tutor",
        {
          method: "POST",
          body: JSON.stringify({ unit, message: userMessage.content, difficulty, sessionId, language }),
        }
      );
      if (res.sessionId) setSessionId(res.sessionId);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: res.reply, sourceRefs: res.sourceRefs, messageId: res.messageId },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} — the AI tutor requires the backend and a configured model provider.`
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl">AI Tutor</h1>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
            <select
              value={difficulty}
              onChange={(e) => {
                setDifficulty(e.target.value as typeof difficulty);
                setAutoSuggested(null);
              }}
              className="input w-40"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="input w-56"
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <select value={language} onChange={(e) => setLanguage(e.target.value as "en" | "sw")} className="input w-28">
              <option value="en">English</option>
              <option value="sw">Kiswahili</option>
            </select>
          </div>
          {autoSuggested && (
            <p className="text-[11px] text-ink/45">Auto-suggested from your recent scores</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex h-[65vh] flex-col border border-line bg-white">
        {resuming && <p className="border-b border-line px-6 py-2 text-xs text-ink/45">Resuming your conversation for {unit}…</p>}
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[75ch] ${m.role === "user" ? "ml-auto text-right" : ""}`}
            >
              <div
                className={`inline-block rounded-sm px-4 py-3 text-sm ${
                  m.role === "user"
                    ? "bg-navy text-paper"
                    : "bg-navy/[0.05] text-ink"
                }`}
              >
                {m.content}
              </div>
              {m.sourceRefs && m.sourceRefs.length > 0 && (
                <p className="mt-1 text-xs text-ink/40">
                  Drawn from: {m.sourceRefs.join(", ")}
                </p>
              )}
              {m.role === "assistant" && i > 0 && <AiFeedback messageId={m.messageId} />}
              {m.role === "assistant" && i > 0 && (
                <div className="mt-1 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => saveToNotebook(m)}
                    className="text-xs text-navy underline decoration-dotted"
                  >
                    {savedIndex === i ? "Saved to notebook" : "Save to notebook"}
                  </button>
                  {ttsSupported && (
                    <button
                      type="button"
                      onClick={() => (speaking ? stopSpeaking() : speak(m.content))}
                      className="text-xs text-navy underline decoration-dotted"
                    >
                      {speaking ? "Stop reading" : "Read aloud"}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {loading && <p className="text-sm text-ink/40">Thinking…</p>}
          {error && (
            <p role="alert" className="border border-gold-dark bg-gold/10 p-3 text-xs text-navy-dark">
              {error}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-3 border-t border-line p-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask about ${unit}…`}
            className="input flex-1"
          />
          {sttSupported && (
            <button
              type="button"
              onClick={() => (listening ? stopListening() : startListening())}
              title={listening ? "Stop listening" : "Speak your question"}
              className={`btn-secondary ${listening ? "animate-pulse" : ""}`}
            >
              {listening ? "● Listening…" : "🎤"}
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={loading}>
            Send
          </button>
        </form>
        {sttError && <p className="border-t border-line px-4 py-2 text-xs text-navy-dark">{sttError}</p>}
      </div>

      <p className="mt-3 text-xs text-ink/45">
        The AI tutor cannot set grades and will refer anything it's unsure of
        to your human trainer.
      </p>
    </PortalShell>
  );
}
