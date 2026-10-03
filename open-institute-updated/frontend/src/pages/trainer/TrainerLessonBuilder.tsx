import { FormEvent, useEffect, useRef, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { CoursePicker, StudentPicker } from "../../components/portal/TrainerPickers";
import LessonView from "../../components/LessonView";
import TrainerLessonExtras from "../../components/lesson/TrainerLessonExtras";
import { apiFetch, uploadMedia, uploadScormPackage, useCurrentUserName, UploadedMedia } from "../../lib/api";
import { BlockType, LessonBlock, MediaInfo, newBlock } from "../../lib/lessonTypes";
import { moveLesson, moveModule, nudgeLesson, structurePayload } from "../../lib/outlineOps";
import { trainerLinks as links } from "./trainerLinks";
import { useConfirm } from "../../components/portal/useConfirm";

// TP006 / TP007 — the lesson builder: a course outline you can reorder by
// dragging, and a block-based lesson editor with real media upload (video,
// audio, images, documents), a student-view preview, publish/draft control
// and version history with restore.

type ContentType = "video" | "reading" | "interactive" | "scorm";
type OutlineLesson = { id: string; title: string; order: number; contentType: ContentType; durationMins: number | null; isPublished: boolean; approvalStatus: string; blockCount: number; hasMedia: boolean };
type OutlineModule = { id: string; title: string; order: number; lessons: OutlineLesson[] };
type Outline = { course: { id: string; title: string; unit: { id: string; code: string; title: string; learningOutcomes: string[] } }; modules: OutlineModule[] };
type FullLesson = {
  id: string; title: string; contentType: ContentType; contentUrl: string | null; contentBody: string | null; blocks: LessonBlock[] | null;
  mediaAssetId: string | null; isPublished: boolean; approvalStatus: string; durationMins: number | null; outcomesCovered: string[];
  mediaMap: Record<string, MediaInfo>; versionCount: number; tags?: string[]; offlineAvailable?: boolean;
};
type Draft = { title: string; contentType: ContentType; durationMins: string; outcomesCovered: string[]; blocks: LessonBlock[]; mediaAssetId: string | null; contentUrl: string; isPublished: boolean; tags: string; offlineAvailable: boolean };
type Version = { id: string; version: number; editedAt: string; wasApproved: boolean };

const BLOCK_LABELS: Record<BlockType, string> = {
  heading: "Heading", text: "Text", image: "Image", video: "Video", audio: "Audio", file: "File / document",
  callout: "Callout", code: "Code", link: "Link", divider: "Divider",
};
const ACCEPT: Record<string, string> = {
  image: "image/png,image/jpeg,image/gif,image/webp",
  video: "video/mp4,video/webm,video/quicktime,video/ogg",
  audio: "audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm",
  file: ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip",
};

function toDraft(l: FullLesson): Draft {
  const blocks: LessonBlock[] = l.blocks && l.blocks.length > 0 ? l.blocks : l.contentBody ? [{ ...newBlock("text"), markdown: l.contentBody } as LessonBlock] : [];
  return {
    title: l.title, contentType: l.contentType, durationMins: l.durationMins ? String(l.durationMins) : "",
    outcomesCovered: l.outcomesCovered, blocks, mediaAssetId: l.mediaAssetId, contentUrl: l.contentUrl ?? "", isPublished: l.isPublished,
    tags: (l.tags ?? []).join(", "), offlineAvailable: l.offlineAvailable ?? false,
  };
}

function validateDraft(d: Draft): string | null {
  if (d.title.trim().length < 2) return "Give the lesson a title.";
  for (let i = 0; i < d.blocks.length; i++) {
    const b = d.blocks[i];
    const at = `Block ${i + 1} (${BLOCK_LABELS[b.type]})`;
    if (b.type === "heading" && !b.text.trim()) return `${at} needs some text.`;
    if (b.type === "callout" && !b.text.trim()) return `${at} needs some text.`;
    if (b.type === "link" && (!b.label.trim() || !/^https?:\/\//i.test(b.url))) return `${at} needs a label and an http(s) link.`;
    if ((b.type === "image" || b.type === "video" || b.type === "audio" || b.type === "file") && !b.mediaAssetId && !b.url) return `${at} needs an uploaded file or a link.`;
    if ((b.type === "image" || b.type === "video" || b.type === "audio" || b.type === "file") && b.url && !/^https?:\/\//i.test(b.url)) return `${at}: the link must start with http:// or https://.`;
  }
  if (d.contentUrl.trim() && !/^https?:\/\//i.test(d.contentUrl.trim())) return "The main content link must start with http:// or https://.";
  return null;
}

const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function TrainerLessonBuilder() {
  const [confirm, confirmDialog] = useConfirm();
  const userName = useCurrentUserName();
  const [courseId, setCourseId] = useState("");
  const [outline, setOutline] = useState<Outline | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [full, setFull] = useState<FullLesson | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState("");
  const [mediaMap, setMediaMap] = useState<Record<string, MediaInfo>>({});
  const [library, setLibrary] = useState<UploadedMedia[]>([]);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [newLessonTitle, setNewLessonTitle] = useState("");
  const [templates, setTemplates] = useState<{ id: string; name: string; description: string | null; contentType: string; shared: boolean }[]>([]);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [renamingModule, setRenamingModule] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const dragRef = useRef<{ kind: "lesson" | "module"; id: string } | null>(null);

  const dirty = !!draft && JSON.stringify(draft) !== baseline;

  async function loadOutline(id = courseId) {
    if (!id) return;
    try {
      setOutline(await apiFetch<Outline>(`/content/course/${id}/outline`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the course outline.");
    }
  }
  async function loadLibrary(id = courseId) {
    if (!id) return;
    apiFetch<UploadedMedia[]>(`/media/mine?courseId=${id}`).then(setLibrary).catch(() => setLibrary([]));
  }

  useEffect(() => {
    setOutline(null); setSelectedId(null); setFull(null); setDraft(null); setError(null); setMsg(null);
    if (courseId) { void loadOutline(courseId); void loadLibrary(courseId); apiFetch<typeof templates>("/lms/templates").then(setTemplates).catch(() => setTemplates([])); }
  }, [courseId]);

  // CNT047 — create a new (unpublished) lesson in a module from a saved template.
  async function addFromTemplate(templateId: string, moduleId: string) {
    if (!templateId) return;
    setError(null); setMsg(null);
    try {
      const lesson = await apiFetch<{ id: string }>(`/lms/templates/${templateId}/use`, { method: "POST", body: JSON.stringify({ moduleId }) });
      setAddingIn(null);
      await loadOutline();
      await openLesson(lesson.id);
      setMsg("Lesson created from the template — it is unpublished until you publish it.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not use that template.");
    }
  }

  async function openLesson(id: string) {
    if (dirty && !window.confirm("You have unsaved changes to this lesson. Discard them?")) return;
    setError(null); setMsg(null); setPreview(false); setVersions(null);
    try {
      const l = await apiFetch<FullLesson>(`/content/lessons/${id}/full`);
      const d = toDraft(l);
      setSelectedId(id); setFull(l); setDraft(d); setBaseline(JSON.stringify(d)); setMediaMap(l.mediaMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the lesson.");
    }
  }

  // ---- outline actions ------------------------------------------------------
  async function applyStructure(next: OutlineModule[]) {
    if (!outline) return;
    const before = outline;
    setOutline({ ...outline, modules: next });
    try {
      await apiFetch(`/content/course/${courseId}/structure`, { method: "PUT", body: JSON.stringify(structurePayload(next)) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the new order.");
      setOutline(before);
      void loadOutline();
    }
  }
  function dropOnLesson(targetModuleId: string, targetLessonId: string) {
    const d = dragRef.current; dragRef.current = null;
    if (!d || !outline || d.id === targetLessonId) return;
    if (d.kind === "lesson") void applyStructure(moveLesson(outline.modules, d.id, targetModuleId, targetLessonId));
  }
  function dropOnModule(targetModuleId: string) {
    const d = dragRef.current; dragRef.current = null;
    if (!d || !outline) return;
    if (d.kind === "lesson") void applyStructure(moveLesson(outline.modules, d.id, targetModuleId, null));
    else if (d.id !== targetModuleId) void applyStructure(moveModule(outline.modules, d.id, targetModuleId));
  }

  async function addModule(e: FormEvent) {
    e.preventDefault();
    if (!newModuleTitle.trim()) return;
    try {
      await apiFetch("/content/modules", { method: "POST", body: JSON.stringify({ courseId, title: newModuleTitle.trim() }) });
      setNewModuleTitle("");
      await loadOutline();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not add the module."); }
  }
  async function renameModule(id: string) {
    if (renameValue.trim().length < 2) return setRenamingModule(null);
    try {
      await apiFetch(`/content/modules/${id}`, { method: "PATCH", body: JSON.stringify({ title: renameValue.trim() }) });
      setRenamingModule(null);
      await loadOutline();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not rename the module."); }
  }
  async function deleteModule(m: OutlineModule) {
    if (!(await confirm({ title: "Delete this module?", body: `"${m.title}"${m.lessons.length ? ` and its ${m.lessons.length} lesson(s)` : ""} will be removed.`, confirmLabel: "Delete", danger: true }))) return;
    try {
      await apiFetch(`/content/modules/${m.id}`, { method: "DELETE" });
    } catch (err) {
      if (err instanceof Error && window.confirm(`${err.message}\n\nDelete anyway?`)) {
        await apiFetch(`/content/modules/${m.id}?force=true`, { method: "DELETE" }).catch((e2: unknown) => setError(e2 instanceof Error ? e2.message : "Could not delete."));
      } else return;
    }
    if (full && m.lessons.some((l) => l.id === full.id)) { setSelectedId(null); setFull(null); setDraft(null); }
    await loadOutline();
  }
  async function addLesson(e: FormEvent, moduleId: string) {
    e.preventDefault();
    if (newLessonTitle.trim().length < 2) return;
    try {
      const created = await apiFetch<{ id: string }>("/content/lessons", { method: "POST", body: JSON.stringify({ moduleId, title: newLessonTitle.trim(), contentType: "reading" }) });
      setNewLessonTitle(""); setAddingIn(null);
      await loadOutline();
      await openLesson(created.id);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not add the lesson."); }
  }

  // ---- lesson actions -----------------------------------------------------------
  function patchDraft(p: Partial<Draft>) { setDraft((d) => (d ? { ...d, ...p } : d)); }
  function setBlocks(fn: (b: LessonBlock[]) => LessonBlock[]) { setDraft((d) => (d ? { ...d, blocks: fn(d.blocks) } : d)); }
  function updateBlock(id: string, p: Partial<LessonBlock>) { setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...p } as LessonBlock) : b))); }
  function moveBlock(id: string, dir: -1 | 1) {
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id); const j = i + dir;
      if (i < 0 || j < 0 || j >= bs.length) return bs;
      const next = bs.slice(); [next[i], next[j]] = [next[j], next[i]]; return next;
    });
  }
  function registerMedia(info: UploadedMedia) {
    setMediaMap((m) => ({ ...m, [info.id]: { id: info.id, kind: info.kind, mimeType: info.mimeType, name: info.name, sizeBytes: info.sizeBytes, url: info.url } }));
    void loadLibrary();
  }

  async function save(overrides: Partial<Draft> = {}) {
    if (!full || !draft) return;
    const d = { ...draft, ...overrides };
    const problem = validateDraft(d);
    if (problem) return setError(problem);
    setSaving(true); setError(null); setMsg(null);
    try {
      await apiFetch(`/content/lessons/${full.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: d.title.trim(), contentType: d.contentType, contentUrl: d.contentUrl.trim() || null, mediaAssetId: d.mediaAssetId,
          blocks: d.blocks, durationMins: d.durationMins ? Number(d.durationMins) : null, outcomesCovered: d.outcomesCovered, isPublished: d.isPublished,
          tags: d.tags.split(",").map((t) => t.trim()).filter(Boolean), offlineAvailable: d.offlineAvailable,
        }),
      });
      const fresh = await apiFetch<FullLesson>(`/content/lessons/${full.id}/full`);
      const nd = toDraft(fresh);
      setFull(fresh); setDraft(nd); setBaseline(JSON.stringify(nd)); setMediaMap(fresh.mediaMap); setVersions(null);
      setMsg(fresh.approvalStatus === "pending_review" ? "Saved. Students keep seeing the last approved version until QA approves this change." : d.isPublished ? "Saved and visible to students." : "Saved as a draft — students can't see it yet.");
      await loadOutline();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the lesson.");
    } finally { setSaving(false); }
  }

  async function deleteLesson() {
    if (!full || !(await confirm({ title: "Delete this lesson?", body: `"${full.title}" will be removed.`, confirmLabel: "Delete", danger: true }))) return;
    try {
      await apiFetch(`/content/lessons/${full.id}`, { method: "DELETE" });
    } catch (err) {
      if (err instanceof Error && window.confirm(`${err.message}\n\nDelete anyway?`)) {
        await apiFetch(`/content/lessons/${full.id}?force=true`, { method: "DELETE" }).catch((e2: unknown) => setError(e2 instanceof Error ? e2.message : "Could not delete."));
      } else return;
    }
    setSelectedId(null); setFull(null); setDraft(null);
    await loadOutline();
  }
  async function duplicateLesson() {
    if (!full) return;
    try {
      const copy = await apiFetch<{ id: string }>(`/content/lessons/${full.id}/duplicate`, { method: "POST" });
      await loadOutline();
      await openLesson(copy.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not duplicate."); }
  }
  async function loadVersions() {
    if (!full) return;
    try {
      const v = await apiFetch<Version[]>(`/content/lessons/${full.id}/versions`);
      setVersions(v.slice().reverse());
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the history."); }
  }
  async function restore(v: Version) {
    if (!full || !window.confirm(`Restore version ${v.version}? The current content is saved to the history first.`)) return;
    try {
      await apiFetch(`/content/lessons/${full.id}/versions/${v.id}/restore`, { method: "POST" });
      setBaseline(""); // force reload without the unsaved-changes prompt
      const fresh = await apiFetch<FullLesson>(`/content/lessons/${full.id}/full`);
      const nd = toDraft(fresh);
      setFull(fresh); setDraft(nd); setBaseline(JSON.stringify(nd)); setMediaMap(fresh.mediaMap); setVersions(null);
      setMsg("Version restored.");
      await loadOutline();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not restore that version."); }
  }

  const unit = outline?.course.unit;

  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      {confirmDialog}
      <h1 className="font-display text-2xl">Lesson builder</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Build your course as modules and lessons. Drag lessons (or use the arrows) to reorder them, and compose each lesson from
        text, images, video, audio and documents. New lessons stay drafts until you publish them.
      </p>

      <div className="mt-4 max-w-md"><CoursePicker value={courseId} onChange={setCourseId} /></div>
      {courseId && <CompletionRulePanel courseId={courseId} />}
      {courseId && <CertificateIssuePanel courseId={courseId} />}
      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {courseId && !outline && !error && <p className="mt-6 text-sm text-ink/50">Loading course…</p>}

      {outline && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(280px,340px)_1fr]">
          {/* ---------------- outline ---------------- */}
          <div className="space-y-3">
            {outline.modules.length === 0 && <p className="text-sm text-ink/50">This course has no modules yet — add the first one below.</p>}
            {outline.modules.map((m, mi) => (
              <div
                key={m.id}
                className="border border-line bg-white"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); dropOnModule(m.id); }}
              >
                <div
                  className="flex items-center justify-between gap-2 border-b border-line bg-paper px-3 py-2"
                  draggable
                  onDragStart={() => { dragRef.current = { kind: "module", id: m.id }; }}
                >
                  {renamingModule === m.id ? (
                    <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={() => void renameModule(m.id)} onKeyDown={(e) => { if (e.key === "Enter") void renameModule(m.id); }} className="input py-1" />
                  ) : (
                    <span className="cursor-grab text-sm font-medium" title="Drag to reorder modules">⠿ {mi + 1}. {m.title}</span>
                  )}
                  <span className="flex shrink-0 gap-2 text-xs">
                    <button type="button" className="text-navy underline decoration-dotted" onClick={() => { setRenamingModule(m.id); setRenameValue(m.title); }}>Rename</button>
                    <button type="button" className="text-navy-dark underline decoration-dotted" onClick={() => void deleteModule(m)}>Delete</button>
                  </span>
                </div>
                <ul>
                  {m.lessons.map((l) => (
                    <li
                      key={l.id}
                      draggable
                      onDragStart={(e) => { e.stopPropagation(); dragRef.current = { kind: "lesson", id: l.id }; }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropOnLesson(m.id, l.id); }}
                      className={`flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-sm last:border-b-0 ${selectedId === l.id ? "bg-navy/[0.07]" : ""}`}
                    >
                      <button type="button" onClick={() => void openLesson(l.id)} className="min-w-0 flex-1 truncate text-left hover:underline" title={l.title}>
                        <span className="cursor-grab text-ink/35">⠿ </span>{l.title}
                      </button>
                      <span className="flex shrink-0 items-center gap-1">
                        {!l.isPublished && <Badge tone="neutral">draft</Badge>}
                        {l.isPublished && l.approvalStatus === "pending_review" && <Badge tone="warn">review</Badge>}
                        <button type="button" aria-label="Move up" className="px-1 text-ink/50 hover:text-ink" onClick={() => void applyStructure(nudgeLesson(outline.modules, l.id, -1))}>↑</button>
                        <button type="button" aria-label="Move down" className="px-1 text-ink/50 hover:text-ink" onClick={() => void applyStructure(nudgeLesson(outline.modules, l.id, 1))}>↓</button>
                      </span>
                    </li>
                  ))}
                  {m.lessons.length === 0 && <li className="px-3 py-3 text-xs text-ink/40">Drop a lesson here, or add one below.</li>}
                </ul>
                <div className="border-t border-line px-3 py-2">
                  {addingIn === m.id ? (
                    <form onSubmit={(e) => void addLesson(e, m.id)} className="flex gap-2">
                      <input autoFocus value={newLessonTitle} onChange={(e) => setNewLessonTitle(e.target.value)} placeholder="Lesson title" className="input py-1.5" />
                      <button type="submit" className="btn-primary px-3 py-1.5">Add</button>
                      {templates.length > 0 && (
                        <select aria-label="Start from a template" className="input w-40 py-1.5 text-xs" value="" onChange={(e) => void addFromTemplate(e.target.value, m.id)}>
                          <option value="">From template…</option>
                          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.shared ? " (shared)" : ""}</option>)}
                        </select>
                      )}
                    </form>
                  ) : (
                    <button type="button" className="text-xs text-navy underline decoration-dotted" onClick={() => { setAddingIn(m.id); setNewLessonTitle(""); }}>+ Add lesson</button>
                  )}
                </div>
              </div>
            ))}
            <form onSubmit={addModule} className="flex gap-2">
              <input value={newModuleTitle} onChange={(e) => setNewModuleTitle(e.target.value)} placeholder="New module title" className="input" />
              <button type="submit" className="btn-secondary shrink-0">+ Module</button>
            </form>
          </div>

          {/* ---------------- editor ---------------- */}
          <div>
            {!draft || !full ? (
              <p className="border border-dashed border-line p-8 text-center text-sm text-ink/45">Select a lesson to edit it, or add a new one.</p>
            ) : (
              <div className="space-y-5">
                <PortalSection
                  title={preview ? "Preview — as students see it" : "Lesson"}
                  action={
                    <div className="flex items-center gap-3 text-xs">
                      {dirty && <span className="text-gold-dark">Unsaved changes</span>}
                      <button type="button" className="text-navy underline decoration-dotted" onClick={() => setPreview((p) => !p)}>{preview ? "Back to editing" : "Preview"}</button>
                    </div>
                  }
                >
                  {preview ? (
                    <div>
                      <h2 className="mb-4 font-display text-xl">{draft.title}</h2>
                      <LessonView lesson={{ title: draft.title, contentType: draft.contentType, blocks: draft.blocks, contentUrl: draft.contentUrl || null, media: draft.mediaAssetId ? mediaMap[draft.mediaAssetId] ?? null : null, mediaMap }} />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-[1fr_160px_130px]">
                        <label className="block"><span className="text-sm font-medium text-ink/80">Title</span>
                          <input value={draft.title} onChange={(e) => patchDraft({ title: e.target.value })} className="input mt-1.5" /></label>
                        <label className="block"><span className="text-sm font-medium text-ink/80">Type</span>
                          <select value={draft.contentType} onChange={(e) => patchDraft({ contentType: e.target.value as ContentType })} className="input mt-1.5">
                            <option value="reading">Reading</option><option value="video">Video</option><option value="interactive">Interactive</option><option value="scorm">SCORM package</option>
                          </select></label>
                        <label className="block"><span className="text-sm font-medium text-ink/80">Minutes</span>
                          <input type="number" min={1} value={draft.durationMins} onChange={(e) => patchDraft({ durationMins: e.target.value })} placeholder="auto" className="input mt-1.5" /></label>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                        <label className="block"><span className="text-sm font-medium text-ink/80">Tags <span className="font-normal text-ink/45">(comma-separated — powers the content library search, LMS007)</span></span>
                          <input value={draft.tags} onChange={(e) => patchDraft({ tags: e.target.value })} placeholder="e.g. safety, welding, semester-1" className="input mt-1.5" /></label>
                        <label className="mt-1.5 flex items-center gap-2 self-end pb-2 text-sm text-ink/80">
                          <input type="checkbox" checked={draft.offlineAvailable} onChange={(e) => patchDraft({ offlineAvailable: e.target.checked })} />
                          Available offline
                        </label>
                      </div>

                      {full.approvalStatus === "pending_review" && (
                        <p className="border-l-4 border-gold-dark/60 bg-gold/15 px-3 py-2 text-xs">Awaiting QA approval — students still see the previous approved version of this lesson.</p>
                      )}

                      <div className="border border-line p-3">
                        <p className="text-sm font-medium text-ink/80">Main media <span className="font-normal text-ink/45">(optional — a lecture video or document shown first)</span></p>
                        <div className="mt-2">
                          <MediaField
                            kind={draft.contentType === "video" ? "video" : "file"} courseId={courseId} library={library} mediaMap={mediaMap}
                            mediaId={draft.mediaAssetId ?? undefined} url={draft.contentUrl || undefined}
                            onUploaded={(info) => { registerMedia(info); patchDraft({ mediaAssetId: info.id, contentUrl: "" }); }}
                            onLink={(url) => patchDraft({ contentUrl: url, mediaAssetId: null })}
                            onClear={() => patchDraft({ mediaAssetId: null, contentUrl: "" })}
                            onError={setError}
                          />
                        </div>
                      </div>

                      {draft.contentType === "scorm" && <ScormUploadPanel lessonId={full.id} />}

                      <div className="border border-line">
                        <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-ink/80" aria-expanded={extrasOpen} onClick={() => setExtrasOpen((v) => !v)}>
                          <span>Materials, scheduling, templates &amp; reviews</span><span aria-hidden>{extrasOpen ? "−" : "+"}</span>
                        </button>
                        {extrasOpen && <div className="border-t border-line p-3"><TrainerLessonExtras key={full.id} lessonId={full.id} courseId={courseId} onChanged={() => void loadOutline()} /></div>}
                      </div>

                      {unit && unit.learningOutcomes.length > 0 && (
                        <fieldset className="border border-line p-3">
                          <legend className="px-1 text-sm font-medium text-ink/80">Learning outcomes this lesson covers</legend>
                          <div className="space-y-1">
                            {unit.learningOutcomes.map((o) => (
                              <label key={o} className="flex items-start gap-2 text-sm">
                                <input type="checkbox" className="mt-1" checked={draft.outcomesCovered.includes(o)}
                                  onChange={(e) => patchDraft({ outcomesCovered: e.target.checked ? [...draft.outcomesCovered, o] : draft.outcomesCovered.filter((x) => x !== o) })} />
                                {o}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      )}

                      <div>
                        <p className="text-sm font-medium text-ink/80">Content</p>
                        <div className="mt-2 space-y-3">
                          {draft.blocks.length === 0 && <p className="text-sm text-ink/45">No content yet — add a block below.</p>}
                          {draft.blocks.map((b, i) => (
                            <div key={b.id} className="border border-line bg-paper/60 p-3">
                              <div className="mb-2 flex items-center justify-between">
                                <span className="font-mono text-xs uppercase tracking-wide text-ink/50">{BLOCK_LABELS[b.type]}</span>
                                <span className="flex gap-2 text-xs">
                                  <button type="button" disabled={i === 0} onClick={() => moveBlock(b.id, -1)} className="text-navy disabled:opacity-30">↑</button>
                                  <button type="button" disabled={i === draft.blocks.length - 1} onClick={() => moveBlock(b.id, 1)} className="text-navy disabled:opacity-30">↓</button>
                                  <button type="button" onClick={() => setBlocks((bs) => bs.filter((x) => x.id !== b.id))} className="text-navy-dark underline decoration-dotted">Remove</button>
                                </span>
                              </div>
                              <BlockEditor block={b} courseId={courseId} library={library} mediaMap={mediaMap} onChange={(p) => updateBlock(b.id, p)} onUploaded={registerMedia} onError={setError} />
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(Object.keys(BLOCK_LABELS) as BlockType[]).map((t) => (
                            <button key={t} type="button" onClick={() => setBlocks((bs) => [...bs, newBlock(t)])} className="rounded-sm border border-line bg-white px-2.5 py-1 text-xs hover:border-navy">+ {BLOCK_LABELS[t]}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </PortalSection>

                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" disabled={saving || !dirty} onClick={() => void save()} className="btn-primary">{saving ? "Saving…" : "Save"}</button>
                  {draft.isPublished ? (
                    <button type="button" disabled={saving} onClick={() => void save({ isPublished: false })} className="btn-secondary">Unpublish (make draft)</button>
                  ) : (
                    <button type="button" disabled={saving} onClick={() => void save({ isPublished: true })} className="btn-secondary">Save &amp; publish</button>
                  )}
                  <Badge tone={draft.isPublished ? "ok" : "neutral"}>{draft.isPublished ? "published" : "draft"}</Badge>
                  <span className="ml-auto flex gap-3 text-xs">
                    <button type="button" className="text-navy underline decoration-dotted" onClick={() => void duplicateLesson()}>Duplicate</button>
                    <button type="button" className="text-navy-dark underline decoration-dotted" onClick={() => void deleteLesson()}>Delete lesson</button>
                  </span>
                </div>
                {msg && <p className="text-xs text-forest">{msg}</p>}

                <PortalSection
                  title="Version history"
                  action={<button type="button" className="text-xs text-navy underline decoration-dotted" onClick={() => void loadVersions()}>{versions ? "Refresh" : `Show (${full.versionCount})`}</button>}
                >
                  {!versions && <p className="text-sm text-ink/45">Every content change is kept, so you can go back to an earlier version.</p>}
                  {versions && versions.length === 0 && <p className="text-sm text-ink/45">No earlier versions yet.</p>}
                  {versions && versions.length > 0 && (
                    <ul className="divide-y divide-line">
                      {versions.map((v) => (
                        <li key={v.id} className="flex items-center justify-between py-2 text-sm">
                          <span>Version {v.version} · {new Date(v.editedAt).toLocaleString()} {v.wasApproved ? "" : <Badge tone="warn">unreviewed</Badge>}</span>
                          <button type="button" className="text-xs text-navy underline decoration-dotted" onClick={() => void restore(v)}>Restore</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </PortalSection>
              </div>
            )}
          </div>
        </div>
      )}
    </PortalShell>
  );
}

// ------------------------------------------------------------------- block editing
function BlockEditor({
  block, courseId, library, mediaMap, onChange, onUploaded, onError,
}: {
  block: LessonBlock; courseId: string; library: UploadedMedia[]; mediaMap: Record<string, MediaInfo>;
  onChange: (p: Partial<LessonBlock>) => void; onUploaded: (m: UploadedMedia) => void; onError: (m: string | null) => void;
}) {
  switch (block.type) {
    case "heading":
      return (
        <div className="flex gap-2">
          <select value={block.level} onChange={(e) => onChange({ level: Number(e.target.value) === 3 ? 3 : 2 })} className="input w-28"><option value={2}>Large</option><option value={3}>Small</option></select>
          <input value={block.text} onChange={(e) => onChange({ text: e.target.value })} placeholder="Heading" className="input" />
        </div>
      );
    case "text":
      return (
        <div>
          <textarea rows={6} value={block.markdown} onChange={(e) => onChange({ markdown: e.target.value })} className="input" placeholder="Write the lesson text. Blank line = new paragraph. Use - for bullets, **bold**, *italic*, [link](https://…)." />
        </div>
      );
    case "callout":
      return (
        <div className="flex gap-2">
          <select value={block.tone} onChange={(e) => onChange({ tone: e.target.value as "info" | "warning" | "tip" })} className="input w-32"><option value="info">Note</option><option value="tip">Tip</option><option value="warning">Warning</option></select>
          <textarea rows={2} value={block.text} onChange={(e) => onChange({ text: e.target.value })} className="input" placeholder="Callout text" />
        </div>
      );
    case "code":
      return (
        <div className="space-y-2">
          <input value={block.language ?? ""} onChange={(e) => onChange({ language: e.target.value })} placeholder="Language (optional)" className="input w-48" />
          <textarea rows={5} value={block.code} onChange={(e) => onChange({ code: e.target.value })} className="input font-mono text-xs" placeholder="Code or commands" />
        </div>
      );
    case "link":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={block.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="Link text" className="input" />
          <input value={block.url} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://…" className="input" />
        </div>
      );
    case "divider":
      return <hr className="border-line" />;
    case "image":
    case "video":
    case "audio":
    case "file":
      return (
        <div className="space-y-2">
          <MediaField
            kind={block.type} courseId={courseId} library={library} mediaMap={mediaMap} mediaId={block.mediaAssetId} url={block.url}
            onUploaded={(info) => { onUploaded(info); onChange({ mediaAssetId: info.id, url: undefined }); }}
            onLink={(url) => onChange({ url, mediaAssetId: undefined })}
            onClear={() => onChange({ mediaAssetId: undefined, url: undefined })}
            onError={onError}
          />
          {block.type === "image" && <input value={block.alt} onChange={(e) => onChange({ alt: e.target.value })} placeholder="Describe the image (for screen readers)" className="input" />}
          {block.type === "file" ? (
            <input value={block.label ?? ""} onChange={(e) => onChange({ label: e.target.value })} placeholder="Label shown to students" className="input" />
          ) : (
            <input value={block.caption ?? ""} onChange={(e) => onChange({ caption: e.target.value })} placeholder="Caption (optional)" className="input" />
          )}
        </div>
      );
  }
}

function MediaField({
  kind, courseId, library, mediaMap, mediaId, url, onUploaded, onLink, onClear, onError,
}: {
  kind: "image" | "video" | "audio" | "file"; courseId: string; library: UploadedMedia[]; mediaMap: Record<string, MediaInfo>;
  mediaId?: string; url?: string; onUploaded: (m: UploadedMedia) => void; onLink: (url: string) => void; onClear: () => void; onError: (m: string | null) => void;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [linkValue, setLinkValue] = useState("");
  const current = mediaId ? mediaMap[mediaId] : undefined;
  const libraryKind = kind === "file" ? ["document", "archive"] : [kind];
  const options = library.filter((m) => libraryKind.includes(m.kind));

  async function onFile(file: File | undefined) {
    if (!file) return;
    onError(null);
    setProgress(0);
    try {
      onUploaded(await uploadMedia(file, courseId, setProgress));
    } catch (e) {
      onError(e instanceof Error ? e.message : "The upload failed.");
    } finally {
      setProgress(null);
    }
  }

  if (mediaId || url) {
    return (
      <div className="flex items-center justify-between gap-3 border border-line bg-white px-3 py-2 text-sm">
        <span className="min-w-0 truncate">
          {current ? <>📎 {current.name} <span className="text-xs text-ink/45">({fmtSize(current.sizeBytes)})</span></> : mediaId ? "Uploaded file" : <span className="break-all">🔗 {url}</span>}
        </span>
        <button type="button" onClick={onClear} className="shrink-0 text-xs text-navy-dark underline decoration-dotted">Remove</button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input type="file" accept={ACCEPT[kind]} disabled={progress !== null} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} className="block w-full text-xs" />
      {progress !== null && (
        <div className="h-2 w-full bg-ink/10"><div className="h-2 bg-navy transition-all" style={{ width: `${progress}%` }} /></div>
      )}
      {progress !== null && <p className="text-xs text-ink/50">Uploading… {progress}%{progress === 100 ? " — finishing" : ""}</p>}
      <div className="flex gap-2">
        <input value={linkValue} onChange={(e) => setLinkValue(e.target.value)} placeholder={kind === "video" ? "…or paste a YouTube / Vimeo / video link" : "…or paste a link"} className="input py-1.5" />
        <button type="button" className="btn-secondary shrink-0 px-3 py-1.5" disabled={!/^https?:\/\//i.test(linkValue.trim())} onClick={() => { onLink(linkValue.trim()); setLinkValue(""); }}>Use link</button>
      </div>
      {options.length > 0 && (
        <select className="input py-1.5" value="" onChange={(e) => { const m = options.find((o) => o.id === e.target.value); if (m) onUploaded(m); }}>
          <option value="">…or pick something you already uploaded</option>
          {options.map((m) => <option key={m.id} value={m.id}>{m.name} ({fmtSize(m.sizeBytes)})</option>)}
        </select>
      )}
    </div>
  );
}

// LMS022 — SCORM package upload. Only usable once the lesson has been
// saved (needs a real lessonId), which the "Type" selector already implies
// since a new lesson is created as "reading" and saved before you can
// switch it to SCORM in this editor.
function ScormUploadPanel({ lessonId }: { lessonId: string }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ launchUrl: string; manifestTitle: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      const uploaded = await uploadScormPackage(file, lessonId, setProgress);
      setResult(uploaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload failed.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="border border-line p-3">
      <p className="text-sm font-medium text-ink/80">SCORM package <span className="font-normal text-ink/45">(a .zip exported from your authoring tool — Articulate, iSpring, etc.)</span></p>
      <div className="mt-2 space-y-2">
        <input type="file" accept=".zip" disabled={progress !== null} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} className="block w-full text-xs" />
        {progress !== null && (
          <div className="h-2 w-full bg-ink/10"><div className="h-2 bg-navy transition-all" style={{ width: `${progress}%` }} /></div>
        )}
        {progress !== null && <p className="text-xs text-ink/50">Uploading… {progress}%{progress === 100 ? " — extracting on the server" : ""}</p>}
        {error && <p className="text-xs text-navy-dark">{error}</p>}
        {result && <p className="text-xs text-forest">Package uploaded — students will launch "{result.manifestTitle ?? "the package"}".</p>}
      </div>
    </div>
  );
}

// LMS019 — completion rules. A collapsed-by-default panel so it doesn't
// crowd the outline editor most visits don't need to touch.
function CompletionRulePanel({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);
  const [rule, setRule] = useState<{ minLessonPercent: number; requirePassingAssessments: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ minLessonPercent: number; requirePassingAssessments: boolean }>(`/content/courses/${courseId}/completion-rule`)
      .then(setRule)
      .catch(() => setRule({ minLessonPercent: 100, requirePassingAssessments: true }));
  }, [courseId]);

  async function saveRule() {
    if (!rule) return;
    setSaving(true); setMsg(null);
    try {
      await apiFetch(`/content/courses/${courseId}/completion-rule`, { method: "PUT", body: JSON.stringify(rule) });
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save.");
    } finally { setSaving(false); }
  }

  return (
    <div className="mt-3 max-w-md border border-line bg-white text-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full px-3 py-2 text-left font-medium text-ink/80">
        {open ? "▾" : "▸"} What counts as "completed" for this course (LMS019)
      </button>
      {open && rule && (
        <div className="space-y-3 border-t border-line px-3 py-3">
          <label className="block">
            <span className="text-ink/70">Minimum % of lessons marked complete</span>
            <input type="number" min={0} max={100} value={rule.minLessonPercent} onChange={(e) => setRule({ ...rule, minLessonPercent: Number(e.target.value) })} className="input mt-1 w-24" />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={rule.requirePassingAssessments} onChange={(e) => setRule({ ...rule, requirePassingAssessments: e.target.checked })} />
            Must also pass every assessment in this course
          </label>
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={saving} onClick={saveRule}>{saving ? "Saving…" : "Save rule"}</button>
          {msg && <span className="ml-2 text-xs text-ink/50">{msg}</span>}
        </div>
      )}
    </div>
  );
}

// LMS036 — issue a course completion certificate to a student on this
// roster. Revocation and the institution-wide list live on the registrar's
// AdminCourses page (REGISTRAR/SUPER_ADMIN only) — issuance is here because
// only the trainer's own roster is available to pick from.
function CertificateIssuePanel({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [grade, setGrade] = useState("PASS");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function issue() {
    if (!studentId) return;
    setBusy(true); setMsg(null);
    try {
      await apiFetch(`/courses/${courseId}/certificates/${studentId}`, { method: "POST", body: JSON.stringify({ grade }) });
      setMsg("Certificate issued.");
      setStudentId("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not issue the certificate — they may already have one for this course.");
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-3 max-w-md border border-line bg-white text-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full px-3 py-2 text-left font-medium text-ink/80">
        {open ? "▾" : "▸"} Issue a course certificate (LMS036)
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-3 py-3">
          <StudentPicker courseId={courseId} value={studentId} onChange={setStudentId} by="studentId" label="Student" />
          <label className="block">
            <span className="text-ink/70">Grade</span>
            <select value={grade} onChange={(e) => setGrade(e.target.value)} className="input mt-1">
              <option value="PASS">Pass</option>
              <option value="MERIT">Merit</option>
              <option value="DISTINCTION">Distinction</option>
            </select>
          </label>
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={busy || !studentId} onClick={issue}>{busy ? "Issuing…" : "Issue certificate"}</button>
          {msg && <span className="ml-2 text-xs text-ink/50">{msg}</span>}
        </div>
      )}
    </div>
  );
}
