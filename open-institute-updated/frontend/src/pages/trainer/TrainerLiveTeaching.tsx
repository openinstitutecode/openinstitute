import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { CoursePicker, CourseOption } from "../../components/portal/TrainerPickers";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";
import { LoadingState } from "../../components/portal/StateViews";
import { useConfirm } from "../../components/portal/useConfirm";

// TP026 — live teaching: schedule a class (in the built-in BigBlueButton room,
// or with any meeting link you already use), notify the class, start/join,
// see who actually joined, save attendance from that, and attach the recording.

type Status = "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";
type Session = {
  id: string; courseId: string; title: string; description: string | null; scheduledAt: string; durationMinutes: number; status: Status;
  provider: "BBB" | "EXTERNAL"; externalUrl: string | null; recordingUrl: string | null; attendeeCount: number; attendanceSyncedAt: string | null;
  course: { id: string; title: string };
};
type AttendanceData = {
  session: { id: string; title: string; attendanceDate: string; attendanceSyncedAt: string | null };
  roster: { studentId: string; fullName: string; joined: boolean; joinedAt: string | null; recordedPresent: boolean | null }[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const tone = (s: Status) => (s === "LIVE" ? "ok" : s === "SCHEDULED" ? "warn" : "neutral");

export default function TrainerLiveTeaching() {
  const [confirm, confirmDialog] = useConfirm();
  const userName = useCurrentUserName();
  const [courseId, setCourseId] = useState("");
  const [course, setCourse] = useState<CourseOption | null>(null);
  const [bbbConfigured, setBbbConfigured] = useState<boolean | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState(60);
  const [provider, setProvider] = useState<"BBB" | "EXTERNAL">("EXTERNAL");
  const [externalUrl, setExternalUrl] = useState("");

  const [editing, setEditing] = useState<Session | null>(null);
  const [attendance, setAttendance] = useState<AttendanceData | null>(null);
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [recordingFor, setRecordingFor] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState("");

  const fail = (e: unknown, fallback: string) => setError(e instanceof Error ? e.message : fallback);

  async function load() {
    try { setSessions(await apiFetch<Session[]>("/live-classes/mine")); } catch (e) { fail(e, "Could not load your live classes."); }
  }
  useEffect(() => {
    void load();
    apiFetch<{ bbbConfigured: boolean }>("/live-classes/config")
      .then((c) => { setBbbConfigured(c.bbbConfigured); setProvider(c.bbbConfigured ? "BBB" : "EXTERNAL"); })
      .catch(() => setBbbConfigured(false));
  }, []);

  const isMoodle = course?.lmsEngine === "MOODLE";
  const shown = (sessions ?? []).filter((s) => !courseId || s.courseId === courseId);
  const upcoming = shown.filter((s) => s.status === "SCHEDULED" || s.status === "LIVE").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const past = shown.filter((s) => s.status === "ENDED" || s.status === "CANCELLED");

  async function schedule(e: FormEvent) {
    e.preventDefault();
    setError(null); setMsg(null);
    try {
      const res = await apiFetch<{ studentsNotified: number }>("/live-classes", {
        method: "POST",
        body: JSON.stringify({
          courseId, title: title.trim(), description: description.trim() || undefined, scheduledAt: new Date(scheduledAt).toISOString(),
          durationMinutes: duration, provider, externalUrl: provider === "EXTERNAL" ? externalUrl.trim() : undefined,
        }),
      });
      setTitle(""); setDescription(""); setScheduledAt(""); setExternalUrl("");
      setMsg(`Scheduled. ${res.studentsNotified} enrolled student(s) were notified.`);
      await load();
    } catch (err) { fail(err, "Could not schedule the class."); }
  }

  async function act(id: string, fn: () => Promise<unknown>, fallback: string, ok?: string) {
    setBusyId(id); setError(null); setMsg(null);
    try { await fn(); if (ok) setMsg(ok); await load(); } catch (err) { fail(err, fallback); } finally { setBusyId(null); }
  }
  const startOrJoin = (s: Session) =>
    act(s.id, async () => {
      const { joinUrl } = await apiFetch<{ joinUrl: string }>(`/live-classes/${s.id}/join`, { method: "POST" });
      window.open(joinUrl, "_blank", "noopener,noreferrer");
    }, "Could not start the class.");
  const end = (s: Session) => act(s.id, () => apiFetch(`/live-classes/${s.id}/end`, { method: "PATCH" }), "Could not end the class.", "Class ended. Take attendance below.");
  const cancel = async (s: Session) => {
    if (!(await confirm({ title: "Cancel this class?", body: `"${s.title}" — enrolled students will be told.`, confirmLabel: "Cancel class", danger: true }))) return;
    return act(s.id, () => apiFetch(`/live-classes/${s.id}`, { method: "DELETE" }), "Could not cancel.", "Class cancelled and students notified.");
  };

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const s = editing;
    await act(s.id, () => apiFetch(`/live-classes/${s.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: s.title.trim(), description: s.description ?? null, scheduledAt: new Date(toLocalInput(s.scheduledAt)).toISOString(), durationMinutes: s.durationMinutes,
        ...(s.provider === "EXTERNAL" ? { externalUrl: s.externalUrl ?? undefined } : {}),
      }),
    }), "Could not save the changes.", "Class updated.");
    setEditing(null);
  }

  async function openAttendance(s: Session) {
    setError(null); setMsg(null);
    try {
      const a = await apiFetch<AttendanceData>(`/live-classes/${s.id}/attendance`);
      setAttendance(a);
      // Joined via the app → present; otherwise keep what was already recorded, else absent.
      setMarks(Object.fromEntries(a.roster.map((r) => [r.studentId, r.joined || r.recordedPresent === true])));
    } catch (err) { fail(err, "Could not load the class list."); }
  }
  async function saveAttendance() {
    if (!attendance) return;
    const id = attendance.session.id;
    await act(id, () => apiFetch(`/live-classes/${id}/attendance`, { method: "POST", body: JSON.stringify({ records: attendance.roster.map((r) => ({ studentId: r.studentId, present: marks[r.studentId] ?? false })) }) }), "Could not save attendance.", "Attendance saved.");
    setAttendance(null);
  }
  async function saveRecording(s: Session) {
    await act(s.id, () => apiFetch(`/live-classes/${s.id}/recording`, { method: "PATCH", body: JSON.stringify({ recordingUrl: recordingUrl.trim() || null }) }), "Could not save the recording link.", "Recording link saved.");
    setRecordingFor(null);
  }

  // A plain function (not a component) so its inputs keep focus while typing.
  function renderRow(s: Session) {
    const open = s.status === "SCHEDULED" || s.status === "LIVE";
    return (
      <li key={s.id} className="py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">{s.title} <span className="font-normal text-ink/45">— {s.course.title}</span></p>
            <p className="text-xs text-ink/50">
              {new Date(s.scheduledAt).toLocaleString()} · {s.durationMinutes} min · {s.provider === "BBB" ? "built-in room" : "meeting link"} · {s.attendeeCount} joined
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={tone(s.status)}>{s.status}</Badge>
            {open && <button type="button" disabled={busyId === s.id} onClick={() => void startOrJoin(s)} className="text-xs font-medium text-navy hover:underline disabled:opacity-50">{s.status === "LIVE" ? "Rejoin ↗" : "Start ↗"}</button>}
            {s.status === "LIVE" && <button type="button" disabled={busyId === s.id} onClick={() => void end(s)} className="text-xs text-navy-dark underline decoration-dotted">End class</button>}
            {s.status === "SCHEDULED" && <button type="button" onClick={() => setEditing({ ...s })} className="text-xs text-navy underline decoration-dotted">Edit / reschedule</button>}
            {s.status === "SCHEDULED" && <button type="button" disabled={busyId === s.id} onClick={() => void cancel(s)} className="text-xs text-ink/50 underline decoration-dotted">Cancel</button>}
            {s.status !== "SCHEDULED" && s.status !== "CANCELLED" && <button type="button" onClick={() => void openAttendance(s)} className="text-xs text-navy underline decoration-dotted">{s.attendanceSyncedAt ? "Attendance ✓" : "Take attendance"}</button>}
            {s.status === "ENDED" && <button type="button" onClick={() => { setRecordingFor(s.id); setRecordingUrl(s.recordingUrl ?? ""); }} className="text-xs text-navy underline decoration-dotted">{s.recordingUrl ? "Change recording" : "Add recording"}</button>}
          </div>
        </div>
        {recordingFor === s.id && (
          <div className="mt-2 flex gap-2">
            <input value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} placeholder="https://… link to the recording" className="input py-1.5" />
            <button type="button" className="btn-primary px-3 py-1.5" onClick={() => void saveRecording(s)}>Save</button>
            <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => setRecordingFor(null)}>Cancel</button>
          </div>
        )}
        {s.recordingUrl && recordingFor !== s.id && <p className="mt-1 text-xs"><a href={s.recordingUrl} target="_blank" rel="noopener noreferrer" className="text-navy underline">Recording</a> <span className="text-ink/45">(students can watch it)</span></p>}
      </li>
    );
  }

  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      {confirmDialog}
      <h1 className="font-display text-2xl">Live teaching</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Schedule online classes for your courses. Enrolled students are notified and join from their course page; you can
        then save attendance from who actually joined.
      </p>

      <div className="mt-4 max-w-md"><CoursePicker value={courseId} onChange={(id, c) => { setCourseId(id); setCourse(c); setAttendance(null); }} label="Course (also filters the list below)" /></div>
      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}
      {msg && <p className="mt-4 text-sm text-forest">{msg}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <PortalSection title="Schedule a class">
          {!courseId && <p className="text-sm text-ink/45">Choose a course to schedule a class for it.</p>}
          {isMoodle && <p className="text-sm text-ink/60">This course is delivered through Moodle — schedule its live classes there.</p>}
          {courseId && !isMoodle && (
            <form onSubmit={schedule} className="space-y-3">
              <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Class title" className="input" />
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What will be covered (optional)" className="input" />
              <div className="grid grid-cols-2 gap-2">
                <input required type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="input" />
                <input required type="number" min={5} max={600} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="input" aria-label="Duration in minutes" />
              </div>
              <fieldset className="space-y-1.5 text-sm">
                <label className={`flex items-start gap-2 ${bbbConfigured ? "" : "opacity-50"}`}>
                  <input type="radio" name="provider" disabled={!bbbConfigured} checked={provider === "BBB"} onChange={() => setProvider("BBB")} className="mt-1" />
                  <span>Built-in video room {bbbConfigured === false && <span className="text-xs text-ink/50">— not set up on this system (an administrator adds a BigBlueButton server)</span>}</span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="radio" name="provider" checked={provider === "EXTERNAL"} onChange={() => setProvider("EXTERNAL")} className="mt-1" />
                  <span>My own meeting link <span className="text-xs text-ink/50">(Google Meet, Zoom, Teams…)</span></span>
                </label>
              </fieldset>
              {provider === "EXTERNAL" && <input required type="url" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://meet.google.com/…" className="input" />}
              <button type="submit" className="btn-primary w-full justify-center">Schedule &amp; notify students</button>
            </form>
          )}
        </PortalSection>

        <div className="space-y-6">
          {editing && (
            <PortalSection title="Edit class">
              <form onSubmit={saveEdit} className="space-y-3">
                <input required value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="input" />
                <div className="grid grid-cols-2 gap-2">
                  <input required type="datetime-local" value={toLocalInput(editing.scheduledAt)} onChange={(e) => setEditing({ ...editing, scheduledAt: new Date(e.target.value).toISOString() })} className="input" />
                  <input required type="number" min={5} max={600} value={editing.durationMinutes} onChange={(e) => setEditing({ ...editing, durationMinutes: Number(e.target.value) })} className="input" />
                </div>
                {editing.provider === "EXTERNAL" && <input required type="url" value={editing.externalUrl ?? ""} onChange={(e) => setEditing({ ...editing, externalUrl: e.target.value })} className="input" />}
                <div className="flex gap-2"><button type="submit" className="btn-primary px-4 py-2">Save &amp; notify if the time changed</button><button type="button" className="btn-secondary px-4 py-2" onClick={() => setEditing(null)}>Cancel</button></div>
              </form>
            </PortalSection>
          )}

          {attendance && (
            <PortalSection title={`Attendance — ${attendance.session.title}`} action={<button type="button" className="text-xs text-navy underline decoration-dotted" onClick={() => setAttendance(null)}>Close</button>}>
              <p className="mb-3 text-xs text-ink/50">Students who opened the join link are ticked. Adjust anyone who joined another way, then save.</p>
              <ul className="divide-y divide-line">
                {attendance.roster.map((r) => (
                  <li key={r.studentId} className="flex items-center justify-between py-2 text-sm">
                    <span>{r.fullName} {r.joined && <span className="text-xs text-forest">· joined {new Date(r.joinedAt ?? "").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}</span>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={marks[r.studentId] ?? false} onChange={(e) => setMarks((m) => ({ ...m, [r.studentId]: e.target.checked }))} /> Present</label>
                  </li>
                ))}
                {attendance.roster.length === 0 && <li className="py-2 text-sm text-ink/45">No students are enrolled.</li>}
              </ul>
              {attendance.roster.length > 0 && <button type="button" className="btn-primary mt-4" onClick={() => void saveAttendance()}>Save attendance</button>}
            </PortalSection>
          )}

          <PortalSection title="Upcoming &amp; live">
            {sessions === null && <LoadingState />}
            {sessions && upcoming.length === 0 && <p className="text-sm text-ink/45">Nothing scheduled.</p>}
            <ul className="divide-y divide-line">{upcoming.map((s) => renderRow(s))}</ul>
          </PortalSection>
          {past.length > 0 && (
            <PortalSection title="Past classes">
              <ul className="divide-y divide-line">{past.map((s) => renderRow(s))}</ul>
            </PortalSection>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
