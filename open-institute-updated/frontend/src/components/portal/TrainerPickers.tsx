import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

// Dropdowns for choosing a course / assessment / student, so no trainer-portal
// page ever asks for a pasted database id.

export type CourseOption = {
  id: string;
  title: string;
  lmsEngine: string;
  unit: { id: string; title: string; code: string; programmeId: string };
  assessments: { id: string; title: string; type: string; totalMarks: number; isDraft: boolean }[];
  assignments: { id: string; title: string; totalMarks: number }[];
};

export function useCourseOptions(): { courses: CourseOption[] | null; error: string | null } {
  const [courses, setCourses] = useState<CourseOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch<CourseOption[]>("/trainer-self/course-options")
      .then((c) => { if (!cancelled) setCourses(c); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load your courses."); });
    return () => { cancelled = true; };
  }, []);
  return { courses, error };
}

const labelCls = "text-sm font-medium text-ink/80";

export function CoursePicker({
  value,
  onChange,
  label = "Course",
  className = "",
  courses: provided,
}: {
  value: string;
  onChange: (courseId: string, course: CourseOption | null) => void;
  label?: string;
  className?: string;
  courses?: { courses: CourseOption[] | null; error: string | null };
}) {
  const own = useCourseOptions();
  const { courses, error } = provided ?? own;

  // With exactly one course there's nothing to choose — select it.
  useEffect(() => {
    if (courses && courses.length === 1 && !value) onChange(courses[0].id, courses[0]);
  }, [courses, value, onChange]);

  return (
    <label className={`block ${className}`}>
      {label && <span className={labelCls}>{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value, courses?.find((c) => c.id === e.target.value) ?? null)}
        className="input mt-1.5"
      >
        <option value="">{courses === null && !error ? "Loading your courses…" : courses && courses.length === 0 ? "You have no courses yet" : "Select a course…"}</option>
        {(courses ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.unit.code} — {c.title}
          </option>
        ))}
      </select>
      {error && <span className="mt-1 block text-xs text-navy-dark">{error}</span>}
    </label>
  );
}

// An assessment across all of the trainer's courses (grouped by course), or
// within one course when `courseId` is given.
export function AssessmentPicker({
  value,
  onChange,
  courseId,
  label = "Assessment",
  className = "",
  required = false,
}: {
  value: string;
  onChange: (assessmentId: string) => void;
  courseId?: string;
  label?: string;
  className?: string;
  required?: boolean;
}) {
  const { courses, error } = useCourseOptions();
  const scoped = (courses ?? []).filter((c) => !courseId || c.id === courseId);
  const total = scoped.reduce((n, c) => n + c.assessments.length, 0);
  return (
    <label className={`block ${className}`}>
      {label && <span className={labelCls}>{label}</span>}
      <select required={required} value={value} onChange={(e) => onChange(e.target.value)} className="input mt-1.5">
        <option value="">{courses === null && !error ? "Loading…" : total === 0 ? "No assessments yet" : "Select an assessment…"}</option>
        {scoped.map((c) => (
          <optgroup key={c.id} label={c.title}>
            {c.assessments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} ({a.type.replace(/_/g, " ").toLowerCase()}, {a.totalMarks} marks){a.isDraft ? " — draft" : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {error && <span className="mt-1 block text-xs text-navy-dark">{error}</span>}
    </label>
  );
}

export type RosterStudent = { studentId: string; userId: string; fullName: string; studentNumber?: string | null; status: string };

// A student from one course's roster. `by` picks which id the parent receives:
// the student record id (grading, attendance) or the user id (messages).
export function StudentPicker({
  courseId,
  value,
  onChange,
  by = "userId",
  label = "Student",
  className = "",
  required = false,
}: {
  courseId: string;
  value: string;
  onChange: (id: string) => void;
  by?: "studentId" | "userId";
  label?: string;
  className?: string;
  required?: boolean;
}) {
  const [roster, setRoster] = useState<RosterStudent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setRoster(null);
    setError(null);
    if (!courseId) return;
    let cancelled = false;
    apiFetch<RosterStudent[]>(`/trainer-self/roster/${courseId}`)
      .then((r) => { if (!cancelled) setRoster(r); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the roster."); });
    return () => { cancelled = true; };
  }, [courseId]);

  return (
    <label className={`block ${className}`}>
      {label && <span className={labelCls}>{label}</span>}
      <select required={required} value={value} onChange={(e) => onChange(e.target.value)} className="input mt-1.5" disabled={!courseId}>
        <option value="">{!courseId ? "Choose a course first" : roster === null && !error ? "Loading…" : "Select a student…"}</option>
        {(roster ?? []).map((s) => (
          <option key={s.studentId} value={by === "userId" ? s.userId : s.studentId}>
            {s.fullName}{s.studentNumber ? ` (${s.studentNumber})` : ""}
          </option>
        ))}
      </select>
      {error && <span className="mt-1 block text-xs text-navy-dark">{error}</span>}
    </label>
  );
}
