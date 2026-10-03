import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";
import { CoursePicker } from "../../components/portal/TrainerPickers";

type RosterEntry = { studentId: string; fullName: string; studentNumber: string; status: string };
type Performance = {
  studentName: string;
  studentNumber: string;
  enrollmentStatus: string | null;
  assessmentResults: { title: string; totalMarks: number; score: number | null; submittedAt: string | null }[];
  assignmentResults: { title: string; dueAt: string; submitted: boolean; score: number | null }[];
  attendanceRate: number | null;
};

export default function TrainerRoster() {
  const userName = useCurrentUserName();
  const [courseId, setCourseId] = useState("");
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [performance, setPerformance] = useState<Performance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    setRoster(null);
    apiFetch<RosterEntry[]>(`/trainer-self/roster/${courseId}`)
      .then(setRoster)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load roster."));
  }, [courseId]);

  useEffect(() => {
    if (!selected || !courseId) return;
    apiFetch<Performance>(`/trainer-self/student-performance/${courseId}/${selected}`)
      .then(setPerformance)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load performance."));
  }, [selected, courseId]);

  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Student roster</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Every student enrolled in the unit behind this course. Select a
        student to see their real grades and attendance for this course.
      </p>

      <div className="mt-4 max-w-md">
        <CoursePicker value={courseId} onChange={(id) => { setCourseId(id); setSelected(null); setPerformance(null); }} />
      </div>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {courseId && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <PortalSection title="Roster">
            {roster && roster.length === 0 && <p className="text-sm text-ink/50">No students enrolled yet.</p>}
            {roster && roster.length > 0 && (
              <ul className="divide-y divide-line">
                {roster.map((r) => (
                  <li key={r.studentId} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <p>{r.fullName}</p>
                      <p className="text-xs text-ink/45">{r.studentNumber}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone={r.status === "completed" ? "ok" : r.status === "failed" ? "danger" : "neutral"}>{r.status}</Badge>
                      <button className="btn-secondary text-xs" onClick={() => setSelected(r.studentId)}>View</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PortalSection>

          {performance && (
            <PortalSection title={`${performance.studentName} — this course`}>
              <p className="text-xs text-ink/45">{performance.studentNumber}</p>
              <p className="mt-2 text-sm">
                Attendance: {performance.attendanceRate !== null ? `${performance.attendanceRate.toFixed(0)}%` : "No records yet"}
              </p>

              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-ink/50">Assessments</p>
              <ul className="mt-1 space-y-1">
                {performance.assessmentResults.length === 0 && <li className="text-sm text-ink/45">None submitted yet.</li>}
                {performance.assessmentResults.map((a, i) => (
                  <li key={i} className="text-sm">{a.title}: {a.score !== null ? `${a.score}/${a.totalMarks}` : "Not graded yet"}</li>
                ))}
              </ul>

              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-ink/50">Assignments</p>
              <ul className="mt-1 space-y-1">
                {performance.assignmentResults.map((a, i) => (
                  <li key={i} className="text-sm">
                    {a.title}: {a.submitted ? (a.score !== null ? `${a.score}` : "Submitted, awaiting grade") : "Not submitted"}
                  </li>
                ))}
              </ul>
            </PortalSection>
          )}
        </div>
      )}
    </PortalShell>
  );
}
