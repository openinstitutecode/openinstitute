import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { CoursePicker } from "../../components/portal/TrainerPickers";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";
import { LoadingState } from "../../components/portal/StateViews";
import { useConfirm } from "../../components/portal/useConfirm";
import QuestionEditor from "../../components/quiz/QuestionEditor";
import { AnswerInput, Media } from "../../components/quiz/AnswerInput";
import { AttemptsPanel, BankToolsPanel, ExtensionsPanel, MarkingPanel, RegradePanel, ReleasePanel, ReportsPanel } from "../../components/quiz/QuizManagePanels";
import { Quiz, QuestionPayload, StudentQuestion, MANUAL_TYPES, paginate, typeLabelOf } from "../../components/quiz/quizTypes";

// TP011 — the quiz builder: pick or write the questions of a quiz, order them,
// set per-quiz marks, timing, attempts, shuffle, pass mark and feedback,
// preview it as a student, publish it, and read item analysis afterwards.

type QuizSummary = { id: string; title: string; type: string; isDraft: boolean; totalMarks: number; questionCount: number; attempts: number; usesUnitPool: boolean };
type QuizQuestion = { questionId: string; order: number; marks: number; marksOverride: number | null; type: string; prompt: string; options: string[]; correctAnswer: string | null; explanation: string | null; difficulty: string; topic: string | null; approved: boolean };
type BankQuestion = { id: string; type: string; prompt: string; options: string[]; correctAnswer: string | null; explanation: string | null; marks: number; difficulty: string; topic: string | null; approved: boolean; mine: boolean; usedInQuizzes: number; tags: string[]; version: number; archived: boolean };
type PreviewData = { assessment: { title: string; durationMinutes: number | null; instructions: string | null; totalMarks: number; questionsPerPage?: number | null }; questions: StudentQuestion[] };
type Analytics = {
  attempts: number; students: number; gradedAttempts: number; ungradedAttempts: number; meanPercent: number | null; medianPercent: number | null;
  passLinePercent: number; passRatePercent: number | null; distribution: { from: number; to: number; count: number }[];
  highestPercent?: number | null; lowestPercent?: number | null;
  byTopic?: { topic: string; averagePercent: number; questions: number }[];
  questions: { questionId: string; prompt: string; type: string; marks: number; answered: number; correct: number; percentCorrect: number | null; optionCounts: Record<string, number> | null; correctAnswer: string | null; difficultyIndex?: number | null; discrimination?: number | null; flag?: string; openReports?: number }[];
};

type Settings = {
  title: string; instructions: string; durationMinutes: string; maxAttempts: string; scheduledAt: string; passMarkPercent: string; shuffleQuestions: boolean; showFeedbackAfterSubmit: boolean;
  opensAt: string; closesAt: string; gradingMethod: string; questionsPerPage: string; navigationMode: string; markingMode: string; resultVisibility: string;
  answerKeyReleaseAt: string; allowedIntakes: string; shuffleOptions: string; retakeCooldownMins: string; randomRules: string;
};
const rulesToText = (r: Quiz["randomRules"]) => r.map((x) => `${x.count}${x.topic ? ` ${x.topic}` : ""}${x.difficulty ? ` [${x.difficulty}]` : ""}`).join("\n");
function textToRules(t: string): { count: number; topic?: string; difficulty?: string }[] {
  return t.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = /^(\d+)\s*(.*?)\s*(?:\[(easy|medium|hard)\])?$/i.exec(l);
    if (!m) return null;
    return { count: Number(m[1]), ...(m[2] ? { topic: m[2] } : {}), ...(m[3] ? { difficulty: m[3].toLowerCase() } : {}) };
  }).filter((x): x is { count: number; topic?: string; difficulty?: string } => !!x);
}

const pad = (n: number) => String(n).padStart(2, "0");
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const toSettings = (q: Quiz): Settings => ({
  title: q.title, instructions: q.instructions ?? "", durationMinutes: q.durationMinutes ? String(q.durationMinutes) : "", maxAttempts: String(q.maxAttempts),
  scheduledAt: toLocalInput(q.scheduledAt), passMarkPercent: q.passMarkPercent ? String(q.passMarkPercent) : "", shuffleQuestions: q.shuffleQuestions, showFeedbackAfterSubmit: q.showFeedbackAfterSubmit,
  opensAt: toLocalInput(q.opensAt), closesAt: toLocalInput(q.closesAt), gradingMethod: q.gradingMethod, questionsPerPage: q.questionsPerPage ? String(q.questionsPerPage) : "",
  navigationMode: q.navigationMode, markingMode: q.markingMode, resultVisibility: q.resultVisibility, answerKeyReleaseAt: toLocalInput(q.answerKeyReleaseAt),
  allowedIntakes: q.allowedIntakes.join(", "), shuffleOptions: q.shuffleOptions === null ? "auto" : q.shuffleOptions ? "yes" : "no",
  retakeCooldownMins: q.retakeCooldownMins ? String(q.retakeCooldownMins) : "", randomRules: rulesToText(q.randomRules),
});


export default function TrainerQuizBuilder() {
  const [confirm, confirmDialog] = useConfirm();
  const userName = useCurrentUserName();
  const initialCourseId = new URLSearchParams(window.location.search).get("courseId") ?? undefined;
  const [courseId, setCourseId] = useState("");
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsBase, setSettingsBase] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"FORMATIVE_QUIZ" | "CAT">("FORMATIVE_QUIZ");
  const [tab, setTab] = useState<"new" | "bank">("new");
  const [editing, setEditing] = useState<QuizQuestion | null>(null);
  const [bank, setBank] = useState<BankQuestion[] | null>(null);
  const [bankSearch, setBankSearch] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ id: string; current: number; versions: { version: number; editedAt: string; snapshot: { prompt: string } }[] } | null>(null);
  const [panel, setPanel] = useState<null | "marking" | "attempts" | "extensions" | "reports" | "release" | "regrade" | "bank">(null);

  const settingsDirty = !!settings && JSON.stringify(settings) !== settingsBase;
  const fail = (e: unknown, fallback: string) => setError(e instanceof Error ? e.message : fallback);

  async function loadList(id = courseId) {
    if (!id) return;
    try { setQuizzes(await apiFetch<QuizSummary[]>(`/quizzes/course/${id}`)); } catch (e) { fail(e, "Could not load quizzes."); }
  }
  function adopt(q: Quiz) {
    setQuiz(q);
    const s = toSettings(q);
    setSettings(s);
    setSettingsBase(JSON.stringify(s));
  }
  async function openQuiz(id: string) {
    if (settingsDirty && !window.confirm("You have unsaved quiz settings. Discard them?")) return;
    setError(null); setMsg(null); setPreview(null); setAnalytics(null); setEditing(null); setBank(null); setPanel(null);
    try { adopt(await apiFetch<Quiz>(`/quizzes/${id}`)); } catch (e) { fail(e, "Could not open the quiz."); }
  }

  useEffect(() => {
    setQuizzes(null); setQuiz(null); setSettings(null); setError(null); setMsg(null); setPreview(null); setAnalytics(null);
    if (courseId) void loadList(courseId);
  }, [courseId]);

  useEffect(() => {
    if (tab !== "bank" || !courseId) return;
    const t = setTimeout(() => {
      apiFetch<BankQuestion[]>(`/quizzes/bank/${courseId}?q=${encodeURIComponent(bankSearch)}`).then(setBank).catch((e: unknown) => fail(e, "Could not load the question bank."));
    }, 250);
    return () => clearTimeout(t);
  }, [tab, courseId, bankSearch, quiz?.questions.length]);

  async function run<T>(fn: () => Promise<T>, fallback: string, ok?: string): Promise<T | undefined> {
    setBusy(true); setError(null); setMsg(null);
    try {
      const r = await fn();
      if (ok) setMsg(ok);
      return r;
    } catch (e) { fail(e, fallback); return undefined; } finally { setBusy(false); }
  }

  async function createQuiz(e: FormEvent) {
    e.preventDefault();
    const q = await run(() => apiFetch<Quiz>("/quizzes", { method: "POST", body: JSON.stringify({ courseId, title: newTitle.trim(), type: newType }) }), "Could not create the quiz.");
    if (q) { setNewTitle(""); adopt(q); setPreview(null); setAnalytics(null); await loadList(); }
  }

  async function saveSettings() {
    if (!quiz || !settings) return;
    const s = settings;
    const q = await run(
      () => apiFetch<Quiz>(`/quizzes/${quiz.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: s.title.trim(), instructions: s.instructions.trim() || null, durationMinutes: s.durationMinutes ? Number(s.durationMinutes) : null,
          maxAttempts: Number(s.maxAttempts) || 1, scheduledAt: s.scheduledAt ? new Date(s.scheduledAt).toISOString() : null,
          passMarkPercent: s.passMarkPercent ? Number(s.passMarkPercent) : null, shuffleQuestions: s.shuffleQuestions, showFeedbackAfterSubmit: s.showFeedbackAfterSubmit,
          opensAt: s.opensAt ? new Date(s.opensAt).toISOString() : null, closesAt: s.closesAt ? new Date(s.closesAt).toISOString() : null,
          gradingMethod: s.gradingMethod, questionsPerPage: s.questionsPerPage ? Number(s.questionsPerPage) : null, navigationMode: s.navigationMode,
          markingMode: s.markingMode, resultVisibility: s.resultVisibility, answerKeyReleaseAt: s.answerKeyReleaseAt ? new Date(s.answerKeyReleaseAt).toISOString() : null,
          allowedIntakes: s.allowedIntakes.split(",").map((x) => x.trim()).filter(Boolean), shuffleOptions: s.shuffleOptions === "auto" ? null : s.shuffleOptions === "yes",
          retakeCooldownMins: s.retakeCooldownMins ? Number(s.retakeCooldownMins) : 0, randomRules: textToRules(s.randomRules),
        }),
      }),
      "Could not save the settings.", "Settings saved."
    );
    if (q) { adopt(q); await loadList(); }
  }

  async function saveQuestionList(items: { questionId: string; marks: number | null }[]) {
    if (!quiz) return;
    const q = await run(() => apiFetch<Quiz>(`/quizzes/${quiz.id}/questions`, { method: "PUT", body: JSON.stringify({ items }) }), "Could not update the questions.");
    if (q) { setQuiz(q); await loadList(); }
  }
  const asItems = (qs: QuizQuestion[]) => qs.map((x) => ({ questionId: x.questionId, marks: x.marksOverride }));
  function moveQuestion(i: number, dir: -1 | 1) {
    if (!quiz) return;
    const j = i + dir;
    if (j < 0 || j >= quiz.questions.length) return;
    const next = quiz.questions.slice(); [next[i], next[j]] = [next[j], next[i]];
    void saveQuestionList(asItems(next));
  }
  function setMarks(i: number, marks: number) {
    if (!quiz || !Number.isFinite(marks) || marks < 1) return;
    void saveQuestionList(asItems(quiz.questions.map((x, k) => (k === i ? { ...x, marksOverride: Math.round(marks) } : x))));
  }
  function removeQuestion(i: number) {
    if (!quiz) return;
    void saveQuestionList(asItems(quiz.questions.filter((_, k) => k !== i)));
  }
  function addFromBank(b: BankQuestion) {
    if (!quiz || quiz.questions.some((x) => x.questionId === b.id)) return;
    void saveQuestionList([...asItems(quiz.questions), { questionId: b.id, marks: null }]);
  }

  async function submitNewQuestion(payload: QuestionPayload) {
    if (!quiz) return false;
    const q = await run(() => apiFetch<Quiz>(`/quizzes/${quiz.id}/questions/new`, { method: "POST", body: JSON.stringify(payload) }), "Could not add the question.", "Question added.");
    if (q) { setQuiz(q); await loadList(); return true; }
    return false;
  }
  async function submitEdit(payload: QuestionPayload) {
    if (!quiz || !editing) return false;
    const ok = await run(() => apiFetch(`/quizzes/questions/${editing.questionId}`, { method: "PATCH", body: JSON.stringify(payload) }), "Could not save the question.", "Question updated.");
    if (ok !== undefined) {
      setEditing(null);
      adopt(await apiFetch<Quiz>(`/quizzes/${quiz.id}`));
      return true;
    }
    return false;
  }

  async function bankAction(b: BankQuestion, action: "duplicate" | "archive") {
    if (action === "archive" && !(await confirm({ title: "Archive this question?", body: "It leaves the bank but stays on quizzes that already use it.", confirmLabel: "Archive", danger: true }))) return;
    const ok = await run(() => apiFetch(`/quizzes/questions/${b.id}/${action}`, { method: "POST" }), `Could not ${action} the question.`, action === "duplicate" ? "Duplicated — the copy is yours and unapproved." : "Archived.");
    if (ok !== undefined) setBank(null), setBankSearch((x) => x + " "), setBankSearch((x) => x.trim());
  }
  async function openHistory(b: BankQuestion) {
    const r = await run(() => apiFetch<{ current: number; versions: { version: number; editedAt: string; snapshot: { prompt: string } }[] }>(`/quizzes/questions/${b.id}/versions`), "Could not load the history.");
    if (r) setHistory({ id: b.id, ...r });
  }
  async function restoreVersion(version: number) {
    if (!history) return;
    const ok = await run(() => apiFetch(`/quizzes/questions/${history.id}/restore-version`, { method: "POST", body: JSON.stringify({ version }) }), "Could not restore that version.", `Restored version ${version} (needs exam-office approval again).`);
    if (ok !== undefined) { setHistory(null); setBank(null); setBankSearch((x) => x + " "); setBankSearch((x) => x.trim()); }
  }

  async function publish() {
    if (!quiz) return;
    const q = await run(() => apiFetch<Quiz>(`/quizzes/${quiz.id}/publish`, { method: "POST" }), "Could not publish.", "Published — enrolled students can now take this quiz.");
    if (q) { setQuiz(q); await loadList(); }
  }
  async function unpublish() {
    if (!quiz) return;
    const q = await run(() => apiFetch<Quiz>(`/quizzes/${quiz.id}/unpublish`, { method: "POST" }), "Could not unpublish.", "Back to draft — students can't see it.");
    if (q) { setQuiz(q); await loadList(); }
  }
  async function duplicate() {
    if (!quiz) return;
    const q = await run(() => apiFetch<Quiz>(`/quizzes/${quiz.id}/duplicate`, { method: "POST" }), "Could not duplicate.");
    if (q) { adopt(q); setPreview(null); setAnalytics(null); await loadList(); }
  }
  async function remove() {
    if (!quiz || !(await confirm({ title: "Delete this quiz?", body: `"${quiz.title}" will be removed.`, confirmLabel: "Delete", danger: true }))) return;
    const done = await run(() => apiFetch(`/quizzes/${quiz.id}`, { method: "DELETE" }).then(() => true), "Could not delete.");
    if (done) { setQuiz(null); setSettings(null); await loadList(); }
  }
  async function showPreview() {
    if (!quiz) return;
    const p = await run(() => apiFetch<PreviewData>(`/quizzes/${quiz.id}/preview`), "Could not build the preview.");
    if (p) { setPreview(p); setAnalytics(null); }
  }
  async function showAnalytics() {
    if (!quiz) return;
    const a = await run(() => apiFetch<Analytics>(`/quizzes/${quiz.id}/analytics`), "Could not load the analysis.");
    if (a) { setAnalytics(a); setPreview(null); }
  }

  const set = (p: Partial<Settings>) => setSettings((s) => (s ? { ...s, ...p } : s));
  const inQuiz = new Set(quiz?.questions.map((q) => q.questionId));

  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      {confirmDialog}
      <h1 className="font-display text-2xl">Quiz builder</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Build a quiz from your unit's question bank or write new questions. Set the time limit, attempts, pass mark and whether
        students see the answers afterwards. Quizzes start as drafts; students only see them once you publish.
      </p>

      <div className="mt-4 max-w-md"><CoursePicker value={courseId} initialCourseId={initialCourseId} onChange={setCourseId} /></div>
      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}
      {msg && <p className="mt-4 text-sm text-forest">{msg}</p>}

      {courseId && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(260px,320px)_1fr]">
          {/* ---- list ---- */}
          <div className="space-y-3">
            <button type="button" className="text-xs text-navy underline decoration-dotted" onClick={() => setPanel(panel === "bank" ? null : "bank")}>Question bank: import / export CSV</button>
            {panel === "bank" && <BankToolsPanel courseId={courseId} onImported={() => setBank(null)} onClose={() => setPanel(null)} />}
            <PortalSection title="Quizzes">
              {quizzes === null && <LoadingState />}
              {quizzes && quizzes.length === 0 && <p className="text-sm text-ink/45">No quizzes yet.</p>}
              <ul className="divide-y divide-line">
                {quizzes?.map((q) => (
                  <li key={q.id}>
                    <button type="button" onClick={() => void openQuiz(q.id)} className={`flex w-full items-center justify-between gap-2 py-2.5 text-left text-sm hover:underline ${quiz?.id === q.id ? "font-medium" : ""}`}>
                      <span className="min-w-0 truncate">{q.title}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span className="text-xs text-ink/45">{q.usesUnitPool ? "unit pool" : `${q.questionCount}q`}</span>
                        <Badge tone={q.isDraft ? "neutral" : "ok"}>{q.isDraft ? "draft" : "live"}</Badge>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <form onSubmit={createQuiz} className="mt-4 space-y-2 border-t border-line pt-4">
                <input required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="New quiz title" className="input" />
                <select value={newType} onChange={(e) => setNewType(e.target.value === "CAT" ? "CAT" : "FORMATIVE_QUIZ")} className="input">
                  <option value="FORMATIVE_QUIZ">Formative quiz (practice, your own questions)</option>
                  <option value="CAT">CAT (graded; approved questions only)</option>
                </select>
                <button type="submit" disabled={busy} className="btn-primary w-full justify-center">Create quiz</button>
              </form>
            </PortalSection>
          </div>

          {/* ---- editor ---- */}
          <div>
            {!quiz || !settings ? (
              <p className="border border-dashed border-line p-8 text-center text-sm text-ink/45">Select a quiz to edit it, or create a new one.</p>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={quiz.isDraft ? "neutral" : "ok"}>{quiz.isDraft ? "draft" : "published"}</Badge>
                  <span className="text-sm text-ink/60">{quiz.type === "CAT" ? "CAT" : "Formative quiz"} · {quiz.totalMarks} marks · {quiz.attempts} attempt(s)</span>
                  <span className="ml-auto flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => void showPreview()}>Preview</button>
                    {quiz.attempts > 0 && <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => void showAnalytics()}>Results analysis</button>}
                    {quiz.isDraft
                      ? <button type="button" disabled={busy} className="btn-primary px-3 py-1.5" onClick={() => void publish()}>Publish</button>
                      : <button type="button" disabled={busy || quiz.attempts > 0} className="btn-secondary px-3 py-1.5" onClick={() => void unpublish()} title={quiz.attempts > 0 ? "Students have attempted it" : ""}>Unpublish</button>}
                  </span>
                </div>

                {quiz.usesUnitPool && (
                  <p className="border-l-4 border-gold-dark/60 bg-gold/15 px-3 py-2 text-xs">This is an older assessment that draws from every approved question in the unit. Add questions below to give it a fixed question list.</p>
                )}
                {quiz.locked && <p className="border-l-4 border-navy/40 bg-navy/[0.05] px-3 py-2 text-xs">Students have attempted this quiz, so its questions and marks are locked. Duplicate it to make a changed version.</p>}

                {preview && <PreviewPanel data={preview} onClose={() => setPreview(null)} />}
                {analytics && <AnalyticsPanel data={analytics} totalMarks={quiz.totalMarks} onClose={() => setAnalytics(null)} />}

                {!quiz.isDraft && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" role="toolbar" aria-label="Manage this quiz">
                    {([["marking", "Marking queue"], ["attempts", "Attempts & grades"], ["release", "Release results"], ["regrade", "Regrade"], ["extensions", "Extensions"], ["reports", "Error reports"]] as const).map(([k, label]) => (
                      <button key={k} type="button" onClick={() => setPanel(panel === k ? null : k)} className={panel === k ? "font-medium underline" : "text-navy underline decoration-dotted"}>{label}</button>
                    ))}
                  </div>
                )}
                {panel === "marking" && <MarkingPanel quizId={quiz.id} onChanged={() => void loadList()} onClose={() => setPanel(null)} />}
                {panel === "regrade" && <RegradePanel quizId={quiz.id} onChanged={() => void loadList()} onClose={() => setPanel(null)} />}
                {panel === "attempts" && <AttemptsPanel quizId={quiz.id} onClose={() => setPanel(null)} />}
                {panel === "extensions" && <ExtensionsPanel quizId={quiz.id} onClose={() => setPanel(null)} />}
                {panel === "reports" && <ReportsPanel quizId={quiz.id} onClose={() => setPanel(null)} />}
                {panel === "release" && <ReleasePanel quizId={quiz.id} published={quiz.resultsPublished} markingMode={quiz.markingMode} onChanged={() => void openQuiz(quiz.id)} onClose={() => setPanel(null)} />}

                <PortalSection title="Settings" action={settingsDirty ? <span className="text-xs text-gold-dark">Unsaved changes</span> : undefined}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block sm:col-span-2"><span className="text-sm font-medium text-ink/80">Title</span><input value={settings.title} onChange={(e) => set({ title: e.target.value })} className="input mt-1.5" /></label>
                    <label className="block sm:col-span-2"><span className="text-sm font-medium text-ink/80">Instructions for students</span><textarea rows={2} value={settings.instructions} onChange={(e) => set({ instructions: e.target.value })} className="input mt-1.5" /></label>
                    <label className="block"><span className="text-sm font-medium text-ink/80">Time limit (minutes)</span><input type="number" min={1} value={settings.durationMinutes} onChange={(e) => set({ durationMinutes: e.target.value })} placeholder="no limit" className="input mt-1.5" /></label>
                    <label className="block"><span className="text-sm font-medium text-ink/80">Attempts allowed</span><input type="number" min={1} max={20} value={settings.maxAttempts} onChange={(e) => set({ maxAttempts: e.target.value })} className="input mt-1.5" /></label>
                    <label className="block"><span className="text-sm font-medium text-ink/80">Pass mark (%)</span><input type="number" min={1} max={100} value={settings.passMarkPercent} onChange={(e) => set({ passMarkPercent: e.target.value })} placeholder="none" className="input mt-1.5" /></label>
                    <label className="block"><span className="text-sm font-medium text-ink/80">Opens at (optional)</span><input type="datetime-local" value={settings.scheduledAt} onChange={(e) => set({ scheduledAt: e.target.value })} className="input mt-1.5" /></label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.shuffleQuestions} onChange={(e) => set({ shuffleQuestions: e.target.checked })} /> Shuffle questions and options per student</label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.showFeedbackAfterSubmit} onChange={(e) => set({ showFeedbackAfterSubmit: e.target.checked })} /> Show correct answers &amp; explanations after submitting</label>
                  </div>
                  <details className="mt-4 border border-line bg-paper/40 px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium text-ink/80">Availability, grading, navigation &amp; results</summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block"><span className="text-sm">Opens</span><input type="datetime-local" value={settings.opensAt} onChange={(e) => set({ opensAt: e.target.value })} className="input mt-1" /></label>
                      <label className="block"><span className="text-sm">Closes</span><input type="datetime-local" value={settings.closesAt} onChange={(e) => set({ closesAt: e.target.value })} className="input mt-1" /></label>
                      <label className="block sm:col-span-2"><span className="text-sm">Only these intakes/groups (comma separated; blank = everyone enrolled)</span><input value={settings.allowedIntakes} onChange={(e) => set({ allowedIntakes: e.target.value })} className="input mt-1" placeholder="e.g. 2026-Jan, 2026-May" /></label>
                      <label className="block"><span className="text-sm">Official grade from several attempts</span>
                        <select value={settings.gradingMethod} onChange={(e) => set({ gradingMethod: e.target.value })} className="input mt-1"><option value="HIGHEST">Highest attempt</option><option value="AVERAGE">Average of attempts</option><option value="LATEST">Latest attempt</option><option value="FIRST">First attempt</option></select></label>
                      <label className="block"><span className="text-sm">Wait between attempts (minutes)</span><input type="number" min={0} value={settings.retakeCooldownMins} onChange={(e) => set({ retakeCooldownMins: e.target.value })} placeholder="no wait" className="input mt-1" /></label>
                      <label className="block"><span className="text-sm">Questions per page</span><input type="number" min={1} max={100} value={settings.questionsPerPage} onChange={(e) => set({ questionsPerPage: e.target.value })} placeholder="all on one page" className="input mt-1" /></label>
                      <label className="block"><span className="text-sm">Navigation</span>
                        <select value={settings.navigationMode} onChange={(e) => set({ navigationMode: e.target.value })} className="input mt-1"><option value="FREE">Free — students can go back</option><option value="FORWARD_ONLY">Forward only — no going back</option></select></label>
                      <label className="block"><span className="text-sm">Shuffle answer options</span>
                        <select value={settings.shuffleOptions} onChange={(e) => set({ shuffleOptions: e.target.value })} className="input mt-1"><option value="auto">Follow “shuffle questions”</option><option value="yes">Always</option><option value="no">Never</option></select></label>
                      <label className="block"><span className="text-sm">Marking</span>
                        <select value={settings.markingMode} onChange={(e) => set({ markingMode: e.target.value })} className="input mt-1"><option value="IMMEDIATE">Immediate (auto-marked scores show at once)</option><option value="DEFERRED">Deferred (hidden until I release results)</option></select></label>
                      <label className="block"><span className="text-sm">Students see their result</span>
                        <select value={settings.resultVisibility} onChange={(e) => set({ resultVisibility: e.target.value })} className="input mt-1"><option value="IMMEDIATE">Immediately</option><option value="AFTER_CLOSE">After the quiz closes</option><option value="ON_RELEASE">When I release results</option><option value="HIDDEN">Never</option></select></label>
                      <label className="block"><span className="text-sm">Show answers from</span><input type="datetime-local" value={settings.answerKeyReleaseAt} onChange={(e) => set({ answerKeyReleaseAt: e.target.value })} className="input mt-1" /></label>
                      <label className="block sm:col-span-2"><span className="text-sm">Random questions from the unit bank — one rule per line: <code>count [topic] [easy|medium|hard]</code>, e.g. <code>5 Tax [hard]</code></span>
                        <textarea rows={2} value={settings.randomRules} onChange={(e) => set({ randomRules: e.target.value })} className="input mt-1 font-mono text-xs" placeholder={"5 Tax\n3 [hard]"} /></label>
                    </div>
                  </details>
                  <button type="button" disabled={busy || !settingsDirty} onClick={() => void saveSettings()} className="btn-primary mt-4">Save settings</button>
                </PortalSection>

                <PortalSection title={`Questions (${quiz.questions.length})`}>
                  {quiz.questions.length === 0 && <p className="text-sm text-ink/45">No questions yet — write one or add from the bank below.</p>}
                  <ol className="space-y-3">
                    {quiz.questions.map((q, i) => (
                      <li key={q.questionId} className="border border-line bg-paper/60 p-3">
                        {editing?.questionId === q.questionId ? (
                          <QuestionEditor initial={q} submitLabel="Save changes" onSubmit={submitEdit} onCancel={() => setEditing(null)} busy={busy} />
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm"><span className="font-mono text-xs text-ink/45">{i + 1}. </span>{q.prompt}</p>
                              <span className="flex shrink-0 items-center gap-2 text-xs">
                                <button type="button" disabled={quiz.locked || i === 0} onClick={() => moveQuestion(i, -1)} className="text-navy disabled:opacity-30">↑</button>
                                <button type="button" disabled={quiz.locked || i === quiz.questions.length - 1} onClick={() => moveQuestion(i, 1)} className="text-navy disabled:opacity-30">↓</button>
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-ink/50">
                              {typeLabelOf(q.type, q.options)}
                              {q.type === "mcq" && q.correctAnswer && <> · answer: <span className="text-forest">{q.correctAnswer}</span></>}
                              {MANUAL_TYPES.includes(q.type) || !q.autoMarked ? <> · <span className="text-gold-dark">marked by hand</span></> : null}
                              {q.config?.negativeFraction ? <> · −{Math.round(q.config.negativeFraction * 100)}% if wrong</> : null}
                              {q.config?.partialCredit ? <> · partial credit</> : null}
                              {q.tags.length > 0 && <> · {q.tags.map((t) => `#${t}`).join(" ")}</>}
                              {!q.approved && <> · <span className="text-gold-dark">not exam-office approved</span></>}
                            </p>
                            {(q.type === "mcq" || q.type === "mcq_multi") && <ul className="mt-1 list-disc pl-5 text-xs text-ink/60">{q.options.map((o) => <li key={o}>{o}{q.type === "mcq_multi" && q.config?.correct?.includes(o) ? " ✓" : ""}</li>)}</ul>}
                            {q.type === "matching" && <ul className="mt-1 list-disc pl-5 text-xs text-ink/60">{q.config?.pairs?.map((pr) => <li key={pr.left}>{pr.left} → {pr.right}</li>)}</ul>}
                            {q.type === "ordering" && <ol className="mt-1 list-decimal pl-5 text-xs text-ink/60">{q.config?.order?.map((o) => <li key={o}>{o}</li>)}</ol>}
                            {q.type === "fill_blank" && <p className="mt-1 text-xs text-ink/60">Accepted: {q.config?.blanks?.map((b) => b.join(" / ")).join("  ·  ")}</p>}
                            {q.type === "numerical" && q.config?.numeric && <p className="mt-1 text-xs text-ink/60">Answer: {q.config.numeric.answer}{q.config.numeric.unit ? ` ${q.config.numeric.unit}` : ""}{q.config.numeric.tolerance ? ` ± ${q.config.numeric.tolerance}${q.config.numeric.toleranceType === "percent" ? "%" : ""}` : ""}</p>}
                            {q.type === "short_answer" && q.config?.acceptedAnswers && <p className="mt-1 text-xs text-ink/60">Accepted: {q.config.acceptedAnswers.join(" / ")}</p>}
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                              <label className="flex items-center gap-1">Marks
                                <input type="number" min={1} disabled={quiz.locked} defaultValue={q.marks} key={`${q.questionId}-${q.marks}`} onBlur={(e) => { if (Number(e.target.value) !== q.marks) setMarks(i, Number(e.target.value)); }} className="input w-16 py-1" />
                              </label>
                              <button type="button" disabled={quiz.locked} onClick={() => setEditing(q)} className="text-navy underline decoration-dotted disabled:opacity-30">Edit</button>
                              <button type="button" disabled={quiz.locked} onClick={() => removeQuestion(i)} className="text-navy-dark underline decoration-dotted disabled:opacity-30">Remove</button>
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ol>
                </PortalSection>

                {!quiz.locked && (
                  <PortalSection
                    title="Add questions"
                    action={
                      <div className="flex gap-3 text-xs">
                        <button type="button" onClick={() => setTab("new")} className={tab === "new" ? "font-medium underline" : "text-navy underline decoration-dotted"}>Write a new one</button>
                        <button type="button" onClick={() => setTab("bank")} className={tab === "bank" ? "font-medium underline" : "text-navy underline decoration-dotted"}>From the question bank</button>
                      </div>
                    }
                  >
                    {tab === "new" ? (
                      <QuestionEditor submitLabel="Add to quiz" onSubmit={submitNewQuestion} busy={busy} resetOnSuccess />
                    ) : (
                      <div>
                        <input value={bankSearch} onChange={(e) => setBankSearch(e.target.value)} placeholder="Search this unit's questions…" className="input" />
                        {history && (
                          <div className="mt-3 border border-line bg-paper/60 p-3 text-xs">
                            <p className="font-medium">Earlier versions (current is v{history.current})</p>
                            <ul className="mt-1 space-y-1">{history.versions.map((v) => <li key={v.version} className="flex justify-between gap-3"><span>v{v.version} · {new Date(v.editedAt).toLocaleString()} · {v.snapshot.prompt.slice(0, 80)}</span><button type="button" className="text-navy underline decoration-dotted" onClick={() => void restoreVersion(v.version)}>Restore</button></li>)}</ul>
                            <button type="button" className="mt-2 text-navy underline decoration-dotted" onClick={() => setHistory(null)}>Close</button>
                          </div>
                        )}
                        {bank === null && <LoadingState />}
                        {bank && bank.length === 0 && <p className="mt-3 text-sm text-ink/45">No questions found.</p>}
                        <ul className="mt-3 divide-y divide-line">
                          {bank?.map((b) => (
                            <li key={b.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                              <div className="min-w-0">
                                <p>{b.prompt}</p>
                                <p className="text-xs text-ink/50">{typeLabelOf(b.type, b.options)} · {b.marks} mark(s) · {b.difficulty}{b.topic ? ` · ${b.topic}` : ""}{b.approved ? " · approved" : " · unapproved"}{b.tags.length > 0 ? ` · ${b.tags.map((t) => "#" + t).join(" ")}` : ""}{b.usedInQuizzes > 0 ? ` · in ${b.usedInQuizzes} quiz(zes)` : ""}</p>
                              </div>
                              <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
                              <button type="button" disabled={inQuiz.has(b.id) || busy || (quiz.type !== "FORMATIVE_QUIZ" && !b.approved)} onClick={() => addFromBank(b)} className="shrink-0 text-xs text-navy underline decoration-dotted disabled:no-underline disabled:opacity-40">
                                {inQuiz.has(b.id) ? "Added" : quiz.type !== "FORMATIVE_QUIZ" && !b.approved ? "Needs approval" : "Add"}
                              </button>
                              <button type="button" disabled={busy} onClick={() => void bankAction(b, "duplicate")} className="text-navy underline decoration-dotted">Duplicate</button>
                              {b.version > 1 && <button type="button" disabled={busy} onClick={() => void openHistory(b)} className="text-navy underline decoration-dotted">History (v{b.version})</button>}
                              {b.mine && b.usedInQuizzes === 0 && <button type="button" disabled={busy} onClick={() => void bankAction(b, "archive")} className="text-navy-dark underline decoration-dotted">Archive</button>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </PortalSection>
                )}

                <div className="flex gap-4 text-xs">
                  <button type="button" className="text-navy underline decoration-dotted" onClick={() => void duplicate()}>Duplicate quiz</button>
                  <button type="button" className="text-navy-dark underline decoration-dotted" onClick={() => void remove()}>Delete quiz</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </PortalShell>
  );
}

// ------------------------------------------------------------------ question form
function PreviewPanel({ data, onClose }: { data: PreviewData; onClose: () => void }) {
  const pages = paginate(data.questions, data.assessment.questionsPerPage);
  const [page, setPage] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const cur = pages[Math.min(page, pages.length - 1)];
  const offset = pages.slice(0, page).reduce((n, p) => n + p.length, 0);
  return (
    <PortalSection title="Preview — as a student sees it" action={<button type="button" onClick={onClose} className="text-xs text-navy underline decoration-dotted">Close</button>}>
      <h3 className="font-display text-lg">{data.assessment.title}</h3>
      <p className="text-xs text-ink/50">{data.assessment.totalMarks} marks{data.assessment.durationMinutes ? ` · ${data.assessment.durationMinutes} minutes` : ""}</p>
      {data.assessment.instructions && <p className="mt-2 text-sm text-ink/70">{data.assessment.instructions}</p>}
      <ol className="mt-4 space-y-5">
        {cur.map((q, i) => (
          <li key={q.id} className="text-sm">
            {q.stem && <p className="mb-2 whitespace-pre-wrap border-l-4 border-navy/30 bg-paper/60 px-3 py-2 text-ink/80">{q.stem}</p>}
            <p><span className="font-mono text-xs text-ink/45">{offset + i + 1}. </span>{q.prompt} <span className="text-xs text-ink/45">({q.marks})</span></p>
            <Media q={q} />
            <AnswerInput q={q} value={answers[q.id] ?? ""} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
          </li>
        ))}
        {data.questions.length === 0 && <li className="text-sm text-ink/45">No questions yet.</li>}
      </ol>
      {pages.length > 1 && (
        <div className="mt-4 flex items-center gap-3 text-xs">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="text-navy disabled:opacity-30">← Previous</button>
          <span>Page {page + 1} of {pages.length}</span>
          <button type="button" disabled={page >= pages.length - 1} onClick={() => setPage(page + 1)} className="text-navy disabled:opacity-30">Next →</button>
        </div>
      )}
    </PortalSection>
  );
}

const FLAG_LABEL: Record<string, string> = { too_easy: "Too easy", too_hard: "Too hard", poor_discrimination: "Doesn't separate strong from weak", good: "Good", insufficient_data: "" };

function AnalyticsPanel({ data, totalMarks, onClose }: { data: Analytics; totalMarks: number; onClose: () => void }) {
  const max = Math.max(1, ...data.distribution.map((b) => b.count));
  return (
    <PortalSection title="Results analysis" action={<button type="button" onClick={onClose} className="text-xs text-navy underline decoration-dotted">Close</button>}>
      <div className="grid gap-3 text-sm sm:grid-cols-4">
        <div><p className="text-xs text-ink/50">Attempts</p><p className="font-display text-xl">{data.attempts}</p></div>
        <div><p className="text-xs text-ink/50">Average</p><p className="font-display text-xl">{data.meanPercent === null ? "—" : `${data.meanPercent}%`}</p></div>
        <div><p className="text-xs text-ink/50">Pass rate (≥{data.passLinePercent}%)</p><p className="font-display text-xl">{data.passRatePercent === null ? "—" : `${data.passRatePercent}%`}</p></div>
        <div><p className="text-xs text-ink/50">Awaiting your marking</p><p className="font-display text-xl">{data.ungradedAttempts}</p></div>
      </div>
      <div className="mt-5 flex h-24 items-end gap-1" aria-label={`Score distribution out of ${totalMarks}`}>
        {data.distribution.map((b) => (
          <div key={b.from} className="flex flex-1 flex-col items-center justify-end" title={`${b.from}–${b.to}%: ${b.count}`}>
            <div className="w-full bg-navy/70" style={{ height: `${(b.count / max) * 100}%`, minHeight: b.count ? 4 : 0 }} />
            <span className="mt-1 text-[10px] text-ink/45">{b.from}</span>
          </div>
        ))}
      </div>
      <p className="mt-1 text-center text-[10px] text-ink/45">Score band (% of {totalMarks} marks)</p>
      {data.byTopic && data.byTopic.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-ink/60">Weakest topics first</p>
          <ul className="mt-1 space-y-1 text-sm">{data.byTopic.map((t) => <li key={t.topic} className="flex justify-between"><span>{t.topic}</span><span>{t.averagePercent}% <span className="text-xs text-ink/45">({t.questions} q)</span></span></li>)}</ul>
        </div>
      )}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-ink/50"><th className="pb-2 pr-3 font-medium">Question</th><th className="pb-2 pr-3 font-medium">% correct</th><th className="pb-2 pr-3 font-medium">Item quality</th><th className="pb-2 font-medium">Most chosen</th></tr></thead>
          <tbody className="divide-y divide-line">
            {data.questions.map((q) => {
              const top = q.optionCounts ? Object.entries(q.optionCounts).sort((a, b) => b[1] - a[1])[0] : null;
              return (
                <tr key={q.questionId}>
                  <td className="py-2 pr-3">{q.prompt}{q.openReports ? <span className="ml-2"><Badge tone="warn">{q.openReports} report{q.openReports === 1 ? "" : "s"}</Badge></span> : null}</td>
                  <td className="py-2 pr-3">{q.percentCorrect === null ? "marked by hand" : <Badge tone={q.percentCorrect >= 70 ? "ok" : q.percentCorrect >= 40 ? "warn" : "danger"}>{q.percentCorrect}%</Badge>}</td>
                  <td className="py-2 pr-3 text-xs">{q.flag && FLAG_LABEL[q.flag] ? <span className={q.flag === "good" ? "text-forest" : "text-gold-dark"}>{FLAG_LABEL[q.flag]}</span> : "—"}{q.discrimination !== null && q.discrimination !== undefined ? <span className="block text-ink/45">discrimination {q.discrimination}</span> : null}</td>
                  <td className="py-2 text-xs text-ink/60">{top && top[1] > 0 ? `${top[0]} (${top[1]})${top[0] !== q.correctAnswer ? " ← not the answer" : ""}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PortalSection>
  );
}
