import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";

type Lesson = { id: string; title: string };
type Module = { id: string; title: string; lessons: Lesson[] };
type Course = { id: string; title: string; modules: Module[] };

export default function TrainerCourses() {
  const userName = useCurrentUserName();
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
            <CourseAnnouncementForm courseId={c.id} />
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
type CourseAnnouncement = { id: string; title: string; content: string; importance: string; createdAt: string };
function CourseAnnouncementForm({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [importance, setImportance] = useState<"normal" | "high">("normal");
  const [posted, setPosted] = useState<CourseAnnouncement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function loadExisting() {
    apiFetch<CourseAnnouncement[]>(`/courses/${courseId}/announcements`)
      .then(setPosted)
      .catch(() => undefined);
  }
  useEffect(loadExisting, [courseId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/courses/${courseId}/announcements`, {
        method: "POST",
        body: JSON.stringify({ title, content, importance }),
      });
      setTitle("");
      setContent("");
      setImportance("normal");
      loadExisting();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post the announcement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-navy hover:underline">
        {open ? "Hide announcements" : `Course announcements (${posted.length})`}
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          {posted.length > 0 && (
            <ul className="space-y-2">
              {posted.map((a) => (
                <li key={a.id} className="text-xs text-ink/60">
                  <span className="font-medium text-ink/80">{a.title}</span> — {a.content}
                  {a.importance === "high" && <span className="ml-1 text-navy-dark">(important)</span>}
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={submit} className="space-y-2">
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
              <label className="flex items-center gap-1.5 text-xs text-ink/60">
                <input type="checkbox" checked={importance === "high"} onChange={(e) => setImportance(e.target.checked ? "high" : "normal")} />
                Mark as important
              </label>
              <button type="submit" disabled={saving} className="btn-primary px-3 py-1 text-xs disabled:opacity-50">
                Post
              </button>
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
