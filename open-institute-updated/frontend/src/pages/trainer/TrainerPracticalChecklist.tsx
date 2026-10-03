import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";
import { AssessmentPicker } from "../../components/portal/TrainerPickers";

type Criterion = { name: string; description?: string; mandatory: boolean };
type ChecklistResult = {
  id: string;
  submissionId: string;
  criteriaCalls: { name: string; competent: boolean; comment?: string }[];
  overallOutcome: "competent" | "not_yet_competent";
};
type Checklist = { id: string; criteria: Criterion[]; results: ChecklistResult[] };
type Submission = { id: string; studentName: string; submittedAt: string };

// EX034 — Practical assessment. lib/practical-checklist.ts and the routes in
// exam-accommodations.ts have been real and unit-tested since batch 56; the
// only genuine gap left was that nobody had built a screen for a trainer to
// actually reach them. This page is that screen: build a CBET-style
// criterion checklist for an assessment, then score real submissions against
// it as competent / not-yet-competent per criterion.
export default function TrainerPracticalChecklist() {
  const userName = useCurrentUserName();
  const [assessmentId, setAssessmentId] = useState("");
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [criteria, setCriteria] = useState<Criterion[]>([{ name: "", description: "", mandatory: true }]);
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [calls, setCalls] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [scoringFor, setScoringFor] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!assessmentId) {
      setChecklist(null);
      return;
    }
    apiFetch<Checklist>(`/exams/assessments/${assessmentId}/practical-checklist`)
      .then((c) => {
        setChecklist(c);
        setCriteria(c.criteria);
      })
      .catch(() => setChecklist(null));
    apiFetch<Submission[]>(`/exams/assessments/${assessmentId}/submissions`)
      .then(setSubmissions)
      .catch(() => setSubmissions(null));
  }
  useEffect(load, [assessmentId]);

  function updateCriterion(i: number, patch: Partial<Criterion>) {
    setCriteria((c) => c.map((cr, idx) => (idx === i ? { ...cr, ...patch } : cr)));
  }

  async function saveChecklist(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    const clean = criteria.filter((c) => c.name.trim());
    if (clean.length === 0) return setError("Add at least one criterion.");
    try {
      await apiFetch(`/exams/assessments/${assessmentId}/practical-checklist`, {
        method: "POST",
        body: JSON.stringify({ criteria: clean }),
      });
      setMsg("Checklist saved.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the checklist.");
    }
  }

  async function scoreSubmission(submissionId: string) {
    if (!checklist) return;
    setError(null);
    setScoringFor(submissionId);
    try {
      const criteriaCalls = checklist.criteria.map((c) => ({
        name: c.name,
        competent: !!calls[`${submissionId}:${c.name}`],
        comment: comments[`${submissionId}:${c.name}`] || undefined,
      }));
      await apiFetch(`/exams/assessments/${assessmentId}/practical-checklist/score`, {
        method: "POST",
        body: JSON.stringify({ submissionId, criteriaCalls }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not score this submission.");
    } finally {
      setScoringFor(null);
    }
  }

  function resultFor(submissionId: string) {
    return checklist?.results.find((r) => r.submissionId === submissionId) ?? null;
  }

  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Practical checklist (CBET)</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Competency-based assessment: score each student competent / not-yet-competent per criterion instead of by
        marks. Any unmet mandatory criterion makes the overall outcome not-yet-competent — the same rule
        <code className="mx-1 rounded bg-line/40 px-1">lib/practical-checklist.ts</code>
        already enforces and unit-tests server-side.
      </p>

      <div className="mt-6 max-w-2xl">
        <AssessmentPicker required value={assessmentId} onChange={setAssessmentId} label="Practical assessment" />
      </div>

      {assessmentId && (
        <form onSubmit={saveChecklist} className="mt-6 max-w-2xl space-y-4">
          <PortalSection title={checklist ? "Edit checklist" : "Build checklist"}>
            <div className="space-y-3">
              {criteria.map((c, i) => (
                <div key={i} className="grid gap-2 border-b border-line pb-3 last:border-0 sm:grid-cols-[2fr_2fr_auto]">
                  <input
                    placeholder="Criterion name"
                    value={c.name}
                    onChange={(e) => updateCriterion(i, { name: e.target.value })}
                    className="input"
                  />
                  <input
                    placeholder="Description (optional)"
                    value={c.description ?? ""}
                    onChange={(e) => updateCriterion(i, { description: e.target.value })}
                    className="input"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-ink/60">
                    <input
                      type="checkbox"
                      checked={c.mandatory}
                      onChange={(e) => updateCriterion(i, { mandatory: e.target.checked })}
                    />
                    Mandatory
                  </label>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCriteria((c) => [...c, { name: "", description: "", mandatory: true }])}
              className="btn-secondary mt-3 px-3 py-1 text-xs"
            >
              + Add criterion
            </button>
          </PortalSection>
          {error && <p className="text-sm text-navy-dark">{error}</p>}
          {msg && <p className="text-sm text-ink/60">{msg}</p>}
          <button type="submit" className="btn-primary px-4 py-2 text-sm">
            {checklist ? "Save changes" : "Create checklist"}
          </button>
        </form>
      )}

      {checklist && (
        <div className="mt-8 max-w-3xl">
        <PortalSection title="Score submissions">
          {!submissions && <p className="text-sm text-ink/50">Loading submissions…</p>}
          {submissions && submissions.length === 0 && <p className="text-sm text-ink/50">No submissions yet.</p>}
          <div className="space-y-6">
            {submissions?.map((s) => {
              const result = resultFor(s.id);
              return (
                <div key={s.id} className="rounded-lg border border-line p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{s.studentName}</p>
                    {result && (
                      <Badge tone={result.overallOutcome === "competent" ? "ok" : "warn"}>
                        {result.overallOutcome === "competent" ? "Competent" : "Not yet competent"}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-3 space-y-2">
                    {checklist.criteria.map((c) => {
                      const key = `${s.id}:${c.name}`;
                      const priorCall = result?.criteriaCalls.find((cc) => cc.name === c.name);
                      const checked = key in calls ? calls[key] : priorCall?.competent ?? false;
                      return (
                        <div key={c.name} className="flex flex-wrap items-center gap-2">
                          <label className="flex items-center gap-2 text-xs text-ink/70">
                            <input type="checkbox" checked={checked} onChange={(e) => setCalls((m) => ({ ...m, [key]: e.target.checked }))} />
                            {c.name}{c.mandatory && <span className="text-navy-dark">*mandatory</span>}
                          </label>
                          <input className="input ml-auto max-w-sm py-1" aria-label={`Comment for ${c.name}`} placeholder="Evidence or assessor comment" value={comments[key] ?? priorCall?.comment ?? ""} onChange={(e) => setComments((m) => ({ ...m, [key]: e.target.value }))} />
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={scoringFor === s.id}
                    onClick={() => scoreSubmission(s.id)}
                    className="btn-primary mt-3 px-3 py-1 text-xs disabled:opacity-50"
                  >
                    {result ? "Update score" : "Score"}
                  </button>
                </div>
              );
            })}
          </div>
        </PortalSection>
        </div>
      )}
    </PortalShell>
  );
}
