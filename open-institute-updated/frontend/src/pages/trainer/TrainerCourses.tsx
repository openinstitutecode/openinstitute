import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";

type Lesson = { id: string; title: string };
type Module = { id: string; title: string; lessons: Lesson[] };
type Course = { id: string; title: string; modules: Module[] };

export default function TrainerCourses() {
  const userName = useCurrentUserName();
  const selectedCourseId = new URLSearchParams(window.location.search).get("courseId");
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Course[]>("/trainer-self/courses")
      .then(setCourses)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your courses."));
  }, []);

  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">My courses</h1>
      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 space-y-6">
        {courses && courses.length === 0 && <p className="text-sm text-ink/50">No courses assigned yet.</p>}
        {courses?.map((c) => (
          <PortalSection key={c.id} title={c.title}>
            {c.modules.length === 0 ? (
              <p className="text-sm text-ink/50">No modules published yet.</p>
            ) : (
              <div className="divide-y divide-line">
                {c.modules.map((m) => (
                  <div key={m.id} className="py-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{m.title}</span>
                      <Badge tone={m.lessons.length > 0 ? "ok" : "neutral"}>{m.lessons.length} lesson(s)</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              <Link to={`/trainer/lesson-builder?courseId=${encodeURIComponent(c.id)}`} className="btn-primary px-3 py-2 text-xs">Build course notes &amp; lessons</Link>
              <Link to={`/trainer/quiz-builder?courseId=${encodeURIComponent(c.id)}`} className="btn-secondary px-3 py-2 text-xs">Build quizzes &amp; exams</Link>
              <Link to={`/trainer/assignments?courseId=${encodeURIComponent(c.id)}`} className="btn-secondary px-3 py-2 text-xs">Manage &amp; publish assignments</Link>
            </div>
            <CourseAnnouncementForm courseId={c.id} initiallyOpen={selectedCourseId === c.id} />
            <CourseDeliveryPlanPanel courseId={c.id} />
          </PortalSection>
        ))}
      </div>
    </PortalShell>
  );
}

// LMS015 — Course-scoped announcements. The backend (POST/GET
// /courses/:courseId/announcements, CourseAnnouncement model) already
// existed; nothing on either side of the app ever called it, so a course
// announcement written here never reached a student. Paired with
// CourseAnnouncementsWidget in StudentCourses.tsx, which reads the same
// route. Distinct from TP029's course-scoped Notification broadcast
// (/trainer-self/announcements) — that pushes a one-off alert; this is a
// persistent, re-readable announcement feed for the course.
type CourseAnnouncement = { id: string; title: string; content: string; importance: string; createdAt: string; status?: string };
function CourseAnnouncementForm({ courseId, initiallyOpen = false }: { courseId: string; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [importance, setImportance] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [posted, setPosted] = useState<CourseAnnouncement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function loadExisting() {
    apiFetch<CourseAnnouncement[]>(`/courses/${courseId}/announcements`)
      .then(setPosted)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load course notes."));
  }
  useEffect(loadExisting, [courseId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch(editingId
        ? `/courses/${courseId}/announcements/${editingId}`
        : `/courses/${courseId}/announcements`, {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({ title, content, importance }),
      });
      setTitle("");
      setContent("");
      setImportance("normal");
      setEditingId(null);
      loadExisting();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post the announcement.");
    } finally {
      setSaving(false);
    }
  }

  function edit(note: CourseAnnouncement) {
    setEditingId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setImportance(["low", "normal", "high", "urgent"].includes(note.importance) ? note.importance as "low" | "normal" | "high" | "urgent" : "normal");
  }

  async function remove(note: CourseAnnouncement) {
    if (!window.confirm(`Delete "${note.title}" from this course? Previously delivered notifications cannot be recalled.`)) return;
    setError(null);
    try {
      await apiFetch(`/courses/${courseId}/announcements/${note.id}`, { method: "DELETE" });
      if (editingId === note.id) {
        setEditingId(null);
        setTitle("");
        setContent("");
        setImportance("normal");
      }
      loadExisting();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the course note.");
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-navy hover:underline">
        {open ? "Hide course notes & updates" : `Course notes & updates (${posted.length})`}
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          {posted.length > 0 && (
            <ul className="space-y-2">
              {posted.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 border border-line p-3 text-xs text-ink/60">
                  <span>
                    <span className="font-medium text-ink/80">{a.title}</span> — {a.content}
                    {a.importance !== "normal" && <span className="ml-1 text-navy-dark">({a.importance})</span>}
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => edit(a)} className="text-navy underline">Edit</button>
                    <button type="button" onClick={() => void remove(a)} className="text-red-700 underline">Delete</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={submit} className="space-y-2">
            <p className="text-xs font-medium text-ink/70">{editingId ? "Update course note" : "Write a course note or update"}</p>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required className="input w-full" />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Announcement"
              required
              rows={2}
              className="input w-full"
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-ink/60">
                Priority
                <select value={importance} onChange={(e) => setImportance(e.target.value as "low" | "normal" | "high" | "urgent")} className="input py-1">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
              <button type="submit" disabled={saving} className="btn-primary px-3 py-1 text-xs disabled:opacity-50">
                {saving ? "Saving…" : editingId ? "Save changes" : "Publish note"}
              </button>
              {editingId && <button type="button" onClick={() => { setEditingId(null); setTitle(""); setContent(""); setImportance("normal"); }} className="text-xs text-ink/60 underline">Cancel edit</button>}
            </div>
            {error && <p className="text-xs text-navy-dark">{error}</p>}
          </form>
        </div>
      )}
    </div>
  );
}

// AI014 — course delivery/pacing plan, batch 64. AI drafts a week-by-week
// schedule grounded only in this course's real lessons; the trainer edits
// freely and explicitly publishes before a single student sees it.
type PlanItem = { id: string; weekNumber: number; title: string; objective: string };
type Plan = { id: string; totalWeeks: number; publishedAt: string | null; items: PlanItem[] };
function CourseDeliveryPlanPanel({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [totalWeeks, setTotalWeeks] = useState(12);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Plan>(`/course-delivery/${courseId}`)
      .then(setPlan)
      .catch(() => setPlan(null));
  }
  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const p = await apiFetch<Plan>(`/course-delivery/${courseId}/generate`, {
        method: "POST",
        body: JSON.stringify({ totalWeeks }),
      });
      setPlan(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a plan.");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!plan) return;
    try {
      await apiFetch(`/course-delivery/${courseId}/publish`, { method: "PATCH" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish.");
    }
  }

  async function updateItem(itemId: string, data: Partial<Pick<PlanItem, "title" | "objective" | "weekNumber">>) {
    try {
      await apiFetch(`/course-delivery/${courseId}/items/${itemId}`, { method: "PATCH", body: JSON.stringify(data) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-navy hover:underline">
        {open ? "Hide delivery plan" : "Delivery / pacing plan"}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={52}
              value={totalWeeks}
              onChange={(e) => setTotalWeeks(Number(e.target.value))}
              className="input w-24"
            />
            <button type="button" onClick={generate} disabled={busy} className="btn-primary px-3 py-1 text-xs disabled:opacity-50">
              {busy ? "Generating…" : plan ? "Regenerate plan" : "Generate plan with AI"}
            </button>
            {plan && (
              <Badge tone={plan.publishedAt ? "ok" : "warn"}>{plan.publishedAt ? "Published" : "Draft — not visible to students"}</Badge>
            )}
            {plan && !plan.publishedAt && (
              <button type="button" onClick={publish} className="btn-secondary px-3 py-1 text-xs">
                Publish to students
              </button>
            )}
          </div>
          {error && <p className="text-xs text-navy-dark">{error}</p>}
          {plan && (
            <ul className="divide-y divide-line">
              {plan.items.map((it) => (
                <li key={it.id} className="py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Week {it.weekNumber}:</span>
                    <input
                      defaultValue={it.title}
                      onBlur={(e) => e.target.value !== it.title && updateItem(it.id, { title: e.target.value })}
                      className="input flex-1 py-1 text-xs"
                    />
                  </div>
                  <input
                    defaultValue={it.objective}
                    onBlur={(e) => e.target.value !== it.objective && updateItem(it.id, { objective: e.target.value })}
                    className="input mt-1 w-full py-1 text-xs text-ink/60"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
