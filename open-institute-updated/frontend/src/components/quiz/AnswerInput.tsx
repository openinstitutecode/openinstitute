import { StudentQuestion } from "./quizTypes";

// Batch 76 — one student answer control per question type. Answers travel as
// strings: plain text for single-value types, JSON for multi-part ones
// (mcq_multi/fill_blank/ordering → array, matching → object). The server
// parses them with the same rules (backend lib/quiz-engine.ts).

const tryJson = <T,>(raw: string | undefined, fallback: T): T => {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return v as T;
  } catch {
    return fallback;
  }
};

export function Media({ q }: { q: StudentQuestion }) {
  if (!q.mediaUrl) return null;
  if (q.mediaKind === "image") return <img src={q.mediaUrl} alt="" className="mt-3 max-h-72 border border-line" loading="lazy" />;
  if (q.mediaKind === "audio") return <audio src={q.mediaUrl} controls className="mt-3 w-full" />;
  if (q.mediaKind === "video") return <video src={q.mediaUrl} controls className="mt-3 max-h-72 w-full" />;
  return null;
}

export function AnswerInput({ q, value, onChange, disabled = false }: { q: StudentQuestion; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  switch (q.type) {
    case "mcq":
      return (
        <div className="mt-3 space-y-2" role="radiogroup" aria-label="Choose one answer">
          {q.options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <input type="radio" name={q.id} disabled={disabled} checked={value === opt} onChange={() => onChange(opt)} /> {opt}
            </label>
          ))}
        </div>
      );

    case "mcq_multi": {
      const picked = tryJson<string[]>(value, []);
      return (
        <div className="mt-3 space-y-2" role="group" aria-label="Choose all that apply">
          <p className="text-xs text-ink/50">Select all that apply.</p>
          {q.options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={disabled}
                checked={picked.includes(opt)}
                onChange={(e) => {
                  const next = e.target.checked ? [...picked, opt] : picked.filter((x) => x !== opt);
                  onChange(next.length ? JSON.stringify(next) : "");
                }}
              />{" "}
              {opt}
            </label>
          ))}
        </div>
      );
    }

    case "fill_blank": {
      const n = q.blanks ?? 1;
      const vals = tryJson<string[]>(value, []);
      return (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {Array.from({ length: n }, (_, i) => (
            <input
              key={i}
              disabled={disabled}
              className="input"
              aria-label={`Blank ${i + 1}`}
              placeholder={`Blank ${i + 1}`}
              value={vals[i] ?? ""}
              onChange={(e) => {
                const next = Array.from({ length: n }, (_, k) => (k === i ? e.target.value : vals[k] ?? ""));
                onChange(next.every((x) => x.trim() === "") ? "" : JSON.stringify(next));
              }}
            />
          ))}
        </div>
      );
    }

    case "numerical":
      return (
        <div className="mt-3 flex items-center gap-2">
          <input disabled={disabled} className="input w-48" inputMode="decimal" aria-label="Numeric answer" placeholder="Your answer" value={value} onChange={(e) => onChange(e.target.value)} />
          {q.unit && <span className="text-sm text-ink/60">{q.unit}</span>}
        </div>
      );

    case "matching": {
      const map = tryJson<Record<string, string>>(value, {});
      return (
        <div className="mt-3 space-y-2">
          {(q.lefts ?? []).map((left) => (
            <label key={left} className="grid items-center gap-2 text-sm sm:grid-cols-2">
              <span>{left}</span>
              <select
                disabled={disabled}
                className="input"
                value={map[left] ?? ""}
                onChange={(e) => {
                  const next = { ...map, [left]: e.target.value };
                  if (!e.target.value) delete next[left];
                  onChange(Object.keys(next).length ? JSON.stringify(next) : "");
                }}
              >
                <option value="">— choose —</option>
                {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          ))}
        </div>
      );
    }

    case "ordering": {
      // Starts as the served (shuffled) order; the student reorders it. Untouched = no answer recorded.
      const order = tryJson<string[]>(value, q.options);
      const move = (i: number, dir: -1 | 1) => {
        const j = i + dir;
        if (j < 0 || j >= order.length) return;
        const next = order.slice();
        [next[i], next[j]] = [next[j], next[i]];
        onChange(JSON.stringify(next));
      };
      return (
        <div className="mt-3">
          <p className="text-xs text-ink/50">Put these in the correct order, first to last.{!value && " (Move an item to record your answer.)"}</p>
          <ol className="mt-2 space-y-1">
            {order.map((item, i) => (
              <li key={item} className="flex items-center gap-2 border border-line bg-paper/60 px-3 py-1.5 text-sm">
                <span className="w-5 font-mono text-xs text-ink/45">{i + 1}.</span>
                <span className="min-w-0 flex-1">{item}</span>
                <button type="button" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${item} up`} className="text-navy disabled:opacity-30">↑</button>
                <button type="button" disabled={disabled || i === order.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${item} down`} className="text-navy disabled:opacity-30">↓</button>
              </li>
            ))}
          </ol>
        </div>
      );
    }

    case "essay":
    case "case_study":
    case "scenario":
    case "practical":
      return (
        <textarea
          disabled={disabled}
          rows={8}
          className="input mt-3"
          placeholder={q.type === "practical" ? "Describe how you demonstrated the competency, with evidence references…" : "Your answer…"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    default:
      // short_answer and anything unknown
      return <textarea disabled={disabled} rows={2} className="input mt-3" placeholder="Your answer…" value={value} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** True when the stored answer string counts as "answered". */
export function hasAnswer(v: string | undefined): boolean {
  if (!v) return false;
  const t = v.trim();
  return t !== "" && t !== "[]" && t !== "{}";
}
