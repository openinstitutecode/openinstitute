import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

// Batch 77 — CNT025/045/051/052/057/058/059: what a student can do alongside a lesson —
// bookmark it, keep private notes, and download the materials attached to it.
// Opening the component records one view (the server ignores repeats within 10 minutes).

type Attachment = { id: string; label: string; downloadable: boolean; version: number; name: string; sizeBytes: number; kind: string; previewUrl: string };
type Note = { id: string; body: string; updatedAt: string };

export default function StudentLessonTools({ lessonId }: { lessonId: string }) {
  const [bookmarked, setBookmarked] = useState(false);
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [draft, setDraft] = useState("");
  const [edit, setEdit] = useState<{ id: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadNotes = useCallback(() => apiFetch<Note[]>(`/lms/lessons/${lessonId}/notes`).then(setNotes).catch(() => undefined), [lessonId]);

  useEffect(() => {
    apiFetch(`/lms/lessons/${lessonId}/view`, { method: "POST" }).catch(() => undefined);
    apiFetch<{ bookmarked: boolean }>(`/lms/lessons/${lessonId}/state`).then((s) => setBookmarked(s.bookmarked)).catch(() => undefined);
    apiFetch<Attachment[]>(`/lms/lessons/${lessonId}/attachments`).then(setAtts).catch(() => setAtts([]));
    void loadNotes();
  }, [lessonId, loadNotes]);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "Something went wrong.");

  async function toggleBookmark() {
    setError(null);
    try { const r = await apiFetch<{ bookmarked: boolean }>(`/lms/lessons/${lessonId}/bookmark`, { method: "POST" }); setBookmarked(r.bookmarked); } catch (e) { fail(e); }
  }
  async function addNote() {
    setError(null);
    try { await apiFetch(`/lms/lessons/${lessonId}/notes`, { method: "POST", body: JSON.stringify({ body: draft }) }); setDraft(""); await loadNotes(); } catch (e) { fail(e); }
  }
  async function saveEdit() {
    if (!edit) return;
    try { await apiFetch(`/lms/notes/${edit.id}`, { method: "PATCH", body: JSON.stringify({ body: edit.body }) }); setEdit(null); await loadNotes(); } catch (e) { fail(e); }
  }
  async function removeNote(id: string) { try { await apiFetch(`/lms/notes/${id}`, { method: "DELETE" }); await loadNotes(); } catch (e) { fail(e); } }
  async function download(a: Attachment) {
    setError(null);
    try { const r = await apiFetch<{ url: string }>(`/lms/attachments/${a.id}/download`, { method: "POST" }); window.open(r.url, "_blank", "noopener"); } catch (e) { fail(e); }
  }

  return (
    <div className="mt-4 space-y-4 border-t border-line pt-3 text-sm">
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={toggleBookmark} aria-pressed={bookmarked} className={bookmarked ? "btn-primary !px-3 !py-1.5" : "btn-secondary !px-3 !py-1.5"}>{bookmarked ? "★ Saved" : "☆ Save lesson"}</button>
        <button type="button" onClick={() => setShowNotes((v) => !v)} aria-expanded={showNotes} className="btn-secondary !px-3 !py-1.5">My notes ({notes.length})</button>
      </div>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}

      {atts.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink/50">Lesson materials</p>
          <ul className="space-y-1">
            {atts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3">
                <span>{a.label} <span className="text-xs text-ink/50">— {a.name}, {Math.max(1, Math.round(a.sizeBytes / 1024))} KB{a.version > 1 ? `, updated (v${a.version})` : ""}</span></span>
                {a.downloadable ? <button type="button" className="text-xs underline" onClick={() => download(a)}>Download</button> : <span className="text-xs text-ink/50">View only</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showNotes && (
        <div className="space-y-3 border border-line p-3">
          <p className="text-xs text-ink/60">Only you can see these notes.</p>
          <div className="flex gap-2">
            <textarea className="input min-h-[64px]" placeholder="Write a note about this lesson…" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="New note" />
            <button type="button" className="btn-primary self-start" disabled={!draft.trim()} onClick={addNote}>Add</button>
          </div>
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="border-t border-line pt-2">
                {edit?.id === n.id ? (
                  <div className="space-y-2">
                    <textarea className="input" value={edit.body} onChange={(e) => setEdit({ id: n.id, body: e.target.value })} aria-label="Edit note" />
                    <div className="flex gap-2"><button type="button" className="btn-primary !py-1" onClick={saveEdit}>Save</button><button type="button" className="btn-secondary !py-1" onClick={() => setEdit(null)}>Cancel</button></div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <p className="mt-1 flex gap-3 text-xs text-ink/50">{new Date(n.updatedAt).toLocaleString()}
                      <button type="button" className="underline" onClick={() => setEdit({ id: n.id, body: n.body })}>Edit</button>
                      <button type="button" className="underline" onClick={() => removeNote(n.id)}>Delete</button></p>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
