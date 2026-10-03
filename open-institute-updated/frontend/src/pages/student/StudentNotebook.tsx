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

type Entry = { id: string; title: string; content: string; sourceType: string; createdAt: string };

export default function StudentNotebook() {
  const userName = useCurrentUserName();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Entry[]>("/me/notebook").then(setEntries).catch(() => setEntries([]));
  }
  useEffect(load, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    try {
      await apiFetch("/me/notebook", { method: "POST", body: JSON.stringify({ title, content }) });
      setTitle("");
      setContent("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that note.");
    }
  }

  async function remove(id: string) {
    await apiFetch(`/me/notebook/${id}`, { method: "DELETE" }).catch(() => undefined);
    load();
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Knowledge notebook</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Your own notes, plus anything you've saved from the AI tutor. Only
        you can see this — it isn't part of any academic record.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Add a note">
          <form onSubmit={add} className="space-y-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="input" />
            <textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Note content…" className="input" />
            <button type="submit" className="btn-primary">Save note</button>
          </form>
          {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
        </PortalSection>

        <PortalSection title="Your notes">
          {entries && entries.length === 0 && <p className="text-sm text-ink/50">No notes yet.</p>}
          <ul className="divide-y divide-line">
            {entries?.map((n) => (
              <li key={n.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-sm">{n.title}</p>
                  <div className="flex items-center gap-2">
                    {n.sourceType === "ai_tutor" && <Badge tone="neutral">AI tutor</Badge>}
                    <button onClick={() => remove(n.id)} className="text-xs text-navy-dark underline decoration-dotted">Delete</button>
                  </div>
                </div>
                <p className="mt-1 text-sm text-ink/65">{n.content}</p>
                <p className="mt-1 text-xs text-ink/40">{new Date(n.createdAt).toLocaleDateString()}</p>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
