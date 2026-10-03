import { useEffect, useState, FormEvent } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";
import { CoursePicker, StudentPicker } from "../../components/portal/TrainerPickers";

type Flag = { studentId: string; fullName: string; signal: string; detail: string };

const signalLabel: Record<string, string> = {
  no_login: "No login 12+ days",
  missed_deadline: "Missed deadline",
  score_dropping: "Score dropping",
};

export default function TrainerAtRisk() {
  const userName = useCurrentUserName();
  const [courseId, setCourseId] = useState("");
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    apiFetch<Flag[]>(`/trainer-self/at-risk/${courseId}`)
      .then(setFlags)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not compute signals."));
  }, [courseId]);

  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Early-warning signals</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Computed live from real login, deadline, and score data — three
        independent, transparent checks. Not a judgment about any student;
        use your own knowledge of them alongside this list.
      </p>

      <div className="mt-4 max-w-md">
        <CoursePicker value={courseId} onChange={setCourseId} />
      </div>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {courseId && (
        <div className="mt-8">
          <PortalSection title="Signals">
            {flags && flags.length === 0 && <p className="text-sm text-ink/50">No signals right now.</p>}
            {flags && flags.length > 0 && (
              <ul className="divide-y divide-line">
                {flags.map((f, i) => (
                  <li key={i} className="flex items-center justify-between py-3 text-sm">
                    <span>{f.fullName}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-ink/50">{f.detail}</span>
                      <Badge tone={f.signal === "score_dropping" ? "warn" : "danger"}>{signalLabel[f.signal] ?? f.signal}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PortalSection>
        </div>
      )}

      {/* TP024 — intervention notes, now wired into this page instead of
          only existing as an unused backend route. */}
      {flags && flags.length > 0 && (
        <div className="mt-8">
          <InterventionNotes flags={flags} />
        </div>
      )}

      {flags && flags.length > 0 && (
        <div className="mt-8">
          <RemediationGenerator flags={flags} />
        </div>
      )}

      <div className="mt-8">
        <AwardBadge courseId={courseId} />
      </div>
    </PortalShell>
  );
}

function AwardBadge({ courseId }: { courseId: string }) {
  const [badges, setBadges] = useState<{ id: string; name: string; iconEmoji: string }[] | null>(null);
  const [badgeId, setBadgeId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ id: string; name: string; iconEmoji: string }[]>("/badges")
      .then(setBadges)
      .catch(() => setBadges([]));
  }, []);

  async function award(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/badges/award", { method: "POST", body: JSON.stringify({ studentId, badgeId }) });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not award badge.");
    }
  }

  return (
    <PortalSection title="Award a badge">
      <form onSubmit={award} className="flex flex-wrap items-end gap-3">
        <StudentPicker required courseId={courseId} value={studentId} onChange={setStudentId} by="studentId" className="w-56" />
        <label className="block">
          <span className="text-sm font-medium text-ink/80">Badge</span>
          <select required value={badgeId} onChange={(e) => setBadgeId(e.target.value)} className="input mt-1.5 w-56">
            <option value="">Select…</option>
            {badges?.map((b) => (
              <option key={b.id} value={b.id}>{b.iconEmoji} {b.name}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-secondary">Award</button>
      </form>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {saved && <p className="mt-2 text-xs text-forest">Awarded.</p>}
    </PortalSection>
  );
}

type Note = { id: string; note: string; actionTaken: string | null; createdAt: string; trainer: { fullName: string } };

function InterventionNotes({ flags }: { flags: Flag[] }) {
  const uniqueStudents = Array.from(new Map(flags.map((f) => [f.studentId, f.fullName])).entries());
  const [studentId, setStudentId] = useState(uniqueStudents[0]?.[0] ?? "");
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [note, setNote] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load(id: string) {
    if (!id) return;
    apiFetch<Note[]>(`/interventions/student/${id}`)
      .then(setNotes)
      .catch(() => setNotes([]));
  }
  useEffect(() => { load(studentId); }, [studentId]);

  async function record(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    try {
      await apiFetch("/interventions", {
        method: "POST",
        body: JSON.stringify({ studentId, note, actionTaken: actionTaken || undefined }),
      });
      setNote("");
      setActionTaken("");
      load(studentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the note.");
    }
  }

  return (
    <PortalSection title="Intervention notes">
      <label className="block max-w-xs">
        <span className="text-sm font-medium text-ink/80">Flagged student</span>
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="input mt-1.5">
          {uniqueStudents.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </label>

      <ul className="mt-4 space-y-2">
        {notes && notes.length === 0 && <li className="text-sm text-ink/45">No intervention history for this student yet.</li>}
        {notes?.map((n) => (
          <li key={n.id} className="border-t border-line pt-2 text-sm">
            <p>{n.note}</p>
            {n.actionTaken && <p className="mt-1 text-xs text-ink/50">Action taken: {n.actionTaken}</p>}
            <p className="mt-1 text-xs text-ink/40">{n.trainer.fullName} · {new Date(n.createdAt).toLocaleDateString()}</p>
          </li>
        ))}
      </ul>

      <form onSubmit={record} className="mt-4 space-y-2">
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you observe or discuss?" className="input" />
        <input value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} placeholder="Action taken (optional)" className="input" />
        <button type="submit" className="btn-secondary">Record note</button>
      </form>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
    </PortalSection>
  );
}

// AI027/TP037 — AI remediation generator: grounded in the real flags
// already computed above, not a generic suggestion disconnected from why
// the student was actually flagged.
function RemediationGenerator({ flags }: { flags: Flag[] }) {
  const uniqueStudents = Array.from(new Map(flags.map((f) => [f.studentId, f.fullName])).entries());
  const [studentId, setStudentId] = useState(uniqueStudents[0]?.[0] ?? "");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setSuggestion(null);
    const student = uniqueStudents.find(([id]) => id === studentId);
    if (!student) return;
    const studentFlags = flags.filter((f) => f.studentId === studentId).map((f) => `${signalLabel[f.signal] ?? f.signal}: ${f.detail}`);
    try {
      const res = await apiFetch<{ reply: string }>("/ai/remediation-generator", {
        method: "POST",
        body: JSON.stringify({ studentName: student[1], signals: studentFlags }),
      });
      setSuggestion(res.reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate suggestions.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalSection title="AI remediation generator">
      <p className="text-xs text-ink/50">
        Grounded in the real flags above for the selected student — not a generic suggestion.
      </p>
      <label className="mt-3 block max-w-xs">
        <span className="text-sm font-medium text-ink/80">Flagged student</span>
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="input mt-1.5">
          {uniqueStudents.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </label>
      <button onClick={generate} className="btn-primary mt-3" disabled={loading}>
        {loading ? "Generating…" : "Generate remediation ideas"}
      </button>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {suggestion && <p className="mt-3 whitespace-pre-line text-sm text-ink/75">{suggestion}</p>}
    </PortalSection>
  );
}
