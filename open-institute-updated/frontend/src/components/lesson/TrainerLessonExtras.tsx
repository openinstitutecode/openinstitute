import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, dateTimeLocalToIso, isoToDateTimeLocal, uploadMedia } from "../../lib/api";

// Batch 77 — the trainer's side of a lesson: attachments (CNT025/045/056/057), category + tags (CNT054/055),
// scheduled publishing (CNT030), student notification (CNT044), save-as-template (CNT047) and reviewer
// feedback (CNT043). Every panel talks to the /api/lms routes; nothing here is local-only.

type Meta = { id: string; isPublished: boolean; publishAt: string | null; category: string | null; tags: string[]; lastNotifiedAt: string | null };
type Attachment = { id: string; label: string; downloadable: boolean; audience: "ENROLLED" | "STAFF"; version: number; name: string; sizeBytes: number; assetId: string };
type Review = { id: string; authorId: string; body: string; status: "OPEN" | "RESOLVED"; createdAt: string };

type Props = { lessonId: string; courseId: string; onChanged?: () => void };

export default function TrainerLessonExtras({ lessonId, courseId, onChanged }: Props) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const [audience, setAudience] = useState<"ENROLLED" | "STAFF">("ENROLLED");
  const [downloadable, setDownloadable] = useState(true);
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [publishAt, setPublishAt] = useState("");
  const [notice, setNotice] = useState("");
  const [tplName, setTplName] = useState("");
  const [tplShared, setTplShared] = useState(false);
  const [review, setReview] = useState("");
  const replaceFor = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  const say = (ok: boolean, text: string) => setMsg({ ok, text });
  const fail = (e: unknown) => say(false, e instanceof Error ? e.message : "Something went wrong.");

  const load = useCallback(async () => {
    try {
      const m = await apiFetch<Meta>(`/lms/lessons/${lessonId}/meta`);
      setMeta(m); setCategory(m.category ?? ""); setTags(m.tags.join(", ")); setPublishAt(isoToDateTimeLocal(m.publishAt));
    } catch (e) { fail(e); }
    apiFetch<Attachment[]>(`/lms/lessons/${lessonId}/attachments`).then(setAtts).catch(() => setAtts([]));
    apiFetch<Review[]>(`/lms/lessons/${lessonId}/reviews`).then(setReviews).catch(() => setReviews([]));
  }, [lessonId]);
  useEffect(() => { setMsg(null); void load(); }, [load]);

  async function addFile(file: File | undefined) {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const up = await uploadMedia(file, courseId, setProgress);
      await apiFetch(`/lms/lessons/${lessonId}/attachments`, { method: "POST", body: JSON.stringify({ assetId: up.id, label: label.trim() || file.name, downloadable, audience }) });
      setLabel(""); say(true, "Material attached."); await load();
    } catch (e) { fail(e); } finally { setBusy(false); setProgress(null); }
  }
  async function replaceFile(file: File | undefined) {
    const aid = replaceFor.current;
    if (!file || !aid) return;
    setBusy(true); setMsg(null);
    try {
      const up = await uploadMedia(file, courseId, setProgress);
      await apiFetch(`/lms/attachments/${aid}/replace`, { method: "POST", body: JSON.stringify({ assetId: up.id }) });
      say(true, "File replaced — students now get the new version."); await load();
    } catch (e) { fail(e); } finally { setBusy(false); setProgress(null); replaceFor.current = null; }
  }
  async function patchAtt(a: Attachment, body: object) { try { await apiFetch(`/lms/attachments/${a.id}`, { method: "PATCH", body: JSON.stringify(body) }); await load(); } catch (e) { fail(e); } }
  async function delAtt(a: Attachment) {
    if (!window.confirm(`Remove "${a.label}" from this lesson?`)) return;
    try { await apiFetch(`/lms/attachments/${a.id}`, { method: "DELETE" }); await load(); } catch (e) { fail(e); }
  }
  async function saveMeta() {
    try {
      await apiFetch(`/lms/lessons/${lessonId}/meta`, { method: "PATCH", body: JSON.stringify({ category: category.trim() || null, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) }) });
      say(true, "Category and tags saved."); await load(); onChanged?.();
    } catch (e) { fail(e); }
  }
  async function schedule(clear: boolean) {
    try {
      await apiFetch(`/lms/lessons/${lessonId}/schedule`, { method: "PATCH", body: JSON.stringify({ publishAt: clear ? null : dateTimeLocalToIso(publishAt) }) });
      say(true, clear ? "Scheduled publishing cancelled." : "Scheduled — the lesson goes live at that time and students are notified."); await load(); onChanged?.();
    } catch (e) { fail(e); }
  }
  async function notify() {
    try { const r = await apiFetch<{ notified: number }>(`/lms/lessons/${lessonId}/notify-change`, { method: "POST", body: JSON.stringify({ message: notice.trim() || undefined }) }); say(true, `Notified ${r.notified} student(s).`); setNotice(""); await load(); } catch (e) { fail(e); }
  }
  async function saveTemplate() {
    try { await apiFetch("/lms/templates", { method: "POST", body: JSON.stringify({ name: tplName.trim(), shared: tplShared, fromLessonId: lessonId }) }); say(true, "Template saved. Use it from \"+ Add lesson\" in any module."); setTplName(""); } catch (e) { fail(e); }
  }
  async function addReview() {
    try { await apiFetch(`/lms/lessons/${lessonId}/reviews`, { method: "POST", body: JSON.stringify({ body: review }) }); setReview(""); await load(); } catch (e) { fail(e); }
  }
  async function resolve(r: Review) { try { await apiFetch(`/lms/reviews/${r.id}/resolve`, { method: "PATCH", body: JSON.stringify({ reopen: r.status === "RESOLVED" }) }); await load(); } catch (e) { fail(e); } }

  if (!meta) return <p className="text-sm text-ink/50">{msg?.text ?? "Loading lesson tools…"}</p>;
  const open = reviews.filter((r) => r.status === "OPEN").length;

  return (
    <div className="space-y-4 text-sm">
      {msg && <p role="status" className={msg.ok ? "text-green-800" : "text-red-700"}>{msg.text}</p>}

      <section className="space-y-2 border border-line p-3" aria-label="Attachments">
        <p className="font-medium text-ink/80">Downloadable materials</p>
        <ul className="space-y-2">
          {atts.length === 0 && <li className="text-xs text-ink/50">Nothing attached yet.</li>}
          {atts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
              <span>{a.label} <span className="text-xs text-ink/50">— {a.name}, {Math.max(1, Math.round(a.sizeBytes / 1024))} KB, v{a.version}</span></span>
              <span className="flex flex-wrap items-center gap-3 text-xs">
                <label><input type="checkbox" checked={a.downloadable} onChange={(e) => patchAtt(a, { downloadable: e.target.checked })} /> Downloadable</label>
                <select value={a.audience} onChange={(e) => patchAtt(a, { audience: e.target.value })} aria-label="Who can see this file"><option value="ENROLLED">Students &amp; staff</option><option value="STAFF">Staff only</option></select>
                <button type="button" className="underline" disabled={busy} onClick={() => { replaceFor.current = a.id; replaceRef.current?.click(); }}>Replace file</button>
                <button type="button" className="underline" onClick={() => delAtt(a)}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-2">
          <input className="input !w-56" placeholder="Label (e.g. Week 3 slides)" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Attachment label" />
          <select className="input !w-auto" value={audience} onChange={(e) => setAudience(e.target.value as "ENROLLED" | "STAFF")} aria-label="Audience"><option value="ENROLLED">Students &amp; staff</option><option value="STAFF">Staff only</option></select>
          <label className="text-xs"><input type="checkbox" checked={downloadable} onChange={(e) => setDownloadable(e.target.checked)} /> Downloadable</label>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => fileRef.current?.click()}>{busy && progress !== null ? `Uploading ${progress}%` : "Upload file"}</button>
        </div>
        <input ref={fileRef} type="file" hidden onChange={(e) => { void addFile(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={replaceRef} type="file" hidden onChange={(e) => { void replaceFile(e.target.files?.[0]); e.target.value = ""; }} />
      </section>

      <section className="space-y-2 border border-line p-3" aria-label="Category and tags">
        <p className="font-medium text-ink/80">Category &amp; tags</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="input" placeholder="Category (e.g. Theory, Practical)" value={category} onChange={(e) => setCategory(e.target.value)} />
          <input className="input" placeholder="Tags, comma separated" value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
        <button type="button" className="btn-secondary" onClick={saveMeta}>Save</button>
      </section>

      <section className="space-y-2 border border-line p-3" aria-label="Scheduling and notices">
        <p className="font-medium text-ink/80">Publishing &amp; notices</p>
        {meta.isPublished ? (
          <div className="space-y-2">
            <p className="text-xs text-ink/60">This lesson is live.{meta.lastNotifiedAt ? ` Students were last notified ${new Date(meta.lastNotifiedAt).toLocaleString()}.` : ""}</p>
            <div className="flex gap-2"><input className="input" placeholder="What changed? (optional)" value={notice} onChange={(e) => setNotice(e.target.value)} /><button type="button" className="btn-secondary whitespace-nowrap" onClick={notify}>Notify students</button></div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input type="datetime-local" className="input !w-auto" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} aria-label="Publish at" />
            <button type="button" className="btn-secondary" disabled={!publishAt} onClick={() => schedule(false)}>Schedule</button>
            {meta.publishAt && <><span className="text-xs text-ink/60">Goes live {new Date(meta.publishAt).toLocaleString()}</span><button type="button" className="text-xs underline" onClick={() => schedule(true)}>Cancel schedule</button></>}
          </div>
        )}
      </section>

      <section className="space-y-2 border border-line p-3" aria-label="Template">
        <p className="font-medium text-ink/80">Save as reusable template</p>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input !w-64" placeholder="Template name" value={tplName} onChange={(e) => setTplName(e.target.value)} />
          <label className="text-xs"><input type="checkbox" checked={tplShared} onChange={(e) => setTplShared(e.target.checked)} /> Share with other trainers</label>
          <button type="button" className="btn-secondary" disabled={tplName.trim().length < 2} onClick={saveTemplate}>Save template</button>
        </div>
      </section>

      <section className="space-y-2 border border-line p-3" aria-label="Reviews">
        <p className="font-medium text-ink/80">Review feedback {open > 0 && <span className="ml-1 text-xs text-gold-dark">{open} open</span>}</p>
        <ul className="space-y-2">
          {reviews.length === 0 && <li className="text-xs text-ink/50">No review comments.</li>}
          {reviews.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 border-b border-line pb-2">
              <span className={r.status === "RESOLVED" ? "text-ink/50 line-through" : ""}>{r.body}<span className="block text-xs text-ink/40">{new Date(r.createdAt).toLocaleString()}</span></span>
              <button type="button" className="whitespace-nowrap text-xs underline" onClick={() => resolve(r)}>{r.status === "RESOLVED" ? "Reopen" : "Resolve"}</button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2"><textarea className="input min-h-[56px]" placeholder="Add review feedback (3+ characters)" value={review} onChange={(e) => setReview(e.target.value)} /><button type="button" className="btn-secondary self-start" disabled={review.trim().length < 3} onClick={addReview}>Add</button></div>
      </section>
    </div>
  );
}
