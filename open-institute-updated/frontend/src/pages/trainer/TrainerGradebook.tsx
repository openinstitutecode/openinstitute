import { Fragment, FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";
import { AssessmentPicker, useCourseOptions, RosterStudent } from "../../components/portal/TrainerPickers";

type Submission = {
  id: string;
  studentName: string;
  submittedAt: string;
  score: number | null;
  integrityFlag: boolean;
  aiAssisted: boolean;
};

type RubricCriterion = { name: string; description?: string; maxMarks: number };
type Rubric = { id: string; criteria: RubricCriterion[] };

export default function TrainerGradebook() {
  const userName = useCurrentUserName();
  const [assessmentId, setAssessmentId] = useState("");
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});
  const [suggestionSessions, setSuggestionSessions] = useState<Record<string, string>>({});
  const [suggesting, setSuggesting] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [applyMsg, setApplyMsg] = useState<Record<string, string>>({});
  const [approvalMsg, setApprovalMsg] = useState<string | null>(null);

  // EX021 — rubric marking: when the assessment has a real rubric, a
  // trainer can grade against its actual criteria instead of typing one
  // raw total, and the breakdown itself is what gets stored.
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [rubricOpenFor, setRubricOpenFor] = useState<string | null>(null);
  const [criteriaScores, setCriteriaScores] = useState<Record<string, Record<string, number>>>({});
  const [rubricFeedback, setRubricFeedback] = useState<Record<string, string>>({});
  const [rubricMsg, setRubricMsg] = useState<Record<string, string>>({});
  const [rubricSaving, setRubricSaving] = useState<string | null>(null);

  function loadRubric() {
    if (!assessmentId) return setRubric(null);
    apiFetch<Rubric>(`/rubrics/${assessmentId}`)
      .then(setRubric)
      .catch(() => setRubric(null));
  }
  useEffect(loadRubric, [assessmentId]);

  function rubricTotal(submissionId: string): number {
    const scores = criteriaScores[submissionId] ?? {};
    return Object.values(scores).reduce((sum: number, v: number) => sum + (Number.isFinite(v) ? v : 0), 0);
  }

  async function saveRubricGrade(submissionId: string) {
    if (!rubric) return;
    setRubricSaving(submissionId);
    setRubricMsg((m) => ({ ...m, [submissionId]: "" }));
    try {
      const scores = criteriaScores[submissionId] ?? {};
      await apiFetch(`/exams/submissions/${submissionId}/grade-rubric`, {
        method: "PATCH",
        body: JSON.stringify({
          criteriaScores: rubric.criteria.map((c) => ({ name: c.name, score: scores[c.name] ?? 0 })),
          feedback: rubricFeedback[submissionId] || undefined,
        }),
      });
      setRubricMsg((m) => ({ ...m, [submissionId]: "Saved." }));
      load();
    } catch (err) {
      setRubricMsg((m) => ({ ...m, [submissionId]: err instanceof Error ? err.message : "Could not save." }));
    } finally {
      setRubricSaving(null);
    }
  }

  async function getSuggestion(submissionId: string) {
    setSuggesting(submissionId);
    setApplyMsg((m) => ({ ...m, [submissionId]: "" }));
    try {
      const res = await apiFetch<{ suggestion: string; sessionId: string }>("/ai/marking-assistant", {
        method: "POST",
        body: JSON.stringify({ submissionId }),
      });
      setSuggestions((s) => ({ ...s, [submissionId]: res.suggestion }));
      setSuggestionSessions((s) => ({ ...s, [submissionId]: res.sessionId }));
    } catch (err) {
      setSuggestions((s) => ({ ...s, [submissionId]: err instanceof Error ? err.message : "Could not get a suggestion." }));
    } finally {
      setSuggesting(null);
    }
  }

  // TP018 — the "apply" half of the AI feedback generator: the trainer's
  // (possibly edited) text is what actually lands in Submission.feedback;
  // "accept: false" still records that the draft was reviewed and
  // deliberately not used, rather than just vanishing.
  async function applyFeedback(submissionId: string, accept: boolean) {
    const sessionId = suggestionSessions[submissionId];
    if (!sessionId) return;
    setApplying(submissionId);
    try {
      await apiFetch(`/ai/feedback-sessions/${sessionId}/apply`, {
        method: "PATCH",
        body: JSON.stringify({ finalFeedback: suggestions[submissionId] ?? "", accept }),
      });
      setApplyMsg((m) => ({ ...m, [submissionId]: accept ? "Applied to this submission's feedback." : "Discarded — not applied." }));
      if (accept) load();
    } catch (err) {
      setApplyMsg((m) => ({ ...m, [submissionId]: err instanceof Error ? err.message : "Could not apply." }));
    } finally {
      setApplying(null);
    }
  }

  async function submitForApproval() {
    setApprovalMsg(null);
    try {
      await apiFetch(`/exams/assessments/${assessmentId}/submit-for-approval`, { method: "PATCH" });
      setApprovalMsg("Submitted for examination-office approval.");
    } catch (err) {
      setApprovalMsg(err instanceof Error ? err.message : "Could not submit — check every submission is graded.");
    }
  }

  function load() {
    if (!assessmentId) return;
    apiFetch<Submission[]>(`/exams/assessments/${assessmentId}/submissions`)
      .then(setSubmissions)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load submissions."));
  }
  useEffect(load, [assessmentId]);

  async function saveGrades(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await Promise.all(
        Object.entries(scores).map(([id, score]) =>
          apiFetch(`/exams/submissions/${id}/grade`, {
            method: "PATCH",
            body: JSON.stringify({ score }),
          })
        )
      );
      setSaved(true);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save grades.");
    }
  }

  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Gradebook</h1>

      <div className="mt-4 max-w-md">
        <AssessmentPicker value={assessmentId} onChange={setAssessmentId} />
      </div>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {assessmentId && (
        <form onSubmit={saveGrades} className="mt-8">
          <PortalSection title="Submissions">
            {submissions && submissions.length === 0 && <p className="text-sm text-ink/50">No submissions yet.</p>}
            {submissions && submissions.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-ink/50">
                      <th className="pb-3 pr-4 font-medium">Student</th>
                      <th className="pb-3 pr-4 font-medium">Submitted</th>
                      <th className="pb-3 pr-4 font-medium">Flags</th>
                      <th className="pb-3 pr-4 font-medium">Score</th>
                      <th className="pb-3 pr-4 font-medium">Status</th>
                      <th className="pb-3 font-medium">AI draft</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {submissions.map((s) => (
                      <Fragment key={s.id}>
                        <tr>
                          <td className="py-3 pr-4">{s.studentName}</td>
                          <td className="py-3 pr-4 text-ink/60">{new Date(s.submittedAt).toLocaleDateString()}</td>
                          <td className="py-3 pr-4">
                            {s.integrityFlag ? <Badge tone="warn">Flagged for review</Badge> : <span className="text-ink/30">—</span>}
                            {s.aiAssisted && <Badge tone="neutral">AI-assisted (disclosed)</Badge>}
                          </td>
                          <td className="py-3 pr-4">
                            {rubric ? (
                              <button
                                type="button"
                                onClick={() => setRubricOpenFor(rubricOpenFor === s.id ? null : s.id)}
                                className="text-xs text-navy underline decoration-dotted"
                              >
                                {s.score !== null ? `${s.score} — grade by rubric` : "Grade by rubric"}
                              </button>
                            ) : (
                              <input
                                type="number"
                                min={0}
                                max={100}
                                defaultValue={s.score ?? ""}
                                onChange={(e) => setScores((sc) => ({ ...sc, [s.id]: Number(e.target.value) }))}
                                className="input w-24"
                                placeholder="—"
                              />
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            {s.score !== null ? <Badge tone="ok">Graded</Badge> : <Badge tone="neutral">Ungraded</Badge>}
                          </td>
                          <td className="py-3 max-w-xs">
                            <button
                              type="button"
                              onClick={() => getSuggestion(s.id)}
                              className="text-xs text-navy underline decoration-dotted"
                              disabled={suggesting === s.id}
                            >
                              {suggesting === s.id ? "Thinking…" : "AI suggest"}
                            </button>
                            {suggestions[s.id] && (
                              <div className="mt-1">
                                <textarea
                                  value={suggestions[s.id]}
                                  onChange={(e) => setSuggestions((sg) => ({ ...sg, [s.id]: e.target.value }))}
                                  className="input w-full text-xs"
                                  rows={4}
                                />
                                {suggestionSessions[s.id] && (
                                  <div className="mt-1 flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => applyFeedback(s.id, true)}
                                      disabled={applying === s.id}
                                      className="text-xs font-medium text-forest hover:underline"
                                    >
                                      {applying === s.id ? "Applying…" : "Apply as feedback"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => applyFeedback(s.id, false)}
                                      disabled={applying === s.id}
                                      className="text-xs text-ink/50 hover:underline"
                                    >
                                      Discard
                                    </button>
                                  </div>
                                )}
                                {applyMsg[s.id] && <p className="mt-1 text-xs text-ink/50">{applyMsg[s.id]}</p>}
                              </div>
                            )}
                          </td>
                        </tr>
                        {rubric && rubricOpenFor === s.id && (
                          <tr>
                            <td colSpan={6} className="bg-sand/40 px-4 py-4">
                              <p className="text-xs font-medium text-ink/70">Rubric criteria</p>
                              <div className="mt-2 flex flex-col gap-2">
                                {rubric.criteria.map((c) => (
                                  <div key={c.name} className="flex items-center gap-3 text-sm">
                                    <span className="w-48 shrink-0">{c.name} <span className="text-ink/40">/ {c.maxMarks}</span></span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={c.maxMarks}
                                      value={criteriaScores[s.id]?.[c.name] ?? ""}
                                      onChange={(e) =>
                                        setCriteriaScores((cs) => ({
                                          ...cs,
                                          [s.id]: { ...cs[s.id], [c.name]: Number(e.target.value) },
                                        }))
                                      }
                                      className="input w-20"
                                    />
                                  </div>
                                ))}
                              </div>
                              <p className="mt-2 text-xs text-ink/60">Total: {rubricTotal(s.id)}</p>
                              <input
                                value={rubricFeedback[s.id] ?? ""}
                                onChange={(e) => setRubricFeedback((f) => ({ ...f, [s.id]: e.target.value }))}
                                placeholder="Feedback (optional)"
                                className="input mt-2 w-full max-w-md"
                              />
                              <div className="mt-3 flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => saveRubricGrade(s.id)}
                                  disabled={rubricSaving === s.id}
                                  className="btn-primary"
                                >
                                  {rubricSaving === s.id ? "Saving…" : "Save rubric grade"}
                                </button>
                                {rubricMsg[s.id] && <p className="text-xs text-ink/60">{rubricMsg[s.id]}</p>}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="submit" className="btn-primary">Save grades</button>
              <button type="button" onClick={submitForApproval} className="btn-secondary">Submit for approval</button>
              {saved && <p className="text-xs text-forest">Saved.</p>}
              {approvalMsg && <p className="text-xs text-ink/60">{approvalMsg}</p>}
            </div>
          </PortalSection>
        </form>
      )}

      {assessmentId && (
        <div className="mt-6">
          <OralAssessment assessmentId={assessmentId} />
        </div>
      )}
    </PortalShell>
  );
}

// EX035 — oral assessment / viva: a real human-conducted, human-scored
// session recorded for the record.
function OralAssessment({ assessmentId }: { assessmentId: string }) {
  const [studentUserId, setStudentUserId] = useState("");
  const [score, setScore] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [sessions, setSessions] = useState<{ id: string; studentUserId: string; score: number | null; notes: string | null; recordedAt: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Pick the student from this assessment's course roster instead of pasting a user id.
  const { courses } = useCourseOptions();
  const courseId = courses?.find((c) => c.assessments.some((a) => a.id === assessmentId))?.id ?? "";
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  useEffect(() => {
    if (!courseId) return setRoster([]);
    apiFetch<RosterStudent[]>(`/trainer-self/roster/${courseId}`).then(setRoster).catch(() => setRoster([]));
  }, [courseId]);
  const nameOf = (userId: string) => roster.find((r) => r.userId === userId)?.fullName ?? userId;

  function load() {
    apiFetch<typeof sessions>(`/exams/oral-sessions/${assessmentId}`).then(setSessions).catch(() => undefined);
  }
  useEffect(load, [assessmentId]);

  async function record(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/exams/oral-sessions", {
        method: "POST",
        body: JSON.stringify({ assessmentId, studentUserId, score: score === "" ? undefined : score, notes: notes || undefined }),
      });
      setStudentUserId(""); setScore(""); setNotes("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record session.");
    }
  }

  return (
    <PortalSection title="Oral assessment / viva">
      <ul className="divide-y divide-line">
        {sessions.map((s) => (
          <li key={s.id} className="py-2 text-sm">
            {nameOf(s.studentUserId)} — {s.score ?? "no score"} · {new Date(s.recordedAt).toLocaleDateString()}
            {s.notes && <p className="text-xs text-ink/50">{s.notes}</p>}
          </li>
        ))}
      </ul>
      <form onSubmit={record} className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
        <select required value={studentUserId} onChange={(e) => setStudentUserId(e.target.value)} className="input w-56">
          <option value="">Select a student…</option>
          {roster.map((r) => <option key={r.userId} value={r.userId}>{r.fullName}</option>)}
        </select>
        <input type="number" value={score} onChange={(e) => setScore(e.target.value ? Number(e.target.value) : "")} placeholder="Score" className="input w-24" />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="input flex-1" />
        <button type="submit" className="btn-primary">Record</button>
      </form>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
    </PortalSection>
  );
}
