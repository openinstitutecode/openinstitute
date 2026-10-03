import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, apiFetchBlob, openOrDownloadBlob, useCurrentUserName } from "../../lib/api";

const links = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/command-centre", label: "Command Centre" },
  { to: "/admin/admissions", label: "Admissions" },
  { to: "/admin/students", label: "Students" },
  { to: "/admin/staff", label: "Staff Management" },
  { to: "/admin/academic-calendar", label: "Academic Calendar" },
  { to: "/admin/timetable-admin", label: "Timetable Management" },
  { to: "/admin/communication", label: "Communication Centre" },
  { to: "/admin/permission-audit", label: "Permission Audit" },
  { to: "/admin/security", label: "Security Centre" },
  { to: "/admin/reports", label: "Report Builder" },
  { to: "/admin/admin-assistant", label: "AI Admin Assistant" },
  { to: "/admin/ai-governance", label: "AI Governance Centre" },
  { to: "/admin/registry", label: "Registry Actions" },
  { to: "/admin/statistics", label: "Academic Statistics" },
  { to: "/admin/qualifications", label: "Qualification Register" },
  { to: "/admin/exams", label: "Examinations" },
  { to: "/admin/results-approval", label: "Results Approval" },
  { to: "/admin/curriculum", label: "Curriculum" },
  { to: "/admin/library", label: "Digital Library" },
  { to: "/admin/library-admin", label: "Library Administration" },
  { to: "/admin/finance", label: "Finance" },
  { to: "/admin/ledger", label: "General Ledger" },
  { to: "/admin/receivable-payable", label: "AR / AP" },
  { to: "/admin/installments", label: "Installment Plans" },
  { to: "/admin/budgets", label: "Budgets" },
  { to: "/admin/inventory", label: "Inventory" },
  { to: "/admin/financial-planning", label: "Financial Planning" },
  { to: "/admin/fee-structure", label: "Fee Structure" },
  { to: "/admin/procurement", label: "Procurement & Assets" },
  { to: "/admin/compliance", label: "Compliance & QA" },
  { to: "/admin/qa-governance", label: "QA Governance" },
  { to: "/admin/course-evaluations", label: "Course & Trainer Evaluations" },
  { to: "/admin/internal-audits", label: "Internal Audits" },
  { to: "/admin/corrective-actions", label: "Corrective Actions" },
  { to: "/admin/complaints", label: "Complaints" },
  { to: "/admin/governance", label: "Governance" },
  { to: "/admin/integrity", label: "Academic Integrity" },
  { to: "/admin/appeals", label: "Appeals" },
  { to: "/admin/rpl", label: "RPL Applications" },
  { to: "/admin/graduation", label: "Graduation Audit" },
  { to: "/admin/kuccps", label: "KUCCPS Exchange" },
  { to: "/admin/users", label: "Users & RBAC" },
  { to: "/admin/audit-log", label: "Audit Log" },
  { to: "/admin/operations", label: "Operations & Data Governance" },
  { to: "/admin/departments", label: "Departments & Tasks" },
  { to: "/admin/research", label: "Research & Innovation" },
  { to: "/admin/trainers", label: "Trainers & HR" },
  { to: "/admin/support-tickets", label: "Support Tickets" },
  { to: "/admin/documents", label: "Document Management" },
  { to: "/admin/data-export", label: "Data Export" },
  { to: "/admin/data-import", label: "Data Import" },
  { to: "/admin/integrations", label: "Integration Centre" },
  { to: "/admin/role-permissions", label: "Role Permissions" },
  { to: "/admin/semesters", label: "Semester Management" },
  { to: "/admin/programme-accreditation", label: "Programme Accreditation" },
  { to: "/admin/credit-transfer", label: "Credit Transfer" },
  { to: "/admin/exam-security", label: "Exam Security" },
  { to: "/admin/similarity-checking", label: "Similarity Checking" },
  { to: "/admin/knowledge-base", label: "Knowledge Base" },
  { to: "/admin/notifications", label: "Notifications" },
  { to: "/admin/workflows", label: "Workflow Engine" },
  { to: "/admin/institutional-analytics", label: "Institutional Analytics" },
  { to: "/admin/decision-centre", label: "Executive Decision Centre" },
];

type Question = {
  id: string;
  prompt: string;
  type: string;
  marks: number;
  difficulty: string;
  topic: string | null;
  approvedById: string | null;
  options?: string[];
  correctAnswer?: string | null;
};

type LearningOutcome = { id: string; code: string; description: string; level: string };

type Amendment = {
  id: string;
  currentScore: number | null;
  proposedScore: number;
  reason: string;
  requestedById: string;
  createdAt: string;
  submission: { id: string; assessment: { title: string; totalMarks: number } | null };
};

export default function AdminExams() {
  const userName = useCurrentUserName();
  const [unitId, setUnitId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState("mcq");
  const [marks, setMarks] = useState(1);
  const [difficulty, setDifficulty] = useState("medium");
  const [topic, setTopic] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // BUGFIX: the MCQ form previously had no options or correct-answer
  // fields at all, so every question created here — regardless of the
  // "Multiple choice" type selected — was saved with no options, making it
  // unusable in a real quiz. Only shown/sent when type === "mcq".
  const [mcqOptions, setMcqOptions] = useState<string[]>(["", ""]);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [learningOutcomeId, setLearningOutcomeId] = useState("");
  const [learningOutcomes, setLearningOutcomes] = useState<LearningOutcome[]>([]);

  // Assessment creation
  const [courseId, setCourseId] = useState("");
  const [assessTitle, setAssessTitle] = useState("");
  const [assessType, setAssessType] = useState("CAT");
  const [totalMarks, setTotalMarks] = useState(100);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [assessSaved, setAssessSaved] = useState(false);

  // RG026 — results amendment review
  const [amendments, setAmendments] = useState<Amendment[] | null>(null);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});

  function loadAmendments() {
    apiFetch<Amendment[]>("/exams/amendments/pending")
      .then(setAmendments)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load pending amendments."));
  }
  useEffect(loadAmendments, []);

  async function decide(id: string, decision: "approved" | "rejected") {
    try {
      await apiFetch(`/exams/amendments/${id}/decide`, {
        method: "PATCH",
        body: JSON.stringify({ decision, decisionNote: decisionNotes[id] || undefined }),
      });
      loadAmendments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record that decision — you may be the original requester.");
    }
  }

  function loadQuestions() {
    if (!unitId) return;
    apiFetch<Question[]>(`/exams/questions/${unitId}`)
      .then((qs) => {
        setQuestions(qs);
        setLoaded(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load existing questions."));
    // EX004 — so the question form can offer "which learning outcome does
    // this map to" without the trainer having to know outcome ids by heart.
    apiFetch<LearningOutcome[]>(`/curriculum/${unitId}/learning-outcomes`)
      .then(setLearningOutcomes)
      .catch(() => setLearningOutcomes([]));
  }

  async function approveQuestion(id: string) {
    setError(null);
    try {
      const updated = await apiFetch<Question>(`/exams/questions/${id}/approve`, { method: "PATCH" });
      setQuestions((qs) => qs.map((q) => (q.id === id ? updated : q)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve that question.");
    }
  }

  async function createAssessment(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setAssessSaved(false);
    try {
      await apiFetch("/exams/assessments", {
        method: "POST",
        body: JSON.stringify({
          courseId,
          title: assessTitle,
          type: assessType,
          totalMarks,
          durationMinutes,
          maxAttempts,
        }),
      });
      setAssessTitle("");
      setAssessSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create assessment.");
    }
  }

  async function addQuestion(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // BUGFIX: previously an MCQ could be saved with no options and no
    // correct answer at all — nothing stopped it, and nothing downstream
    // (delivery, scoring) could have worked with it.
    const cleanOptions = mcqOptions.map((o) => o.trim()).filter(Boolean);
    if (type === "mcq") {
      if (cleanOptions.length < 2) {
        setError("An MCQ needs at least two non-empty options.");
        return;
      }
      if (!correctAnswer || !cleanOptions.includes(correctAnswer)) {
        setError("Pick which option is correct.");
        return;
      }
    }
    try {
      const q = await apiFetch<Question>("/exams/questions", {
        method: "POST",
        body: JSON.stringify({
          unitId,
          prompt,
          type,
          marks,
          difficulty,
          topic: topic || undefined,
          options: type === "mcq" ? cleanOptions : undefined,
          correctAnswer: type === "mcq" ? correctAnswer : undefined,
          learningOutcomeId: learningOutcomeId || undefined,
        }),
      });
      setQuestions((qs) => [q, ...qs]);
      setPrompt("");
      setMcqOptions(["", ""]);
      setCorrectAnswer("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save question.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Examinations</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Every question needs a second approval before it can be used in a
        live assessment. CATs and final exams are always human-moderated —
        that's enforced by the backend, not just this screen.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <PortalSection title="Question bank">
          {!loaded && <p className="text-sm text-ink/50">Enter a unit ID and click "Load questions" to see its bank.</p>}
          {loaded && questions.length === 0 && <p className="text-sm text-ink/50">No questions for this unit yet.</p>}
          <ul className="divide-y divide-line">
            {questions.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p>{q.prompt}</p>
                  <p className="text-xs text-ink/40">{q.type} · {q.marks} mark(s) · {q.difficulty}{q.topic ? ` · ${q.topic}` : ""}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge tone={q.approvedById ? "ok" : "neutral"}>
                    {q.approvedById ? "Approved" : "Awaiting review"}
                  </Badge>
                  {/* BUGFIX: this button didn't exist even though PATCH
                      /exams/questions/:id/approve has always worked — the
                      approval gate could never actually be reached from
                      here. */}
                  {!q.approvedById && (
                    <button type="button" onClick={() => approveQuestion(q.id)} className="btn-secondary shrink-0 px-3 py-1 text-xs">
                      Approve
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </PortalSection>

        <PortalSection title="Draft a question">
          <form onSubmit={addQuestion} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Unit ID</span>
              <div className="mt-1.5 flex gap-2">
                <input
                  required
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  placeholder="cuid from the Unit table"
                  className="input flex-1"
                />
                <button type="button" onClick={loadQuestions} className="btn-secondary shrink-0">
                  Load
                </button>
              </div>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Question type</span>
              <select value={type} onChange={(e) => setType(e.target.value)} className="input mt-1.5">
                <option value="mcq">Multiple choice</option>
                <option value="short_answer">Short answer</option>
                <option value="essay">Essay</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Prompt</span>
              <textarea required rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} className="input mt-1.5" />
            </label>
            {type === "mcq" && (
              <div className="space-y-2 rounded-lg border border-line p-3">
                <span className="text-sm font-medium text-ink/80">Options (mark the correct one)</span>
                {mcqOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correctAnswer"
                      checked={correctAnswer === opt && opt !== ""}
                      onChange={() => setCorrectAnswer(opt)}
                      disabled={!opt.trim()}
                    />
                    <input
                      value={opt}
                      onChange={(e) => {
                        const next = [...mcqOptions];
                        const prevValue = next[i];
                        next[i] = e.target.value;
                        setMcqOptions(next);
                        if (correctAnswer === prevValue) setCorrectAnswer(e.target.value);
                      }}
                      placeholder={`Option ${i + 1}`}
                      className="input flex-1"
                    />
                    {mcqOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setMcqOptions(mcqOptions.filter((_, idx) => idx !== i))}
                        className="text-xs text-ink/40 hover:text-ink/70"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setMcqOptions([...mcqOptions, ""])} className="btn-secondary text-xs">
                  Add option
                </button>
              </div>
            )}
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Marks</span>
              <input required type="number" min={1} value={marks} onChange={(e) => setMarks(Number(e.target.value))} className="input mt-1.5" />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-ink/80">Difficulty</span>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="input mt-1.5">
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink/80">Topic</span>
                <input value={topic} onChange={(e) => setTopic(e.target.value)} className="input mt-1.5" />
              </label>
            </div>
            {learningOutcomes.length > 0 && (
              <label className="block">
                <span className="text-sm font-medium text-ink/80">Learning outcome (optional)</span>
                <select value={learningOutcomeId} onChange={(e) => setLearningOutcomeId(e.target.value)} className="input mt-1.5">
                  <option value="">— none —</option>
                  {learningOutcomes.map((lo) => (
                    <option key={lo.id} value={lo.id}>
                      {lo.code} · {lo.description}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {error && <p className="text-xs text-navy-dark">{error}</p>}
            <button type="submit" className="btn-primary w-full justify-center">
              Save to question bank
            </button>
          </form>
        </PortalSection>
      </div>

      <div className="mt-6">
        <PortalSection title="Create an assessment">
          <form onSubmit={createAssessment} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <input required value={courseId} onChange={(e) => setCourseId(e.target.value)} placeholder="Course ID" className="input" />
            <input required value={assessTitle} onChange={(e) => setAssessTitle(e.target.value)} placeholder="Assessment title" className="input" />
            <select value={assessType} onChange={(e) => setAssessType(e.target.value)} className="input">
              <option value="FORMATIVE_QUIZ">Formative quiz</option>
              <option value="ASSIGNMENT">Assignment</option>
              <option value="CAT">CAT</option>
              <option value="FINAL_EXAM">Final exam</option>
              <option value="PRACTICAL">Practical</option>
            </select>
            <input required type="number" min={1} value={totalMarks} onChange={(e) => setTotalMarks(Number(e.target.value))} placeholder="Total marks" className="input" />
            <input required type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} placeholder="Duration (minutes)" className="input" />
            <input required type="number" min={1} value={maxAttempts} onChange={(e) => setMaxAttempts(Number(e.target.value))} placeholder="Max attempts" className="input" />
            <button type="submit" className="btn-primary sm:col-span-2 lg:col-span-3">Create assessment</button>
            {assessSaved && <p className="text-xs text-forest">Created — CATs and final exams are automatically flagged as requiring human moderation.</p>}
          </form>
        </PortalSection>

        {/* EX014 — admit cards, batch 64. A real, printable/emailable card
            per enrolled student, checked by eye at the door — deliberately
            not biometric verification (see feature-audit-400.md). */}
        <PortalSection title="Exam admit cards">
          <AdmitCardGenerator />
        </PortalSection>
      </div>

      {/* RG026 — results amendment: a request/approval workflow. The
          examination officer viewing this page must be a different person
          than whoever requested the amendment — enforced by the backend. */}
      <div className="mt-6">
        <PortalSection title="Pending results amendments">
          {amendments && amendments.length === 0 && <p className="text-sm text-ink/50">Nothing pending.</p>}
          <ul className="divide-y divide-line">
            {amendments?.map((a) => (
              <li key={a.id} className="py-4">
                <p className="text-sm">
                  {a.submission.assessment?.title ?? "Assessment"}: {a.currentScore ?? "ungraded"} → proposed {a.proposedScore}
                  {a.submission.assessment ? ` / ${a.submission.assessment.totalMarks}` : ""}
                </p>
                <p className="mt-1 text-xs text-ink/55">{a.reason}</p>
                <textarea
                  rows={2}
                  placeholder="Decision note (optional)"
                  value={decisionNotes[a.id] ?? ""}
                  onChange={(e) => setDecisionNotes((n) => ({ ...n, [a.id]: e.target.value }))}
                  className="input mt-2"
                />
                <div className="mt-2 flex gap-3">
                  <button className="btn-primary" onClick={() => decide(a.id, "approved")}>Approve</button>
                  <button className="btn-secondary" onClick={() => decide(a.id, "rejected")}>Reject</button>
                </div>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>

      {/* TP032 — results approval queue + EX001 — assessment calendar +
          EX006/EX038 — question analytics/difficulty calibration. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <PendingApprovals />
        <AssessmentCalendar />
      </div>
      <div className="mt-6">
        <QuestionAnalytics />
      </div>
      <div className="mt-6">
        <AssessmentReports />
      </div>
      <div className="mt-6">
        <ExternalModeration />
      </div>
      <div className="mt-6">
        <InternalModeration />
      </div>
      <div className="mt-6">
        <ExaminationBuilder />
      </div>
    </PortalShell>
  );
}

function ExternalModeration() {
  type Review = { id: string; comments: string; outcome: string; reviewedAt: string };
  const [assessmentId, setAssessmentId] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!assessmentId) return;
    try {
      setReviews(await apiFetch<Review[]>(`/exams/external-moderation/${assessmentId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load reviews.");
    }
  }

  return (
    <PortalSection title="External moderation">
      <p className="text-xs text-ink/50">
        A real, distinct sign-off from an external examiner — separate from internal moderation.
      </p>
      <div className="mt-3 flex gap-2">
        <input value={assessmentId} onChange={(e) => setAssessmentId(e.target.value)} placeholder="Assessment ID" className="input flex-1" />
        <button onClick={load} className="btn-secondary shrink-0">Load</button>
      </div>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      <ul className="mt-3 divide-y divide-line">
        {reviews.map((r) => (
          <li key={r.id} className="py-2 text-sm">
            <div className="flex items-center justify-between">
              <span>{r.comments}</span>
              <Badge tone={r.outcome === "approved" ? "ok" : r.outcome === "changes_requested" ? "warn" : "neutral"}>{r.outcome.replace("_", " ")}</Badge>
            </div>
            <p className="text-xs text-ink/45">{new Date(r.reviewedAt).toLocaleDateString()}</p>
          </li>
        ))}
      </ul>
    </PortalSection>
  );
}

function InternalModeration() {
  type Flagged = { submissionId: string; studentUserId: string; marker1Score: number; marker2Score: number; divergence: number };
  const [assessmentId, setAssessmentId] = useState("");
  const [threshold, setThreshold] = useState<number | null>(null);
  const [flagged, setFlagged] = useState<Flagged[]>([]);
  const [finalScores, setFinalScores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<string | null>(null);

  async function load() {
    if (!assessmentId) return;
    setError(null);
    try {
      const data = await apiFetch<{ threshold: number; flagged: Flagged[] }>(
        `/exams/moderation/flagged/${assessmentId}`
      );
      setThreshold(data.threshold);
      setFlagged(data.flagged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load flagged submissions.");
    }
  }

  async function resolve(submissionId: string) {
    const finalScore = Number(finalScores[submissionId]);
    if (!finalScore && finalScore !== 0) return;
    try {
      await apiFetch(`/exams/moderation/${submissionId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ finalScore }),
      });
      setResolved(submissionId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve moderation.");
    }
  }

  return (
    <PortalSection title="Marking moderation">
      <p className="text-xs text-ink/50">
        Submissions where two independent markers disagree by more than{" "}
        {threshold !== null ? `${threshold.toFixed(1)} marks` : "the threshold"} — a moderator must set the
        final score before results can be submitted for approval.
      </p>
      <div className="mt-3 flex gap-2">
        <input value={assessmentId} onChange={(e) => setAssessmentId(e.target.value)} placeholder="Assessment ID" className="input flex-1" />
        <button onClick={load} className="btn-secondary shrink-0">Load</button>
      </div>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {flagged.length === 0 && <p className="mt-3 text-sm text-ink/50">No divergent marks flagged for this assessment.</p>}
      <ul className="mt-3 divide-y divide-line">
        {flagged.map((f) => (
          <li key={f.submissionId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div>
              <p>Marker 1: {f.marker1Score} · Marker 2: {f.marker2Score}</p>
              <Badge tone="warn">Diverges by {f.divergence.toFixed(1)}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Final score"
                value={finalScores[f.submissionId] ?? ""}
                onChange={(e) => setFinalScores({ ...finalScores, [f.submissionId]: e.target.value })}
                className="input w-28"
              />
              <button onClick={() => resolve(f.submissionId)} className="btn-primary shrink-0">Resolve</button>
            </div>
          </li>
        ))}
      </ul>
      {resolved && <p className="mt-2 text-xs text-forest">Moderation decision recorded.</p>}
    </PortalSection>
  );
}

// EX026 — grade approval: a real two-stage queue. An assessment submitted
// by a trainer first needs a distinct approve/reject decision from an
// examination officer (resultsApprovedAt) before Publish is even offered —
// the backend now enforces this server-side too, so this UI reflects a
// real gate, not just a suggested order of buttons.
function PendingApprovals() {
  type Pending = {
    id: string;
    title: string;
    course: { title: string };
    resultsSubmittedForApprovalAt: string;
    resultsApprovedAt: string | null;
  };
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Pending[]>("/exams/assessments/pending-approval").then(setPending).catch((err) => setError(err instanceof Error ? err.message : "Could not load queue."));
  }
  useEffect(load, []);

  async function decide(id: string, decision: "approved" | "rejected") {
    await apiFetch(`/exams/assessments/${id}/approve-results`, {
      method: "PATCH",
      body: JSON.stringify({ decision }),
    }).catch((err) => setError(err instanceof Error ? err.message : "Could not record the decision."));
    load();
  }

  async function publish(id: string) {
    await apiFetch(`/exams/assessments/${id}/publish`, { method: "PATCH" }).catch((err) => setError(err instanceof Error ? err.message : "Could not publish."));
    load();
  }

  async function startChain(id: string) {
    try {
      await apiFetch(`/results-approval/${id}/submit`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the approval chain.");
    }
  }

  return (
    <PortalSection title="Results approval queue">
      <p className="mb-2 text-xs text-ink/45">
        A high-stakes assessment can go through the full examiner-1 →
        examiner-2 → QA-officer chain instead of a single approval — start
        that from here, then track it on the{" "}
        <a href="/admin/results-approval" className="text-navy underline decoration-dotted">
          Results Approval
        </a>{" "}
        page.
      </p>
      {error && <p className="text-xs text-navy-dark">{error}</p>}
      {pending && pending.length === 0 && <p className="text-sm text-ink/50">Nothing pending.</p>}
      <ul className="divide-y divide-line">
        {pending?.map((p) => (
          <li key={p.id} className="flex items-center justify-between py-2 text-sm">
            <span>
              {p.title} — {p.course.title}{" "}
              {p.resultsApprovedAt ? <Badge tone="ok">Approved</Badge> : <Badge tone="neutral">Awaiting approval</Badge>}
            </span>
            <span className="flex gap-2">
              {!p.resultsApprovedAt ? (
                <>
                  <button onClick={() => decide(p.id, "approved")} className="btn-secondary text-xs">Approve</button>
                  <button onClick={() => decide(p.id, "rejected")} className="text-xs text-navy-dark underline decoration-dotted">Reject</button>
                  <button onClick={() => startChain(p.id)} className="text-xs text-ink/50 underline decoration-dotted">
                    Start multi-stage chain
                  </button>
                </>
              ) : (
                <button onClick={() => publish(p.id)} className="btn-secondary text-xs">Publish</button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </PortalSection>
  );
}

function AssessmentCalendar() {
  type CalEntry = { id: string; title: string; courseTitle: string; scheduledAt: string; durationMinutes: number | null };
  const [entries, setEntries] = useState<CalEntry[] | null>(null);

  useEffect(() => {
    apiFetch<CalEntry[]>("/exams/calendar").then(setEntries).catch(() => setEntries([]));
  }, []);

  return (
    <PortalSection title="Assessment calendar">
      {entries && entries.length === 0 && <p className="text-sm text-ink/50">No scheduled assessments.</p>}
      <ul className="divide-y divide-line">
        {entries?.map((e) => (
          <li key={e.id} className="py-2 text-sm">
            {e.title} — {e.courseTitle}
            <p className="text-xs text-ink/45">{new Date(e.scheduledAt).toLocaleString()}{e.durationMinutes ? ` · ${e.durationMinutes} min` : ""}</p>
          </li>
        ))}
      </ul>
    </PortalSection>
  );
}

function QuestionAnalytics() {
  type QA = { questionId: string; prompt: string; labeledDifficulty: string; observedDifficulty: string | null; timesUsed: number; observedCorrectRate: number | null; miscalibrated: boolean };
  const [unitId, setUnitId] = useState("");
  const [rows, setRows] = useState<QA[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setRows(await apiFetch<QA[]>(`/exams/questions/analytics${unitId ? `?unitId=${unitId}` : ""}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load analytics.");
    }
  }

  return (
    <PortalSection title="Question analytics & difficulty calibration">
      <div className="flex gap-2">
        <input value={unitId} onChange={(e) => setUnitId(e.target.value)} placeholder="Unit ID (optional filter)" className="input flex-1" />
        <button onClick={load} className="btn-secondary shrink-0">Load</button>
      </div>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      <ul className="mt-3 divide-y divide-line">
        {rows?.map((r) => (
          <li key={r.questionId} className="py-2 text-sm">
            <p>{r.prompt}</p>
            <p className="text-xs text-ink/45">
              Labeled: {r.labeledDifficulty} · Observed: {r.observedDifficulty ?? "no data"} · Used {r.timesUsed}x
              {r.observedCorrectRate !== null ? ` · ${(r.observedCorrectRate * 100).toFixed(0)}% correct` : ""}
              {r.miscalibrated && <span className="ml-2 text-navy-dark">Miscalibrated</span>}
            </p>
          </li>
        ))}
      </ul>
    </PortalSection>
  );
}

// EX039 — Assessment reports. lib/exam-reports.ts's two builders (CSV
// export + a per-student results slip) have been real and unit-tested since
// batch 56 — the routes work if called directly by URL, but nothing in the
// admin UI ever linked to them. This is that missing button.
function AssessmentReports() {
  type Row = { id: string; studentName: string; score: number | null };
  const [assessmentId, setAssessmentId] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSubmissions() {
    if (!assessmentId) return;
    setError(null);
    try {
      setRows(await apiFetch<Row[]>(`/exams/assessments/${assessmentId}/submissions`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load submissions.");
    }
  }

  async function downloadCsv() {
    if (!assessmentId) return;
    setBusy("csv");
    setError(null);
    try {
      const { blob, filename } = await apiFetchBlob(`/exams/assessments/${assessmentId}/analytics/export.csv`);
      openOrDownloadBlob(blob, filename ?? `${assessmentId}-results.csv`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the CSV.");
    } finally {
      setBusy(null);
    }
  }

  async function viewSlip(submissionId: string) {
    setBusy(submissionId);
    setError(null);
    try {
      const { blob } = await apiFetchBlob(`/exams/submissions/${submissionId}/results-slip`);
      openOrDownloadBlob(blob, null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the results slip.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PortalSection title="Assessment reports (EX039)">
      <div className="flex gap-2">
        <input
          value={assessmentId}
          onChange={(e) => setAssessmentId(e.target.value)}
          placeholder="Assessment ID"
          className="input flex-1"
        />
        <button onClick={loadSubmissions} className="btn-secondary shrink-0">Load submissions</button>
        <button onClick={downloadCsv} disabled={!assessmentId || busy === "csv"} className="btn-primary shrink-0 disabled:opacity-50">
          Download CSV
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {rows && (
        <ul className="mt-3 divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2 text-sm">
              <span>{r.studentName} — {r.score ?? "ungraded"}</span>
              <button
                onClick={() => viewSlip(r.id)}
                disabled={busy === r.id}
                className="btn-secondary px-2 py-1 text-xs disabled:opacity-50"
              >
                View results slip
              </button>
            </li>
          ))}
        </ul>
      )}
    </PortalSection>
  );
}

// TP012 — Examination builder. Ties together learning outcomes (per unit),
// exam blueprints (per programme), and real question-bank coverage into one
// workflow: define what a unit's questions should demonstrate, define how
// many questions at each level an exam needs, see live whether the approved
// question bank can satisfy that, and — only once it can — generate the
// actual assessment. Previously blueprints/outcomes had full backend CRUD
// but no screen anywhere ever called any of it.
function ExaminationBuilder() {
  type Outcome = { id: string; code: string; description: string; level: string };
  type Blueprint = {
    id: string;
    name: string;
    totalMarks: number;
    durationMinutes: number;
    passMarks: number;
    rememberCount: number;
    understandCount: number;
    applyCount: number;
    analyzeCount: number;
    evaluateCount: number;
  };
  type CoverageRow = { level: string; required: number; available: number; met: boolean };
  type Coverage = { blueprint: { id: string; name: string; totalMarks: number; durationMinutes: number }; coverage: CoverageRow[]; ready: boolean };

  const [unitId, setUnitId] = useState("");
  const [programmeId, setProgrammeId] = useState("");
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState("");
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // New learning outcome form
  const [loCode, setLoCode] = useState("");
  const [loDescription, setLoDescription] = useState("");
  const [loLevel, setLoLevel] = useState("understand");

  // New blueprint form
  const [bpName, setBpName] = useState("");
  const [bpTotalMarks, setBpTotalMarks] = useState(100);
  const [bpDuration, setBpDuration] = useState(120);
  const [bpPass, setBpPass] = useState(50);
  const [bpCounts, setBpCounts] = useState({ remember: 5, understand: 10, apply: 8, analyze: 5, evaluate: 2 });

  // Generate-assessment form
  const [genCourseId, setGenCourseId] = useState("");
  const [genTitle, setGenTitle] = useState("");
  const [genType, setGenType] = useState<"CAT" | "FINAL_EXAM" | "FORMATIVE_QUIZ" | "ASSIGNMENT" | "PRACTICAL">("CAT");
  const [genScheduledAt, setGenScheduledAt] = useState("");
  const [generating, setGenerating] = useState(false);

  async function loadOutcomes() {
    if (!unitId) return;
    try {
      setOutcomes(await apiFetch<Outcome[]>(`/curriculum/${unitId}/learning-outcomes`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load learning outcomes.");
    }
  }

  async function loadBlueprints() {
    if (!programmeId) return;
    try {
      setBlueprints(await apiFetch<Blueprint[]>(`/curriculum/programmes/${programmeId}/blueprints`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load blueprints.");
    }
  }

  async function addOutcome(e: FormEvent) {
    e.preventDefault();
    if (!unitId || !loCode.trim() || !loDescription.trim()) return;
    setError(null);
    try {
      await apiFetch(`/curriculum/${unitId}/learning-outcomes`, {
        method: "POST",
        body: JSON.stringify({ code: loCode, description: loDescription, level: loLevel }),
      });
      setLoCode("");
      setLoDescription("");
      loadOutcomes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the outcome.");
    }
  }

  async function addBlueprint(e: FormEvent) {
    e.preventDefault();
    if (!programmeId || !bpName.trim()) return;
    setError(null);
    try {
      await apiFetch(`/curriculum/programmes/${programmeId}/blueprints`, {
        method: "POST",
        body: JSON.stringify({
          name: bpName,
          totalMarks: bpTotalMarks,
          durationMinutes: bpDuration,
          passMarks: bpPass,
          rememberCount: bpCounts.remember,
          understandCount: bpCounts.understand,
          applyCount: bpCounts.apply,
          analyzeCount: bpCounts.analyze,
          evaluateCount: bpCounts.evaluate,
        }),
      });
      setBpName("");
      loadBlueprints();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the blueprint.");
    }
  }

  async function checkCoverage() {
    if (!unitId || !selectedBlueprintId) return;
    setError(null);
    setCoverage(null);
    try {
      setCoverage(await apiFetch<Coverage>(`/exams/blueprint-coverage/${selectedBlueprintId}/unit/${unitId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check coverage.");
    }
  }

  async function generate(e: FormEvent) {
    e.preventDefault();
    if (!unitId || !selectedBlueprintId || !genCourseId || !genTitle.trim()) return;
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<{ assessment: { id: string; title: string } }>("/exams/assessments/from-blueprint", {
        method: "POST",
        body: JSON.stringify({
          unitId,
          blueprintId: selectedBlueprintId,
          courseId: genCourseId,
          title: genTitle,
          type: genType,
          scheduledAt: genScheduledAt ? new Date(genScheduledAt).toISOString() : undefined,
        }),
      });
      setNotice(`Assessment "${result.assessment.title}" created from the blueprint.`);
      setGenTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the assessment — check coverage above.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <PortalSection title="Examination builder (TP012)">
      <p className="text-xs text-ink/50">
        Map a unit's questions to learning outcomes, define a blueprint's question-level distribution for a programme, then generate an assessment once the approved question bank can satisfy it.
      </p>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {notice && <p className="mt-2 text-xs text-forest">{notice}</p>}

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="flex gap-2">
            <input value={unitId} onChange={(e) => setUnitId(e.target.value)} placeholder="Unit ID" className="input flex-1" />
            <button onClick={loadOutcomes} className="btn-secondary shrink-0">Load outcomes</button>
          </div>
          <ul className="mt-3 divide-y divide-line text-sm">
            {outcomes.map((o) => (
              <li key={o.id} className="py-2">
                <span className="font-mono text-xs text-ink/45">{o.code}</span> — {o.description}{" "}
                <Badge tone="neutral">{o.level}</Badge>
              </li>
            ))}
            {unitId && outcomes.length === 0 && <li className="py-2 text-ink/45">No learning outcomes yet.</li>}
          </ul>
          <form onSubmit={addOutcome} className="mt-3 space-y-2 border-t border-line pt-3">
            <div className="flex gap-2">
              <input value={loCode} onChange={(e) => setLoCode(e.target.value)} placeholder="Code (e.g. LO-001)" className="input flex-1" />
              <select value={loLevel} onChange={(e) => setLoLevel(e.target.value)} className="input w-40">
                <option value="remember">Remember</option>
                <option value="understand">Understand</option>
                <option value="apply">Apply</option>
                <option value="analyze">Analyze</option>
                <option value="evaluate">Evaluate</option>
              </select>
            </div>
            <textarea value={loDescription} onChange={(e) => setLoDescription(e.target.value)} rows={2} placeholder="What should the student be able to do?" className="input" />
            <button type="submit" className="btn-secondary w-full justify-center">Add learning outcome</button>
          </form>
          <p className="mt-2 text-[11px] text-ink/45">
            Tag each question with its learning outcome from the question bank screen (uses the same outcome codes above) — that's what makes it countable towards a blueprint.
          </p>
        </div>

        <div>
          <div className="flex gap-2">
            <input value={programmeId} onChange={(e) => setProgrammeId(e.target.value)} placeholder="Programme ID" className="input flex-1" />
            <button onClick={loadBlueprints} className="btn-secondary shrink-0">Load blueprints</button>
          </div>
          <ul className="mt-3 divide-y divide-line text-sm">
            {blueprints.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2">
                <span>{b.name} — {b.totalMarks} marks, {b.durationMinutes} min</span>
                <button onClick={() => setSelectedBlueprintId(b.id)} className={`text-xs underline decoration-dotted ${selectedBlueprintId === b.id ? "text-navy font-medium" : "text-ink/50"}`}>
                  {selectedBlueprintId === b.id ? "Selected" : "Select"}
                </button>
              </li>
            ))}
            {programmeId && blueprints.length === 0 && <li className="py-2 text-ink/45">No blueprints yet.</li>}
          </ul>
          <form onSubmit={addBlueprint} className="mt-3 space-y-2 border-t border-line pt-3">
            <input value={bpName} onChange={(e) => setBpName(e.target.value)} placeholder="Blueprint name" className="input" />
            <div className="grid grid-cols-3 gap-2">
              <input type="number" value={bpTotalMarks} onChange={(e) => setBpTotalMarks(Number(e.target.value))} placeholder="Total marks" className="input" />
              <input type="number" value={bpDuration} onChange={(e) => setBpDuration(Number(e.target.value))} placeholder="Duration (min)" className="input" />
              <input type="number" value={bpPass} onChange={(e) => setBpPass(Number(e.target.value))} placeholder="Pass marks" className="input" />
            </div>
            <div className="grid grid-cols-5 gap-1">
              {(Object.keys(bpCounts) as (keyof typeof bpCounts)[]).map((level) => (
                <label key={level} className="text-center text-[10px] text-ink/50">
                  {level}
                  <input
                    type="number"
                    min={0}
                    value={bpCounts[level]}
                    onChange={(e) => setBpCounts((c) => ({ ...c, [level]: Number(e.target.value) }))}
                    className="input mt-1 px-1 text-center"
                  />
                </label>
              ))}
            </div>
            <button type="submit" className="btn-secondary w-full justify-center">Create blueprint</button>
          </form>
        </div>
      </div>

      <div className="mt-6 border-t border-line pt-6">
        <div className="flex items-center gap-3">
          <button onClick={checkCoverage} disabled={!unitId || !selectedBlueprintId} className="btn-secondary disabled:opacity-50">
            Check coverage for selected unit + blueprint
          </button>
          {selectedBlueprintId && <span className="text-xs text-ink/45">Blueprint selected: {selectedBlueprintId}</span>}
        </div>

        {coverage && (
          <>
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-ink/50">
                  <th className="pb-2">Level</th>
                  <th className="pb-2">Required</th>
                  <th className="pb-2">Approved &amp; available</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {coverage.coverage.map((c) => (
                  <tr key={c.level} className="border-t border-line">
                    <td className="py-2 capitalize">{c.level}</td>
                    <td className="py-2">{c.required}</td>
                    <td className="py-2">{c.available}</td>
                    <td className="py-2">
                      <Badge tone={c.met ? "ok" : "warn"}>{c.met ? "Covered" : "Short"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <form onSubmit={generate} className="mt-4 grid gap-2 sm:grid-cols-2">
              <input required value={genCourseId} onChange={(e) => setGenCourseId(e.target.value)} placeholder="Course ID to attach the assessment to" className="input sm:col-span-2" />
              <input required value={genTitle} onChange={(e) => setGenTitle(e.target.value)} placeholder="Assessment title" className="input" />
              <select value={genType} onChange={(e) => setGenType(e.target.value as typeof genType)} className="input">
                <option value="CAT">CAT</option>
                <option value="FINAL_EXAM">Final exam</option>
                <option value="FORMATIVE_QUIZ">Formative quiz</option>
                <option value="ASSIGNMENT">Assignment</option>
                <option value="PRACTICAL">Practical</option>
              </select>
              <input type="datetime-local" value={genScheduledAt} onChange={(e) => setGenScheduledAt(e.target.value)} className="input sm:col-span-2" />
              <button type="submit" disabled={!coverage.ready || generating} className="btn-primary sm:col-span-2 disabled:opacity-50">
                {coverage.ready ? (generating ? "Generating…" : "Generate assessment from this blueprint") : "Question bank doesn't cover this blueprint yet"}
              </button>
            </form>
          </>
        )}
      </div>
    </PortalSection>
  );
}

// EX014 — admit cards, batch 64. Enter an assessment ID once results are
// scheduled and generate a real admit card for every currently enrolled
// student who has a photo on file; students who haven't uploaded one yet
// are reported so the office can follow up before the exam.
type AdmitCardBatchResult = { issued: number; skippedNoPhoto: number; totalEnrolled: number };
function AdmitCardGenerator() {
  const [assessmentId, setAssessmentId] = useState("");
  const [result, setResult] = useState<AdmitCardBatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate(e: FormEvent) {
    e.preventDefault();
    if (!assessmentId.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<AdmitCardBatchResult>(`/exams/assessments/${assessmentId}/admit-cards/generate`, { method: "POST" });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate admit cards.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={generate} className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="text-sm font-medium text-ink/80">Assessment ID</span>
        <input value={assessmentId} onChange={(e) => setAssessmentId(e.target.value)} className="input mt-1.5" placeholder="Assessment ID" />
      </label>
      <button type="submit" disabled={loading} className="btn-primary disabled:opacity-50">
        {loading ? "Generating…" : "Generate admit cards"}
      </button>
      {result && (
        <p className="w-full text-xs text-ink/60">
          Issued {result.issued} of {result.totalEnrolled} enrolled students.
          {result.skippedNoPhoto > 0 && ` ${result.skippedNoPhoto} skipped — no profile photo on file yet.`}
        </p>
      )}
      {error && <p className="w-full text-xs text-navy-dark">{error}</p>}
    </form>
  );
}
