import { FormEvent, useState } from "react";
import { MANUAL_TYPES, QuestionConfig, QuestionPayload, QuizQuestion, TYPE_LABEL, TYPE_ORDER, isTrueFalse } from "./quizTypes";

// Batch 76 — authoring form for every question type (QZ005-QZ031).
// Builds the exact payload backend routes/quizzes.ts validates; the server
// re-validates everything, so this form only has to be helpful, not trusted.

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const countBlanks = (s: string) => (s.match(/_{3,}/g) ?? []).length;

export default function QuestionEditor({
  initial, submitLabel, onSubmit, onCancel, busy, resetOnSuccess = false,
}: {
  initial?: QuizQuestion; submitLabel: string; onSubmit: (p: QuestionPayload) => Promise<boolean>; onCancel?: () => void; busy: boolean; resetOnSuccess?: boolean;
}) {
  const c: QuestionConfig = initial?.config ?? {};
  const initialType = initial ? (isTrueFalse(initial.type, initial.options) ? "true_false" : initial.type) : "mcq";

  const [type, setType] = useState(initialType);
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [marks, setMarks] = useState(String(initial?.marks ?? 1));
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? "medium");
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [incorrectExplanation, setIncorrectExplanation] = useState(c.incorrectExplanation ?? "");
  const [mediaUrl, setMediaUrl] = useState(initial?.mediaUrl ?? "");
  const [mediaKind, setMediaKind] = useState<string>(initial?.mediaKind ?? "image");

  // type-specific state
  const [options, setOptions] = useState<string[]>(initial && ["mcq", "mcq_multi"].includes(initialType) ? initial.options : ["", "", "", ""]);
  const [correctIdx, setCorrectIdx] = useState(() => (initial && initialType === "mcq" ? Math.max(0, initial.options.indexOf(initial.correctAnswer ?? "")) : 0));
  const [multiCorrect, setMultiCorrect] = useState<string[]>(c.correct ?? []);
  const [tf, setTf] = useState(initial?.correctAnswer === "False" ? "False" : "True");
  const [blanks, setBlanks] = useState<string[]>((c.blanks ?? []).map((b) => b.join(" | ")));
  const [accepted, setAccepted] = useState((c.acceptedAnswers ?? []).join("\n"));
  const [modelAnswer, setModelAnswer] = useState(initial && initial.type === "short_answer" ? initial.correctAnswer ?? "" : "");
  const [numAnswer, setNumAnswer] = useState(c.numeric ? String(c.numeric.answer) : "");
  const [numTol, setNumTol] = useState(c.numeric?.tolerance ? String(c.numeric.tolerance) : "");
  const [numTolType, setNumTolType] = useState<"abs" | "percent">(c.numeric?.toleranceType ?? "abs");
  const [numUnit, setNumUnit] = useState(c.numeric?.unit ?? "");
  const [pairs, setPairs] = useState<{ left: string; right: string }[]>(c.pairs?.length ? c.pairs : [{ left: "", right: "" }, { left: "", right: "" }]);
  const [order, setOrder] = useState<string[]>(c.order?.length ? c.order : ["", ""]);
  const [stem, setStem] = useState(c.stem ?? "");
  const [rubricHint, setRubricHint] = useState(c.rubricHint ?? "");
  const [partial, setPartial] = useState(!!c.partialCredit);
  const [caseSensitive, setCaseSensitive] = useState(!!c.caseSensitive);
  const [negPct, setNegPct] = useState(c.negativeFraction ? String(Math.round(c.negativeFraction * 100)) : "");
  const [optFeedback, setOptFeedback] = useState<Record<string, string>>(c.answerFeedback ?? {});
  const [problem, setProblem] = useState<string | null>(null);

  const isManual = MANUAL_TYPES.includes(type);
  const supportsPartial = ["mcq_multi", "fill_blank", "matching", "ordering"].includes(type);
  const supportsNegative = !isManual && type !== "short_answer" || (type === "short_answer" && lines(accepted).length > 0);
  const blankCount = countBlanks(prompt);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    const cfg: QuestionConfig = {};
    if (partial && supportsPartial) cfg.partialCredit = true;
    if (negPct.trim() && supportsNegative) {
      const n = Number(negPct);
      if (!Number.isFinite(n) || n < 0 || n > 100) return setProblem("Negative marking must be between 0 and 100%.");
      if (n > 0) cfg.negativeFraction = n / 100;
    }
    if (incorrectExplanation.trim()) cfg.incorrectExplanation = incorrectExplanation.trim();
    if (stem.trim()) cfg.stem = stem.trim();
    if (rubricHint.trim() && isManual) cfg.rubricHint = rubricHint.trim();

    const base = { prompt: prompt.trim(), marks: Math.max(1, Math.round(Number(marks) || 1)), difficulty, topic: topic.trim() || undefined, explanation: explanation.trim() || undefined,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean), mediaUrl: mediaUrl.trim() || null, mediaKind: mediaUrl.trim() ? (mediaKind as "image" | "audio" | "video") : null };
    let payload: QuestionPayload;

    switch (type) {
      case "mcq": {
        const kept = options.map((o) => o.trim());
        if (kept.filter(Boolean).length < 2) return setProblem("Give at least two answer options.");
        if (!kept[correctIdx]) return setProblem("Mark which option is correct.");
        const fb: Record<string, string> = {};
        for (const o of kept.filter(Boolean)) if (optFeedback[o]?.trim()) fb[o] = optFeedback[o].trim();
        if (Object.keys(fb).length) cfg.answerFeedback = fb;
        payload = { ...base, type, options: kept.filter(Boolean), correctAnswer: kept[correctIdx], config: cfg };
        break;
      }
      case "mcq_multi": {
        const kept = options.map((o) => o.trim()).filter(Boolean);
        const right = multiCorrect.filter((m) => kept.includes(m));
        if (kept.length < 2) return setProblem("Give at least two answer options.");
        if (right.length < 1) return setProblem("Tick at least one correct option.");
        payload = { ...base, type, options: kept, config: { ...cfg, correct: right } };
        break;
      }
      case "true_false":
        payload = { ...base, type, correctAnswer: tf, config: cfg };
        break;
      case "fill_blank": {
        if (blankCount < 1) return setProblem("Write each blank in the question as ___ (three underscores).");
        const groups = Array.from({ length: blankCount }, (_, i) => (blanks[i] ?? "").split("|").map((x) => x.trim()).filter(Boolean));
        if (groups.some((g) => g.length === 0)) return setProblem("Give at least one accepted answer for every blank.");
        payload = { ...base, type, config: { ...cfg, blanks: groups, caseSensitive } };
        break;
      }
      case "short_answer": {
        const acc = lines(accepted);
        payload = { ...base, type, correctAnswer: modelAnswer.trim() || undefined, config: { ...cfg, ...(acc.length ? { acceptedAnswers: acc, caseSensitive } : {}) } };
        break;
      }
      case "numerical": {
        const a = Number(numAnswer);
        if (numAnswer.trim() === "" || !Number.isFinite(a)) return setProblem("Enter the correct numeric answer.");
        const tol = numTol.trim() === "" ? 0 : Number(numTol);
        if (!Number.isFinite(tol) || tol < 0) return setProblem("Tolerance must be zero or more.");
        payload = { ...base, type, config: { ...cfg, numeric: { answer: a, tolerance: tol, toleranceType: numTolType, unit: numUnit.trim() || undefined } } };
        break;
      }
      case "matching": {
        const kept = pairs.map((p) => ({ left: p.left.trim(), right: p.right.trim() })).filter((p) => p.left && p.right);
        if (kept.length < 2) return setProblem("Add at least two complete pairs.");
        payload = { ...base, type, config: { ...cfg, pairs: kept } };
        break;
      }
      case "ordering": {
        const kept = order.map((o) => o.trim()).filter(Boolean);
        if (kept.length < 2) return setProblem("Add at least two items, in the correct order.");
        payload = { ...base, type, config: { ...cfg, order: kept } };
        break;
      }
      default: {
        if ((type === "case_study" || type === "scenario") && !stem.trim()) return setProblem("Write the case study / scenario text students will read.");
        payload = { ...base, type, config: cfg };
      }
    }
    const ok = await onSubmit(payload);
    if (ok && resetOnSuccess) {
      setPrompt(""); setOptions(["", "", "", ""]); setCorrectIdx(0); setMultiCorrect([]); setBlanks([]); setAccepted(""); setModelAnswer(""); setNumAnswer("");
      setPairs([{ left: "", right: "" }, { left: "", right: "" }]); setOrder(["", ""]); setStem(""); setExplanation(""); setIncorrectExplanation(""); setMarks("1"); setOptFeedback({});
    }
  }

  const setOpt = (i: number, v: string) => setOptions((os) => os.map((x, k) => (k === i ? v : x)));
  const removeOpt = (i: number) => {
    setOptions((os) => os.filter((_, k) => k !== i));
    setCorrectIdx((cx) => (cx === i ? 0 : cx > i ? cx - 1 : cx));
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_90px_110px]">
        <select value={type} onChange={(e) => setType(e.target.value)} className="input" aria-label="Question type" disabled={!!initial && false}>
          {TYPE_ORDER.map((v) => <option key={v} value={v}>{TYPE_LABEL[v]}</option>)}
        </select>
        <input type="number" min={1} max={100} value={marks} onChange={(e) => setMarks(e.target.value)} className="input" aria-label="Marks" placeholder="Marks" />
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="input" aria-label="Difficulty"><option value="easy">Easy</option><option value="medium">Intermediate</option><option value="hard">Advanced</option></select>
      </div>

      {(type === "case_study" || type === "scenario") && (
        <textarea required rows={5} value={stem} onChange={(e) => setStem(e.target.value)} placeholder={type === "case_study" ? "Case study text students will read…" : "Describe the scenario…"} className="input" />
      )}
      <textarea required rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={type === "fill_blank" ? "Question, with ___ where each blank goes" : type === "case_study" || type === "scenario" ? "The question about the case / scenario" : "Question"} className="input" />

      {type === "mcq" && (
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2">
                <input type="radio" name="correct" checked={correctIdx === i} onChange={() => setCorrectIdx(i)} aria-label={`Option ${i + 1} is correct`} />
                <input value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={`Option ${i + 1}`} className="input py-1.5" />
                {options.length > 2 && <button type="button" className="text-xs text-navy-dark" onClick={() => removeOpt(i)} aria-label={`Remove option ${i + 1}`}>✕</button>}
              </div>
              {o.trim() && <input value={optFeedback[o.trim()] ?? ""} onChange={(e) => setOptFeedback((f) => ({ ...f, [o.trim()]: e.target.value }))} placeholder="Feedback if a student picks this (optional)" className="input ml-6 w-[calc(100%-1.5rem)] py-1 text-xs" />}
            </div>
          ))}
          {options.length < 8 && <button type="button" className="text-xs text-navy underline decoration-dotted" onClick={() => setOptions((os) => [...os, ""])}>+ Add option</button>}
          <p className="text-xs text-ink/45">The selected circle marks the correct answer.</p>
        </div>
      )}

      {type === "mcq_multi" && (
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="checkbox" checked={!!o.trim() && multiCorrect.includes(o.trim())} disabled={!o.trim()} onChange={(e) => setMultiCorrect((m) => (e.target.checked ? [...m, o.trim()] : m.filter((x) => x !== o.trim())))} aria-label={`Option ${i + 1} is correct`} />
              <input value={o} onChange={(e) => { setMultiCorrect((m) => m.map((x) => (x === o.trim() ? e.target.value.trim() : x))); setOpt(i, e.target.value); }} placeholder={`Option ${i + 1}`} className="input py-1.5" />
              {options.length > 2 && <button type="button" className="text-xs text-navy-dark" onClick={() => removeOpt(i)} aria-label={`Remove option ${i + 1}`}>✕</button>}
            </div>
          ))}
          {options.length < 8 && <button type="button" className="text-xs text-navy underline decoration-dotted" onClick={() => setOptions((os) => [...os, ""])}>+ Add option</button>}
          <p className="text-xs text-ink/45">Tick every correct option.</p>
        </div>
      )}

      {type === "true_false" && (
        <div className="flex gap-6 text-sm">{["True", "False"].map((v) => <label key={v} className="flex items-center gap-2"><input type="radio" name="tf" checked={tf === v} onChange={() => setTf(v)} /> {v}</label>)}</div>
      )}

      {type === "fill_blank" && (
        <div className="space-y-2">
          <p className="text-xs text-ink/50">{blankCount === 0 ? "Type ___ in the question wherever a blank goes." : `${blankCount} blank${blankCount === 1 ? "" : "s"} found. Accepted answers for each (separate alternatives with |):`}</p>
          {Array.from({ length: blankCount }, (_, i) => (
            <input key={i} value={blanks[i] ?? ""} onChange={(e) => setBlanks((b) => { const n = b.slice(); n[i] = e.target.value; return n; })} placeholder={`Blank ${i + 1}: e.g. Nairobi | nairobi city`} className="input py-1.5" />
          ))}
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} /> Case-sensitive</label>
        </div>
      )}

      {type === "short_answer" && (
        <div className="space-y-2">
          <textarea rows={3} value={accepted} onChange={(e) => setAccepted(e.target.value)} placeholder={"Accepted answers, one per line (optional).\nWith these the question is marked automatically; without, you mark it by hand."} className="input" />
          <input value={modelAnswer} onChange={(e) => setModelAnswer(e.target.value)} placeholder="Model answer (shown to you when marking)" className="input" />
          {lines(accepted).length > 0 && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} /> Case-sensitive</label>}
        </div>
      )}

      {type === "numerical" && (
        <div className="grid gap-2 sm:grid-cols-4">
          <input value={numAnswer} onChange={(e) => setNumAnswer(e.target.value)} inputMode="decimal" placeholder="Correct answer" className="input" aria-label="Correct numeric answer" />
          <input value={numTol} onChange={(e) => setNumTol(e.target.value)} inputMode="decimal" placeholder="± tolerance" className="input" aria-label="Tolerance" />
          <select value={numTolType} onChange={(e) => setNumTolType(e.target.value === "percent" ? "percent" : "abs")} className="input" aria-label="Tolerance type"><option value="abs">absolute</option><option value="percent">percent</option></select>
          <input value={numUnit} onChange={(e) => setNumUnit(e.target.value)} placeholder="Unit (optional)" className="input" aria-label="Unit" />
        </div>
      )}

      {type === "matching" && (
        <div className="space-y-2">
          {pairs.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
              <input value={p.left} onChange={(e) => setPairs((ps) => ps.map((x, k) => (k === i ? { ...x, left: e.target.value } : x)))} placeholder="Item" className="input py-1.5" />
              <span className="text-ink/40">→</span>
              <input value={p.right} onChange={(e) => setPairs((ps) => ps.map((x, k) => (k === i ? { ...x, right: e.target.value } : x)))} placeholder="Matches" className="input py-1.5" />
              {pairs.length > 2 && <button type="button" className="text-xs text-navy-dark" onClick={() => setPairs((ps) => ps.filter((_, k) => k !== i))} aria-label={`Remove pair ${i + 1}`}>✕</button>}
            </div>
          ))}
          {pairs.length < 10 && <button type="button" className="text-xs text-navy underline decoration-dotted" onClick={() => setPairs((ps) => [...ps, { left: "", right: "" }])}>+ Add pair</button>}
        </div>
      )}

      {type === "ordering" && (
        <div className="space-y-2">
          <p className="text-xs text-ink/50">Enter the items in the CORRECT order. Students see them shuffled.</p>
          {order.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 font-mono text-xs text-ink/45">{i + 1}.</span>
              <input value={o} onChange={(e) => setOrder((os) => os.map((x, k) => (k === i ? e.target.value : x)))} placeholder={`Step ${i + 1}`} className="input py-1.5" />
              {order.length > 2 && <button type="button" className="text-xs text-navy-dark" onClick={() => setOrder((os) => os.filter((_, k) => k !== i))} aria-label={`Remove item ${i + 1}`}>✕</button>}
            </div>
          ))}
          {order.length < 12 && <button type="button" className="text-xs text-navy underline decoration-dotted" onClick={() => setOrder((os) => [...os, ""])}>+ Add item</button>}
        </div>
      )}

      {isManual && (
        <div className="space-y-2">
          <textarea rows={2} value={rubricHint} onChange={(e) => setRubricHint(e.target.value)} placeholder={type === "practical" ? "What a competent demonstration looks like (shown to you when marking)" : "Marking guidance (shown to you when marking)"} className="input" />
          <p className="text-xs text-ink/45">Marked by you in the marking queue. A quiz containing this question isn't scored until you've marked it.</p>
        </div>
      )}

      <details className="border border-line bg-paper/40 px-3 py-2 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-ink/70">Marking policy, feedback, media and labels</summary>
        <div className="mt-3 space-y-3">
          {supportsPartial && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} /> Award partial credit</label>}
          {supportsNegative && (
            <label className="flex items-center gap-2 text-xs">Negative marking: deduct <input value={negPct} onChange={(e) => setNegPct(e.target.value)} inputMode="numeric" className="input w-16 py-1" aria-label="Negative marking percent" placeholder="0" /> % of the marks for a wrong (attempted) answer</label>
          )}
          <input value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Explanation of the correct answer (shown after submitting)" className="input" />
          <input value={incorrectExplanation} onChange={(e) => setIncorrectExplanation(e.target.value)} placeholder="Why common wrong answers are wrong (shown only to those who got it wrong)" className="input" />
          <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
            <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="Image / audio / video link (https://… or an uploaded file's URL)" className="input" />
            <select value={mediaKind} onChange={(e) => setMediaKind(e.target.value)} className="input" aria-label="Media type"><option value="image">Image</option><option value="audio">Audio</option><option value="video">Video</option></select>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic" className="input" />
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, comma separated" className="input" />
          </div>
        </div>
      </details>

      {problem && <p className="text-xs text-navy-dark" role="alert">{problem}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary px-4 py-2">{submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel} className="btn-secondary px-4 py-2">Cancel</button>}
      </div>
    </form>
  );
}
