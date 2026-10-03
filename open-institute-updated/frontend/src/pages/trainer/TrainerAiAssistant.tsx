import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";

// TP034 — a "unit" here is a real Course the trainer teaches (unit title
// used for curriculum grounding, moduleId/unitId used by the two apply
// actions below), not the free-text placeholder this page used to send.
type Module = { id: string; title: string };
type Course = { id: string; title: string; unit: { id: string; title: string; code: string } | null; modules: Module[] };

const freeActions = [
  { id: "summary", label: "Summarise class performance", hint: "Latest CAT results" },
  { id: "case-study", label: "Draft a case study", hint: "A workplace scenario with discussion questions" },
];

type DraftQuestion = {
  type: "mcq" | "short_answer" | "essay";
  prompt: string;
  options: string[];
  correctAnswer?: string;
  marks: number;
  difficulty: "easy" | "medium" | "hard";
};

export default function TrainerAiAssistant() {
  const userName = useCurrentUserName();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");

  useEffect(() => {
    apiFetch<Course[]>("/trainer-self/courses")
      .then((cs) => {
        setCourses(cs);
        if (cs.length > 0) setCourseId(cs[0].id);
      })
      .catch(() => undefined);
  }, []);

  const course = courses.find((c) => c.id === courseId);
  const unitTitle = course?.unit?.title ?? "";

  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">AI teaching assistant</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Every draft below is grounded in the approved material for the course
        you pick — nothing is published to students, added to the gradebook,
        or sent as feedback until you review and explicitly save it.
      </p>

      <div className="mt-6 max-w-sm">
        <label className="text-xs font-medium text-ink/60">Course</label>
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="input mt-1">
          {courses.length === 0 && <option value="">No courses assigned yet</option>}
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} {c.unit ? `(${c.unit.code})` : ""}
            </option>
          ))}
        </select>
      </div>

      {course && course.unit && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <LessonPlanPanel unit={unitTitle} course={course} />
          <QuizPanel unit={unitTitle} unitId={course.unit.id} />
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {freeActions.map((a) => (
          <FreeDraftTile key={a.id} id={a.id} label={a.label} hint={a.hint} unit={unitTitle} />
        ))}
      </div>

      <div className="mt-8">
        <PortalSection title="Feedback drafting">
          <p className="text-sm text-ink/60">
            AI-drafted feedback is generated per submission, grounded in that
            student's real answer and the assessment's rubric — open a
            submission in the{" "}
            <a href="/trainer/gradebook" className="text-navy underline decoration-dotted">
              Gradebook
            </a>{" "}
            and use "AI suggest" there. Every suggestion is saved as a
            reviewable session, and applying one writes straight into that
            submission's feedback field once you approve it.
          </p>
        </PortalSection>
      </div>
    </PortalShell>
  );
}

function FreeDraftTile({ id, label, hint, unit }: { id: string; label: string; hint: string; unit: string }) {
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!unit) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ draft: string }>("/ai/trainer-assist", {
        method: "POST",
        body: JSON.stringify({ action: id, unit }),
      });
      setOutput(res.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a draft.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-line bg-white p-5">
      <button onClick={run} disabled={loading || !unit} className="text-left disabled:opacity-60">
        <p className="font-medium">{label}</p>
        <p className="mt-1 text-xs text-ink/50">{loading ? "Thinking…" : hint}</p>
      </button>
      {(output || error) && (
        <p className={`mt-3 whitespace-pre-line text-xs ${error ? "text-navy-dark" : "text-ink/70"}`}>{error || output}</p>
      )}
    </div>
  );
}

// TP035 — lesson-plan draft with a real "Save as lesson" apply step.
function LessonPlanPanel({ unit, course }: { unit: string; course: Course }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [moduleId, setModuleId] = useState(course.modules[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const res = await apiFetch<{ draft: string }>("/ai/trainer-assist", {
        method: "POST",
        body: JSON.stringify({ action: "lesson-plan", unit }),
      });
      setDraft(res.draft);
      if (!title) setTitle(`${unit} — AI-drafted lesson`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a draft.");
    } finally {
      setLoading(false);
    }
  }

  async function saveAsLesson() {
    if (!draft || !moduleId) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/ai/trainer-assist/save-as-lesson", {
        method: "POST",
        body: JSON.stringify({ moduleId, title, content: draft }),
      });
      setMsg("Saved as a real lesson — open Content Authoring to publish/edit it further.");
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the lesson.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalSection title="Draft a lesson plan">
      <button onClick={generate} disabled={loading} className="btn-secondary disabled:opacity-60">
        {loading ? "Drafting…" : "Draft a 40-minute lesson"}
      </button>
      {draft && (
        <div className="mt-4 space-y-3">
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap border border-line bg-sand/30 p-3 font-sans text-xs text-ink/80">{draft}</pre>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lesson title" className="input" />
          <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} className="input">
            {course.modules.length === 0 && <option value="">No modules yet — create one in Content Authoring</option>}
            {course.modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
          <div className="flex gap-3">
            <button onClick={saveAsLesson} disabled={saving || !moduleId || !title} className="btn-primary disabled:opacity-50">
              {saving ? "Saving…" : "Save as lesson"}
            </button>
            <button onClick={() => setDraft(null)} className="btn-secondary">
              Discard
            </button>
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-forest">{msg}</p>}
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
    </PortalSection>
  );
}

// TP036 — structured quiz question generation with a real "save to
// question bank" apply step, editable before saving.
function QuizPanel({ unit, unitId }: { unit: string; unitId: string }) {
  const [questions, setQuestions] = useState<DraftQuestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const res = await apiFetch<{ questions: DraftQuestion[] }>("/ai/trainer-assist/generate-quiz-questions", {
        method: "POST",
        body: JSON.stringify({ unit, count: 5 }),
      });
      setQuestions(res.questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate questions.");
    } finally {
      setLoading(false);
    }
  }

  function updatePrompt(i: number, prompt: string) {
    setQuestions((qs) => qs?.map((q, idx) => (idx === i ? { ...q, prompt } : q)) ?? null);
  }

  function removeQuestion(i: number) {
    setQuestions((qs) => qs?.filter((_, idx) => idx !== i) ?? null);
  }

  async function saveQuestions() {
    if (!questions || questions.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ created: number }>("/ai/trainer-assist/save-questions", {
        method: "POST",
        body: JSON.stringify({ unitId, questions }),
      });
      setMsg(`Saved ${res.created} question(s) to the question bank for this unit.`);
      setQuestions(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the questions.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalSection title="Generate quiz questions">
      <button onClick={generate} disabled={loading} className="btn-secondary disabled:opacity-60">
        {loading ? "Drafting…" : "Draft 5 questions"}
      </button>
      {questions && (
        <div className="mt-4 space-y-3">
          {questions.map((q, i) => (
            <div key={i} className="flex items-start gap-2 border border-line p-2 text-xs">
              <textarea
                value={q.prompt}
                onChange={(e) => updatePrompt(i, e.target.value)}
                className="input flex-1 text-xs"
                rows={2}
              />
              <span className="mt-1 shrink-0 text-ink/40">{q.marks} mk · {q.difficulty}</span>
              <button onClick={() => removeQuestion(i)} className="mt-1 shrink-0 text-red-700 hover:underline">
                Remove
              </button>
            </div>
          ))}
          {questions.length > 0 && (
            <button onClick={saveQuestions} disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? "Saving…" : `Save ${questions.length} question(s) to bank`}
            </button>
          )}
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-forest">{msg}</p>}
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
    </PortalSection>
  );
}
