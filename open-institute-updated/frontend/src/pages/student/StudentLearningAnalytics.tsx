import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { LoadingState } from "../../components/portal/StateViews";

const links = [
  { to: "/student/dashboard", label: "Dashboard" },
  { to: "/student/courses", label: "My Courses" },
  { to: "/student/learning-analytics", label: "My Learning Analytics" },
];

type Analytics = {
  since: string;
  totalSecondsLast30Days: number;
  byCourse: { courseId: string; courseTitle: string; seconds: number }[];
  lessonsCompletedTotal: number;
};

function fmtHours(seconds: number): string {
  const hrs = seconds / 3600;
  if (hrs < 1) return `${Math.round(seconds / 60)} min`;
  return `${hrs.toFixed(1)} hrs`;
}

// LMS028 — real numbers from LessonTimeLog + LessonProgress (see
// routes/learning-analytics.ts), not a placeholder "analytics" page.
export default function StudentLearningAnalytics() {
  const userName = useCurrentUserName();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Analytics>("/learning-analytics/me")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your learning analytics."));
  }, []);

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">My learning analytics</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Time-on-task from the last 30 days, tracked while a lesson is actually open on screen — not inferred from login gaps.
      </p>
      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}
      {!data && !error && <LoadingState />}

      {data && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <PortalSection title="Total time on task (30 days)">
              <p className="font-display text-3xl">{fmtHours(data.totalSecondsLast30Days)}</p>
            </PortalSection>
            <PortalSection title="Lessons completed (all time)">
              <p className="font-display text-3xl">{data.lessonsCompletedTotal}</p>
            </PortalSection>
          </div>

          <PortalSection title="By course">
            {data.byCourse.length === 0 && <p className="text-sm text-ink/50">No tracked time yet — open a lesson to start.</p>}
            <ul className="space-y-2">
              {data.byCourse.map((c) => (
                <li key={c.courseId} className="flex items-center justify-between border-b border-line py-1.5 text-sm">
                  <span>{c.courseTitle}</span>
                  <Badge tone="neutral">{fmtHours(c.seconds)}</Badge>
                </li>
              ))}
            </ul>
          </PortalSection>
        </>
      )}

      <WeaknessReport />
      <MasteryPrediction />
    </PortalShell>
  );
}

// AI025 — mastery prediction: a real, honest heuristic (recency-weighted
// trend, not a trained model — see lib/mastery-prediction.ts) computed
// from this student's own graded scores per unit.
type UnitMastery = {
  unitId: string;
  unitCode: string;
  unitTitle: string;
  attempts: number;
  latestPercent: number | null;
  predictedNextPercent: number | null;
  trend: "improving" | "declining" | "stable" | "insufficient_data";
  masteryLevel: "not_yet_competent" | "developing" | "competent" | "mastered";
  confidence: "low" | "medium" | "high";
};

const MASTERY_LABEL: Record<UnitMastery["masteryLevel"], string> = {
  mastered: "Mastered",
  competent: "Competent",
  developing: "Developing",
  not_yet_competent: "Not yet competent",
};

const MASTERY_TONE: Record<UnitMastery["masteryLevel"], "ok" | "warn" | "neutral"> = {
  mastered: "ok",
  competent: "ok",
  developing: "warn",
  not_yet_competent: "warn",
};

const TREND_ARROW: Record<UnitMastery["trend"], string> = {
  improving: "↑ improving",
  declining: "↓ declining",
  stable: "→ stable",
  insufficient_data: "— not enough attempts yet",
};

function MasteryPrediction() {
  const [byUnit, setByUnit] = useState<UnitMastery[] | null>(null);

  useEffect(() => {
    apiFetch<{ byUnit: UnitMastery[] }>("/learning-analytics/mastery/me")
      .then((d) => setByUnit(d.byUnit))
      .catch(() => setByUnit(null));
  }, []);

  if (!byUnit) return null;

  return (
    <div className="mt-6">
      <PortalSection title="Mastery prediction (per unit)">
        <p className="mb-4 text-xs text-ink/50">
          A deterministic trend projection from your own graded scores — recent attempts weighted more heavily than
          older ones — not a trained prediction model. Treat it as a heads-up, not a guarantee.
        </p>
        {byUnit.length === 0 ? (
          <p className="text-sm text-ink/50">No graded scores yet — this fills in once assessments or assignments are graded.</p>
        ) : (
          <ul className="space-y-3">
            {byUnit.map((u) => (
              <li key={u.unitId} className="border-b border-line pb-3 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {u.unitCode} — {u.unitTitle}
                  </span>
                  <Badge tone={MASTERY_TONE[u.masteryLevel]}>{MASTERY_LABEL[u.masteryLevel]}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink/55">
                  {u.attempts} graded attempt{u.attempts === 1 ? "" : "s"} · latest {u.latestPercent ?? "—"}%
                  {u.predictedNextPercent !== null && ` · predicted next ${u.predictedNextPercent}%`} ·{" "}
                  {TREND_ARROW[u.trend]} · confidence: {u.confidence}
                </p>
              </li>
            ))}
          </ul>
        )}
      </PortalSection>
    </div>
  );
}

// AI026 — weakness detection: real per-topic accuracy from this student's
// own graded question responses (see lib/weakness-detection.ts), not the
// institution-wide "students who've gone quiet" count command-centre.ts
// uses for a different purpose (disengagement, not weakness).
type WeakTopic = { topic: string; attempts: number; correct: number; accuracyPercent: number };
function WeaknessReport() {
  const [weakTopics, setWeakTopics] = useState<WeakTopic[] | null>(null);

  useEffect(() => {
    apiFetch<{ weakTopics: WeakTopic[] }>("/learning-analytics/weakness/me")
      .then((d) => setWeakTopics(d.weakTopics))
      .catch(() => setWeakTopics(null));
  }, []);

  if (!weakTopics) return null;

  return (
    <div className="mt-6">
      <PortalSection title="Topics to revise">
        {weakTopics.length === 0 ? (
          <p className="text-sm text-ink/50">
            No consistently weak topics yet from your graded attempts — keep it up.
          </p>
        ) : (
          <ul className="space-y-2">
            {weakTopics.map((t) => (
              <li key={t.topic} className="flex items-center justify-between border-b border-line py-1.5 text-sm">
                <span>{t.topic}</span>
                <Badge tone="warn">
                  {t.correct}/{t.attempts} correct ({t.accuracyPercent}%)
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </PortalSection>
    </div>
  );
}
