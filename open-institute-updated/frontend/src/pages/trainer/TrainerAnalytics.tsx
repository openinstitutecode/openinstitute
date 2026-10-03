import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";
import { CoursePicker } from "../../components/portal/TrainerPickers";
import { LoadingState } from "../../components/portal/StateViews";

type CohortAnalytics = {
  courseTitle: string;
  enrolledCount: number;
  perAssessment: { assessmentId: string; title: string; submissionCount: number; mean: number | null; passRate: number | null }[];
  cohortMean: number | null;
  cohortPassRate: number | null;
};

type Engagement = {
  courseTitle: string;
  enrolledCount: number;
  completionRate: number | null;
  activeInLast14Days: number;
  activeRate: number | null;
  assignmentSubmissionRate: number | null;
};

export default function TrainerAnalytics() {
  const userName = useCurrentUserName();
  const [courseId, setCourseId] = useState("");
  const [data, setData] = useState<CohortAnalytics | null>(null);
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    apiFetch<CohortAnalytics>(`/trainer-self/cohort-analytics/${courseId}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load analytics."));
    apiFetch<Engagement>(`/trainer-self/course-engagement/${courseId}`)
      .then(setEngagement)
      .catch(() => undefined);
  }, [courseId]);

  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Cohort analytics</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Real mean score and pass rate per assessment, computed from actual
        graded submissions — averaged into a cohort-level figure. Assessments
        with no graded submissions yet are shown but excluded from the average.
      </p>

      <div className="mt-4 max-w-md">
        <CoursePicker value={courseId} onChange={(id) => { setCourseId(id); setData(null); setEngagement(null); setError(null); }} />
      </div>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {data && (
        <div className="mt-8 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatBlock label="Enrolled" value={data.enrolledCount} />
            <StatBlock label="Cohort mean" value={data.cohortMean !== null ? `${data.cohortMean.toFixed(1)}%` : "No data yet"} />
            <StatBlock label="Cohort pass rate" value={data.cohortPassRate !== null ? `${data.cohortPassRate.toFixed(1)}%` : "No data yet"} />
          </div>

          <PortalSection title={`Per-assessment breakdown — ${data.courseTitle}`}>
            {data.perAssessment.length === 0 && <p className="text-sm text-ink/50">No assessments created for this course yet.</p>}
            <ul className="divide-y divide-line">
              {data.perAssessment.map((a) => (
                <li key={a.assessmentId} className="flex items-center justify-between py-3 text-sm">
                  <span>{a.title}</span>
                  <span className="text-xs text-ink/50">
                    {a.submissionCount === 0
                      ? "No graded submissions"
                      : `${a.submissionCount} graded · mean ${a.mean!.toFixed(1)}% · pass rate ${a.passRate!.toFixed(1)}%`}
                  </span>
                </li>
              ))}
            </ul>
          </PortalSection>
        </div>
      )}

      {/* TP033 — course analytics: completion and engagement, distinct from
          the per-assessment mean/pass-rate above. */}
      {engagement && (
        <div className="mt-8">
          <PortalSection title={`Engagement — ${engagement.courseTitle}`}>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatBlock label="Completion rate" value={engagement.completionRate !== null ? `${engagement.completionRate.toFixed(0)}%` : "No data"} />
              <StatBlock label="Active in last 14 days" value={`${engagement.activeInLast14Days} / ${engagement.enrolledCount}`} />
              <StatBlock label="Assignment submission rate" value={engagement.assignmentSubmissionRate !== null ? `${engagement.assignmentSubmissionRate.toFixed(0)}%` : "No assignments yet"} />
            </div>
          </PortalSection>
        </div>
      )}

      {courseId && <TimeOnTaskPanel courseId={courseId} />}
    </PortalShell>
  );
}

// LMS028/LMS029 — real time-on-task per student, from LessonTimeLog
// heartbeats (see lib/lesson-engagement.ts on the student side), not
// inferred from session/login gaps.
function TimeOnTaskPanel({ courseId }: { courseId: string }) {
  type Row = { studentId: string; studentName: string; studentNumber: string | null; secondsLast30Days: number; lessonsCompleted: number; totalLessons: number };
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    apiFetch<{ students: Row[] }>(`/learning-analytics/course/${courseId}`)
      .then((d) => setRows(d.students))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load time-on-task."));
  }, [courseId]);

  function fmt(seconds: number): string {
    const hrs = seconds / 3600;
    return hrs < 1 ? `${Math.round(seconds / 60)} min` : `${hrs.toFixed(1)} hrs`;
  }

  return (
    <div className="mt-8">
      <PortalSection title="Time on task (last 30 days)">
        {error && <p className="text-sm text-navy-dark">{error}</p>}
        {!rows && !error && <LoadingState />}
        {rows && rows.length === 0 && <p className="text-sm text-ink/50">No enrolled students yet.</p>}
        {rows && rows.length > 0 && (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ink/50"><th className="pb-2">Student</th><th className="pb-2">Time on task</th><th className="pb-2">Lessons</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.studentId} className="border-t border-line">
                  <td className="py-2">{r.studentName}{r.studentNumber ? ` (${r.studentNumber})` : ""}</td>
                  <td className="py-2">{fmt(r.secondsLast30Days)}</td>
                  <td className="py-2">{r.lessonsCompleted} / {r.totalLessons}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PortalSection>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-line bg-white p-6">
      <p className="text-sm text-ink/55">{label}</p>
      <p className="mt-2 font-display text-3xl">{value}</p>
    </div>
  );
}
