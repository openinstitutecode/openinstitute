import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge, Table } from "../../components/portal/Primitives";
import { CoursePicker } from "../../components/portal/TrainerPickers";
import { apiFetch, dateTimeLocalToIso, downloadFrom, isoToDateTimeLocal, openStoredFile, uploadMedia, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";

type Criterion = { name: string; description?: string; maxMarks: number };
type A = {
  id: string; courseId: string; title: string; instructions: string; dueAt: string; totalMarks: number; status: string; releaseAt: string | null; category: string; weightPercent: number; mode: string; maxGroupSize: number;
  allowText: boolean; allowFiles: boolean; maxFiles: number; maxFileMb: number; allowedKinds: string[]; requireEvidence: boolean; lateMode: string; cutoffAt: string | null; latePenaltyPctPerDay: number; latePenaltyMaxPct: number;
  maxResubmissions: number; rubricCriteria: Criterion[] | null; competencyBased: boolean; holdGrades: boolean; gradesReleasedAt: string | null; requireModeration: boolean; moderationSamplePct: number;
  checkSimilarity: boolean; confirmationNote: string | null; submissionCount?: number;
};
const KINDS = ["pdf", "word", "excel", "powerpoint", "text", "audio", "video", "image", "archive"];
const blank = {
  title: "", instructions: "", dueAt: "", totalMarks: 100, releaseAt: "", category: "ASSIGNMENT", weightPercent: 0, mode: "INDIVIDUAL", maxGroupSize: 5, allowText: true, allowFiles: true, maxFiles: 5, maxFileMb: 20,
  allowedKinds: [] as string[], requireEvidence: false, lateMode: "NONE", cutoffAt: "", latePenaltyPctPerDay: 10, latePenaltyMaxPct: 50, maxResubmissions: 0, competencyBased: false, holdGrades: false,
  requireModeration: false, moderationSamplePct: 0, checkSimilarity: false, confirmationNote: "", rubric: [] as Criterion[],
};
type Form = typeof blank;

export default function TrainerAssignments() {
  const userName = useCurrentUserName();
  const initialCourseId = new URLSearchParams(window.location.search).get("courseId") ?? undefined;
  const [courseId, setCourseId] = useState("");
  const [list, setList] = useState<A[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [marking, setMarking] = useState<A | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    if (!courseId) { setList(null); return; }
    apiFetch<A[]>(`/assignments/course/${courseId}${showArchived ? "?archived=1" : ""}`).then(setList).catch((e) => setMsg({ ok: false, text: e.message }));
  }, [courseId, showArchived]);
  useEffect(load, [load]);

  async function act(path: string, body?: unknown, ok = "Done.") {
    setMsg(null);
    try { await apiFetch(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }); setMsg({ ok: true, text: ok }); load(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed." }); }
  }

  function edit(a: A | null) {
    if (!a) return setEditing({ id: null, form: { ...blank } });
    setEditing({ id: a.id, form: { ...blank, title: a.title, instructions: a.instructions, dueAt: isoToDateTimeLocal(a.dueAt), totalMarks: a.totalMarks, releaseAt: isoToDateTimeLocal(a.releaseAt), category: a.category, weightPercent: a.weightPercent, mode: a.mode,
      maxGroupSize: a.maxGroupSize, allowText: a.allowText, allowFiles: a.allowFiles, maxFiles: a.maxFiles, maxFileMb: a.maxFileMb, allowedKinds: a.allowedKinds, requireEvidence: a.requireEvidence, lateMode: a.lateMode, cutoffAt: isoToDateTimeLocal(a.cutoffAt),
      latePenaltyPctPerDay: a.latePenaltyPctPerDay, latePenaltyMaxPct: a.latePenaltyMaxPct, maxResubmissions: a.maxResubmissions, competencyBased: a.competencyBased, holdGrades: a.holdGrades, requireModeration: a.requireModeration,
      moderationSamplePct: a.moderationSamplePct, checkSimilarity: a.checkSimilarity, confirmationNote: a.confirmationNote ?? "", rubric: a.rubricCriteria ?? [] } });
  }

  async function save() {
    if (!editing) return;
    const f = editing.form;
    const body: Record<string, unknown> = {
      title: f.title, instructions: f.instructions, dueAt: dateTimeLocalToIso(f.dueAt), totalMarks: Number(f.totalMarks), releaseAt: dateTimeLocalToIso(f.releaseAt), category: f.category, weightPercent: Number(f.weightPercent), mode: f.mode,
      maxGroupSize: Number(f.maxGroupSize), allowText: f.allowText, allowFiles: f.allowFiles, maxFiles: Number(f.maxFiles), maxFileMb: Number(f.maxFileMb), allowedKinds: f.allowedKinds, requireEvidence: f.requireEvidence, lateMode: f.lateMode,
      cutoffAt: dateTimeLocalToIso(f.cutoffAt), latePenaltyPctPerDay: Number(f.latePenaltyPctPerDay), latePenaltyMaxPct: Number(f.latePenaltyMaxPct), maxResubmissions: Number(f.maxResubmissions), competencyBased: f.competencyBased,
      holdGrades: f.holdGrades, requireModeration: f.requireModeration, moderationSamplePct: Number(f.moderationSamplePct), checkSimilarity: f.checkSimilarity, confirmationNote: f.confirmationNote || null,
      rubricCriteria: f.rubric.length && !f.competencyBased ? f.rubric.map((r) => ({ ...r, maxMarks: Number(r.maxMarks) })) : null,
    };
    try {
      if (editing.id) await apiFetch(`/assignments/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await apiFetch("/assignments", { method: "POST", body: JSON.stringify({ ...body, courseId, status: "DRAFT" }) });
      setEditing(null); setMsg({ ok: true, text: editing.id ? "Saved." : "Saved as a draft — publish it when ready." }); load();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed." }); }
  }

  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      <div className="space-y-6">
        <PortalSection title="Assignments" action={<div className="flex items-center gap-3"><label className="text-xs"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
          <button className="btn-primary !py-2" disabled={!courseId} onClick={() => edit(null)}>New assignment</button></div>}>
          <CoursePicker value={courseId} initialCourseId={initialCourseId} onChange={(id) => { setCourseId(id); setMarking(null); setEditing(null); }} className="mb-4 max-w-md" />
          {msg && <p role="status" className={`mb-3 text-sm ${msg.ok ? "text-green-800" : "text-red-700"}`}>{msg.text}</p>}
          {list && (list.length === 0 ? <p className="text-sm text-ink/60">No assignments yet.</p> : (
            <Table columns={["Title", "Due", "Status", "Marks", "Hand-ins", "Actions"]} rows={list.map((a) => [
              <span key="t"><strong>{a.title}</strong><span className="block font-mono text-xs text-ink/50">{a.category}{a.mode === "GROUP" ? " · group" : ""}{a.competencyBased ? " · competency" : ""}</span></span>,
              new Date(a.dueAt).toLocaleString(),
              <Badge key="s" tone={a.status === "PUBLISHED" ? "ok" : a.status === "DRAFT" ? "warn" : "neutral"}>{a.status}{a.holdGrades && !a.gradesReleasedAt ? " · grades held" : ""}</Badge>,
              String(a.totalMarks), String(a.submissionCount ?? 0),
              <span key="x" className="flex flex-wrap gap-2 text-xs">
                <button className="underline" onClick={() => setMarking(a)}>Mark</button>
                <button className="underline" onClick={() => edit(a)}>Edit</button>
                {a.status !== "PUBLISHED" ? <button className="underline" onClick={() => act(`/assignments/${a.id}/${a.status === "ARCHIVED" ? "restore" : "publish"}`, undefined, "Published.")}>{a.status === "ARCHIVED" ? "Restore" : "Publish"}</button>
                  : <><button className="underline" onClick={() => act(`/assignments/${a.id}/unpublish`, undefined, "Unpublished.")}>Unpublish</button><button className="underline" onClick={() => act(`/assignments/${a.id}/archive`, undefined, "Archived.")}>Archive</button></>}
                <button className="underline" onClick={() => act(`/assignments/${a.id}/duplicate`, { shiftDays: 7 }, "Copied as a draft, deadline shifted +7 days.")}>Duplicate</button>
              </span>])} />))}
        </PortalSection>
        {editing && <Editor form={editing.form} isNew={!editing.id} onChange={(form) => setEditing({ ...editing, form })} onSave={save} onCancel={() => setEditing(null)} />}
        {marking && <Marking a={marking} onClose={() => { setMarking(null); load(); }} />}
      </div>
    </PortalShell>
  );
}

function Editor({ form, isNew, onChange, onSave, onCancel }: { form: Form; isNew: boolean; onChange: (f: Form) => void; onSave: () => void; onCancel: () => void }) {
  const set = <K extends keyof Form>(k: K, v: Form[K]) => onChange({ ...form, [k]: v });
  const rubricTotal = form.rubric.reduce((s, r) => s + Number(r.maxMarks || 0), 0);
  const L = ({ t, children }: { t: string; children: React.ReactNode }) => <label className="block text-xs font-medium text-ink/70">{t}<div className="mt-1 font-normal">{children}</div></label>;
  return (
    <PortalSection title={isNew ? "New assignment" : "Edit assignment"}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2"><L t="Title"><input className="input" value={form.title} onChange={(e) => set("title", e.target.value)} /></L></div>
        <div className="md:col-span-2"><L t="Instructions"><textarea className="input min-h-[120px]" value={form.instructions} onChange={(e) => set("instructions", e.target.value)} /></L></div>
        <L t="Deadline"><input type="datetime-local" className="input" value={form.dueAt} onChange={(e) => set("dueAt", e.target.value)} /></L>
        <L t="Opens to students (optional)"><input type="datetime-local" className="input" value={form.releaseAt} onChange={(e) => set("releaseAt", e.target.value)} /></L>
        <L t="Total marks"><input type="number" className="input" value={form.totalMarks} onChange={(e) => set("totalMarks", Number(e.target.value))} /></L>
        <L t="Category"><select className="input" value={form.category} onChange={(e) => set("category", e.target.value)}>{["ASSIGNMENT", "PRACTICAL", "PROJECT", "CAT"].map((c) => <option key={c}>{c}</option>)}</select></L>
        <L t="Mode"><select className="input" value={form.mode} onChange={(e) => set("mode", e.target.value)}><option value="INDIVIDUAL">Individual</option><option value="GROUP">Group</option></select></L>
        {form.mode === "GROUP" && <L t="Max group size"><input type="number" min={2} max={20} className="input" value={form.maxGroupSize} onChange={(e) => set("maxGroupSize", Number(e.target.value))} /></L>}
        <L t="Marking style"><select className="input" value={form.competencyBased ? "C" : "S"} onChange={(e) => set("competencyBased", e.target.value === "C")}><option value="S">Marks / rubric</option><option value="C">Competent / Not yet competent</option></select></L>
        <L t="Resubmissions allowed"><input type="number" min={0} max={10} className="input" value={form.maxResubmissions} onChange={(e) => set("maxResubmissions", Number(e.target.value))} /></L>
        <div className="flex flex-wrap gap-4 md:col-span-2 text-sm">
          <label><input type="checkbox" checked={form.allowText} onChange={(e) => set("allowText", e.target.checked)} /> Typed answers</label>
          <label><input type="checkbox" checked={form.allowFiles} onChange={(e) => set("allowFiles", e.target.checked)} /> File uploads</label>
          <label><input type="checkbox" checked={form.requireEvidence} onChange={(e) => set("requireEvidence", e.target.checked)} /> Evidence file required (practicals)</label>
          <label><input type="checkbox" checked={form.checkSimilarity} onChange={(e) => set("checkSimilarity", e.target.checked)} /> Check typed answers for overlap</label>
          <label><input type="checkbox" checked={form.holdGrades} onChange={(e) => set("holdGrades", e.target.checked)} /> Hold grades until I release them</label>
          <label><input type="checkbox" checked={form.requireModeration} onChange={(e) => set("requireModeration", e.target.checked)} /> Moderation required</label>
        </div>
        {form.allowFiles && <>
          <L t="Max files"><input type="number" className="input" value={form.maxFiles} onChange={(e) => set("maxFiles", Number(e.target.value))} /></L>
          <L t="Max size per file (MB)"><input type="number" className="input" value={form.maxFileMb} onChange={(e) => set("maxFileMb", Number(e.target.value))} /></L>
          <div className="md:col-span-2"><p className="text-xs font-medium text-ink/70">Accepted file types (none ticked = any allowed type)</p>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">{KINDS.map((k) => <label key={k}><input type="checkbox" checked={form.allowedKinds.includes(k)} onChange={(e) => set("allowedKinds", e.target.checked ? [...form.allowedKinds, k] : form.allowedKinds.filter((x) => x !== k))} /> {k}</label>)}</div></div>
        </>}
        <L t="Late work"><select className="input" value={form.lateMode} onChange={(e) => set("lateMode", e.target.value)}><option value="NONE">Not accepted</option><option value="PENALTY">Accepted with penalty</option><option value="ACCEPT">Accepted, no penalty</option></select></L>
        {form.lateMode !== "NONE" && <L t="Late cutoff (optional)"><input type="datetime-local" className="input" value={form.cutoffAt} onChange={(e) => set("cutoffAt", e.target.value)} /></L>}
        {form.lateMode === "PENALTY" && <><L t="Penalty % per day"><input type="number" className="input" value={form.latePenaltyPctPerDay} onChange={(e) => set("latePenaltyPctPerDay", Number(e.target.value))} /></L><L t="Maximum penalty %"><input type="number" className="input" value={form.latePenaltyMaxPct} onChange={(e) => set("latePenaltyMaxPct", Number(e.target.value))} /></L></>}
        {form.requireModeration && <L t="Moderation sample %"><input type="number" min={0} max={100} className="input" value={form.moderationSamplePct} onChange={(e) => set("moderationSamplePct", Number(e.target.value))} /></L>}
        <L t="Share of course grade (%)"><input type="number" min={0} max={100} className="input" value={form.weightPercent} onChange={(e) => set("weightPercent", Number(e.target.value))} /></L>
        <div className="md:col-span-2"><L t="Note added to the student's receipt"><input className="input" value={form.confirmationNote} onChange={(e) => set("confirmationNote", e.target.value)} /></L></div>
        {!form.competencyBased && (
          <div className="md:col-span-2 space-y-2">
            <p className="text-xs font-medium text-ink/70">Rubric (optional) — criteria must add up to the total marks ({rubricTotal} / {form.totalMarks})</p>
            {form.rubric.map((r, i) => (
              <div key={i} className="flex gap-2">
                <input className="input" placeholder="Criterion" value={r.name} onChange={(e) => set("rubric", form.rubric.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className="input" placeholder="What it looks for" value={r.description ?? ""} onChange={(e) => set("rubric", form.rubric.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                <input type="number" className="input !w-24" value={r.maxMarks} onChange={(e) => set("rubric", form.rubric.map((x, j) => (j === i ? { ...x, maxMarks: Number(e.target.value) } : x)))} />
                <button className="text-xs underline" onClick={() => set("rubric", form.rubric.filter((_, j) => j !== i))}>Remove</button>
              </div>))}
            <button className="btn-secondary !py-1" onClick={() => set("rubric", [...form.rubric, { name: "", maxMarks: 10 }])}>Add criterion</button>
          </div>)}
      </div>
      <div className="mt-6 flex gap-3"><button className="btn-primary" onClick={onSave}>Save</button><button className="btn-secondary" onClick={onCancel}>Cancel</button></div>
    </PortalSection>
  );
}

type Row = { studentUserId: string; fullName: string; studentNumber: string; status: string; submissionId: string | null; submittedAt: string | null; isLate: boolean; versionCount: number; fileCount: number; score: number | null; similarityScore: number | null; aiAssisted: boolean; extensionStatus: string | null };
type Detail = {
  id: string; student: { fullName: string } | null; textAnswer: string | null; files: { id: string; originalName: string; mimeType: string; kind: string }[]; isLate: boolean; lateMinutes: number | null; latePenaltyPct: number | null; score: number | null; feedback: string | null;
  versions: { versionNo: number; submittedAt: string; change: { added: number; removed: number; unchangedPct: number } | null; textAnswer: string | null }[]; similarityScore: number | null; similarityNote: string | null; groupMemberCount: number;
  marks: { markerNumber: number; score: number }[]; annotations: ({ start: number; end: number; quote: string; comment: string } | { assetId: string; page: number; comment: string })[] | null;
  feedbackFiles: { id: string; originalName: string; kind: string }[];
};

function Marking({ a, onClose }: { a: A; onClose: () => void }) {
  const [data, setData] = useState<{ counts: Record<string, number>; rows: Row[] } | null>(null);
  const [filter, setFilter] = useState("");
  const [sel, setSel] = useState<Detail | null>(null);
  const [score, setScore] = useState("");
  const [crit, setCrit] = useState<Record<string, string>>({});
  const [comp, setComp] = useState("COMPETENT");
  const [feedback, setFeedback] = useState("");
  const [waive, setWaive] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [extensions, setExtensions] = useState<{ id: string; fullName?: string; requestedDueAt: string; reason: string; status: string }[]>([]);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [modScore, setModScore] = useState("");
  const [ann, setAnn] = useState<({ start: number; end: number; comment: string } | { assetId: string; page: number; comment: string })[]>([]);
  const [annComment, setAnnComment] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfFileId, setPdfFileId] = useState("");
  const [pdfPage, setPdfPage] = useState("1");
  const [pdfComment, setPdfComment] = useState("");
  const [fbFiles, setFbFiles] = useState<{ id: string; name: string; kind: string }[]>([]);
  const [fbProgress, setFbProgress] = useState<number | null>(null);

  const load = useCallback(() => {
    apiFetch<{ counts: Record<string, number>; rows: Row[] }>(`/assignments/${a.id}/submissions${filter ? `?status=${filter}` : ""}`).then(setData).catch((e) => setMsg({ ok: false, text: e.message }));
    apiFetch<typeof extensions>(`/assignments/${a.id}/extensions`).then(setExtensions).catch(() => undefined);
  }, [a.id, filter]);
  useEffect(load, [load]);

  async function open(r: Row) {
    if (!r.submissionId) return;
    const d = await apiFetch<Detail>(`/assignments/submissions/${r.submissionId}`);
    setSel(d); setScore(d.score?.toString() ?? ""); setFeedback(d.feedback ?? ""); setCrit({}); setWaive(false); setMsg(null); setAnn(d.annotations ?? []); setPdfUrl(null); setPdfPage("1"); setPdfComment(""); setFbFiles((d.feedbackFiles ?? []).map((f) => ({ id: f.id, name: f.originalName, kind: f.kind })));
    const pdf = d.files.find((f) => f.mimeType === "application/pdf");
    setPdfFileId(pdf?.id ?? "");
    if (pdf) void showPdf(pdf.id);
  }

  async function showPdf(assetId: string) {
    try { const result = await apiFetch<{ url: string }>(`/assignments/files/${assetId}/url`); setPdfFileId(assetId); setPdfUrl(result.url); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not open the PDF preview." }); }
  }

  async function grade() {
    if (!sel) return;
    const body: Record<string, unknown> = { feedback: feedback || undefined, waiveLatePenalty: waive, feedbackAssetIds: fbFiles.map((f) => f.id), ...(ann.length ? { annotations: ann } : {}) };
    if (a.competencyBased) body.competencyResult = comp;
    else if (a.rubricCriteria) body.criteria = a.rubricCriteria.map((c) => ({ name: c.name, score: Number(crit[c.name] ?? NaN) }));
    else body.score = Number(score);
    try { const r = await apiFetch<{ score: number; gradedStudents: number; visibleToStudent: boolean }>(`/assignments/submissions/${sel.id}/grade`, { method: "PUT", body: JSON.stringify(body) });
      setMsg({ ok: true, text: `Saved ${r.score}/${a.totalMarks}${r.gradedStudents > 1 ? ` for ${r.gradedStudents} group members` : ""}${r.visibleToStudent ? "" : " — held until you release grades"}.` }); setSel(null); load(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed." }); }
  }

  async function call(path: string, method = "POST", body?: unknown, ok = "Done.") {
    try { const r = await apiFetch<Record<string, unknown>>(path, { method, body: body ? JSON.stringify(body) : undefined }); setMsg({ ok: true, text: ok }); load(); return r; }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed." }); return null; }
  }

  async function addFeedbackFile(file: File | undefined) {
    if (!file) return;
    if (fbFiles.length >= 10) return setMsg({ ok: false, text: "At most 10 feedback files." });
    setMsg(null);
    try { setFbProgress(0); const up = await uploadMedia(file, a.courseId, setFbProgress); setFbFiles((cur) => [...cur, { id: up.id, name: up.name, kind: up.kind }]); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Upload failed." }); }
    finally { setFbProgress(null); }
  }

  const selectedText = () => { const sl = window.getSelection(); const t = sl?.toString() ?? ""; if (!sel?.textAnswer || !t) return; const start = sel.textAnswer.indexOf(t); if (start < 0) return; setAnn((x) => [...x, { start, end: start + t.length, comment: annComment || "See note" }]); setAnnComment(""); };

  return (
    <PortalSection title={`Marking — ${a.title}`} action={<button className="btn-secondary !py-1" onClick={onClose}>Close</button>}>
      {msg && <p role="status" className={`mb-3 text-sm ${msg.ok ? "text-green-800" : "text-red-700"}`}>{msg.text}</p>}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
        {data && Object.entries(data.counts).map(([k, v]) => <button key={k} className={`underline ${filter === k ? "font-bold" : ""}`} onClick={() => setFilter(filter === k ? "" : k)}>{k.replace(/_/g, " ")}: {v}</button>)}
        <span className="mx-2 text-ink/30">|</span>
        <button className="underline" onClick={() => downloadFrom(`/assignments/${a.id}/download.zip`, "submissions.zip")}>Download all (ZIP)</button>
        {a.holdGrades && <button className="underline" onClick={() => call(`/assignments/${a.id}/release-grades`, "POST", {}, "Grades released and students notified.")}>Release grades</button>}
        {!a.holdGrades && <button className="underline" onClick={() => call(`/assignments/${a.id}/withhold-grades`, "POST", {}, "Grades are now held.")}>Hold grades</button>}
        <button className="underline" onClick={async () => setStats(await apiFetch(`/assignments/${a.id}/analytics`))}>Analytics</button>
        {a.checkSimilarity && <button className="underline" onClick={async () => setStats(await apiFetch(`/assignments/${a.id}/similarity`))}>Similarity report</button>}
        {a.requireModeration && <button className="underline" onClick={async () => setStats(await apiFetch(`/assignments/${a.id}/moderation`))}>Moderation sample</button>}
      </div>
      {stats && <pre className="mb-4 max-h-64 overflow-auto bg-ink/5 p-3 text-xs">{JSON.stringify(stats, null, 2)}</pre>}

      {data && <Table columns={["Student", "Status", "Submitted", "Score", "Flags", ""]} rows={data.rows.map((r) => [
        <span key="n">{r.fullName}<span className="block font-mono text-xs text-ink/50">{r.studentNumber}</span></span>, r.status.replace(/_/g, " "),
        r.submittedAt ? `${new Date(r.submittedAt).toLocaleString()} (v${r.versionCount})` : "—", r.score === null ? "—" : `${r.score}/${a.totalMarks}`,
        <span key="f" className="text-xs">{r.isLate ? "late " : ""}{r.aiAssisted ? "AI-declared " : ""}{(r.similarityScore ?? 0) >= 70 ? `overlap ${r.similarityScore}% ` : ""}{r.extensionStatus ? `ext:${r.extensionStatus}` : ""}</span>,
        r.submissionId ? <button key="o" className="text-xs underline" onClick={() => open(r)}>Open</button> : ""])} />}

      {sel && (
        <div className="mt-6 space-y-3 border border-line p-4 text-sm">
          <p className="font-medium">{sel.student?.fullName}{sel.groupMemberCount > 1 ? ` (group of ${sel.groupMemberCount} — grade is shared)` : ""}{sel.isLate ? ` · late by ${Math.round((sel.lateMinutes ?? 0) / 60)}h` : ""}</p>
          {sel.textAnswer && <div><p className="whitespace-pre-wrap bg-ink/5 p-3 text-xs" onMouseUp={selectedText}>{sel.textAnswer}</p>
            <div className="mt-1 flex gap-2 text-xs"><input className="input" placeholder="Comment, then highlight text above to attach it" value={annComment} onChange={(e) => setAnnComment(e.target.value)} /><span className="self-center whitespace-nowrap">{ann.length} note(s)</span></div></div>}
          <ul>{sel.files.map((f) => <li key={f.id}><button className="underline" onClick={() => openStoredFile(f.id)}>{f.originalName}</button></li>)}</ul>
          {sel.files.some((f) => f.mimeType === "application/pdf") && <div className="space-y-2 rounded border border-line p-3">
            <label className="block text-xs">PDF to review<select className="input mt-1" value={pdfFileId} onChange={(e) => void showPdf(e.target.value)}>{sel.files.filter((f) => f.mimeType === "application/pdf").map((f) => <option key={f.id} value={f.id}>{f.originalName}</option>)}</select></label>
            {pdfUrl && <iframe title="Submitted PDF" src={pdfUrl} className="h-[480px] w-full rounded border border-line" />}
            <div className="flex flex-wrap items-end gap-2"><label className="text-xs">Page<input type="number" min={1} max={1000} className="input mt-1 w-24" value={pdfPage} onChange={(e) => setPdfPage(e.target.value)} /></label><label className="min-w-56 flex-1 text-xs">Comment<input className="input mt-1" value={pdfComment} onChange={(e) => setPdfComment(e.target.value)} placeholder="Feedback for this PDF page" /></label><button className="btn-secondary !py-2" disabled={!pdfFileId || !pdfComment.trim() || !Number.isInteger(Number(pdfPage)) || Number(pdfPage) < 1} onClick={() => { setAnn((x) => [...x, { assetId: pdfFileId, page: Number(pdfPage), comment: pdfComment.trim() }]); setPdfComment(""); }}>Add page note</button></div>
            <ul className="space-y-1 text-xs">{ann.filter((x): x is { assetId: string; page: number; comment: string } => "assetId" in x).map((x, i) => <li key={`${x.assetId}-${i}`}>PDF p.{x.page}: {sel.files.find((f) => f.id === x.assetId)?.originalName} — {x.comment}</li>)}</ul>
            <p className="text-[11px] text-ink/50">Page notes are anchored to the uploaded PDF page. Open the page in the viewer to place each note; Word documents are still opened in the browser's supported viewer.</p>
          </div>}
          {sel.similarityScore !== null && <p className="text-xs">{sel.similarityNote}</p>}
          {sel.versions.length > 1 && <details><summary className="cursor-pointer text-xs">{sel.versions.length} versions</summary><ul className="mt-1 text-xs">{sel.versions.map((v) => <li key={v.versionNo}>v{v.versionNo} {new Date(v.submittedAt).toLocaleString()}{v.change ? ` — +${v.change.added}/−${v.change.removed} words, ${v.change.unchangedPct}% unchanged` : ""}</li>)}</ul></details>}
          {a.competencyBased ? <select className="input !w-auto" value={comp} onChange={(e) => setComp(e.target.value)}><option value="COMPETENT">Competent</option><option value="NOT_YET_COMPETENT">Not yet competent</option></select>
            : a.rubricCriteria ? <div className="space-y-2">{a.rubricCriteria.map((c) => <div key={c.name} className="flex items-center gap-2"><span className="w-48">{c.name} (/{c.maxMarks})</span><input type="number" className="input !w-24" value={crit[c.name] ?? ""} onChange={(e) => setCrit({ ...crit, [c.name]: e.target.value })} /></div>)}</div>
            : <input type="number" className="input !w-32" placeholder={`/ ${a.totalMarks}`} value={score} onChange={(e) => setScore(e.target.value)} />}
          {sel.isLate && a.lateMode === "PENALTY" && <label className="block text-xs"><input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} /> Waive the {sel.latePenaltyPct}% late penalty</label>}
          <textarea className="input" placeholder="Written feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          <div className="space-y-2 border border-line p-3">
            <p className="text-xs font-medium text-ink/70">Feedback files — audio or video comments, or the student's document with your annotations</p>
            <input type="file" accept="audio/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg" aria-label="Upload a feedback file" onChange={(e) => { void addFeedbackFile(e.target.files?.[0]); e.target.value = ""; }} />
            {fbProgress !== null && <p className="text-xs text-ink/60">Uploading… {fbProgress}%</p>}
            <ul className="space-y-1 text-xs">{fbFiles.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3"><span>{f.kind === "audio" ? "🎧" : f.kind === "video" ? "🎬" : "📎"} <button type="button" className="underline" onClick={() => openStoredFile(f.id)}>{f.name}</button></span>
                <button type="button" className="underline" onClick={() => setFbFiles((cur) => cur.filter((x) => x.id !== f.id))}>Remove</button></li>))}</ul>
            {fbFiles.length > 0 && <p className="text-xs text-ink/50">Students see these once the grade is visible to them. Save the grade to attach them.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3"><button className="btn-primary" onClick={grade}>Save grade</button>
            <button className="btn-secondary" onClick={() => call(`/assignments/submissions/${sel.id}/request-resubmission`, "POST", { extraAttempts: 1 }, "Student invited to resubmit.")}>Invite resubmission</button>
            {a.requireModeration && <><input type="number" className="input !w-28" placeholder="Moderator mark" value={modScore} onChange={(e) => setModScore(e.target.value)} /><button className="btn-secondary" onClick={() => call(`/assignments/submissions/${sel.id}/moderate`, "POST", { score: Number(modScore) }, "Moderation recorded.")}>Moderate</button></>}</div>
        </div>)}

      {extensions.length > 0 && (
        <div className="mt-6"><p className="mb-2 font-medium">Extension requests</p>
          <ul className="space-y-2 text-sm">{extensions.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 border border-line p-2"><span>{e.fullName} → {new Date(e.requestedDueAt).toLocaleString()} <span className="text-xs text-ink/60">“{e.reason}”</span></span>
              {e.status === "REQUESTED" ? <span className="flex gap-2"><button className="btn-secondary !py-1" onClick={() => call(`/assignments/extensions/${e.id}`, "PATCH", { decision: "APPROVED" }, "Approved.")}>Approve</button><button className="btn-secondary !py-1" onClick={() => call(`/assignments/extensions/${e.id}`, "PATCH", { decision: "DENIED" }, "Denied.")}>Deny</button></span> : <Badge tone={e.status === "APPROVED" ? "ok" : "danger"}>{e.status}</Badge>}</li>))}</ul></div>)}
    </PortalSection>
  );
}
