import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";
import { LoadingState } from "../../components/portal/StateViews";

type Session = {
  id: string;
  unit: string;
  studentId: string;
  student: { fullName: string };
  startedAt: string;
  endedAt: string | null;
  score: number | null;
  feedback: string | null;
};
type Turn = { id: string; role: "student" | "examiner"; content: string };
type SessionDetail = Session & { turns: Turn[] };

// AI033 — AI viva review. viva.ts persists a real transcript per session
// (AiVivaSession/AiVivaTurn); this is the trainer side that reads it back
// and records the trainer-confirmed score — the AI examiner never scores
// its own conversation, same principle as EX036's simulation lab review.
export default function TrainerVivaReview() {
  const userName = useCurrentUserName();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [onlyUnscored, setOnlyUnscored] = useState(true);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch<Session[]>(`/viva/sessions${onlyUnscored ? "?unscored=true" : ""}`)
      .then(setSessions)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load sessions."));
  }
  useEffect(load, [onlyUnscored]);

  function open(id: string) {
    apiFetch<SessionDetail>(`/viva/sessions/${id}`)
      .then((d) => {
        setDetail(d);
        setScore(d.score !== null ? String(d.score) : "");
        setFeedback(d.feedback ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not open this session."));
  }

  async function submitScore() {
    if (!detail) return;
    const value = Number(score);
    if (Number.isNaN(value) || value < 0 || value > 100) return setError("Score must be 0-100.");
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/viva/sessions/${detail.id}/score`, {
        method: "PATCH",
        body: JSON.stringify({ score: value, feedback: feedback || undefined }),
      });
      setDetail(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the score.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">AI viva review</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Ended viva sessions, with the full transcript against the AI examiner. Confirm a real, human score,
        the same way you would after observing an oral exam in person — the AI examiner never scores itself.
      </p>

      <label className="mt-4 flex items-center gap-2 text-xs text-ink/60">
        <input type="checkbox" checked={onlyUnscored} onChange={(e) => setOnlyUnscored(e.target.checked)} />
        Only show unscored sessions
      </label>

      {error && <p className="mt-2 text-sm text-navy-dark">{error}</p>}

      <div className="mt-4">
        <PortalSection title="Ended sessions">
          {!sessions && <LoadingState />}
          {sessions && sessions.length === 0 && <p className="text-sm text-ink/50">Nothing to review.</p>}
          <ul className="divide-y divide-line">
            {sessions?.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {s.student.fullName} — {s.unit}
                </span>
                <div className="flex items-center gap-2">
                  {s.score !== null && <Badge tone="ok">{s.score}/100</Badge>}
                  <button onClick={() => open(s.id)} className="btn-secondary px-2 py-1 text-xs">
                    Review
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>

      {detail && (
        <div className="mt-6">
          <PortalSection title={`${detail.student.fullName} — ${detail.unit}`}>
            <div className="max-h-80 space-y-3 overflow-y-auto border-b border-line pb-4">
              {detail.turns.map((t) => (
                <div key={t.id} className={`text-sm ${t.role === "student" ? "text-right" : ""}`}>
                  <span
                    className={`inline-block max-w-[85%] rounded-sm px-4 py-2 ${
                      t.role === "student" ? "bg-navy text-paper" : "bg-navy/[0.05]"
                    }`}
                  >
                    {t.content}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[120px_1fr]">
              <input
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="Score /100"
                className="input"
              />
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Feedback (optional)"
                rows={2}
                className="input"
              />
            </div>
            <button onClick={submitScore} disabled={saving} className="btn-primary mt-3 px-4 py-2 text-sm disabled:opacity-50">
              Save score
            </button>
          </PortalSection>
        </div>
      )}
    </PortalShell>
  );
}
