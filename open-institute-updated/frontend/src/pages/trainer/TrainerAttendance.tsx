import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { CoursePicker, RosterStudent } from "../../components/portal/TrainerPickers";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";

type Record_ = { studentId: string; sessionDate: string; present: boolean };

// TP027 — mark attendance from the course's real roster (no pasted ids),
// pre-filled with anything already recorded for that date, and a per-student
// attendance rate over the sessions recorded so far.
export default function TrainerAttendance() {
  const userName = useCurrentUserName();
  const [courseId, setCourseId] = useState("");
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10));
  const [roster, setRoster] = useState<RosterStudent[] | null>(null);
  const [history, setHistory] = useState<Record_[]>([]);
  const [present, setPresent] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRoster(null);
    setHistory([]);
    setSaved(null);
    setError(null);
    if (!courseId) return;
    let cancelled = false;
    Promise.all([
      apiFetch<RosterStudent[]>(`/trainer-self/roster/${courseId}`),
      apiFetch<Record_[]>(`/attendance/course/${courseId}`),
    ])
      .then(([r, h]) => {
        if (cancelled) return;
        setRoster(r);
        setHistory(h);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the class."); });
    return () => { cancelled = true; };
  }, [courseId]);

  // Pre-fill the checkboxes from what's already recorded for the chosen date; default everyone to present.
  useEffect(() => {
    if (!roster) return;
    const forDay = new Map(history.filter((h) => h.sessionDate.slice(0, 10) === sessionDate).map((h) => [h.studentId, h.present]));
    const next: Record<string, boolean> = {};
    for (const s of roster) next[s.studentId] = forDay.get(s.studentId) ?? true;
    setPresent(next);
    setSaved(null);
  }, [roster, history, sessionDate]);

  const alreadyRecorded = history.some((h) => h.sessionDate.slice(0, 10) === sessionDate);
  const sessionDates = new Set(history.map((h) => h.sessionDate.slice(0, 10)));
  const rateOf = (studentId: string) => {
    const mine = history.filter((h) => h.studentId === studentId);
    return mine.length === 0 ? null : Math.round((mine.filter((h) => h.present).length / mine.length) * 100);
  };

  async function save() {
    if (!roster || roster.length === 0) return;
    setError(null);
    setSaved(null);
    setSaving(true);
    try {
      await apiFetch("/attendance/mark", {
        method: "POST",
        body: JSON.stringify({
          courseId,
          sessionDate: new Date(`${sessionDate}T00:00:00.000Z`).toISOString(),
          records: roster.map((s) => ({ studentId: s.studentId, present: present[s.studentId] ?? true })),
        }),
      });
      setSaved(`Attendance saved for ${roster.length} student(s).`);
      setHistory(await apiFetch<Record_[]>(`/attendance/course/${courseId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save attendance.");
    } finally {
      setSaving(false);
    }
  }

  const presentCount = roster ? roster.filter((s) => present[s.studentId] ?? true).length : 0;

  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Mark attendance</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Choose a course and a date; your class list loads automatically. Everyone starts as present — untick the
        students who were absent. Re-saving the same date corrects it. For online classes, Live Teaching can pre-fill
        this from who actually joined.
      </p>

      <div className="mt-6 grid max-w-2xl gap-4 sm:grid-cols-2">
        <CoursePicker value={courseId} onChange={setCourseId} />
        <label className="block">
          <span className="text-sm font-medium text-ink/80">Session date</span>
          <input type="date" value={sessionDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setSessionDate(e.target.value)} className="input mt-1.5" />
        </label>
      </div>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {courseId && roster && roster.length === 0 && <p className="mt-6 text-sm text-ink/50">No students are enrolled in this course yet.</p>}

      {roster && roster.length > 0 && (
        <div className="mt-6 max-w-3xl">
          <PortalSection
            title={`Class list (${presentCount} of ${roster.length} present)`}
            action={
              <div className="flex gap-3 text-xs">
                <button type="button" className="text-navy underline decoration-dotted" onClick={() => setPresent(Object.fromEntries(roster.map((s) => [s.studentId, true])))}>All present</button>
                <button type="button" className="text-navy underline decoration-dotted" onClick={() => setPresent(Object.fromEntries(roster.map((s) => [s.studentId, false])))}>All absent</button>
              </div>
            }
          >
            {alreadyRecorded && <p className="mb-3 text-xs text-ink/50">Attendance for this date is already recorded — saving will update it.</p>}
            <ul className="divide-y divide-line">
              {roster.map((s) => {
                const rate = rateOf(s.studentId);
                return (
                  <li key={s.studentId} className="flex items-center justify-between py-2.5 text-sm">
                    <span>
                      {s.fullName}
                      {s.studentNumber && <span className="ml-2 font-mono text-xs text-ink/45">{s.studentNumber}</span>}
                    </span>
                    <span className="flex items-center gap-4">
                      {rate !== null && <Badge tone={rate >= 75 ? "ok" : rate >= 50 ? "warn" : "danger"}>{rate}% over {sessionDates.size} session(s)</Badge>}
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={present[s.studentId] ?? true}
                          onChange={(e) => setPresent((p) => ({ ...p, [s.studentId]: e.target.checked }))}
                        />
                        Present
                      </label>
                    </span>
                  </li>
                );
              })}
            </ul>
          </PortalSection>
          <div className="mt-4 flex items-center gap-4">
            <button type="button" onClick={save} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save attendance"}</button>
            {saved && <p className="text-xs text-forest">{saved}</p>}
          </div>
        </div>
      )}
    </PortalShell>
  );
}
