import { useState } from "react";
import { apiFetch } from "../../lib/api";

// Batch 75 — KAI-020: rate an AI answer (posts to /api/self/ai-feedback).
const OPTIONS = [["helpful", "Helpful"], ["not_helpful", "Not helpful"], ["wrong", "Wrong"], ["unsafe", "Unsafe"]] as const;
export default function AiFeedback({ messageId }: { messageId?: string }) {
  const [sent, setSent] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  if (!messageId) return null;
  async function rate(rating: string) {
    setErr(false);
    try { await apiFetch("/self/ai-feedback", { method: "POST", body: JSON.stringify({ messageId, rating }) }); setSent(rating); } catch { setErr(true); }
  }
  if (sent) return <p role="status" className="mt-1 text-xs text-ink/50">Thanks — your rating was recorded.</p>;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink/50" role="group" aria-label="Rate this answer">
      <span>Rate this answer:</span>
      {OPTIONS.map(([v, label]) => <button key={v} type="button" onClick={() => rate(v)} className="text-navy underline decoration-dotted">{label}</button>)}
      {err && <span role="alert" className="text-red-700">Could not save — try again.</span>}
    </div>
  );
}
