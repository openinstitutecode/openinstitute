import { useCallback, useEffect, useRef, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, openStoredFile, uploadAssignmentFile, useCurrentUserName, dateTimeLocalToIso, type AssignmentFile } from "../../lib/api";
import { studentLinks as links } from "./studentLinks";

type Card = {
  id: string; title: string; instructions: string; dueAt: string; effectiveDueAt: string; totalMarks: number; mode: "INDIVIDUAL" | "GROUP"; maxGroupSize: number;
  allowText: boolean; allowFiles: boolean; maxFiles: number; maxFileMb: number; allowedKinds: string[]; requireEvidence: boolean;
  lateMode: string; latePenaltyPctPerDay: number; latePenaltyMaxPct: number; cutoffAt: string | null; maxResubmissions: number; competencyBased: boolean;
  rubricCriteria: { name: string; description?: string; maxMarks: number }[] | null; category: string; weightPercent: number;
  window: { state: "NOT_OPEN" | "OPEN" | "LATE" | "CLOSED"; reason: string; penaltyPct: number };
  extension: { status: string; grantedDueAt: string | null } | null;
  mine: { id: string; isDraft: boolean; isLate: boolean; submittedAt: string; versionCount: number; needsRegrade: boolean; graded: boolean; score: number | null; gradeWithheld: boolean; canResubmit: boolean; resubmissionsLeft: number } | null;
};
type Mine = {
  isDraft: boolean; textAnswer: string | null; files: AssignmentFile[]; versions: { versionNo: number; submittedAt: string; isLate: boolean; note: string | null; fileCount: number }[];
  graded: boolean; gradeWithheld: boolean; score?: number; totalMarks?: number; rawScore?: number | null; latePenaltyPct?: number | null; feedback?: string | null;
  criteriaScores?: { name: string; maxMarks: number; score: number }[] | null; competencyResult?: string | null; annotations?: ({ start: number; end: number; quote: string; comment: string } | { assetId: string; page: number; comment: string })[] | null;
  feedbackFiles?: AssignmentFile[]; versionCount: number;
};
type Group = { id: string; name: string; size: number; full: boolean; mine: boolean; members: { userId: string; fullName: string }[] };
type CourseItem = { id: string; title: string };

const fmt = (iso: string) => new Date(iso).toLocaleString();

export default function StudentAssignments() {
  const userName = useCurrentUserName();
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [courseId, setCourseId] = useState("");
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => { apiFetch<CourseItem[]>("/me/courses").then((c) => { setCourses(c); if (c[0]) setCourseId(c[0].id); }).catch((e) => setError(e.message)); }, []);
  const load = useCallback(() => {
    if (!courseId) return;
    setCards(null);
    apiFetch<Card[]>(`/assignments/course/${courseId}`).then(setCards).catch((e) => setError(e.message));
  }, [courseId]);
  useEffect(load, [load]);

  const statusOf = (c: Card) => {
    if (c.mine && !c.mine.isDraft) return c.mine.graded ? (c.mine.gradeWithheld ? <Badge tone="neutral">Graded — awaiting release</Badge> : <Badge tone="ok">{c.mine.score}/{c.totalMarks}</Badge>) : c.mine.needsRegrade ? <Badge tone="warn">Resubmitted</Badge> : <Badge tone="neutral">Submitted v{c.mine.versionCount}{c.mine.isLate ? " (late)" : ""}</Badge>;
    if (c.mine?.isDraft) return <Badge tone="warn">Draft saved</Badge>;
    if (c.window.state === "CLOSED") return <Badge tone="danger">Closed</Badge>;
    if (c.window.state === "LATE") return <Badge tone="warn">Late</Badge>;
    return <Badge tone="neutral">Open</Badge>;
  };

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <div className="space-y-6">
        <PortalSection title="Assignment Centre" action={
          <select className="input !w-auto" value={courseId} onChange={(e) => { setCourseId(e.target.value); setOpenId(null); }} aria-label="Course">
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>}>
          {error && <p className="mb-3 text-sm text-red-700" role="alert">{error}</p>}
          {!cards ? <p className="text-sm text-ink/60">Loading…</p> : cards.length === 0 ? <p className="text-sm text-ink/60">No assignments have been published for this course yet.</p> : (
            <ul className="divide-y divide-line">
              {cards.map((c) => (
                <li key={c.id} className="py-4">
                  <button className="flex w-full items-start justify-between gap-4 text-left" onClick={() => setOpenId(openId === c.id ? null : c.id)} aria-expanded={openId === c.id}>
                    <span>
                      <span className="block font-medium">{c.title} <span className="font-mono text-xs text-ink/50">{c.category}{c.mode === "GROUP" ? " · group" : ""}</span></span>
                      <span className="block text-xs text-ink/60">Due {fmt(c.effectiveDueAt)}{c.extension?.status === "APPROVED" ? " (extended)" : ""} · {c.totalMarks} marks{c.weightPercent ? ` · ${c.weightPercent}% of grade` : ""}</span>
                    </span>
                    {statusOf(c)}
                  </button>
                  {openId === c.id && <Detail card={c} onChanged={load} />}
                </li>
              ))}
            </ul>
          )}
        </PortalSection>
      </div>
    </PortalShell>
  );
}

function Detail({ card, onChanged }: { card: Card; onChanged: () => void }) {
  const [mine, setMine] = useState<Mine | null>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<AssignmentFile[]>([]);
  const [aiAssisted, setAiAssisted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupName, setGroupName] = useState("");
  const [extDate, setExtDate] = useState("");
  const [extReason, setExtReason] = useState("");
  const dirty = useRef(false);

  const reload = useCallback(async () => {
    const m = await apiFetch<Mine | null>(`/assignments/${card.id}/mine`).catch(() => null);
    setMine(m);
    if (m && !dirty.current) { setText(m.textAnswer ?? ""); setFiles(m.files ?? []); }
    if (card.mode === "GROUP") apiFetch<Group[]>(`/assignments/${card.id}/groups`).then(setGroups).catch(() => undefined);
  }, [card.id, card.mode]);
  useEffect(() => { reload(); }, [reload]);

  const handedIn = !!mine && !mine.isDraft;
  const canSubmit = !handedIn ? card.window.state === "OPEN" || card.window.state === "LATE" : !!card.mine?.canResubmit;
  const inGroup = groups.some((g) => g.mine);

  // ASG017 — autosave a draft every 20s while the student is typing and nothing is handed in yet.
  useEffect(() => {
    if (handedIn || !canSubmit || !dirty.current) return;
    const t = setInterval(async () => {
      if (!dirty.current) return;
      try { await apiFetch(`/assignments/${card.id}/draft`, { method: "PUT", body: JSON.stringify({ textAnswer: text, fileAssetIds: files.map((f) => f.id) }) }); dirty.current = false; setMsg({ ok: true, text: `Draft saved ${new Date().toLocaleTimeString()}` }); } catch { /* retry next tick */ }
    }, 20_000);
    return () => clearInterval(t);
  }, [handedIn, canSubmit, text, files, card.id]);

  async function pick(list: FileList | null) {
    if (!list?.length) return;
    setMsg(null);
    for (const f of Array.from(list)) {
      if (files.length >= card.maxFiles) { setMsg({ ok: false, text: `At most ${card.maxFiles} file(s) may be attached.` }); break; }
      try { setProgress(0); const up = await uploadAssignmentFile(card.id, f, setProgress); dirty.current = true; setFiles((cur) => [...cur, up]); }
      catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Upload failed." }); }
      finally { setProgress(null); }
    }
  }

  async function send(draft: boolean) {
    setBusy(true); setMsg(null);
    try {
      const body = JSON.stringify({ textAnswer: text || null, fileAssetIds: files.map((f) => f.id), aiAssisted });
      const r = await apiFetch<{ receipt?: string; saved?: boolean }>(`/assignments/${card.id}/${draft ? "draft" : "submit"}`, { method: draft ? "PUT" : "POST", body });
      dirty.current = false;
      setMsg({ ok: true, text: draft ? "Draft saved." : r.receipt ?? "Submitted." });
      await reload(); if (!draft) onChanged();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." }); } finally { setBusy(false); }
  }

  async function act(path: string, body?: unknown) {
    setMsg(null);
    try { await apiFetch(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }); await reload(); onChanged(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." }); }
  }

  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4 text-sm">
      <p className="whitespace-pre-wrap">{card.instructions}</p>
      <ul className="space-y-1 text-xs text-ink/70">
        <li>{card.window.reason}</li>
        {card.lateMode === "PENALTY" && <li>Late penalty: {card.latePenaltyPctPerDay}% per day, up to {card.latePenaltyMaxPct}%{card.cutoffAt ? `; closes ${fmt(card.cutoffAt)}` : ""}.</li>}
        {card.lateMode === "ACCEPT" && <li>Late work is accepted without penalty{card.cutoffAt ? ` until ${fmt(card.cutoffAt)}` : ""}.</li>}
        {card.allowFiles && <li>Up to {card.maxFiles} file(s), {card.maxFileMb} MB each{card.allowedKinds.length ? `; accepted: ${card.allowedKinds.join(", ")}` : ""}{card.requireEvidence ? "; evidence required" : ""}.</li>}
        <li>{card.maxResubmissions ? `You may resubmit up to ${card.maxResubmissions} time(s).` : "Resubmission is not allowed."}</li>
        {card.competencyBased && <li>Marked Competent / Not yet competent.</li>}
      </ul>

      {card.rubricCriteria && (
        <details className="border border-line p-3"><summary className="cursor-pointer font-medium">Marking rubric</summary>
          <ul className="mt-2 space-y-1">{card.rubricCriteria.map((r) => <li key={r.name}><strong>{r.name}</strong> ({r.maxMarks}){r.description ? ` — ${r.description}` : ""}</li>)}</ul>
        </details>
      )}

      {card.mode === "GROUP" && (
        <div className="border border-line p-3">
          <p className="font-medium">Group work (up to {card.maxGroupSize} members) — one hand-in, one shared grade.</p>
          {groups.length === 0 && <p className="text-xs text-ink/60">No groups yet.</p>}
          <ul className="mt-2 space-y-2">{groups.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-2">
              <span>{g.name} <span className="text-xs text-ink/60">({g.size}/{card.maxGroupSize}: {g.members.map((m) => m.fullName).join(", ") || "empty"})</span></span>
              {g.mine ? <button className="btn-secondary !px-3 !py-1" disabled={handedIn} onClick={() => act(`/assignments/${card.id}/groups/leave`)}>Leave</button>
                : !inGroup && !g.full && !handedIn && <button className="btn-secondary !px-3 !py-1" onClick={() => act(`/assignments/groups/${g.id}/join`)}>Join</button>}
            </li>))}</ul>
          {!inGroup && !handedIn && (
            <div className="mt-3 flex gap-2"><input className="input" placeholder="New group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
              <button className="btn-secondary whitespace-nowrap" disabled={groupName.trim().length < 2} onClick={() => { act(`/assignments/${card.id}/groups`, { name: groupName.trim() }); setGroupName(""); }}>Create</button></div>)}
        </div>
      )}

      {canSubmit && (card.mode !== "GROUP" || inGroup) && (
        <div className="space-y-3">
          {card.allowText && <textarea className="input min-h-[160px]" placeholder="Type your answer…" value={text} onChange={(e) => { dirty.current = true; setText(e.target.value); }} aria-label="Typed answer" />}
          {card.allowFiles && (
            <div>
              <input type="file" multiple onChange={(e) => { pick(e.target.files); e.target.value = ""; }} aria-label="Attach files" />
              {progress !== null && <p className="text-xs text-ink/60">Uploading… {progress}%</p>}
              <ul className="mt-2 space-y-1">{files.map((f) => (
                <li key={f.id} className="flex items-center justify-between"><span>{f.name} <span className="text-xs text-ink/50">({Math.max(1, Math.round(f.sizeBytes / 1024))} KB)</span></span>
                  <button className="text-xs underline" onClick={() => { dirty.current = true; setFiles((cur) => cur.filter((x) => x.id !== f.id)); }}>Remove</button></li>))}</ul>
            </div>
          )}
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={aiAssisted} onChange={(e) => setAiAssisted(e.target.checked)} /> I used AI assistance and I am declaring it.</label>
          <div className="flex gap-3">
            <button className="btn-primary" disabled={busy} onClick={() => send(false)}>{handedIn ? "Resubmit" : "Hand in"}</button>
            {!handedIn && <button className="btn-secondary" disabled={busy} onClick={() => send(true)}>Save draft</button>}
          </div>
        </div>
      )}

      {!canSubmit && !handedIn && card.window.state === "CLOSED" && card.extension?.status !== "REQUESTED" && !card.mine && (
        <p className="text-xs text-red-700">{card.window.reason}</p>
      )}

      {!handedIn && card.window.state !== "NOT_OPEN" && card.extension?.status !== "APPROVED" && (!card.extension || card.extension.status === "REQUESTED") && (
        <details className="border border-line p-3"><summary className="cursor-pointer font-medium">{card.extension ? "Extension requested — update" : "Request an extension"}</summary>
          <div className="mt-2 space-y-2">
            <input type="datetime-local" className="input" value={extDate} onChange={(e) => setExtDate(e.target.value)} aria-label="Requested new deadline" />
            <textarea className="input" placeholder="Why do you need more time? (10+ characters)" value={extReason} onChange={(e) => setExtReason(e.target.value)} />
            <button className="btn-secondary" disabled={!extDate || extReason.trim().length < 10} onClick={() => act(`/assignments/${card.id}/extension-request`, { requestedDueAt: dateTimeLocalToIso(extDate), reason: extReason.trim() })}>Send request</button>
          </div>
        </details>
      )}

      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-green-800" : "text-red-700"}`}>{msg.text}</p>}

      {handedIn && mine && (
        <div className="space-y-3 border border-line p-3">
          <p className="font-medium">Your hand-in (version {mine.versionCount})</p>
          {mine.textAnswer && <p className="max-h-40 overflow-auto whitespace-pre-wrap bg-ink/5 p-2 text-xs">{mine.textAnswer}</p>}
          <ul className="space-y-1">{mine.files.map((f) => <li key={f.id}><button className="underline" onClick={() => openStoredFile(f.id)}>{f.name}</button></li>)}</ul>
          {mine.versions.length > 1 && <details><summary className="cursor-pointer text-xs">Version history</summary><ul className="mt-1 text-xs">{mine.versions.map((v) => <li key={v.versionNo}>v{v.versionNo} — {fmt(v.submittedAt)}{v.isLate ? " (late)" : ""}, {v.fileCount} file(s)</li>)}</ul></details>}
          {mine.gradeWithheld && <p className="text-xs text-ink/60">Your work has been marked. Results will appear once your trainer releases them.</p>}
          {mine.graded && !mine.gradeWithheld && (
            <div className="space-y-2">
              <p className="font-medium">{mine.competencyResult ? mine.competencyResult.replace(/_/g, " ").toLowerCase() : `${mine.score} / ${mine.totalMarks}`}{mine.latePenaltyPct ? ` (after ${mine.latePenaltyPct}% late penalty from ${mine.rawScore})` : ""}</p>
              {mine.criteriaScores && <ul className="text-xs">{mine.criteriaScores.map((c) => <li key={c.name}>{c.name}: {c.score}/{c.maxMarks}</li>)}</ul>}
              {mine.feedback && <p className="whitespace-pre-wrap bg-ink/5 p-2">{mine.feedback}</p>}
              {mine.annotations && mine.annotations.length > 0 && <ul className="space-y-1 text-xs">{mine.annotations.map((a, i) => <li key={i}>{"assetId" in a ? <><strong>PDF page {a.page}:</strong> {a.comment}</> : <><em>“{a.quote}”</em> — {a.comment}</>}</li>)}</ul>}
              {mine.feedbackFiles?.map((f) => <button key={f.id} className="block underline" onClick={() => openStoredFile(f.id)}>Feedback file: {f.name}</button>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
