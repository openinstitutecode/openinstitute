import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge, Table } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { studentLinks as links } from "./studentLinks";

type Prog = { courseId: string; title: string; unitCode: string; lessons: { total: number; done: number; percent: number | null }; modules: { title: string; total: number; done: number; percent: number | null }[]; assessments: { total: number; attempted: number }; assignments: { total: number; handedIn: number }; grade: { percent: number | null; letter: string | null; missing: number; awaiting: number } | null; onTrack: boolean };
type Mine = { course: { title: string }; items: { id: string; title: string; kind: string; category: string; totalMarks: number }[]; cells: Record<string, { score: number | null; percent: number | null; state: string }>; overall: { percent: number | null; letter: string | null; weighted: boolean }; missing: number; awaiting: number; trend: { direction: string; slope: number | null } };
type Note = { id: string; lessonId: string; lessonTitle: string; body: string; updatedAt: string };
type Mark = { lessonId: string; title: string; moduleTitle: string; courseId: string; savedAt: string };
type Ev = { at: string; type: string; label: string };
type Hit = { lessonId: string; title: string; moduleTitle: string; snippet: string | null };

const bar = (p: number | null) => <div className="h-2 w-full bg-ink/10"><div className="h-2 bg-navy" style={{ width: `${Math.min(100, p ?? 0)}%` }} /></div>;

export default function StudentLearning() {
  const userName = useCurrentUserName();
  const [prog, setProg] = useState<Prog[] | null>(null);
  const [sel, setSel] = useState("");
  const [gb, setGb] = useState<Mine | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [edit, setEdit] = useState<{ id: string; body: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ courses: Prog[] }>("/lms/progress/me").then((r) => { setProg(r.courses); if (r.courses[0]) setSel(r.courses[0].courseId); }).catch((e) => setErr(e.message));
    apiFetch<Note[]>("/lms/notes").then(setNotes).catch(() => undefined);
    apiFetch<Mark[]>("/lms/bookmarks").then(setMarks).catch(() => undefined);
    apiFetch<Ev[]>("/lms/activity/me").then(setEvents).catch(() => undefined);
  }, []);
  useEffect(() => { if (sel) apiFetch<Mine>(`/lms/gradebook/${sel}/me`).then(setGb).catch(() => setGb(null)); setHits(null); }, [sel]);

  async function search() {
    if (q.trim().length < 2 || !sel) return;
    try { setHits((await apiFetch<{ hits: Hit[] }>(`/lms/courses/${sel}/search?q=${encodeURIComponent(q.trim())}`)).hits); } catch (e) { setErr(e instanceof Error ? e.message : "Search failed."); }
  }
  async function saveNote() {
    if (!edit) return;
    try { await apiFetch(`/lms/notes/${edit.id}`, { method: "PATCH", body: JSON.stringify({ body: edit.body }) }); setEdit(null); setNotes(await apiFetch<Note[]>("/lms/notes")); } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); }
  }
  async function delNote(id: string) { await apiFetch(`/lms/notes/${id}`, { method: "DELETE" }); setNotes((n) => n.filter((x) => x.id !== id)); }
  async function unmark(lessonId: string) { await apiFetch(`/lms/lessons/${lessonId}/bookmark`, { method: "POST" }); setMarks((m) => m.filter((x) => x.lessonId !== lessonId)); }

  const cur = prog?.find((p) => p.courseId === sel);
  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <div className="space-y-6">
        {err && <p className="text-sm text-red-700" role="alert">{err}</p>}
        <PortalSection title="My progress" action={prog && prog.length > 1 ? <select className="input !w-auto" value={sel} onChange={(e) => setSel(e.target.value)}>{prog.map((p) => <option key={p.courseId} value={p.courseId}>{p.title}</option>)}</select> : undefined}>
          {!prog ? <p className="text-sm text-ink/60">Loading…</p> : !cur ? <p className="text-sm text-ink/60">You are not enrolled in a course with content yet.</p> : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3"><h3 className="font-medium">{cur.title}</h3><Badge tone={cur.onTrack ? "ok" : "warn"}>{cur.onTrack ? "On track" : "Needs attention"}</Badge>
                {cur.grade?.percent != null && <Badge tone="neutral">Current grade {cur.grade.percent}% ({cur.grade.letter})</Badge>}</div>
              <div><p className="mb-1 text-xs">Lessons {cur.lessons.done}/{cur.lessons.total} ({cur.lessons.percent ?? 0}%)</p>{bar(cur.lessons.percent)}</div>
              <ul className="grid gap-2 sm:grid-cols-2">{cur.modules.map((m) => <li key={m.title} className="text-xs"><span>{m.title} — {m.done}/{m.total}</span>{bar(m.percent)}</li>)}</ul>
              <p className="text-xs text-ink/70">Assignments handed in {cur.assignments.handedIn}/{cur.assignments.total} · Assessments attempted {cur.assessments.attempted}/{cur.assessments.total}{cur.grade && cur.grade.missing > 0 ? ` · ${cur.grade.missing} piece(s) of work missing` : ""}{cur.grade && cur.grade.awaiting > 0 ? ` · ${cur.grade.awaiting} awaiting marking` : ""}</p>
            </div>)}
        </PortalSection>

        {gb && (
          <PortalSection title="My gradebook">
            <p className="mb-3 text-sm">{gb.overall.percent === null ? "No released results yet." : `Overall ${gb.overall.percent}% (${gb.overall.letter})${gb.overall.weighted ? " — weighted by category" : ""}. Trend: ${gb.trend.direction.toLowerCase()}.`}</p>
            <Table columns={["Item", "Type", "Result", "Status"]} rows={gb.items.map((i) => { const c = gb.cells[i.id]; return [i.title, i.category.replace(/_/g, " "), c?.score != null ? `${c.score}/${i.totalMarks} (${c.percent}%)` : "—", (c?.state ?? "").replace(/_/g, " ").toLowerCase()]; })} />
          </PortalSection>)}

        <PortalSection title="Search this course">
          <div className="flex gap-2"><input className="input" placeholder="Search lessons, tags and text…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} /><button className="btn-secondary" onClick={search}>Search</button></div>
          {hits && (hits.length === 0 ? <p className="mt-3 text-sm text-ink/60">Nothing found.</p> : <ul className="mt-3 space-y-2 text-sm">{hits.map((h) => <li key={h.lessonId}><strong>{h.title}</strong> <span className="text-xs text-ink/50">{h.moduleTitle}</span>{h.snippet && <span className="block text-xs text-ink/70">{h.snippet}</span>}</li>)}</ul>)}
        </PortalSection>

        <PortalSection title={`Saved lessons (${marks.length})`}>
          {marks.length === 0 ? <p className="text-sm text-ink/60">Bookmark a lesson from the lesson page to find it here.</p> : <ul className="space-y-1 text-sm">{marks.map((m) => <li key={m.lessonId} className="flex justify-between"><span>{m.title} <span className="text-xs text-ink/50">{m.moduleTitle}</span></span><button className="text-xs underline" onClick={() => unmark(m.lessonId)}>Remove</button></li>)}</ul>}
        </PortalSection>

        <PortalSection title={`My lesson notes (${notes.length})`}>
          {notes.length === 0 ? <p className="text-sm text-ink/60">Notes you write on lessons appear here — only you can see them.</p> : (
            <ul className="space-y-3 text-sm">{notes.map((n) => (
              <li key={n.id} className="border border-line p-3"><p className="text-xs text-ink/50">{n.lessonTitle} · {new Date(n.updatedAt).toLocaleDateString()}</p>
                {edit?.id === n.id ? <div className="mt-1 space-y-2"><textarea className="input" value={edit.body} onChange={(e) => setEdit({ id: n.id, body: e.target.value })} /><div className="flex gap-2"><button className="btn-primary !py-1" onClick={saveNote}>Save</button><button className="btn-secondary !py-1" onClick={() => setEdit(null)}>Cancel</button></div></div>
                  : <><p className="mt-1 whitespace-pre-wrap">{n.body}</p><div className="mt-1 flex gap-3 text-xs"><button className="underline" onClick={() => setEdit({ id: n.id, body: n.body })}>Edit</button><button className="underline" onClick={() => delNote(n.id)}>Delete</button></div></>}
              </li>))}</ul>)}
        </PortalSection>

        <PortalSection title="Recent activity">
          {events.length === 0 ? <p className="text-sm text-ink/60">No activity yet.</p> : <ul className="space-y-1 text-xs">{events.slice(0, 30).map((e, i) => <li key={i}><span className="font-mono text-ink/50">{new Date(e.at).toLocaleString()}</span> — {e.type.replace(/_/g, " ").toLowerCase()}: {e.label}</li>)}</ul>}
        </PortalSection>
      </div>
    </PortalShell>
  );
}
