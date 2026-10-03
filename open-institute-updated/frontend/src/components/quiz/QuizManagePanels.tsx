import { FormEvent, useEffect, useState } from "react";
import { PortalSection, Badge } from "../portal/Primitives";
import { LoadingState } from "../portal/StateViews";
import { apiFetch, apiFetchBlob, openOrDownloadBlob } from "../../lib/api";
import { typeLabelOf } from "./quizTypes";

// Batch 76 — trainer management panels for a quiz (QZ066-QZ080):
// marking queue, attempts & official grades, extensions, student error
// reports, results release, and the question-bank import/export tool.

const err = (e: unknown, f: string) => (e instanceof Error ? e.message : f);
const CloseBtn = ({ onClose }: { onClose: () => void }) => <button type="button" onClick={onClose} className="text-xs text-navy underline decoration-dotted">Close</button>;

// ------------------------------------------------------------------ marking
type QueueItem = { questionId: string; type: string; stem: string | null; prompt: string; maxMarks: number; answer: string; modelAnswer: string | null; rubricHint: string | null };
type QueueAttempt = { submissionId: string; studentName: string; studentNumber: string | null; submittedAt: string; items: QueueItem[] };

export function MarkingPanel({ quizId, onChanged, onClose }: { quizId: string; onChanged: () => void; onClose: () => void }) {
  const [data, setData] = useState<{ pendingAttempts: number; attempts: QueueAttempt[] } | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [fb, setFb] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => apiFetch<{ pendingAttempts: number; attempts: QueueAttempt[] }>(`/quizzes/${quizId}/marking-queue`).then(setData).catch((e) => setError(err(e, "Could not load the marking queue.")));
  useEffect(() => { void load(); }, [quizId]);

  async function save(a: QueueAttempt) {
    setError(null); setMsg(null);
    const payload = a.items.map((it) => ({ it, v: marks[`${a.submissionId}:${it.questionId}`] }));
    if (payload.some((p) => p.v === undefined || p.v === "" || !Number.isFinite(Number(p.v)))) return setError("Enter marks for every written answer of this student.");
    if (payload.some((p) => Number(p.v) < 0 || Number(p.v) > p.it.maxMarks)) return setError("Marks must be between 0 and the question's maximum.");
    setBusy(true);
    try {
      const r = await apiFetch<{ score: number | null }>(`/quizzes/${quizId}/submissions/${a.submissionId}/marks`, {
        method: "PUT",
        body: JSON.stringify({ marks: payload.map((p) => ({ questionId: p.it.questionId, marks: Number(p.v), feedback: fb[`${a.submissionId}:${p.it.questionId}`] || undefined })) }),
      });
      setMsg(`Saved — ${a.studentName} scored ${r.score ?? "—"}.`);
      await load(); onChanged();
    } catch (e) { setError(err(e, "Could not save the marks.")); } finally { setBusy(false); }
  }

  return (
    <PortalSection title={`Marking queue${data ? ` (${data.pendingAttempts} attempt${data.pendingAttempts === 1 ? "" : "s"})` : ""}`} action={<CloseBtn onClose={onClose} />}>
      {!data && !error && <LoadingState />}
      {error && <p className="text-sm text-navy-dark" role="alert">{error}</p>}
      {msg && <p className="text-sm text-forest">{msg}</p>}
      {data && data.attempts.length === 0 && <p className="text-sm text-ink/45">Nothing waiting to be marked.</p>}
      <div className="space-y-5">
        {data?.attempts.map((a) => (
          <div key={a.submissionId} className="border border-line bg-paper/60 p-3">
            <p className="text-sm font-medium">{a.studentName}{a.studentNumber ? <span className="text-xs text-ink/50"> · {a.studentNumber}</span> : null}</p>
            {a.items.map((it) => {
              const key = `${a.submissionId}:${it.questionId}`;
              return (
                <div key={it.questionId} className="mt-3 border-t border-line pt-3 text-sm">
                  {it.stem && <p className="mb-1 whitespace-pre-wrap text-xs text-ink/60">{it.stem}</p>}
                  <p className="font-medium">{it.prompt} <span className="text-xs font-normal text-ink/45">({typeLabelOf(it.type, [])}, {it.maxMarks} marks)</span></p>
                  <p className="mt-1 whitespace-pre-wrap border-l-4 border-navy/30 bg-white px-3 py-2">{it.answer}</p>
                  {it.modelAnswer && <p className="mt-1 text-xs text-forest">Model answer: {it.modelAnswer}</p>}
                  {it.rubricHint && <p className="mt-1 text-xs text-ink/55">Guidance: {it.rubricHint}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="number" min={0} max={it.maxMarks} step="0.5" value={marks[key] ?? ""} onChange={(e) => setMarks((m) => ({ ...m, [key]: e.target.value }))} className="input w-24 py-1" aria-label={`Marks out of ${it.maxMarks}`} placeholder={`/ ${it.maxMarks}`} />
                    <input value={fb[key] ?? ""} onChange={(e) => setFb((m) => ({ ...m, [key]: e.target.value }))} className="input min-w-[12rem] flex-1 py-1" placeholder="Comment for the student (optional)" />
                  </div>
                </div>
              );
            })}
            <button type="button" disabled={busy} onClick={() => void save(a)} className="btn-primary mt-3 px-4 py-1.5">Save marks</button>
          </div>
        ))}
      </div>
    </PortalSection>
  );
}

// ----------------------------------------------------------------- attempts
type AttemptRow = { studentUserId: string; studentName: string; studentNumber: string | null; intake: string | null; attempts: number; scores: (number | null)[]; officialGrade: number | null; pendingMarking: number; lastSubmittedAt: string };

export function AttemptsPanel({ quizId, onClose }: { quizId: string; onClose: () => void }) {
  const [data, setData] = useState<{ gradingMethod: string; totalMarks: number; students: AttemptRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { apiFetch<{ gradingMethod: string; totalMarks: number; students: AttemptRow[] }>(`/quizzes/${quizId}/attempts`).then(setData).catch((e) => setError(err(e, "Could not load attempts."))); }, [quizId]);
  return (
    <PortalSection title="Attempts & official grades" action={<CloseBtn onClose={onClose} />}>
      {!data && !error && <LoadingState />}
      {error && <p className="text-sm text-navy-dark">{error}</p>}
      {data && (
        <>
          <p className="mb-3 text-xs text-ink/55">Official grade = {data.gradingMethod.toLowerCase()} of each student's marked attempts, out of {data.totalMarks}.</p>
          {data.students.length === 0 ? <p className="text-sm text-ink/45">No attempts yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-line text-ink/50"><th className="pb-2 pr-3 font-medium">Student</th><th className="pb-2 pr-3 font-medium">Attempts</th><th className="pb-2 pr-3 font-medium">Scores</th><th className="pb-2 font-medium">Official</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {data.students.map((s) => (
                    <tr key={s.studentUserId}>
                      <td className="py-2 pr-3">{s.studentName}<span className="block text-xs text-ink/45">{s.studentNumber ?? ""}{s.intake ? ` · ${s.intake}` : ""}</span></td>
                      <td className="py-2 pr-3">{s.attempts}</td>
                      <td className="py-2 pr-3 text-xs">{s.scores.map((x) => (x === null ? "to mark" : x)).join(", ")}</td>
                      <td className="py-2">{s.officialGrade === null ? <Badge tone="warn">awaiting marking</Badge> : <strong>{s.officialGrade}</strong>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </PortalSection>
  );
}

// --------------------------------------------------------------- extensions
type Ext = { id: string; studentUserId: string; studentName: string; studentNumber: string | null; extraAttempts: number; extendedCloseAt: string | null; reason: string };

export function ExtensionsPanel({ quizId, onClose }: { quizId: string; onClose: () => void }) {
  const [list, setList] = useState<Ext[] | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [student, setStudent] = useState("");
  const [extra, setExtra] = useState("1");
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => apiFetch<Ext[]>(`/quizzes/${quizId}/extensions`).then(setList).catch((e) => setError(err(e, "Could not load extensions.")));
  useEffect(() => {
    void load();
    apiFetch<{ students: AttemptRow[] }>(`/quizzes/${quizId}/attempts`).then((d) => setAttempts(d.students)).catch(() => undefined);
  }, [quizId]);

  async function grant(e: FormEvent) {
    e.preventDefault(); setError(null); setMsg(null);
    if (!student.trim()) return setError("Choose a student (or paste their user id).");
    try {
      await apiFetch(`/quizzes/${quizId}/extensions/${encodeURIComponent(student.trim())}`, { method: "PUT", body: JSON.stringify({ extraAttempts: Number(extra) || 0, extendedCloseAt: until ? new Date(until).toISOString() : null, reason: reason.trim() }) });
      setMsg("Extension granted — the student was notified."); setReason(""); await load();
    } catch (x) { setError(err(x, "Could not grant the extension.")); }
  }
  async function revoke(id: string) {
    setError(null);
    try { await apiFetch(`/quizzes/${quizId}/extensions/${encodeURIComponent(id)}`, { method: "DELETE" }); await load(); } catch (x) { setError(err(x, "Could not revoke.")); }
  }
  return (
    <PortalSection title="Extensions & extra attempts" action={<CloseBtn onClose={onClose} />}>
      <form onSubmit={grant} className="grid gap-2 sm:grid-cols-[1fr_90px_1fr]">
        <select className="input" value={student} onChange={(e) => setStudent(e.target.value)} aria-label="Student">
          <option value="">Student who has attempted…</option>
          {attempts.map((a) => <option key={a.studentUserId} value={a.studentUserId}>{a.studentName}{a.studentNumber ? ` (${a.studentNumber})` : ""}</option>)}
        </select>
        <input type="number" min={0} max={10} className="input" value={extra} onChange={(e) => setExtra(e.target.value)} aria-label="Extra attempts" title="Extra attempts" />
        <input type="datetime-local" className="input" value={until} onChange={(e) => setUntil(e.target.value)} aria-label="Open until" title="Keep open for this student until" />
        <input className="input sm:col-span-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (recorded in the audit trail)" required minLength={3} />
        <button type="submit" className="btn-primary px-4 py-2">Grant</button>
      </form>
      {error && <p className="mt-2 text-sm text-navy-dark" role="alert">{error}</p>}
      {msg && <p className="mt-2 text-sm text-forest">{msg}</p>}
      {!list && !error && <LoadingState />}
      {list && list.length === 0 && <p className="mt-3 text-sm text-ink/45">No extensions granted.</p>}
      <ul className="mt-3 divide-y divide-line text-sm">
        {list?.map((x) => (
          <li key={x.id} className="flex items-start justify-between gap-3 py-2">
            <span>{x.studentName}{x.studentNumber ? ` (${x.studentNumber})` : ""} — {x.extraAttempts > 0 ? `+${x.extraAttempts} attempt(s)` : ""}{x.extendedCloseAt ? ` open until ${new Date(x.extendedCloseAt).toLocaleString()}` : ""}<span className="block text-xs text-ink/50">{x.reason}</span></span>
            <button type="button" onClick={() => void revoke(x.studentUserId)} className="shrink-0 text-xs text-navy-dark underline decoration-dotted">Revoke</button>
          </li>
        ))}
      </ul>
    </PortalSection>
  );
}

// ------------------------------------------------------------------ reports
type Report = { id: string; questionId: string; prompt: string; category: string; message: string; status: string; resolution: string | null; createdAt: string };

export function ReportsPanel({ quizId, onClose }: { quizId: string; onClose: () => void }) {
  const [list, setList] = useState<Report[] | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const load = () => apiFetch<Report[]>(`/quizzes/${quizId}/reports`).then(setList).catch((e) => setError(err(e, "Could not load reports.")));
  useEffect(() => { void load(); }, [quizId]);
  async function decide(id: string, status: "resolved" | "dismissed") {
    setError(null);
    try { await apiFetch(`/quizzes/reports/${id}`, { method: "PATCH", body: JSON.stringify({ status, resolution: note[id] || undefined }) }); await load(); } catch (e) { setError(err(e, "Could not update the report.")); }
  }
  return (
    <PortalSection title="Student error reports" action={<CloseBtn onClose={onClose} />}>
      {!list && !error && <LoadingState />}
      {error && <p className="text-sm text-navy-dark">{error}</p>}
      {list && list.length === 0 && <p className="text-sm text-ink/45">No reports.</p>}
      <ul className="space-y-3">
        {list?.map((r) => (
          <li key={r.id} className="border border-line bg-paper/60 p-3 text-sm">
            <p className="font-medium">{r.prompt}</p>
            <p className="mt-1"><Badge tone={r.status === "open" ? "warn" : "ok"}>{r.status}</Badge> <span className="text-xs text-ink/50">{r.category}</span></p>
            <p className="mt-1">{r.message}</p>
            {r.resolution && <p className="mt-1 text-xs text-forest">Response: {r.resolution}</p>}
            {r.status === "open" && (
              <div className="mt-2 flex flex-wrap gap-2">
                <input className="input min-w-[12rem] flex-1 py-1" placeholder="Reply to the student (optional)" value={note[r.id] ?? ""} onChange={(e) => setNote((n) => ({ ...n, [r.id]: e.target.value }))} />
                <button type="button" className="btn-primary px-3 py-1" onClick={() => void decide(r.id, "resolved")}>Resolve</button>
                <button type="button" className="btn-secondary px-3 py-1" onClick={() => void decide(r.id, "dismissed")}>Dismiss</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </PortalSection>
  );
}

// --------------------------------------------------------- results release
export function ReleasePanel({ quizId, published, markingMode, onChanged, onClose }: { quizId: string; published: boolean; markingMode: string; onChanged: () => void; onClose: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needForce, setNeedForce] = useState(false);
  const [busy, setBusy] = useState(false);
  async function publish(force: boolean) {
    setBusy(true); setError(null); setMsg(null);
    try {
      const r = await apiFetch<{ notified: number }>(`/quizzes/${quizId}/results/publish`, { method: "POST", body: JSON.stringify({ force }) });
      setMsg(`Results released. ${r.notified} student(s) notified.`); setNeedForce(false); onChanged();
    } catch (e) {
      const m = err(e, "Could not release results.");
      setError(m); setNeedForce(/still need marking/i.test(m));
    } finally { setBusy(false); }
  }
  async function hide() {
    setBusy(true); setError(null); setMsg(null);
    try { await apiFetch(`/quizzes/${quizId}/results/unpublish`, { method: "POST" }); setMsg("Results hidden again."); onChanged(); } catch (e) { setError(err(e, "Could not hide results.")); } finally { setBusy(false); }
  }
  return (
    <PortalSection title="Release results" action={<CloseBtn onClose={onClose} />}>
      <p className="text-sm text-ink/70">Results are currently <strong>{published ? "released" : "not released"}</strong>.{markingMode === "DEFERRED" ? " This quiz uses deferred marking: students see nothing until you release." : ""}</p>
      {error && <p className="mt-2 text-sm text-navy-dark" role="alert">{error}</p>}
      {msg && <p className="mt-2 text-sm text-forest">{msg}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {!published && <button type="button" disabled={busy} onClick={() => void publish(false)} className="btn-primary px-4 py-2">Release results &amp; notify students</button>}
        {needForce && <button type="button" disabled={busy} onClick={() => void publish(true)} className="btn-secondary px-4 py-2">Release anyway</button>}
        {published && <button type="button" disabled={busy} onClick={() => void hide()} className="btn-secondary px-4 py-2">Hide results again</button>}
      </div>
    </PortalSection>
  );
}

// ------------------------------------------------------- bank import/export
export function BankToolsPanel({ courseId, onImported, onClose }: { courseId: string; onImported: () => void; onClose: () => void }) {
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<{ dryRun: boolean; valid?: number; imported?: number; errors: { row: number; message: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    setBusy(true); setError(null);
    try {
      const r = await apiFetch<NonNullable<typeof result>>(`/quizzes/bank/${courseId}/import`, { method: "POST", body: JSON.stringify({ csv, dryRun }) });
      setResult(r);
      if (!dryRun && (r.imported ?? 0) > 0) onImported();
    } catch (e) { setError(err(e, "Import failed.")); } finally { setBusy(false); }
  }
  async function exportCsv() {
    setError(null);
    try { const { blob, filename } = await apiFetch_blob(courseId); openOrDownloadBlob(blob, filename ?? "question-bank.csv"); } catch (e) { setError(err(e, "Export failed.")); }
  }
  const template = "type,prompt,marks,difficulty,topic,options,correct,explanation,tags\nmcq,Capital of Kenya?,2,easy,geography,Nairobi|Mombasa|Kisumu,Nairobi,,geo\nnumerical,5 / 2 = ?,1,easy,maths,,2.5±0.1,,\n";
  return (
    <PortalSection title="Question bank import / export" action={<CloseBtn onClose={onClose} />}>
      <div className="flex flex-wrap gap-3 text-sm">
        <button type="button" className="btn-secondary px-4 py-2" onClick={() => void exportCsv()}>Export bank as CSV</button>
        <button type="button" className="text-xs text-navy underline decoration-dotted" onClick={() => setCsv(template)}>Use a sample</button>
        <label className="text-xs text-navy underline decoration-dotted">Choose a CSV file…
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(setCsv); }} />
        </label>
      </div>
      <textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} className="input mt-3 font-mono text-xs" placeholder="Paste CSV here. Columns: type, prompt, marks, difficulty, topic, options (a|b|c), correct, explanation, tags" />
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy || csv.trim().length < 10} className="btn-secondary px-4 py-2" onClick={() => void run(true)}>Check only</button>
        <button type="button" disabled={busy || csv.trim().length < 10} className="btn-primary px-4 py-2" onClick={() => void run(false)}>Import valid rows</button>
      </div>
      {error && <p className="mt-2 text-sm text-navy-dark" role="alert">{error}</p>}
      {result && (
        <div className="mt-3 text-sm">
          <p className="text-forest">{result.dryRun ? `${result.valid ?? 0} row(s) are valid.` : `${result.imported ?? 0} question(s) imported.`}</p>
          {result.errors.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-navy-dark">{result.errors.slice(0, 30).map((x) => <li key={x.row}>Row {x.row}: {x.message}</li>)}</ul>}
        </div>
      )}
    </PortalSection>
  );
}
const apiFetch_blob = (courseId: string) => apiFetchBlob(`/quizzes/bank/${courseId}/export.csv`);

// ----------------------------------------------------------------- regrade
export function RegradePanel({ quizId, onChanged, onClose }: { quizId: string; onChanged: () => void; onClose: () => void }) {
  const [result, setResult] = useState<{ applied: boolean; attemptsChecked: number; changedAnswers: number; changedAttempts: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(apply: boolean) {
    setBusy(true); setError(null);
    try {
      setResult(await apiFetch(`/quizzes/${quizId}/regrade`, { method: "POST", body: JSON.stringify({ apply }) }));
      if (apply) onChanged();
    } catch (e) { setError(err(e, "Regrade failed.")); } finally { setBusy(false); }
  }
  return (
    <PortalSection title="Regrade automatically-marked answers" action={<CloseBtn onClose={onClose} />}>
      <p className="text-sm text-ink/70">Re-marks every objective answer against the questions' current answer keys. Answers you marked by hand are never changed.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} className="btn-secondary px-4 py-2" onClick={() => void run(false)}>Check what would change</button>
        {result && !result.applied && result.changedAnswers > 0 && <button type="button" disabled={busy} className="btn-primary px-4 py-2" onClick={() => void run(true)}>Apply to {result.changedAttempts} attempt(s)</button>}
      </div>
      {error && <p className="mt-2 text-sm text-navy-dark" role="alert">{error}</p>}
      {result && (
        <p className="mt-2 text-sm text-forest">
          {result.applied ? "Regraded: " : "Checked: "}{result.attemptsChecked} attempt(s) looked at, {result.changedAnswers} answer(s) {result.applied ? "changed" : "would change"} across {result.changedAttempts} attempt(s).
        </p>
      )}
    </PortalSection>
  );
}
