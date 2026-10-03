import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { LoadingState } from "../../components/portal/StateViews";

const links = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/curriculum", label: "Curriculum" },
  { to: "/admin/learning-paths", label: "Learning Paths" },
];

type Unit = { id: string; code: string; title: string };
type Programme = { id: string; name: string; units: Unit[] };
type PathStep = { unitId: string; order: number; isOptional: boolean; unit: { code: string; title: string } };
type LearningPath = { id: string; title: string; description: string | null; isPublished: boolean; steps: PathStep[] };

// LMS021 — a real, ordered, programme-scoped sequence of units a
// coordinator recommends, distinct from LMS020's hard prerequisite gate.
export default function AdminLearningPaths() {
  const userName = useCurrentUserName();
  const [programmes, setProgrammes] = useState<Programme[] | null>(null);
  const [programmeId, setProgrammeId] = useState("");
  const [paths, setPaths] = useState<LearningPath[] | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stepUnitIds, setStepUnitIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<Programme[]>("/curriculum/programmes")
      .then((list) => { setProgrammes(list); if (list.length > 0) setProgrammeId(list[0].id); })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load programmes."));
  }, []);

  function loadPaths(pid: string) {
    if (!pid) return;
    apiFetch<LearningPath[]>(`/learning-paths/programme/${pid}`).then(setPaths).catch(() => setPaths(null));
  }
  useEffect(() => { loadPaths(programmeId); }, [programmeId]);

  const programme = programmes?.find((p) => p.id === programmeId);

  function toggleStep(unitId: string) {
    setStepUnitIds((ids) => (ids.includes(unitId) ? ids.filter((i) => i !== unitId) : [...ids, unitId]));
  }
  function move(unitId: string, dir: -1 | 1) {
    setStepUnitIds((ids) => {
      const i = ids.indexOf(unitId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ids.length) return ids;
      const next = [...ids];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function create() {
    if (!programmeId || !title.trim() || stepUnitIds.length === 0) {
      setError("Pick a programme, a title, and at least one unit.");
      return;
    }
    setBusy(true); setError(null); setNotice(null);
    try {
      await apiFetch("/learning-paths", {
        method: "POST",
        body: JSON.stringify({
          programmeId, title: title.trim(), description: description.trim() || undefined,
          steps: stepUnitIds.map((unitId) => ({ unitId })),
        }),
      });
      setTitle(""); setDescription(""); setStepUnitIds([]);
      setNotice("Path created (as a draft — publish it below to show students).");
      loadPaths(programmeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the path.");
    } finally { setBusy(false); }
  }

  async function togglePublish(id: string, isPublished: boolean) {
    try {
      await apiFetch(`/learning-paths/${id}/publish`, { method: "PATCH", body: JSON.stringify({ isPublished: !isPublished }) });
      loadPaths(programmeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that path.");
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch(`/learning-paths/${id}`, { method: "DELETE" });
      loadPaths(programmeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that path.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Learning paths</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Recommend an order through a programme's units. Unpublished paths are only visible here — publish to show them on students' roadmap.
      </p>

      <label className="mt-4 block max-w-md">
        <span className="text-sm font-medium text-ink/80">Programme</span>
        <select value={programmeId} onChange={(e) => setProgrammeId(e.target.value)} className="input mt-1.5">
          {programmes?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}
      {notice && <p className="mt-4 text-sm text-forest">{notice}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <PortalSection title="New path">
          <div className="space-y-3 text-sm">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Path title" className="input" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" rows={2} className="input" />
            <div>
              <p className="mb-1 text-xs text-ink/50">Steps, in order (click to add, use arrows to reorder):</p>
              <div className="max-h-40 space-y-1 overflow-y-auto border border-line p-2">
                {programme?.units.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={stepUnitIds.includes(u.id)} onChange={() => toggleStep(u.id)} />
                    {u.code} — {u.title}
                  </label>
                ))}
              </div>
              {stepUnitIds.length > 0 && (
                <ol className="mt-2 space-y-1 text-xs">
                  {stepUnitIds.map((id, i) => {
                    const u = programme?.units.find((x) => x.id === id);
                    return (
                      <li key={id} className="flex items-center justify-between">
                        <span>{i + 1}. {u?.code}</span>
                        <span className="flex gap-1">
                          <button type="button" onClick={() => move(id, -1)} className="text-ink/50 hover:text-navy">↑</button>
                          <button type="button" onClick={() => move(id, 1)} className="text-ink/50 hover:text-navy">↓</button>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
            <button onClick={create} disabled={busy} className="btn-primary w-full justify-center disabled:opacity-50">Create path</button>
          </div>
        </PortalSection>

        <PortalSection title="Existing paths">
          {!paths && <LoadingState />}
          {paths && paths.length === 0 && <p className="text-sm text-ink/50">No paths yet for this programme.</p>}
          <ul className="divide-y divide-line">
            {paths?.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{p.title}</p>
                    <p className="text-xs text-ink/50">{p.steps.length} step(s)</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={p.isPublished ? "ok" : "neutral"}>{p.isPublished ? "published" : "draft"}</Badge>
                    <button onClick={() => togglePublish(p.id, p.isPublished)} className="text-xs font-medium text-navy hover:underline">
                      {p.isPublished ? "Unpublish" : "Publish"}
                    </button>
                    <button onClick={() => remove(p.id)} className="text-xs font-medium text-navy-dark hover:underline">Delete</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
