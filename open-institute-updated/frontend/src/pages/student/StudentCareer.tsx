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

export default function StudentCareer() {
  const userName = useCurrentUserName();
  const [roles, setRoles] = useState<string[] | null>(null);
  const [programme, setProgramme] = useState<string | null>(null);
  const [targetRole, setTargetRole] = useState("");
  const [experience, setExperience] = useState("");
  // AI036 — multilingual AI: the backend now accepts a `language` field for
  // CV drafting; this is the UI control for it.
  const [cvLanguage, setCvLanguage] = useState<"en" | "sw">("en");
  const [cvDraft, setCvDraft] = useState<string | null>(null);
  const [cvSaved, setCvSaved] = useState(false);
  const [interviewLog, setInterviewLog] = useState<{ role: "ai" | "me"; text: string }[]>([]);
  const [interviewInput, setInterviewInput] = useState("");
  const [interviewConversationId, setInterviewConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // SP028 — resolved from the student's actual enrolled programme, not a
  // hardcoded slug, so every programme (not just Business Management) gets
  // its own real role mapping.
  useEffect(() => {
    apiFetch<{ programme: string; roles: string[]; hasMapping: boolean }>("/career/my-roles")
      .then((r) => {
        setProgramme(r.programme);
        setRoles(r.roles);
      })
      .catch(() => setRoles([]));
  }, []);

  async function draftCv(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCvSaved(false);
    try {
      const res = await apiFetch<{ draft: string }>("/career/cv-draft", {
        method: "POST",
        body: JSON.stringify({ targetRole, experienceSummary: experience, language: cvLanguage }),
      });
      setCvDraft(res.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not draft your CV.");
    }
  }

  // SP028 — persist the chosen draft into the student's own portfolio,
  // instead of it only ever existing in this one browser tab.
  async function saveCvToPortfolio() {
    if (!cvDraft) return;
    setError(null);
    try {
      await apiFetch("/career/cv-draft/save", {
        method: "POST",
        body: JSON.stringify({ targetRole, draft: cvDraft }),
      });
      setCvSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this draft.");
    }
  }

  async function startInterview() {
    setError(null);
    try {
      const res = await apiFetch<{ reply: string; conversationId: string }>("/career/mock-interview", {
        method: "POST",
        body: JSON.stringify({ role: targetRole || "Business Development Associate", turn: 0 }),
      });
      setInterviewLog([{ role: "ai", text: res.reply }]);
      setInterviewConversationId(res.conversationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the interview.");
    }
  }

  async function sendInterviewAnswer(e: FormEvent) {
    e.preventDefault();
    if (!interviewInput.trim()) return;
    const mine = interviewInput;
    setInterviewLog((log) => [...log, { role: "me", text: mine }]);
    setInterviewInput("");
    try {
      const res = await apiFetch<{ reply: string; conversationId: string }>("/career/mock-interview", {
        method: "POST",
        body: JSON.stringify({
          role: targetRole || "Business Development Associate",
          answer: mine,
          turn: interviewLog.length,
          conversationId: interviewConversationId,
        }),
      });
      setInterviewLog((log) => [...log, { role: "ai", text: res.reply }]);
      setInterviewConversationId(res.conversationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue the interview.");
    }
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Career services</h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Roles your programme leads to">
          {programme && <p className="mb-2 text-xs text-ink/45">Based on your programme: {programme}</p>}
          {roles && roles.length === 0 && <p className="text-sm text-ink/50">No mapping available yet.</p>}
          <ul className="space-y-2 text-sm">
            {roles?.map((r) => (
              <li key={r} className="border-b border-line pb-2 last:border-0">{r}</li>
            ))}
          </ul>
        </PortalSection>

        <PortalSection title="Draft CV bullet points">
          <form onSubmit={draftCv} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Target role</span>
              <input required value={targetRole} onChange={(e) => setTargetRole(e.target.value)} className="input mt-1.5" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Describe your relevant experience</span>
              <textarea required rows={3} value={experience} onChange={(e) => setExperience(e.target.value)} className="input mt-1.5" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Language</span>
              <select value={cvLanguage} onChange={(e) => setCvLanguage(e.target.value as "en" | "sw")} className="input mt-1.5 w-32">
                <option value="en">English</option>
                <option value="sw">Kiswahili</option>
              </select>
            </label>
            <button type="submit" className="btn-primary w-full justify-center">
              Draft bullet points
            </button>
          </form>
          {cvDraft && (
            <>
              <pre className="mt-4 whitespace-pre-wrap font-sans text-sm text-ink/80">{cvDraft}</pre>
              <button
                type="button"
                onClick={saveCvToPortfolio}
                className="mt-3 text-xs font-medium text-navy hover:underline"
              >
                {cvSaved ? "Saved to your portfolio ✓" : "Save this draft to my portfolio"}
              </button>
            </>
          )}
        </PortalSection>
      </div>

      <div className="mt-6">
        <PortalSection title="Mock interview">
          {interviewLog.length === 0 ? (
            <button onClick={startInterview} className="btn-secondary">
              Start a mock interview for "{targetRole || "your target role"}"
            </button>
          ) : (
            <>
              <div className="max-h-72 space-y-3 overflow-y-auto">
                {interviewLog.map((m, i) => (
                  <div key={i} className={`text-sm ${m.role === "me" ? "text-right" : ""}`}>
                    <span className={`inline-block rounded-sm px-3 py-2 ${m.role === "me" ? "bg-navy text-paper" : "bg-navy/[0.05]"}`}>
                      {m.text}
                    </span>
                  </div>
                ))}
              </div>
              <form onSubmit={sendInterviewAnswer} className="mt-4 flex gap-3">
                <input value={interviewInput} onChange={(e) => setInterviewInput(e.target.value)} className="input flex-1" />
                <button type="submit" className="btn-primary">Reply</button>
              </form>
            </>
          )}
        </PortalSection>
      </div>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}
    </PortalShell>
  );
}
