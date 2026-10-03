// AI026 — Weakness detection. Previously the only thing in the system that
// resembled this was command-centre.ts's institution-wide "students with no
// submission in 12+ days" count — a disengagement signal, not a weakness
// one, and not per-student or per-topic at all. This is the real thing:
// given a student's graded question responses, find the topics where they
// are genuinely struggling, using the `Question.topic` tag that was already
// being set on every question but never read by anything analytical.
//
// Deliberately simple and honest: this is accuracy-rate-per-topic on real
// graded attempts, not a trained mastery model (that would be AI025, which
// correctly remains unbuilt — it needs a labelled dataset and a model this
// system has neither of).

export type ResponseForWeakness = {
  topic: string | null;
  isCorrect: boolean | null;
};

export type WeakTopic = {
  topic: string;
  attempts: number;
  correct: number;
  accuracyPercent: number;
};

export type WeaknessOptions = {
  /** A topic needs at least this many graded attempts before it's judged — a 0-of-1 miss isn't a pattern. */
  minAttempts?: number;
  /** Accuracy strictly below this percentage counts as a weak topic. */
  thresholdPercent?: number;
};

export function computeWeakTopics(responses: ResponseForWeakness[], opts: WeaknessOptions = {}): WeakTopic[] {
  const minAttempts = opts.minAttempts ?? 3;
  const thresholdPercent = opts.thresholdPercent ?? 60;

  const byTopic = new Map<string, { attempts: number; correct: number }>();
  for (const r of responses) {
    if (!r.topic || r.isCorrect === null) continue; // ungraded or untagged — nothing to learn from
    const entry = byTopic.get(r.topic) ?? { attempts: 0, correct: 0 };
    entry.attempts += 1;
    if (r.isCorrect) entry.correct += 1;
    byTopic.set(r.topic, entry);
  }

  const weak: WeakTopic[] = [];
  for (const [topic, { attempts, correct }] of byTopic) {
    const accuracyPercent = Math.round((correct / attempts) * 100);
    if (attempts >= minAttempts && accuracyPercent < thresholdPercent) {
      weak.push({ topic, attempts, correct, accuracyPercent });
    }
  }

  return weak.sort((a, b) => a.accuracyPercent - b.accuracyPercent);
}

/**
 * AI024 — adaptive learning: suggests a starting difficulty for the AI
 * tutor from a student's own recent graded assessment scores, rather than
 * leaving the selector on a fixed default every time. This never overrides
 * a student's own choice; it just changes what the selector defaults to.
 */
export function suggestDifficulty(recentScorePercentages: number[]): "beginner" | "intermediate" | "advanced" {
  if (recentScorePercentages.length === 0) return "intermediate";
  const avg = recentScorePercentages.reduce((s, n) => s + n, 0) / recentScorePercentages.length;
  if (avg < 50) return "beginner";
  if (avg < 75) return "intermediate";
  return "advanced";
}
