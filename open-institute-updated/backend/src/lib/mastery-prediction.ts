// AI025 — Mastery prediction.
//
// The AI026 module note (lib/weakness-detection.ts) previously said this
// "correctly remains unbuilt — it needs a labelled dataset and a model
// this system has neither of". That's true of a *trained* mastery model
// (something fit on historical outcome data to predict pass/fail
// probability, the way a real learning-analytics platform's mastery
// engine would). This system has no labelled training set and no ML
// infrastructure, and none of that changed this batch — nothing here
// calls a model or is "trained" on anything.
//
// What's built instead, honestly: a deterministic trend heuristic over a
// student's own real graded scores for a unit — the same category of
// thing AI024's suggestDifficulty() and AI026's computeWeakTopics()
// already are (real data, simple rules, not a classifier). It looks at
// the student's chronological score history for a unit, weights recent
// attempts more heavily than older ones, fits a plain linear trend across
// attempt order, and reports a predicted next-attempt percentage, a
// trend direction, and a mastery band — clearly labelled as a heuristic
// projection, not a probability from a trained model.

export type ScoredAttempt = {
  /** Percentage (0-100), already normalised from score/totalMarks by the caller. */
  percent: number;
  /** When this attempt was graded — used only to order attempts oldest-first. */
  at: Date;
};

export type MasteryLevel = "not_yet_competent" | "developing" | "competent" | "mastered";
export type MasteryTrend = "improving" | "declining" | "stable" | "insufficient_data";
export type MasteryConfidence = "low" | "medium" | "high";

export type MasteryPrediction = {
  attempts: number;
  latestPercent: number | null;
  /** Recency-weighted mean, not a plain average — a student's last few attempts matter more than their first. */
  weightedAveragePercent: number | null;
  /** Slope of a simple linear fit across attempt order, in percentage points per attempt. */
  trendSlope: number | null;
  trend: MasteryTrend;
  /** weightedAveragePercent + one trendSlope step, clamped to [0, 100]. Null with fewer than 2 attempts. */
  predictedNextPercent: number | null;
  masteryLevel: MasteryLevel;
  confidence: MasteryConfidence;
};

function masteryLevelFor(percent: number): MasteryLevel {
  if (percent >= 80) return "mastered";
  if (percent >= 60) return "competent";
  if (percent >= 40) return "developing";
  return "not_yet_competent";
}

/**
 * Recency-weighted mean: attempt i (0 = oldest) gets weight (i + 1), so the
 * most recent attempt in a run of N carries N times the weight of the
 * first. Chosen over an exponential decay for the same reason the rest of
 * this codebase favours simple, auditable arithmetic over a tunable curve
 * with no data to tune it against.
 */
function weightedMean(values: number[]): number {
  let weightedSum = 0;
  let weightTotal = 0;
  values.forEach((v, i) => {
    const w = i + 1;
    weightedSum += v * w;
    weightTotal += w;
  });
  return weightedSum / weightTotal;
}

/** Ordinary least-squares slope of `values` against their index (0, 1, 2, ...). */
function linearSlope(values: number[]): number {
  const n = values.length;
  const xs = values.map((_, i) => i);
  const xMean = xs.reduce((s, x) => s + x, 0) / n;
  const yMean = values.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (values[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function predictMastery(attemptsInput: ScoredAttempt[]): MasteryPrediction {
  const attempts = [...attemptsInput].sort((a, b) => a.at.getTime() - b.at.getTime());
  const percents = attempts.map((a) => a.percent);

  if (attempts.length === 0) {
    return {
      attempts: 0,
      latestPercent: null,
      weightedAveragePercent: null,
      trendSlope: null,
      trend: "insufficient_data",
      predictedNextPercent: null,
      masteryLevel: "not_yet_competent",
      confidence: "low",
    };
  }

  const latestPercent = percents[percents.length - 1];
  const weightedAveragePercent = Math.round(weightedMean(percents) * 10) / 10;

  if (attempts.length === 1) {
    return {
      attempts: 1,
      latestPercent,
      weightedAveragePercent,
      trendSlope: null,
      trend: "insufficient_data",
      predictedNextPercent: null,
      masteryLevel: masteryLevelFor(latestPercent),
      confidence: "low",
    };
  }

  const trendSlope = Math.round(linearSlope(percents) * 10) / 10;
  // A slope inside +-1.5 points/attempt reads as noise, not a real trend,
  // given typical assessment-score variance — not statistically derived,
  // a deliberately conservative band so "stable" is the honest default.
  const trend: MasteryTrend = trendSlope > 1.5 ? "improving" : trendSlope < -1.5 ? "declining" : "stable";
  const predictedNextPercent = Math.max(0, Math.min(100, Math.round(weightedAveragePercent + trendSlope)));

  const confidence: MasteryConfidence = attempts.length >= 5 ? "high" : attempts.length >= 3 ? "medium" : "low";

  return {
    attempts: attempts.length,
    latestPercent,
    weightedAveragePercent,
    trendSlope,
    trend,
    predictedNextPercent,
    masteryLevel: masteryLevelFor(predictedNextPercent),
    confidence,
  };
}
