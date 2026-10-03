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

type Item = { id: string; title: string; description: string | null; category: string; linkUrl: string | null; addedAt: string };
const categories = ["project", "competency", "badge", "research", "attachment", "other"] as const;

export default function StudentPortfolio() {
  const userName = useCurrentUserName();
  const [items, setItems] = useState<Item[] | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("project");
  const [linkUrl, setLinkUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Item[]>("/me/portfolio").then(setItems).catch(() => setItems([]));
  }
  useEffect(load, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    try {
      await apiFetch("/me/portfolio", {
        method: "POST",
        body: JSON.stringify({ title, description: description || undefined, category, linkUrl: linkUrl || undefined }),
      });
      setTitle("");
      setDescription("");
      setLinkUrl("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that item — check the link is a valid URL.");
    }
  }

  async function remove(id: string) {
    await apiFetch(`/me/portfolio/${id}`, { method: "DELETE" }).catch(() => undefined);
    load();
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Digital portfolio</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Curate your own showcase of work — projects, research, badges,
        attachment outcomes — to share with employers or keep for yourself.
        This is display only; it doesn't create or change any academic record.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Add an item">
          <form onSubmit={add} className="space-y-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="input" />
            <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="input">
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="input" />
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Link (optional)" className="input" />
            <button type="submit" className="btn-primary">Add to portfolio</button>
          </form>
          {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
        </PortalSection>

        <PortalSection title="Your portfolio">
          {items && items.length === 0 && <p className="text-sm text-ink/50">Nothing added yet.</p>}
          <ul className="divide-y divide-line">
            {items?.map((it) => (
              <li key={it.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-sm">{it.title}</p>
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">{it.category}</Badge>
                    <button onClick={() => remove(it.id)} className="text-xs text-navy-dark underline decoration-dotted">Remove</button>
                  </div>
                </div>
                {it.description && <p className="mt-1 text-sm text-ink/65">{it.description}</p>}
                {it.linkUrl && (
                  <a href={it.linkUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-navy underline">
                    {it.linkUrl}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
