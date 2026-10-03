import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { CoursePicker } from "../../components/portal/TrainerPickers";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";

export default function TrainerContent() {
  const userName = useCurrentUserName();
  const [courseId, setCourseId] = useState("");
  const [programmeId, setProgrammeId] = useState("");

  const [assignTitle, setAssignTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [totalMarks, setTotalMarks] = useState(100);
  const [assignSaved, setAssignSaved] = useState(false);

  const [error, setError] = useState<string | null>(null);

  async function createAssignment(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setAssignSaved(false);
    try {
      await apiFetch("/content/assignments", {
        method: "POST",
        body: JSON.stringify({
          courseId,
          title: assignTitle,
          instructions,
          dueAt: new Date(dueAt).toISOString(),
          totalMarks,
        }),
      });
      setAssignTitle("");
      setInstructions("");
      setAssignSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save assignment.");
    }
  }

  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Assignments &amp; course content</h1>

      <div className="mt-4 max-w-md">
        <CoursePicker
          value={courseId}
          onChange={(id, course) => {
            setCourseId(id);
            setProgrammeId(course?.unit.programmeId ?? "");
            setAssignSaved(false);
          }}
        />
      </div>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Lessons, media &amp; quizzes">
          <p className="text-sm text-ink/60">
            Build modules and lessons (text, images, video, audio, documents), reorder them by dragging, and manage
            quizzes in the dedicated builders. Live classes are scheduled from Live Teaching.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/trainer/lesson-builder" className="btn-primary">Lesson Builder</Link>
            <Link to="/trainer/quiz-builder" className="btn-secondary">Quiz Builder</Link>
            <Link to="/trainer/live" className="btn-secondary">Live Teaching</Link>
          </div>
        </PortalSection>

        <PortalSection title="New assignment">
          <form onSubmit={createAssignment} className="space-y-3">
            <input required value={assignTitle} onChange={(e) => setAssignTitle(e.target.value)} placeholder="Assignment title" className="input" />
            <textarea required rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Instructions" className="input" />
            <input required type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="input" />
            <input required type="number" min={1} value={totalMarks} onChange={(e) => setTotalMarks(Number(e.target.value))} placeholder="Total marks" className="input" />
            <button type="submit" disabled={!courseId} className="btn-secondary w-full justify-center">Save assignment</button>
            {!courseId && <p className="text-xs text-ink/45">Choose a course first.</p>}
            {assignSaved && <p className="text-xs text-forest">Saved.</p>}
          </form>
        </PortalSection>
      </div>

      {/* TP008/LMS038/LMS040 — outcomes mapping, review dates, and an LMS
          administration summary; LMS032 — study groups. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <LmsSummary />
        <OverdueReview />
      </div>
      <div className="mt-6">
        <StudyGroups courseId={courseId} />
      </div>
      <div className="mt-6">
        <CompetencyMapping programmeId={programmeId} />
      </div>
    </PortalShell>
  );
}

function LmsSummary() {
  type Summary = { totalLessons: number; byType: Record<string, number>; overdueForReview: number; lessonsWithoutOutcomesMapped: number };
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    apiFetch<Summary>("/content/lms-summary").then(setSummary).catch(() => undefined);
  }, []);

  return (
    <PortalSection title="LMS administration summary">
      {summary && (
        <ul className="space-y-1 text-sm">
          <li>Total lessons: {summary.totalLessons}</li>
          {Object.entries(summary.byType).map(([type, count]) => (
            <li key={type} className="text-ink/60">— {type}: {count}</li>
          ))}
          <li className="mt-2">Overdue for review: <Badge tone={summary.overdueForReview > 0 ? "warn" : "ok"}>{summary.overdueForReview}</Badge></li>
          <li>Missing outcomes mapping: <Badge tone={summary.lessonsWithoutOutcomesMapped > 0 ? "warn" : "ok"}>{summary.lessonsWithoutOutcomesMapped}</Badge></li>
        </ul>
      )}
    </PortalSection>
  );
}

function OverdueReview() {
  type Item = { id: string; title: string; courseTitle: string; reviewDueDate: string };
  const [items, setItems] = useState<Item[] | null>(null);

  function load() {
    apiFetch<Item[]>("/content/lessons/overdue-review").then(setItems).catch(() => setItems([]));
  }
  useEffect(load, []);

  async function markReviewed(id: string) {
    await apiFetch(`/content/lessons/${id}/mark-reviewed`, { method: "PATCH" }).catch(() => undefined);
    load();
  }

  return (
    <PortalSection title="Content overdue for review">
      {items && items.length === 0 && <p className="text-sm text-ink/50">Nothing overdue.</p>}
      <ul className="divide-y divide-line">
        {items?.map((i) => (
          <li key={i.id} className="flex items-center justify-between py-2 text-sm">
            <span>{i.title} — {i.courseTitle}</span>
            <Link to="/trainer/lesson-builder" className="text-xs text-navy underline decoration-dotted">Open builder</Link>
            <button onClick={() => markReviewed(i.id)} className="text-xs text-navy underline decoration-dotted">Mark reviewed</button>
          </li>
        ))}
      </ul>
    </PortalSection>
  );
}

function StudyGroups({ courseId }: { courseId: string }) {
  const [groups, setGroups] = useState<{ id: string; name: string; memberCount: number }[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!courseId) return setGroups([]);
    try {
      setGroups(await apiFetch(`/content/study-groups/course/${courseId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load groups.");
    }
  }
  useEffect(() => {
    setError(null);
    void load();
  }, [courseId]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !courseId) return;
    try {
      await apiFetch("/content/study-groups", { method: "POST", body: JSON.stringify({ courseId, name }) });
      setName("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create group.");
    }
  }

  return (
    <PortalSection title="Peer study groups (LMS032)">
      <p className="text-xs text-ink/50">Real student-formed collaborative study groups — distinct from peer assessment.</p>
      {!courseId && <p className="mt-3 text-sm text-ink/45">Choose a course above.</p>}
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {courseId && (
        <>
          <ul className="mt-3 divide-y divide-line">
            {groups.map((g) => (
              <li key={g.id} className="py-2 text-sm">{g.name} — {g.memberCount} member(s)</li>
            ))}
            {groups.length === 0 && <li className="py-2 text-sm text-ink/45">No study groups yet.</li>}
          </ul>
          <form onSubmit={create} className="mt-3 flex gap-2 border-t border-line pt-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New group name" className="input flex-1" />
            <button type="submit" className="btn-primary shrink-0">Create</button>
          </form>
        </>
      )}
    </PortalSection>
  );
}

// TP009 — Competency mapping: a real unit × competency grid, replacing the
// student-only read view that used to be the only place competencies
// showed up anywhere in the UI. Ticking a cell calls PUT
// /competency/:id/map-units with that competency's full current unit list.
function CompetencyMapping({ programmeId }: { programmeId: string }) {
  type MatrixUnit = { id: string; code: string; title: string };
  type MatrixCompetency = { id: string; name: string };
  type Matrix = { units: MatrixUnit[]; competencies: MatrixCompetency[]; mapped: string[] };

  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    setMatrix(null);
    void load();
  }, [programmeId]);

  async function load() {
    if (!programmeId) return;
    setError(null);
    try {
      setMatrix(await apiFetch<Matrix>(`/competency/programme/${programmeId}/matrix`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the mapping.");
    }
  }

  async function toggle(unitId: string, competency: MatrixCompetency) {
    if (!matrix) return;
    const key = `${unitId}:${competency.id}`;
    const currentlyMapped = matrix.mapped.includes(key);
    const newSet = new Set(matrix.units.filter((u) => matrix.mapped.includes(`${u.id}:${competency.id}`)).map((u) => u.id));
    if (currentlyMapped) newSet.delete(unitId);
    else newSet.add(unitId);

    setSavingKey(key);
    // Optimistic update
    setMatrix({
      ...matrix,
      mapped: currentlyMapped ? matrix.mapped.filter((m) => m !== key) : [...matrix.mapped, key],
    });
    try {
      await apiFetch(`/competency/${competency.id}/map-units`, {
        method: "PUT",
        body: JSON.stringify({ unitIds: Array.from(newSet) }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that mapping — reload and try again.");
      load();
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <PortalSection title="Competency mapping">
      <p className="text-xs text-ink/50">Tick which units build towards each programme competency.</p>
      {!programmeId && <p className="mt-3 text-sm text-ink/45">Choose a course above — its programme's competencies load here.</p>}
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}

      {matrix && matrix.competencies.length === 0 && (
        <p className="mt-3 text-sm text-ink/45">No competencies defined for this programme yet — ask your programme coordinator to add some.</p>
      )}

      {matrix && matrix.competencies.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-line py-2 pr-3 text-left font-medium">Unit</th>
                {matrix.competencies.map((c) => (
                  <th key={c.id} className="border-b border-line px-2 py-2 text-center font-medium">{c.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.units.map((u) => (
                <tr key={u.id}>
                  <td className="border-b border-line py-2 pr-3">{u.code} — {u.title}</td>
                  {matrix.competencies.map((c) => {
                    const key = `${u.id}:${c.id}`;
                    return (
                      <td key={c.id} className="border-b border-line px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={matrix.mapped.includes(key)}
                          disabled={savingKey === key}
                          onChange={() => toggle(u.id, c)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalSection>
  );
}
