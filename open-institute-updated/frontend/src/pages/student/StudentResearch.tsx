import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { toApaCitation } from "../../lib/citations";

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

type Project = { id: string; title: string; type: string; status: string; ethicsRequired: boolean; ethicsApproved: boolean };
type Note = { id: string; title: string; content: string; createdAt: string };
type Bib = { id: string; sourceType: string; title: string; author: string | null; year: number | null; url: string | null };
type MatrixEntry = { id: string; sourceTitle: string; author: string | null; year: number | null; methodology: string | null; keyFindings: string | null };
type Milestone = { id: string; title: string; dueDate: string | null; status: string };
type Alert = { severity: "info" | "warn" | "danger"; message: string };

const alertTone: Record<Alert["severity"], "ok" | "warn" | "danger" | "neutral"> = { info: "neutral", warn: "warn", danger: "danger" };

export default function StudentResearch() {
  const userName = useCurrentUserName();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"student_research" | "innovation" | "startup">("student_research");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Project[]>("/research/projects/mine").then(setProjects).catch(() => setProjects([]));
    apiFetch<Alert[]>("/research/alerts/mine").then(setAlerts).catch(() => undefined);
  }
  useEffect(load, []);

  async function createProject(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/research/projects", { method: "POST", body: JSON.stringify({ title, type }) });
      setTitle("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project.");
    }
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Research workspace</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Your research and innovation projects — notes, bibliography, literature matrix, funding, and IP all in one place.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {alerts.length > 0 && (
        <div className="mt-4 space-y-1">
          {alerts.map((a, i) => (
            <p key={i} className="text-sm"><Badge tone={alertTone[a.severity]}>{a.severity}</Badge> <span className="ml-2">{a.message}</span></p>
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[280px_1fr]">
        <PortalSection title="Your projects">
          <ul className="divide-y divide-line">
            {projects?.map((p) => (
              <li key={p.id} className="py-2">
                <button onClick={() => setSelected(p.id)} className={`text-left text-sm ${selected === p.id ? "font-medium text-navy" : ""}`}>
                  {p.title}
                </button>
                <p className="text-xs text-ink/45">{p.status}</p>
              </li>
            ))}
          </ul>
          <form onSubmit={createProject} className="mt-4 space-y-2 border-t border-line pt-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project title" className="input" />
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="input">
              <option value="student_research">Student research</option>
              <option value="innovation">Innovation</option>
              <option value="startup">Startup</option>
            </select>
            <button type="submit" className="btn-primary w-full justify-center">Propose project</button>
          </form>
        </PortalSection>

        {selected ? <ProjectWorkspace projectId={selected} /> : <p className="text-sm text-ink/50">Select a project to open its workspace.</p>}
      </div>
    </PortalShell>
  );
}

function ProjectWorkspace({ projectId }: { projectId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [bib, setBib] = useState<Bib[]>([]);
  const [matrix, setMatrix] = useState<MatrixEntry[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [bibTitle, setBibTitle] = useState("");
  const [bibAuthor, setBibAuthor] = useState("");
  const [bibYear, setBibYear] = useState<number | "">("");
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDue, setMilestoneDue] = useState("");

  function load() {
    apiFetch<Note[]>(`/research/projects/${projectId}/notes`).then(setNotes).catch(() => undefined);
    apiFetch<Bib[]>(`/research/projects/${projectId}/bibliography`).then(setBib).catch(() => undefined);
    apiFetch<MatrixEntry[]>(`/research/projects/${projectId}/literature-matrix`).then(setMatrix).catch(() => undefined);
    apiFetch<{ id: string; milestones: Milestone[] }[]>(`/research/projects/mine`)
      .then((projects) => {
        const proj = projects.find((p) => p.id === projectId);
        if (proj) setMilestones(proj.milestones);
      })
      .catch(() => undefined);
  }
  useEffect(load, [projectId]);

  async function addMilestone(e: FormEvent) {
    e.preventDefault();
    if (!milestoneTitle.trim()) return;
    await apiFetch(`/research/projects/${projectId}/milestones`, {
      method: "POST",
      body: JSON.stringify({ title: milestoneTitle, dueDate: milestoneDue ? new Date(milestoneDue).toISOString() : undefined }),
    });
    setMilestoneTitle(""); setMilestoneDue("");
    load();
  }

  async function markDone(id: string) {
    await apiFetch(`/research/milestones/${id}/done`, { method: "PATCH" });
    load();
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim()) return;
    await apiFetch(`/research/projects/${projectId}/notes`, { method: "POST", body: JSON.stringify({ title: noteTitle, content: noteContent }) });
    setNoteTitle(""); setNoteContent("");
    load();
  }

  async function addBib(e: FormEvent) {
    e.preventDefault();
    if (!bibTitle.trim()) return;
    await apiFetch(`/research/projects/${projectId}/bibliography`, {
      method: "POST",
      body: JSON.stringify({ sourceType: "journal_article", title: bibTitle, author: bibAuthor || undefined, year: bibYear || undefined }),
    });
    setBibTitle(""); setBibAuthor(""); setBibYear("");
    load();
  }

  return (
    <div className="space-y-6">
      <PortalSection title="Milestones">
        <ul className="divide-y divide-line">
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2 text-sm">
              <span>{m.title} {m.dueDate ? `— due ${new Date(m.dueDate).toLocaleDateString()}` : ""}</span>
              {m.status === "done" ? (
                <Badge tone="ok">Done</Badge>
              ) : (
                <button onClick={() => markDone(m.id)} className="text-xs text-navy underline decoration-dotted">Mark done</button>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={addMilestone} className="mt-3 flex gap-2 border-t border-line pt-3">
          <input value={milestoneTitle} onChange={(e) => setMilestoneTitle(e.target.value)} placeholder="Milestone title" className="input flex-1" />
          <input type="date" value={milestoneDue} onChange={(e) => setMilestoneDue(e.target.value)} className="input" />
          <button type="submit" className="btn-secondary shrink-0">Add</button>
        </form>
      </PortalSection>

      <PortalSection title="Research notebook">
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="border-t border-line pt-2 text-sm">
              <p className="font-medium">{n.title}</p>
              <p className="text-ink/65">{n.content}</p>
            </li>
          ))}
        </ul>
        <form onSubmit={addNote} className="mt-3 space-y-2 border-t border-line pt-3">
          <input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Note title" className="input" />
          <textarea rows={2} value={noteContent} onChange={(e) => setNoteContent(e.target.value)} placeholder="Note content" className="input" />
          <button type="submit" className="btn-secondary">Add note</button>
        </form>
      </PortalSection>

      <PortalSection title="Bibliography">
        <ul className="space-y-1">
          {bib.map((b) => (
            <li key={b.id} className="text-sm text-ink/70">{toApaCitation(b)}</li>
          ))}
        </ul>
        <form onSubmit={addBib} className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          <input value={bibTitle} onChange={(e) => setBibTitle(e.target.value)} placeholder="Title" className="input flex-1" />
          <input value={bibAuthor} onChange={(e) => setBibAuthor(e.target.value)} placeholder="Author" className="input w-40" />
          <input type="number" value={bibYear} onChange={(e) => setBibYear(e.target.value ? Number(e.target.value) : "")} placeholder="Year" className="input w-24" />
          <button type="submit" className="btn-secondary">Add source</button>
        </form>
      </PortalSection>

      <PortalSection title="Literature matrix">
        {matrix.length === 0 ? (
          <p className="text-sm text-ink/50">No entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="text-ink/50"><th className="pr-4">Source</th><th className="pr-4">Methodology</th><th>Key findings</th></tr></thead>
              <tbody>
                {matrix.map((m) => (
                  <tr key={m.id} className="border-t border-line">
                    <td className="py-2 pr-4">{m.sourceTitle} {m.year ? `(${m.year})` : ""}</td>
                    <td className="py-2 pr-4">{m.methodology ?? "—"}</td>
                    <td className="py-2">{m.keyFindings ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PortalSection>

      <EthicsReview projectId={projectId} />

      <ResearchAssistant projectId={projectId} />
    </div>
  );
}

// LB027 — real ethics submission: a researcher writes a protocol summary
// and risk mitigation, then tracks it through committee review — not a
// flag someone else flips with no visibility into why.
type EthicsSubmissionType = {
  id: string;
  summary: string;
  risksAndMitigation: string | null;
  status: string;
  protocolNumber: string | null;
  decisionNotes: string | null;
  submittedAt: string;
};

const ethicsStatusTone: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  submitted: "neutral",
  under_review: "warn",
  revisions_requested: "warn",
  approved: "ok",
  rejected: "danger",
};

function EthicsReview({ projectId }: { projectId: string }) {
  const [submissions, setSubmissions] = useState<EthicsSubmissionType[]>([]);
  const [summary, setSummary] = useState("");
  const [risks, setRisks] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<EthicsSubmissionType[]>(`/research/projects/${projectId}/ethics-submissions`)
      .then(setSubmissions)
      .catch(() => setSubmissions([]));
  }
  useEffect(load, [projectId]);

  const latest = submissions[0];
  const canSubmit = !latest || latest.status === "revisions_requested" || latest.status === "rejected";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!summary.trim()) return;
    setError(null);
    try {
      await apiFetch(`/research/projects/${projectId}/ethics-submissions`, {
        method: "POST",
        body: JSON.stringify({ summary, risksAndMitigation: risks || undefined }),
      });
      setSummary(""); setRisks("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit for ethics review.");
    }
  }

  return (
    <PortalSection title="Ethics review">
      {error && <p className="text-sm text-navy-dark">{error}</p>}
      <ul className="space-y-3">
        {submissions.map((s) => (
          <li key={s.id} className="border-t border-line pt-3 text-sm">
            <div className="flex items-center justify-between">
              <Badge tone={ethicsStatusTone[s.status] ?? "neutral"}>{s.status.replace("_", " ")}</Badge>
              <span className="text-xs text-ink/45">{new Date(s.submittedAt).toLocaleDateString()}</span>
            </div>
            <p className="mt-1 text-ink/70">{s.summary}</p>
            {s.protocolNumber && <p className="mt-1 text-xs text-ink/50">Protocol #{s.protocolNumber}</p>}
            {s.decisionNotes && <p className="mt-1 text-xs text-ink/50">Committee notes: {s.decisionNotes}</p>}
          </li>
        ))}
        {submissions.length === 0 && <p className="text-sm text-ink/50">No ethics submission yet.</p>}
      </ul>
      {canSubmit && (
        <form onSubmit={submit} className="mt-3 space-y-2 border-t border-line pt-3">
          <textarea
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What will be done, to whom/what, and how (protocol summary)"
            className="input"
          />
          <textarea
            rows={2}
            value={risks}
            onChange={(e) => setRisks(e.target.value)}
            placeholder="Risks and how they'll be mitigated (optional)"
            className="input"
          />
          <button type="submit" className="btn-primary">
            {latest ? "Resubmit for review" : "Submit for ethics review"}
          </button>
        </form>
      )}
    </PortalSection>
  );
}

// AI018/LB021/LB022/LB023 — grounded only in this project's real logged
// facts, never claiming knowledge of literature it hasn't been given.
function ResearchAssistant({ projectId }: { projectId: string }) {
  const [mode, setMode] = useState<"gap_analysis" | "research_question" | "methodology">("gap_analysis");
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    setLoading(true);
    setError(null);
    setReply(null);
    try {
      const res = await apiFetch<{ reply: string }>("/ai/research-assistant", {
        method: "POST",
        body: JSON.stringify({ projectId, mode }),
      });
      setReply(res.reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the assistant.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalSection title="AI research assistant">
      <p className="text-xs text-ink/50">
        Grounded only in what you've logged for this project — it hasn't read your actual sources, only your notes and matrix entries about them.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="input">
          <option value="gap_analysis">Research-gap analysis</option>
          <option value="research_question">Research question help</option>
          <option value="methodology">Methodology advice</option>
        </select>
        <button onClick={ask} className="btn-primary" disabled={loading}>{loading ? "Thinking…" : "Ask"}</button>
      </div>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {reply && <p className="mt-3 whitespace-pre-line text-sm text-ink/75">{reply}</p>}
    </PortalSection>
  );
}
