import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { QrCode } from "../../components/portal/QrCode";
import { DocLetterhead } from "../../components/Logo";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { AnswerInput, Media, hasAnswer } from "../../components/quiz/AnswerInput";
import { StudentQuestion, paginate } from "../../components/quiz/quizTypes";

const links = [
  { to: "/student/dashboard", label: "Dashboard" },
  { to: "/student/profile", label: "My Profile" },
  { to: "/student/id-card", label: "Digital ID" },
  { to: "/student/roadmap", label: "Programme Roadmap" },
  { to: "/student/courses", label: "My Courses" },
  { to: "/student/assignments", label: "Assignment Centre" },
  { to: "/student/exams", label: "Assessment Centre" },
  { to: "/student/alerts", label: "Academic Alerts" },
  { to: "/student/notebook", label: "Knowledge Notebook" },
  { to: "/student/portfolio", label: "Digital Portfolio" },
  { to: "/student/advisor", label: "AI Study Advisor" },
  { to: "/student/letters", label: "Official Letters" },
  { to: "/student/receipts", label: "Payment Receipts" },
  { to: "/student/research", label: "Research Workspace" },
  { to: "/student/messages", label: "Messages & Office Hours" },
  { to: "/student/forums", label: "Discussion Forums" },
  { to: "/student/timetable", label: "Timetable" },
  { to: "/student/attendance", label: "Attendance" },
  { to: "/student/achievements", label: "Achievements" },
  { to: "/student/library", label: "Digital Library" },
  { to: "/student/tutor", label: "AI Tutor" },
  { to: "/student/career", label: "Career Services" },
  { to: "/student/job-matches", label: "Job Matches" },
  { to: "/student/simulation", label: "Business Simulation Lab" },
  { to: "/student/virtual-lab", label: "Virtual Business Lab" },
  { to: "/student/viva", label: "AI Viva Practice" },
  { to: "/student/passport", label: "Competency Passport" },
  { to: "/student/grades", label: "Grades & Transcript" },
  { to: "/student/appeals", label: "Appeals" },
  { to: "/student/fees", label: "Fees" },
  { to: "/student/attachment", label: "Industrial Attachment" },
  { to: "/student/graduation", label: "Graduation Status" },
  { to: "/student/wellbeing", label: "Counselling & Support" },
  { to: "/student/events", label: "Clubs & Events" },
  { to: "/student/support", label: "Support" },
  { to: "/student/accessibility", label: "Accessibility Settings" },
  { to: "/student/credit-transfer", label: "Credit Transfer" },
  { to: "/student/tutor-sessions", label: "Tutor Session History" },
];

type Available = {
  id: string;
  title: string;
  type: string;
  courseTitle: string;
  unitTitle: string;
  totalMarks: number;
  scheduledAt: string | null;
  durationMinutes: number | null;
  maxAttempts: number;
  attemptsUsed: number;
  attemptsRemaining: number;
  windowClosed: boolean;
  resultsPublished: boolean;
  myScore: number | null;
  // Batch 76
  opensAt?: string | null;
  closesAt?: string | null;
  gradingMethod?: string;
  availability?: string;
  availabilityMessage?: string;
  myGrade?: number | null;
  hasExtension?: boolean;
  isQuiz?: boolean;
  passMarkPercent?: number | null;
};

type Question = StudentQuestion;
type TakePayload = {
  assessment: { id: string; title: string; totalMarks: number; durationMinutes: number | null; unitTitle: string; instructions?: string | null; questionsPerPage?: number | null; navigationMode?: string };
  sessionId?: string;
  startedAt?: string;
  deadline?: string | null;
  draft?: { answers: Record<string, string>; flagged: string[]; currentIndex: number } | null;
  questions: Question[];
};
type ReviewItem = {
  questionId: string; prompt: string; type: string; yourAnswer: string | null; isCorrect: boolean | null; partial?: boolean; correctAnswer: string | null; explanation: string | null;
  answerFeedback?: string | null; incorrectExplanation?: string | null; markerFeedback?: string | null; marks: number; marksAwarded: number | null;
};
type SubmitResult = {
  autoMarked: boolean; correctCount: number | null; totalQuestions: number; score: number | null; provisionalScore: number | null; totalMarks: number;
  passMarkPercent: number | null; passed: boolean | null; review: ReviewItem[] | null; scoreWithheld?: boolean; withheldReason?: string | null;
};
type MyAttempts = {
  title: string; totalMarks: number; gradingMethod: string; officialGrade: number | null; passed: boolean | null; scoresVisible: boolean; keyVisible: boolean;
  attempts: { submissionId: string; attemptNumber: number; submittedAt: string; status: string; score: number | null; passed: boolean | null }[];
};
type ReviewPayload = { title: string; totalMarks: number; score: number | null; scoreVisible: boolean; passed: boolean | null; review: ReviewItem[] | null; reason?: string };

const GRADING_LABEL: Record<string, string> = { HIGHEST: "highest attempt", AVERAGE: "average of attempts", LATEST: "latest attempt", FIRST: "first attempt" };

export default function StudentExams() {
  const userName = useCurrentUserName();
  const [list, setList] = useState<Available[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taking, setTaking] = useState<string | null>(null);

  function load() {
    apiFetch<Available[]>("/exams/available/mine")
      .then(setList)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load assessments."));
  }
  useEffect(load, []);

  if (taking) {
    return <ExamTake assessmentId={taking} onDone={() => { setTaking(null); load(); }} />;
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Assessment centre</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Every assessment scheduled for a unit you're enrolled in. Attempts and
        time windows are enforced by the server, not just this screen.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 space-y-4">
        {list && list.length === 0 && <p className="text-sm text-ink/50">No assessments scheduled right now.</p>}
        {list?.map((a) => (
          <PortalSection key={a.id} title={`${a.title} — ${a.courseTitle}`}>
            <p className="text-xs text-ink/45">
              {a.unitTitle} · {a.type.replace("_", " ")} · {a.totalMarks} marks
              {a.durationMinutes ? ` · ${a.durationMinutes} min` : ""}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Badge tone={a.availability === "ok" ? "ok" : a.availability === "no_attempts" ? "warn" : "neutral"}>
                {a.availability === "not_open"
                  ? `Opens ${a.opensAt ? new Date(a.opensAt).toLocaleString() : "soon"}`
                  : a.windowClosed
                    ? "Closed"
                    : a.attemptsRemaining > 0
                      ? `${a.attemptsRemaining} attempt(s) left`
                      : "No attempts left"}
              </Badge>
              {a.closesAt && !a.windowClosed && <span className="text-xs text-ink/50">Closes {new Date(a.closesAt).toLocaleString()}</span>}
              {a.hasExtension && <Badge tone="ok">Extension granted</Badge>}
              {a.myGrade !== null && a.myGrade !== undefined && (
                <Badge tone={a.myGrade / Math.max(1, a.totalMarks) >= (a.passMarkPercent ?? 50) / 100 ? "ok" : "danger"}>
                  Grade: {a.myGrade}/{a.totalMarks}{a.gradingMethod && a.attemptsUsed > 1 ? ` (${GRADING_LABEL[a.gradingMethod] ?? a.gradingMethod})` : ""}
                </Badge>
              )}
              {a.availability === "ok" && (
                <button className="btn-primary" onClick={() => setTaking(a.id)}>
                  Start attempt
                </button>
              )}
            </div>
            {a.availability && !["ok", "no_attempts"].includes(a.availability) && a.availabilityMessage && !a.windowClosed && a.availability !== "not_open" && <p className="mt-2 text-xs text-ink/50">{a.availabilityMessage}</p>}
            {a.attemptsUsed > 0 && a.isQuiz && <MyAttemptsPanel assessmentId={a.id} />}
            {a.scheduledAt && <AdmitCard assessmentId={a.id} />}
          </PortalSection>
        ))}
      </div>
    </PortalShell>
  );
}

// EX014 — real admit card: the student generates their own (once a photo
// is on file), an invigilator checks the printed/emailed result by eye.
// No automated face match happens anywhere in this code.
type AdmitCardData = { documentId: string; photoDataUrl: string | null; verificationUrl: string; issuedAt: string };
function AdmitCard({ assessmentId }: { assessmentId: string }) {
  const [card, setCard] = useState<AdmitCardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<AdmitCardData>(`/exams/assessments/${assessmentId}/admit-card/mine`)
      .then(setCard)
      .catch(() => undefined);
  }, [assessmentId]);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const created = await apiFetch<AdmitCardData>(`/exams/assessments/${assessmentId}/admit-card/mine`, { method: "POST" });
      setCard(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate admit card.");
    } finally {
      setLoading(false);
    }
  }

  if (card) {
    return (
      <div className="mt-3 border-t border-line pt-3">
        <DocLetterhead title="Examination admit card" />
        <div className="flex items-center gap-3">
        {card.photoDataUrl && <img src={card.photoDataUrl} alt="" className="h-12 w-12 rounded-sm border border-line object-cover" />}
        <QrCode data={card.verificationUrl} size={64} alt="Admit card verification QR" />
        <div className="text-xs text-ink/50">
          Admit card issued. Document ID: {card.documentId}
          <br />
          Print or screenshot this section to bring to the exam.
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <button onClick={generate} disabled={loading} className="btn-secondary px-3 py-1 text-xs disabled:opacity-50">
        {loading ? "Generating…" : "Get admit card"}
      </button>
      {error && <p className="mt-1 text-xs text-navy-dark">{error}</p>}
    </div>
  );
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}

function ReviewList({ items, assessmentId, canReport }: { items: ReviewItem[]; assessmentId: string; canReport: boolean }) {
  return (
    <ol className="space-y-4">
      {items.map((r, i) => (
        <li key={r.questionId} className="text-sm">
          <p><span className="font-mono text-xs text-ink/45">{i + 1}. </span>{r.prompt}</p>
          <p className="mt-1 whitespace-pre-wrap">
            Your answer: <span className={r.isCorrect === true ? "text-forest" : r.isCorrect === false ? "text-navy-dark" : ""}>{r.yourAnswer && hasAnswer(r.yourAnswer) ? prettyAnswer(r.yourAnswer) : "— no answer —"}</span>
            {r.isCorrect !== null && <span className="ml-2 text-xs">{r.isCorrect ? "✓ correct" : r.partial ? "◐ partly correct" : "✗ incorrect"}</span>}
            {r.marksAwarded !== null && <span className="ml-2 text-xs text-ink/50">{r.marksAwarded}/{r.marks}</span>}
          </p>
          {r.isCorrect !== true && r.correctAnswer && <p className="text-xs text-forest">Correct answer: {r.correctAnswer}</p>}
          {r.answerFeedback && <p className="mt-1 text-xs text-ink/70">{r.answerFeedback}</p>}
          {r.incorrectExplanation && <p className="mt-1 text-xs text-ink/70">{r.incorrectExplanation}</p>}
          {r.explanation && <p className="mt-1 text-xs text-ink/60">{r.explanation}</p>}
          {r.markerFeedback && <p className="mt-1 border-l-4 border-navy/30 pl-2 text-xs text-ink/70">Trainer: {r.markerFeedback}</p>}
          {canReport && <ReportQuestion assessmentId={assessmentId} questionId={r.questionId} />}
        </li>
      ))}
    </ol>
  );
}

// Structured answers are stored as JSON; show them readably.
function prettyAnswer(raw: string): string {
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v.join(", ");
    if (v && typeof v === "object") return Object.entries(v).map(([k, val]) => `${k} → ${val}`).join("; ");
  } catch { /* plain text */ }
  return raw;
}

// QZ078 — flag a wrong/unclear question to the trainer.
function ReportQuestion({ assessmentId, questionId }: { assessmentId: string; questionId: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("error");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  async function send(e: FormEvent) {
    e.preventDefault(); setError(null);
    try { await apiFetch("/quiz-attempts/report", { method: "POST", body: JSON.stringify({ assessmentId, questionId, category, message: message.trim() }) }); setState("sent"); }
    catch (x) { setError(x instanceof Error ? x.message : "Could not send the report."); }
  }
  if (state === "sent") return <p className="mt-1 text-xs text-forest">Thanks — your trainer will look at this question.</p>;
  if (!open) return <button type="button" className="mt-1 text-xs text-navy underline decoration-dotted" onClick={() => setOpen(true)}>Report a problem with this question</button>;
  return (
    <form onSubmit={send} className="mt-2 flex flex-wrap gap-2">
      <select className="input w-auto py-1 text-xs" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Problem type">
        <option value="error">Wrong answer / marking</option><option value="unclear">Unclear</option><option value="ambiguous">More than one right answer</option><option value="typo">Typo</option><option value="other">Other</option>
      </select>
      <input className="input min-w-[12rem] flex-1 py-1 text-xs" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What's wrong with it?" minLength={5} required />
      <button type="submit" className="btn-secondary px-3 py-1 text-xs">Send</button>
      {error && <span className="w-full text-xs text-navy-dark" role="alert">{error}</span>}
    </form>
  );
}

// QZ074 / QZ075 — a student's own attempt history, with review of each attempt where the quiz allows it.
function MyAttemptsPanel({ assessmentId }: { assessmentId: string }) {
  const [data, setData] = useState<MyAttempts | null>(null);
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || data) return;
    apiFetch<MyAttempts>(`/quiz-attempts/${assessmentId}/mine`).then(setData).catch((e) => setError(e instanceof Error ? e.message : "Could not load your attempts."));
  }, [open, data, assessmentId]);
  async function openReview(id: string) {
    setError(null);
    try { setReview(await apiFetch<ReviewPayload>(`/quiz-attempts/review/${id}`)); } catch (e) { setError(e instanceof Error ? e.message : "Could not load the review."); }
  }
  return (
    <div className="mt-3 border-t border-line pt-3 text-sm">
      <button type="button" className="text-xs text-navy underline decoration-dotted" onClick={() => setOpen(!open)}>{open ? "Hide my attempts" : "My attempts"}</button>
      {open && (
        <div className="mt-2">
          {error && <p className="text-xs text-navy-dark" role="alert">{error}</p>}
          {!data && !error && <p className="text-xs text-ink/50">Loading…</p>}
          {data && (
            <>
              <p className="text-xs text-ink/55">Your grade is the {GRADING_LABEL[data.gradingMethod] ?? data.gradingMethod}{data.scoresVisible ? "" : " — scores aren't released yet"}.</p>
              <ul className="mt-2 divide-y divide-line">
                {data.attempts.map((a) => (
                  <li key={a.submissionId} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span>Attempt {a.attemptNumber} · {new Date(a.submittedAt).toLocaleString()}</span>
                    <span className="flex items-center gap-3 text-xs">
                      {a.status === "awaiting_marking" ? <Badge tone="warn">awaiting marking</Badge> : a.score !== null ? <strong>{a.score}/{data.totalMarks}</strong> : <span className="text-ink/45">score hidden</span>}
                      <button type="button" className="text-navy underline decoration-dotted" onClick={() => void openReview(a.submissionId)}>Review</button>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {review && (
            <div className="mt-3 border border-line bg-paper/60 p-3">
              <div className="flex justify-between"><p className="font-medium">{review.title}{review.score !== null ? ` — ${review.score}/${review.totalMarks}` : ""}</p><button type="button" className="text-xs text-navy underline decoration-dotted" onClick={() => setReview(null)}>Close</button></div>
              {review.review ? <div className="mt-3"><ReviewList items={review.review} assessmentId={assessmentId} canReport /></div> : <p className="mt-2 text-xs text-ink/60">{review.reason ?? "Answers aren't available."}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExamTake({ assessmentId, onDone }: { assessmentId: string; onDone: () => void }) {
  const userName = useCurrentUserName();
  const [data, setData] = useState<TakePayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    apiFetch<TakePayload>(`/exams/assessments/${assessmentId}/take`)
      .then((payload) => {
        setData(payload);
        // QZ060 — resume exactly where the student left off after a refresh / dropped connection.
        if (payload.draft) {
          setAnswers(payload.draft.answers ?? {});
          setFlagged(payload.draft.flagged ?? []);
          const per = payload.assessment.questionsPerPage;
          if (per && per > 0) setPage(Math.min(Math.floor((payload.draft.currentIndex ?? 0) / per), Math.max(0, Math.ceil(payload.questions.length / per) - 1)));
        }
        // EX013 — advisory-only browser/environment check. Best-effort: if
        // this fails (offline, blocked, etc.) the student still sits the
        // exam; nothing here is allowed to block the attempt.
        if (payload.sessionId) {
          apiFetch(`/exam-security/${payload.sessionId}/check`, {
            method: "POST",
            body: JSON.stringify({
              userAgent: navigator.userAgent,
              screenWidth: window.screen?.width,
              screenHeight: window.screen?.height,
            }),
          }).catch(() => {
            /* advisory only — never block the attempt on this failing */
          });
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not open this assessment."));
  }, [assessmentId]);

  const pages = data ? paginate(data.questions, data.assessment.questionsPerPage) : [[]];
  const safePage = Math.min(page, pages.length - 1);
  const firstIndexOnPage = pages.slice(0, safePage).reduce((n, p) => n + p.length, 0);
  const forwardOnly = data?.assessment.navigationMode === "FORWARD_ONLY";

  // QZ060 — autosave: shortly after the last change, and always when moving page.
  async function saveDraft(): Promise<void> {
    if (!data?.sessionId || result) return;
    setSaveState("saving");
    try {
      await apiFetch(`/quiz-attempts/${assessmentId}/draft`, { method: "PUT", body: JSON.stringify({ answers, flagged, currentIndex: firstIndexOnPage }) });
      setSaveState("saved"); setDirty(false);
    } catch { setSaveState("failed"); }
  }
  useEffect(() => {
    if (!dirty || !data?.sessionId || result) return;
    const t = setTimeout(() => { void saveDraft(); }, 2500);
    return () => clearTimeout(t);
  }, [answers, flagged, dirty]);

  function change(id: string, v: string) {
    setAnswers((a) => ({ ...a, [id]: v }));
    setDirty(true);
  }
  function toggleFlag(id: string) {
    setFlagged((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
    setDirty(true);
  }
  function go(next: number) {
    setPage(next);
    setDirty(true); // persist the new position
    window.scrollTo?.({ top: 0 });
  }

  async function doSubmit() {
    if (!data || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const responses = data.questions.map((q) => ({ questionId: q.id, answerGiven: answers[q.id] ?? "" })).filter((r) => hasAnswer(r.answerGiven));
      // The API needs at least one answer; an empty attempt is still recorded via a blank answer.
      const body = { assessmentId, responses: responses.length > 0 ? responses : data.questions.slice(0, 1).map((q) => ({ questionId: q.id, answerGiven: " " })) };
      setResult(await apiFetch<SubmitResult>("/exams/submissions/answers", { method: "POST", body: JSON.stringify(body) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your attempt.");
    } finally {
      setSubmitting(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!data) return;
    const unanswered = data.questions.filter((q) => !hasAnswer(answers[q.id])).length;
    const note = [unanswered > 0 ? `${unanswered} question(s) are unanswered.` : "", flagged.length > 0 ? `${flagged.length} are flagged for review.` : ""].filter(Boolean).join(" ");
    if (note && !window.confirm(`${note} Submit anyway?`)) return;
    void doSubmit();
  }

  // Count down to the server-set deadline; submit automatically when it hits zero.
  const deadline = data?.deadline ? new Date(data.deadline).getTime() : null;
  useEffect(() => {
    if (!deadline || result) return;
    const tick = () => setRemaining(deadline - Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [deadline, result]);
  useEffect(() => {
    if (remaining !== null && remaining <= 0 && data && !result && !submitting) void doSubmit();
  }, [remaining]);

  // EX016 — automatic activity monitoring: log tab-hidden/tab-visible while
  // an attempt is open. Best-effort and purely advisory, same as the EX013
  // check above — a failed POST here never blocks or interrupts the exam.
  useEffect(() => {
    const sessionId = data?.sessionId;
    if (!sessionId || result) return;
    const logEvent = (eventType: string) => {
      apiFetch(`/exam-security/${sessionId}/activity`, {
        method: "POST",
        body: JSON.stringify({ eventType }),
      }).catch(() => {
        /* advisory only */
      });
    };
    const onVisibilityChange = () => {
      logEvent(document.hidden ? "tab_hidden" : "tab_visible");
      if (document.hidden) void saveDraft(); // save when the student leaves the tab
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [data?.sessionId, result, answers, flagged]);

  const answeredCount = data ? data.questions.filter((q) => hasAnswer(answers[q.id])).length : 0;

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      {error && <p className="text-sm text-navy-dark" role="alert">{error}</p>}
      {!data && !error && <p className="text-sm text-ink/50">Loading your attempt…</p>}
      {!data && error && <button className="btn-secondary mt-4" onClick={onDone}>Back to assessment centre</button>}

      {data && !result && (
        <form onSubmit={submit}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl">{data.assessment.title}</h1>
              <p className="mt-1 text-sm text-ink/60">
                {data.assessment.unitTitle} · {data.assessment.totalMarks} marks
                {data.assessment.durationMinutes ? ` · ${data.assessment.durationMinutes} min limit` : ""}
              </p>
            </div>
            <div className="flex items-start gap-3">
              {data.sessionId && <span className="pt-2 text-xs text-ink/45" aria-live="polite">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "All answers saved" : saveState === "failed" ? "Couldn't save — check your connection" : ""}</span>}
              {remaining !== null && (
                <div className={`border px-4 py-2 font-mono text-lg ${remaining < 60_000 ? "border-navy-dark text-navy-dark" : "border-line"}`} aria-live="polite">
                  {formatClock(remaining)}
                </div>
              )}
            </div>
          </div>
          {data.assessment.instructions && <p className="mt-4 max-w-prose whitespace-pre-wrap text-sm text-ink/70">{data.assessment.instructions}</p>}
          {forwardOnly && <p className="mt-3 border-l-4 border-gold-dark/60 bg-gold/10 px-3 py-2 text-xs">This quiz is forward-only: once you move on you can't go back to earlier questions.</p>}

          {pages.length > 1 && (
            <nav className="mt-4 flex flex-wrap gap-1" aria-label="Question pages">
              {pages.map((_, i) => (
                <button key={i} type="button" disabled={forwardOnly && i !== safePage} onClick={() => go(i)} aria-current={i === safePage ? "page" : undefined}
                  className={`h-8 min-w-8 border px-2 text-xs ${i === safePage ? "border-navy bg-navy text-white" : "border-line"} ${pages[i].some((q) => flagged.includes(q.id)) ? "ring-1 ring-gold-dark" : ""} ${pages[i].every((q) => hasAnswer(answers[q.id])) ? "" : "opacity-80"} disabled:opacity-30`}>
                  {i + 1}
                </button>
              ))}
            </nav>
          )}

          <div className="mt-6 space-y-6">
            {data.questions.length === 0 && (
              <p className="text-sm text-ink/50">No questions are available for this assessment yet — contact your trainer.</p>
            )}
            {pages[safePage].map((q, i) => (
              <PortalSection key={q.id} title={`Question ${firstIndexOnPage + i + 1} (${q.marks} mark${q.marks === 1 ? "" : "s"})`}
                action={<label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={flagged.includes(q.id)} onChange={() => toggleFlag(q.id)} /> Flag for review</label>}>
                {q.stem && <p className="mb-3 whitespace-pre-wrap border-l-4 border-navy/30 bg-paper/60 px-3 py-2 text-sm text-ink/80">{q.stem}</p>}
                <p className="whitespace-pre-wrap text-sm">{q.prompt}</p>
                <Media q={q} />
                <AnswerInput q={q} value={answers[q.id] ?? ""} onChange={(v) => change(q.id, v)} />
              </PortalSection>
            ))}
          </div>

          {data.questions.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-4">
              {pages.length > 1 && !forwardOnly && <button type="button" disabled={safePage === 0} onClick={() => go(safePage - 1)} className="btn-secondary disabled:opacity-40">← Previous</button>}
              {safePage < pages.length - 1 ? (
                <button type="button" onClick={() => go(safePage + 1)} className="btn-primary">Next →</button>
              ) : (
                <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Submitting…" : "Submit attempt"}</button>
              )}
              <span className="text-xs text-ink/45">{answeredCount} of {data.questions.length} answered{flagged.length > 0 ? ` · ${flagged.length} flagged` : ""}</span>
            </div>
          )}
        </form>
      )}

      {result && (
        <div className="space-y-6">
          <PortalSection title="Attempt submitted">
            {result.scoreWithheld ? (
              <p className="text-sm text-ink/70">Your attempt has been recorded. {result.withheldReason}</p>
            ) : result.autoMarked && result.score !== null ? (
              <div className="text-sm">
                <p className="font-display text-2xl">{result.score} / {result.totalMarks}</p>
                <p className="mt-1 text-ink/70">{result.correctCount} of {result.totalQuestions} correct.</p>
                {result.passed !== null && (
                  <p className={`mt-2 font-medium ${result.passed ? "text-forest" : "text-navy-dark"}`}>
                    {result.passed ? "Passed" : "Not yet passed"} (pass mark {result.passMarkPercent}%)
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink/70">
                Your attempt has been recorded and is waiting for your trainer to mark the written answers.
                {result.provisionalScore !== null && ` The automatically marked part is worth ${result.provisionalScore} of ${result.totalMarks} marks so far.`}
              </p>
            )}
            <button className="btn-secondary mt-4" onClick={onDone}>Back to assessment centre</button>
          </PortalSection>

          {result.review && (
            <PortalSection title="Review your answers">
              <ReviewList items={result.review} assessmentId={assessmentId} canReport />
            </PortalSection>
          )}
        </div>
      )}
    </PortalShell>
  );
}
