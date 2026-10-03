import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge, Table } from "../../components/portal/Primitives";
import { CoursePicker } from "../../components/portal/TrainerPickers";
import { apiFetch, dateTimeLocalToIso, downloadFrom, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";

type Tab = "gradebook" | "weights" | "analysis" | "engagement" | "content" | "interventions" | "notices" | "porting";
const TABS: [Tab, string][] = [["gradebook", "Gradebook"], ["weights", "Grade weights"], ["analysis", "Class analysis"], ["engagement", "Engagement & completion"], ["content", "Content analytics"], ["interventions", "Interventions"], ["notices", "Course notice"], ["porting", "Import / export"]];
const CATS = ["FORMATIVE_QUIZ", "ASSIGNMENT", "PRACTICAL", "PROJECT", "CAT", "FINAL_EXAM"];

type GB = { items: { id: string; title: string; totalMarks: number; category: string }[]; rows: { studentUserId: string; fullName: string; studentNumber: string; cells: Record<string, { score: number | null; state: string }>; overall: { percent: number | null; letter: string | null }; missing: number }[]; itemStats: { itemId: string; mean: number | null; difficulty: string | null; completionPercent: number | null }[]; classAverage: number | null };

export default function TrainerLmsTools() {
  const userName = useCurrentUserName();
  const [courseId, setCourseId] = useState("");
  const [tab, setTab] = useState<Tab>("gradebook");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const say = (ok: boolean, text: string) => setMsg({ ok, text });
  const fail = (e: unknown) => say(false, e instanceof Error ? e.message : "Failed.");

  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      <div className="space-y-6">
        <PortalSection title="LMS tools">
          <CoursePicker value={courseId} onChange={(id) => { setCourseId(id); setMsg(null); }} className="mb-4 max-w-md" />
          <div className="mb-2 flex flex-wrap gap-2" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "btn-primary !py-1.5" : "btn-secondary !py-1.5"} onClick={() => { setTab(k); setMsg(null); }}>{l}</button>)}</div>
          {msg && <p role="status" className={`text-sm ${msg.ok ? "text-green-800" : "text-red-700"}`}>{msg.text}</p>}
        </PortalSection>
        {!courseId ? <p className="text-sm text-ink/60">Choose a course to begin.</p> : (
          <>
            {tab === "gradebook" && <Gradebook courseId={courseId} fail={fail} say={say} />}
            {tab === "weights" && <Weights courseId={courseId} fail={fail} say={say} />}
            {tab === "analysis" && <Analysis courseId={courseId} fail={fail} />}
            {tab === "engagement" && <Engagement courseId={courseId} fail={fail} />}
            {tab === "content" && <ContentStats courseId={courseId} fail={fail} />}
            {tab === "interventions" && <Interventions courseId={courseId} fail={fail} say={say} />}
            {tab === "notices" && <Notice courseId={courseId} fail={fail} say={say} />}
            {tab === "porting" && <Porting courseId={courseId} fail={fail} say={say} />}
          </>)}
      </div>
    </PortalShell>
  );
}
type P = { courseId: string; fail: (e: unknown) => void; say?: (ok: boolean, t: string) => void };

function Gradebook({ courseId, fail }: P) {
  const [gb, setGb] = useState<GB | null>(null);
  useEffect(() => { setGb(null); apiFetch<GB>(`/lms/gradebook/${courseId}`).then(setGb).catch(fail); }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!gb) return <p className="text-sm text-ink/60">Loading…</p>;
  const st = new Map(gb.itemStats.map((s) => [s.itemId, s]));
  return (
    <PortalSection title={`Gradebook — class average ${gb.classAverage ?? "—"}%`} action={<button className="btn-secondary !py-1" onClick={() => downloadFrom(`/lms/gradebook/${courseId}/export.csv`, "gradebook.csv")}>Export CSV</button>}>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs">
        <thead><tr className="border-b border-line"><th className="pr-3 pb-2">Student</th>{gb.items.map((i) => <th key={i.id} className="pr-3 pb-2 font-medium">{i.title}<span className="block font-normal text-ink/50">/{i.totalMarks} · {st.get(i.id)?.difficulty?.toLowerCase() ?? ""}</span></th>)}<th className="pb-2">Overall</th><th className="pb-2">Report</th></tr></thead>
        <tbody className="divide-y divide-line">{gb.rows.map((r) => (
          <tr key={r.studentUserId}><td className="py-2 pr-3">{r.fullName}<span className="block font-mono text-ink/50">{r.studentNumber}</span></td>
            {gb.items.map((i) => { const c = r.cells[i.id]; return <td key={i.id} className={`pr-3 ${c?.state === "MISSING" ? "text-red-700" : ""}`}>{c?.score != null ? c.score : c?.state === "MISSING" ? "missing" : c?.state === "AWAITING" ? "to mark" : "—"}</td>; })}
            <td className="font-medium">{r.overall.percent != null ? `${r.overall.percent}% ${r.overall.letter}` : "—"}</td><td><button className="text-xs underline" onClick={() => downloadFrom(`/lms/gradebook/${courseId}/student/${encodeURIComponent(r.studentUserId)}/report.html`, `result-${r.studentNumber}.html`)}>Report</button></td></tr>))}</tbody></table></div>
    </PortalSection>
  );
}

function Weights({ courseId, fail, say }: P) {
  const [w, setW] = useState<Record<string, number>>({});
  useEffect(() => { apiFetch<{ weights: Record<string, number> }>(`/lms/gradebook/${courseId}/weights`).then((r) => setW(r.weights)).catch(fail); }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = CATS.reduce((s, c) => s + (Number(w[c]) || 0), 0);
  async function save() { try { await apiFetch(`/lms/gradebook/${courseId}/weights`, { method: "PUT", body: JSON.stringify({ weights: CATS.map((c) => ({ category: c, weightPercent: Number(w[c]) || 0 })) }) }); say?.(true, "Weights saved."); } catch (e) { fail(e); } }
  return (
    <PortalSection title="How each category counts towards the course grade">
      <div className="grid gap-3 sm:grid-cols-3">{CATS.map((c) => <label key={c} className="text-xs font-medium">{c.replace(/_/g, " ")}<input type="number" min={0} max={100} className="input mt-1" value={w[c] ?? 0} onChange={(e) => setW({ ...w, [c]: Number(e.target.value) })} /></label>)}</div>
      <p className={`mt-3 text-sm ${total === 100 || total === 0 ? "" : "text-red-700"}`}>Total: {total}% {total === 0 ? "(no weights — every graded item counts equally)" : total === 100 ? "" : "— must be exactly 100"}</p>
      <button className="btn-primary mt-3" disabled={total !== 100 && total !== 0} onClick={save}>Save weights</button>
    </PortalSection>
  );
}

type An = { items: { itemId: string; title: string; mean: number | null; passRate?: number | null; difficulty: string | null; completionPercent: number | null }[]; distribution: { mean: number | null; median: number | null; passRatePercent: number | null; histogram: { from: number; to: number; count: number }[] }; letters: Record<string, number>; atRiskBelowPass: number; top: { fullName: string; percent: number }[]; bottom: { fullName: string; percent: number }[]; incomplete: { fullName: string; studentNumber: string; missing: number; awaiting: number }[]; discrepancies: { studentNumber: string; fullName: string; note: string }[] };
function Analysis({ courseId, fail }: P) {
  const [d, setD] = useState<An | null>(null);
  const [hist, setHist] = useState<{ at: string; action: string; by: string }[] | null>(null);
  const [comp, setComp] = useState<{ name: string; attainmentPercent: number | null; competent: number; notAssessed: number }[] | null>(null);
  useEffect(() => { setD(null); apiFetch<An>(`/lms/gradebook/${courseId}/analysis`).then(setD).catch(fail); }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <p className="text-sm text-ink/60">Loading…</p>;
  return (
    <>
      <PortalSection title="Class results">
        <p className="mb-3 text-sm">Mean {d.distribution.mean ?? "—"}% · median {d.distribution.median ?? "—"}% · pass rate {d.distribution.passRatePercent ?? "—"}% · {d.atRiskBelowPass} below the pass mark. Grades: {Object.entries(d.letters).map(([k, v]) => `${k}:${v}`).join("  ") || "—"}</p>
        <div className="mb-5 rounded border border-line p-3" role="img" aria-label={`Grade distribution: ${d.distribution.histogram.map((h) => `${h.from} to ${h.to} percent: ${h.count} students`).join(", ")}`}>
          <p className="mb-2 text-xs font-medium">Grade distribution (% score)</p>
          <div className="flex h-32 items-end gap-1 border-b border-line px-1">{d.distribution.histogram.map((h) => {
            const peak = Math.max(1, ...d.distribution.histogram.map((x) => x.count));
            return <div key={h.from} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center" title={`${h.from}–${h.to}%: ${h.count} students`}><span className="text-[10px]">{h.count || ""}</span><div className="mx-auto w-full max-w-10 rounded-t bg-navy" style={{ height: `${(h.count / peak) * 78}%`, minHeight: h.count ? "3px" : "0" }} /><span className="mt-1 text-[9px] text-ink/60">{h.from}</span></div>;
          })}</div>
          <p className="mt-1 text-right text-[10px] text-ink/50">Number of students</p>
        </div>
        <Table columns={["Item", "Mean %", "Completion %", "Difficulty"]} rows={d.items.map((i) => [i.title, String(i.mean ?? "—"), String(i.completionPercent ?? "—"), (i.difficulty ?? "—").replace("_", " ").toLowerCase()])} />
        {d.discrepancies.length > 0 && <div className="mt-4"><p className="text-sm font-medium">Recorded grade differs from computed</p><ul className="text-xs">{d.discrepancies.map((x) => <li key={x.studentNumber}>{x.fullName} ({x.studentNumber}) — {x.note}</li>)}</ul></div>}
        {d.incomplete.length > 0 && <div className="mt-4"><p className="text-sm font-medium">Outstanding work ({d.incomplete.length})</p><ul className="text-xs">{d.incomplete.slice(0, 20).map((x) => <li key={x.studentNumber}>{x.fullName}: {x.missing} missing, {x.awaiting} awaiting marking</li>)}</ul></div>}
      </PortalSection>
      <PortalSection title="More">
        <div className="flex gap-3"><button className="btn-secondary" onClick={() => apiFetch<typeof hist>(`/lms/gradebook/${courseId}/history`).then(setHist).catch(fail)}>Grade change history</button>
          <button className="btn-secondary" onClick={() => apiFetch<{ competencies: NonNullable<typeof comp> }>(`/lms/gradebook/${courseId}/competency`).then((r) => setComp(r.competencies)).catch(fail)}>Competency attainment</button></div>
        {hist && <ul className="mt-3 max-h-64 overflow-auto text-xs">{hist.length === 0 ? <li>No grade changes recorded.</li> : hist.map((h, i) => <li key={i}>{new Date(h.at).toLocaleString()} — {h.action.replace(/_/g, " ").toLowerCase()} by {h.by}</li>)}</ul>}
        {comp && <ul className="mt-3 text-sm">{comp.length === 0 ? <li>No competencies are mapped to this unit.</li> : comp.map((c) => <li key={c.name}>{c.name}: {c.attainmentPercent ?? 0}% attained ({c.competent} competent, {c.notAssessed} not yet assessed)</li>)}</ul>}
      </PortalSection>
    </>
  );
}

function Engagement({ courseId, fail }: P) {
  const [e, setE] = useState<{ rows: { studentUserId: string; fullName: string; studentNumber: string; lessonsCompleted: number; minutesOnTask: number; submissions: number; idleDays: number | null; level: string }[]; note: string } | null>(null);
  const [c, setC] = useState<{ enrolled: number; averageCompletionPercent: number | null; completed: number; distribution: { label: string; students: number }[]; hardestToFinish: { title: string; completionPercent: number | null }[] } | null>(null);
  useEffect(() => { setE(null); setC(null); apiFetch<typeof e>(`/lms/courses/${courseId}/engagement`).then(setE).catch(fail); apiFetch<typeof c>(`/lms/courses/${courseId}/completion-analytics`).then(setC).catch(fail); }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {c && <PortalSection title="Completion" action={<div className="flex flex-wrap gap-2"><button className="btn-secondary !py-1" onClick={() => downloadFrom(`/lms/courses/${courseId}/progress.csv`, "progress.csv")}>Export progress CSV</button><button className="btn-secondary !py-1" onClick={() => downloadFrom(`/lms/gradebook/${courseId}/progress-report.html`, `progress-report-${courseId}.html`)}>Download progress report</button></div>}>
        <p className="mb-2 text-sm">Average {c.averageCompletionPercent ?? "—"}% · {c.completed}/{c.enrolled} finished every lesson.</p>
        <p className="text-xs">{c.distribution.map((b) => `${b.label}: ${b.students}`).join("  ·  ")}</p>
        {c.hardestToFinish.length > 0 && <p className="mt-2 text-xs">Least-completed lessons: {c.hardestToFinish.map((h) => `${h.title} (${h.completionPercent}%)`).join(", ")}</p>}</PortalSection>}
      {e && <PortalSection title="Engagement (least active first)"><p className="mb-3 text-xs text-ink/60">{e.note}</p>
        <Table columns={["Student", "Lessons", "Minutes", "Hand-ins", "Idle", "Level"]} rows={e.rows.map((r) => [<span key="n">{r.fullName}<span className="block font-mono text-xs text-ink/50">{r.studentNumber}</span></span>, String(r.lessonsCompleted), String(r.minutesOnTask), String(r.submissions), r.idleDays === null ? "never" : `${r.idleDays}d`, <Badge key="l" tone={r.level === "HIGH" ? "ok" : r.level === "MEDIUM" ? "neutral" : "warn"}>{r.level}</Badge>])} /></PortalSection>}
    </>
  );
}

function ContentStats({ courseId, fail }: P) {
  const [d, setD] = useState<{ enrolled: number; totalViews: number; neverViewed: { lessonId: string; title: string }[]; lessons: { lessonId: string; title: string; views: number; uniqueViewers: number; completionPercent: number | null }[]; materials: { attachmentId: string; label: string; downloads: number; uniqueDownloaders: number }[] } | null>(null);
  useEffect(() => { setD(null); apiFetch<typeof d>(`/lms/courses/${courseId}/content-analytics`).then(setD).catch(fail); }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <p className="text-sm text-ink/60">Loading…</p>;
  return (
    <PortalSection title={`Content use — ${d.totalViews} views across ${d.enrolled} students`}>
      <Table columns={["Lesson", "Views", "Viewers", "Completed"]} rows={d.lessons.map((l) => [l.title, String(l.views), String(l.uniqueViewers), `${l.completionPercent ?? "—"}%`])} />
      {d.neverViewed.length > 0 && <p className="mt-3 text-xs">Never opened: {d.neverViewed.map((n) => n.title).join(", ")}</p>}
      {d.materials.length > 0 && <div className="mt-4"><p className="text-sm font-medium">Downloads</p><ul className="text-xs">{d.materials.map((m) => <li key={m.attachmentId}>{m.label}: {m.downloads} downloads by {m.uniqueDownloaders} students</li>)}</ul></div>}
    </PortalSection>
  );
}

type Iv = { id: string; fullName?: string; studentNumber?: string; reason: string; action: string | null; status: string; outcome: string | null };
function Interventions({ courseId, fail, say }: P) {
  const [rows, setRows] = useState<Iv[]>([]);
  const [roster, setRoster] = useState<{ studentUserId: string; fullName: string }[]>([]);
  const [uid, setUid] = useState(""); const [reason, setReason] = useState(""); const [action, setAction] = useState("");
  const load = useCallback(() => { apiFetch<Iv[]>(`/lms/courses/${courseId}/interventions`).then(setRows).catch(fail); }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); apiFetch<{ rows: typeof roster }>(`/lms/courses/${courseId}/engagement`).then((r) => setRoster(r.rows)).catch(() => undefined); }, [courseId, load]);
  async function open() { try { await apiFetch(`/lms/courses/${courseId}/interventions`, { method: "POST", body: JSON.stringify({ studentUserId: uid, reason, action: action || undefined }) }); setReason(""); setAction(""); say?.(true, "Intervention opened."); load(); } catch (e) { fail(e); } }
  async function patch(id: string, body: object) { try { await apiFetch(`/lms/interventions/${id}`, { method: "PATCH", body: JSON.stringify(body) }); load(); } catch (e) { fail(e); } }
  return (
    <PortalSection title="Student support interventions">
      <div className="grid gap-2 md:grid-cols-3"><select className="input" value={uid} onChange={(e) => setUid(e.target.value)}><option value="">Choose student…</option>{roster.map((s) => <option key={s.studentUserId} value={s.studentUserId}>{s.fullName}</option>)}</select>
        <input className="input" placeholder="Why (5+ characters)" value={reason} onChange={(e) => setReason(e.target.value)} /><input className="input" placeholder="Planned action (optional)" value={action} onChange={(e) => setAction(e.target.value)} /></div>
      <button className="btn-primary mt-3" disabled={!uid || reason.trim().length < 5} onClick={open}>Open intervention</button>
      <ul className="mt-5 space-y-2 text-sm">{rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border border-line p-3"><span><strong>{r.fullName}</strong> — {r.reason}{r.action ? ` → ${r.action}` : ""}{r.outcome ? ` (outcome: ${r.outcome})` : ""}</span>
          <span className="flex items-center gap-2"><Badge tone={r.status === "CLOSED" ? "ok" : "warn"}>{r.status.replace("_", " ")}</Badge>
            {r.status === "OPEN" && <button className="text-xs underline" onClick={() => patch(r.id, { status: "IN_PROGRESS" })}>Start</button>}
            {r.status !== "CLOSED" && <button className="text-xs underline" onClick={() => { const o = window.prompt("Outcome?") ; if (o) patch(r.id, { status: "CLOSED", outcome: o }); }}>Close</button>}</span></li>))}</ul>
    </PortalSection>
  );
}

function Notice({ courseId, fail, say }: P) {
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [scheduledAt, setScheduledAt] = useState("");
  const [pending, setPending] = useState<{ id: string; title: string; content: string; scheduledAt: string }[]>([]);
  const load = useCallback(() => { apiFetch<typeof pending>(`/lms/courses/${courseId}/notices`).then(setPending).catch(fail); }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  async function send() { try { const r = await apiFetch<{ recipients: number }>(`/lms/courses/${courseId}/notify`, { method: "POST", body: JSON.stringify({ title, body }) }); say?.(true, `Sent to ${r.recipients} students.`); setTitle(""); setBody(""); } catch (e) { fail(e); } }
  async function schedule() { try { await apiFetch(`/courses/${courseId}/announcements`, { method: "POST", body: JSON.stringify({ title, content: body, scheduledAt: dateTimeLocalToIso(scheduledAt), importance: "normal" }) }); say?.(true, `Notice scheduled for ${new Date(scheduledAt).toLocaleString()}.`); setTitle(""); setBody(""); setScheduledAt(""); load(); } catch (e) { fail(e); } }
  async function cancel(id: string) { try { await apiFetch(`/lms/notices/${id}`, { method: "DELETE" }); load(); say?.(true, "Scheduled notice cancelled."); } catch (e) { fail(e); } }
  return (
    <PortalSection title="Send a notice to every student on this course">
      <input className="input mb-2" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} /><textarea className="input" placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="mt-3 flex flex-wrap items-end gap-3"><button className="btn-primary" disabled={title.trim().length < 3 || body.trim().length < 3} onClick={send}>Send now</button>
        <label className="text-xs">Schedule for <input aria-label="Schedule notice date and time" type="datetime-local" className="input mt-1" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></label>
        <button className="btn-secondary" disabled={title.trim().length < 3 || body.trim().length < 3 || !scheduledAt || new Date(scheduledAt).getTime() <= Date.now()} onClick={schedule}>Schedule notice</button></div>
      <p className="mt-2 text-xs text-ink/50">Scheduled notices are published to enrolled students and sent through in-app notifications when the background scheduler runs.</p>
      {pending.length > 0 && <div className="mt-5 border-t border-line pt-3"><p className="mb-2 text-sm font-medium">Scheduled notices</p><ul className="space-y-2">{pending.map((n) => <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 border border-line p-2 text-xs"><span><strong>{n.title}</strong> · {new Date(n.scheduledAt).toLocaleString()}<span className="block text-ink/60">{n.content}</span></span><button className="underline" onClick={() => cancel(n.id)}>Cancel</button></li>)}</ul></div>}
    </PortalSection>
  );
}

function Porting({ courseId, fail, say }: P) {
  const [csv, setCsv] = useState(""); const [asgId, setAsgId] = useState(""); const [asgs, setAsgs] = useState<{ id: string; title: string }[]>([]);
  const [report, setReport] = useState<string | null>(null);
  useEffect(() => { apiFetch<{ id: string; title: string }[]>(`/assignments/course/${courseId}`).then(setAsgs).catch(() => undefined); }, [courseId]);
  async function marks(dry: boolean) {
    try { const r = await apiFetch<{ valid?: number; applied: number; errors: { row: number; message: string }[] }>(`/lms/gradebook/${courseId}/import`, { method: "POST", body: JSON.stringify({ assignmentId: asgId, csv, dryRun: dry }) }); setReport(dry ? `${r.valid} valid row(s); ${r.errors.length} problem(s).${r.errors.map((e) => ` Row ${e.row}: ${e.message}`).join("")}` : `Applied ${r.applied} mark(s).`); if (!dry) say?.(true, "Marks imported."); }
    catch (e) { fail(e); }
  }
  async function importJson(f: File | undefined) {
    if (!f) return;
    try { const r = await apiFetch<{ lessons: number; modules: number; note: string }>(`/lms/courses/${courseId}/import`, { method: "POST", body: await f.text() }); say?.(true, `Imported ${r.lessons} lesson(s) in ${r.modules} module(s). ${r.note}`); } catch (e) { fail(e); }
  }
  return (
    <>
      <PortalSection title="Course content"><div className="flex flex-wrap items-center gap-3"><button className="btn-secondary" onClick={() => downloadFrom(`/lms/courses/${courseId}/export.json`, "course-content.json")}>Export lessons &amp; assignments (JSON)</button>
        <label className="text-sm">Import: <input type="file" accept="application/json,.json" onChange={(e) => { importJson(e.target.files?.[0]); e.target.value = ""; }} /></label></div></PortalSection>
      <PortalSection title="Import assignment marks from CSV">
        <select className="input mb-2 max-w-md" value={asgId} onChange={(e) => setAsgId(e.target.value)}><option value="">Choose assignment…</option>{asgs.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</select>
        <textarea className="input min-h-[120px] font-mono text-xs" placeholder={"student_number,score,feedback\nKV/2026/001,72,Good work"} value={csv} onChange={(e) => setCsv(e.target.value)} />
        <div className="mt-3 flex gap-3"><button className="btn-secondary" disabled={!asgId || !csv} onClick={() => marks(true)}>Check first</button><button className="btn-primary" disabled={!asgId || !csv} onClick={() => marks(false)}>Apply marks</button></div>
        {report && <p className="mt-3 text-sm">{report}</p>}
      </PortalSection>
    </>
  );
}
