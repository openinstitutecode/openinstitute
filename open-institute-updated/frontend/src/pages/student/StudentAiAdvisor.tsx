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

type Tab = "planner" | "revision" | "advisor";

export default function StudentAiAdvisor() {
  const userName = useCurrentUserName();
  const [tab, setTab] = useState<Tab>("planner");

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">AI study advisor</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Every plan below is built from your real deadlines, real scores, or
        real progression record — the model only phrases and organizes that
        data, it never invents an academic fact about you.
      </p>

      <div className="mt-6 flex gap-2 border-b border-line">
        {([
          ["planner", "Study planner"],
          ["revision", "Revision assistant"],
          ["advisor", "Academic advisor"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm ${tab === key ? "border-b-2 border-navy font-medium" : "text-ink/55"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "planner" && <StudyPlanner />}
        {tab === "revision" && <RevisionAssistant />}
        {tab === "advisor" && <AcademicAdvisor />}
      </div>
    </PortalShell>
  );
}

function StudyPlanner() {
  const [plan, setPlan] = useState<string | null>(null);
  const [deadlines, setDeadlines] = useState<{ unit: string; title: string; dueAt: string; kind: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // AI036 — multilingual AI: the backend has accepted a `language` field
  // since it was added, but no page ever sent it.
  const [language, setLanguage] = useState<"en" | "sw">("en");

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ plan: string; upcomingDeadlines: typeof deadlines }>("/ai/study-planner", {
        method: "POST",
        body: JSON.stringify({ language }),
      });
      setPlan(res.plan);
      setDeadlines(res.upcomingDeadlines);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a plan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalSection title="Weekly study plan">
      <div className="flex items-center gap-2">
        <button onClick={generate} className="btn-primary" disabled={loading}>
          {loading ? "Generating…" : "Generate my study plan"}
        </button>
        <select value={language} onChange={(e) => setLanguage(e.target.value as "en" | "sw")} className="input w-28">
          <option value="en">English</option>
          <option value="sw">Kiswahili</option>
        </select>
      </div>
      {error && <p className="mt-2 text-sm text-navy-dark">{error}</p>}
      {plan && <p className="mt-4 whitespace-pre-line text-sm text-ink/75">{plan}</p>}
      {deadlines.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-line pt-3">
          {deadlines.map((d, i) => (
            <li key={i} className="text-xs text-ink/50">{d.unit} — {d.kind} "{d.title}" due {new Date(d.dueAt).toLocaleDateString()}</li>
          ))}
        </ul>
      )}
    </PortalSection>
  );
}

function RevisionAssistant() {
  const [plan, setPlan] = useState<string | null>(null);
  const [weakAreas, setWeakAreas] = useState<{ unit: string; assessment: string; percentage: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ plan: string; weakAreas: typeof weakAreas }>("/ai/revision-assistant", { method: "POST" });
      setPlan(res.plan);
      setWeakAreas(res.weakAreas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a revision plan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalSection title="Revision priorities">
      <button onClick={generate} className="btn-primary" disabled={loading}>
        {loading ? "Generating…" : "Find my weak areas"}
      </button>
      {error && <p className="mt-2 text-sm text-navy-dark">{error}</p>}
      {plan && <p className="mt-4 whitespace-pre-line text-sm text-ink/75">{plan}</p>}
      {weakAreas.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-line pt-3">
          {weakAreas.map((w, i) => (
            <li key={i} className="text-xs text-ink/50">{w.unit} — "{w.assessment}" scored {w.percentage}%</li>
          ))}
        </ul>
      )}
    </PortalSection>
  );
}

function AcademicAdvisor() {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const userMessage = { role: "user" as const, content: input };
    setMessages((m) => [...m, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ reply: string }>("/ai/academic-advisor", {
        method: "POST",
        body: JSON.stringify({ message: userMessage.content }),
      });
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the advisor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalSection title="Ask about your progression">
      <div className="space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === "user" ? "font-medium" : "text-ink/75"}`}>
            {m.content}
          </div>
        ))}
        {loading && <p className="text-sm text-ink/40">Thinking…</p>}
        {error && <p className="text-sm text-navy-dark">{error}</p>}
      </div>
      <form onSubmit={submit} className="mt-4 flex gap-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Am I on track to graduate on time?" className="input flex-1" />
        <button type="submit" className="btn-primary" disabled={loading}>Ask</button>
      </form>
      <p className="mt-2 text-xs text-ink/45">
        This advisor can't override a registrar decision or make an exception — for that, use Appeals or contact the registrar directly.
      </p>
    </PortalSection>
  );
}
