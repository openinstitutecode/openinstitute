import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { Badge, PortalSection, StatCard } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { links } from "./AdminIntegrations";
import { LoadingState } from "../../components/portal/StateViews";

// Batch 66 — the admin console for the Virtual Business Lab integration (VBI038 and the admin side
// of VBI002/010/025/027/028/036/050). Everything here is a thin client over /integration/v1/*; the
// rules live in the backend. ICT admin / super admin only (the API enforces it).

type Health = "GREEN" | "AMBER" | "RED";
type Dashboard = {
  health: Health;
  eventCounts: Record<string, Record<string, number>>;
  oldestPendingAgeSeconds: number | null;
  lastSentToLab: string | null;
  lastReceivedFromLab: string | null;
  lastFailure: { eventType: string; error: string | null; at: string } | null;
  mappings: Record<string, number>;
  activity: { total: number; byType: { activityType: string; count: number }[] };
  activeCredentials: number;
  labResults: Record<string, number>;
  approvedUnposted: number;
};
type Ev = { id: string; eventId: string; direction: string; eventType: string; status: string; attempts: number; lastError: string | null; nextAttemptAt: string | null; createdAt: string };
type Cred = { id: string; keyId: string; direction: string; status: string; createdAt: string; revokedAt: string | null; notes: string | null };
type UnitLite = { id: string; code: string; title: string; vblEnabled: boolean };
type UnitLookup = { assessments: { id: string; title: string; totalMarks: number; rubric: { criteria: { name: string }[] } | null }[]; learningOutcomes: { id: string; code: string; description: string }[] };
type Activity = { id: string; activityType: string; summary: string | null; occurredAt: string; student: { fullName: string; studentNumber: string }; unit: { code: string } | null };

const TABS = ["Health", "Events", "Credentials", "Mappings", "Activity"] as const;
type Tab = (typeof TABS)[number];
const healthTone = (h: Health) => (h === "GREEN" ? "ok" : h === "AMBER" ? "warn" : "danger");
const statusTone = (s: string) => (s === "SENT" || s === "RECEIVED" ? "ok" : s === "FAILED" || s === "PENDING" ? "warn" : s === "DEAD_LETTER" ? "danger" : "neutral");
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : "—");
const post = (path: string, body?: unknown) => apiFetch<any>(`/integration/v1${path}`, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const del = (path: string) => apiFetch<any>(`/integration/v1${path}`, { method: "DELETE" });
const get = <T,>(path: string) => apiFetch<T>(`/integration/v1${path}`);

export default function AdminVirtualLab() {
  const userName = useCurrentUserName();
  const [tab, setTab] = useState<Tab>("Health");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<string | void>) => {
    setError(null);
    setMessage(null);
    try {
      const m = await fn();
      if (m) setMessage(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action failed.");
    }
  }, []);

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Virtual Business Lab console</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">Synchronization health, the event ledger, signing credentials, and the mappings that connect Lab units, competencies and criteria to portal records.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={t === tab ? "btn-primary" : "btn-secondary"}>{t}</button>
        ))}
      </div>
      {message && <p className="mt-3 text-sm text-forest">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-6 space-y-6">
        {tab === "Health" && <HealthTab run={run} />}
        {tab === "Events" && <EventsTab run={run} />}
        {tab === "Credentials" && <CredentialsTab run={run} />}
        {tab === "Mappings" && <MappingsTab run={run} />}
        {tab === "Activity" && <ActivityTab />}
      </div>
    </PortalShell>
  );
}

type Run = (fn: () => Promise<string | void>) => Promise<void>;

function HealthTab({ run }: { run: Run }) {
  const [d, setD] = useState<Dashboard | null>(null);
  const load = useCallback(() => run(async () => { setD(await get<Dashboard>("/dashboard")); }), [run]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <LoadingState />;
  const out = d.eventCounts.PORTAL_TO_VBL ?? {};
  const inn = d.eventCounts.VBL_TO_PORTAL ?? {};
  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border border-line bg-white p-6"><p className="text-sm text-ink/55">Health</p><div className="mt-2"><Badge tone={healthTone(d.health)}>{d.health}</Badge></div>
          {d.oldestPendingAgeSeconds !== null && <p className="mt-2 text-xs text-ink/50">Oldest undelivered: {Math.round(d.oldestPendingAgeSeconds / 60)} min</p>}</div>
        <StatCard label="Awaiting delivery to Lab" value={(out.PENDING ?? 0) + (out.FAILED ?? 0)} hint={`${out.DEAD_LETTER ?? 0} dead-lettered`} />
        <StatCard label="Received from Lab" value={inn.RECEIVED ?? 0} hint={`${inn.FAILED ?? 0} failed to process`} />
        <StatCard label="Approved, not yet posted" value={d.approvedUnposted} hint="needs a gradebook mapping" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <PortalSection title="Last activity">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt>Last sent to Lab</dt><dd>{fmt(d.lastSentToLab)}</dd></div>
            <div className="flex justify-between"><dt>Last received from Lab</dt><dd>{fmt(d.lastReceivedFromLab)}</dd></div>
            <div className="flex justify-between"><dt>Active credentials</dt><dd>{d.activeCredentials}</dd></div>
          </dl>
          {d.lastFailure && <p className="mt-3 text-sm text-red-700">Last failure ({d.lastFailure.eventType}, {fmt(d.lastFailure.at)}): {d.lastFailure.error ?? "no detail"}</p>}
        </PortalSection>
        <PortalSection title="Mappings in place">
          <ul className="grid grid-cols-2 gap-1 text-sm">{Object.entries(d.mappings).map(([k, v]) => <li key={k} className="flex justify-between pr-4"><span className="capitalize">{k.replace(/([A-Z])/g, " $1")}</span><strong>{v}</strong></li>)}</ul>
        </PortalSection>
      </div>
      <PortalSection title="Lab results by status">
        <div className="flex flex-wrap gap-6 text-sm">{Object.entries(d.labResults).map(([k, v]) => <span key={k}>{k.replace("_", " ").toLowerCase()}: <strong>{v}</strong></span>)}</div>
      </PortalSection>
      <PortalSection title="Actions">
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" onClick={() => run(async () => { const r = await post("/scheduler/run"); await load(); return r.ranTick ? `Tick ran: ${r.sent} sent, ${r.failed} failed, ${r.gradebookPosted} grades posted.` : "Another instance is already running the tick."; })}>Run sync now</button>
          <button className="btn-secondary" onClick={() => run(async () => { const r = await post("/outbox/requeue-dead-letter"); await load(); return `${r.requeued} dead-lettered event(s) requeued.`; })}>Requeue all dead letters</button>
          <button className="btn-secondary" onClick={load}>Refresh</button>
        </div>
      </PortalSection>
    </>
  );
}

function EventsTab({ run }: { run: Run }) {
  const [rows, setRows] = useState<Ev[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [f, setF] = useState({ direction: "", status: "", eventType: "" });
  const load = useCallback((append: boolean, from?: string | null) => run(async () => {
    const q = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => v && q.set(k, v));
    if (from) q.set("cursor", from);
    const page = await get<{ events: Ev[]; nextCursor: string | null }>(`/events?${q}`);
    setRows((prev) => (append ? [...prev, ...page.events] : page.events));
    setCursor(page.nextCursor);
  }), [f, run]);
  useEffect(() => { load(false); }, [load]);
  return (
    <PortalSection title="Event ledger" action={<button className="btn-secondary" onClick={() => load(false)}>Refresh</button>}>
      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input" value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}><option value="">Both directions</option><option value="PORTAL_TO_VBL">Portal → Lab</option><option value="VBL_TO_PORTAL">Lab → Portal</option></select>
        <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Any status</option>{["PENDING", "SENT", "RECEIVED", "FAILED", "DEAD_LETTER"].map((s) => <option key={s}>{s}</option>)}</select>
        <input className="input" placeholder="Event type, e.g. assessment.decided" value={f.eventType} onChange={(e) => setF({ ...f, eventType: e.target.value })} />
      </div>
      {rows.length === 0 && <p className="text-sm text-ink/50">No events match.</p>}
      {rows.map((e) => (
        <div key={e.id} className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-t-0">
          <Badge tone={statusTone(e.status)}>{e.status}</Badge>
          <span className="text-sm font-medium">{e.eventType}</span>
          <span className="text-xs text-ink/50">{e.direction === "PORTAL_TO_VBL" ? "Portal → Lab" : "Lab → Portal"} · {fmt(e.createdAt)} · {e.attempts} attempt(s)</span>
          {e.nextAttemptAt && e.status === "FAILED" && <span className="text-xs text-ink/50">next try {fmt(e.nextAttemptAt)}</span>}
          {e.lastError && <span className="w-full text-xs text-red-700">{e.lastError}</span>}
          {e.direction === "PORTAL_TO_VBL" && e.status === "DEAD_LETTER" && (
            <button className="btn-secondary ml-auto" onClick={() => run(async () => { await post(`/outbox/${e.eventId}/requeue`); await load(false); return "Requeued."; })}>Requeue</button>
          )}
        </div>
      ))}
      {cursor && <button className="btn-secondary mt-4" onClick={() => load(true, cursor)}>Load more</button>}
    </PortalSection>
  );
}

function CredentialsTab({ run }: { run: Run }) {
  const [rows, setRows] = useState<Cred[]>([]);
  const [revealed, setRevealed] = useState<{ keyId: string; secret: string; direction: string } | null>(null);
  const [direction, setDirection] = useState("VBL_TO_PORTAL");
  const [notes, setNotes] = useState("");
  const load = useCallback(() => run(async () => { setRows(await get<Cred[]>("/credentials")); }), [run]);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      {revealed && (
        <div className="border border-amber-400 bg-amber-50 p-4 text-sm">
          <p className="font-medium">Copy this secret now — it is never shown again.</p>
          <p className="mt-2 font-mono text-xs break-all">key id: {revealed.keyId}</p>
          <p className="font-mono text-xs break-all">secret: {revealed.secret}</p>
          <p className="mt-2 text-xs text-ink/60">Install it on the {revealed.direction === "VBL_TO_PORTAL" ? "Lab (as the secret it signs portal-bound events with)" : "Lab (as the secret it verifies portal events with)"}, confirm traffic flows, then revoke the old credential.</p>
          <button className="btn-secondary mt-3" onClick={() => setRevealed(null)}>I have copied it</button>
        </div>
      )}
      <PortalSection title="Issue a credential">
        <div className="flex flex-wrap gap-2">
          <select className="input" value={direction} onChange={(e) => setDirection(e.target.value)}><option value="VBL_TO_PORTAL">Lab → Portal (verifies inbound events)</option><option value="PORTAL_TO_VBL">Portal → Lab (signs outbound events)</option></select>
          <input className="input flex-1" placeholder="Notes (optional), e.g. 'Q4 rotation'" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button className="btn-primary" onClick={() => run(async () => { setRevealed(await post("/credentials", { direction, notes: notes || undefined })); setNotes(""); await load(); })}>Issue</button>
        </div>
        <p className="mt-2 text-xs text-ink/50">Rotation is non-disruptive: issue the new credential, deploy it to the other side, then revoke the old one. Both verify meanwhile.</p>
      </PortalSection>
      <PortalSection title="Credentials">
        {rows.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-t-0">
            <Badge tone={c.status === "ACTIVE" ? "ok" : "neutral"}>{c.status}</Badge>
            <span className="font-mono text-xs">{c.keyId}</span>
            <span className="text-xs text-ink/50">{c.direction === "VBL_TO_PORTAL" ? "Lab → Portal" : "Portal → Lab"} · issued {fmt(c.createdAt)}{c.notes ? ` · ${c.notes}` : ""}</span>
            {c.status === "ACTIVE" && <button className="btn-secondary ml-auto" onClick={() => { if (window.confirm(`Revoke ${c.keyId}? Anything still signed with it will be rejected.`)) run(async () => { await post(`/credentials/${c.id}/revoke`); await load(); return "Revoked."; }); }}>Revoke</button>}
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-ink/50">None issued yet — the env-var secrets are being used.</p>}
      </PortalSection>
    </>
  );
}

function MappingsTab({ run }: { run: Run }) {
  const [units, setUnits] = useState<UnitLite[]>([]);
  const [unitId, setUnitId] = useState("");
  const [lookup, setLookup] = useState<UnitLookup | null>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [gm, setGm] = useState<any[]>([]);
  const [cm, setCm] = useState<any[]>([]);
  const [rm, setRm] = useState<any[]>([]);
  const [form, setForm] = useState({ labCourseCode: "", labProgrammeId: "", labCohortId: "", assessmentId: "", competent: "100", notYet: "0", rubricNote: "", labCompetencyCode: "", learningOutcomeId: "", labCriterionCode: "", rubricCriterionName: "" });
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const loadAll = useCallback(() => run(async () => {
    const [c, g, m, r] = await Promise.all([get<any[]>("/courses"), get<any[]>("/gradebook-mapping"), get<any[]>("/competency-mapping"), get<any[]>("/rubric-mapping")]);
    setCourses(c); setGm(g); setCm(m); setRm(r);
  }), [run]);
  useEffect(() => { run(async () => { setUnits(await get<UnitLite[]>("/lookups/units")); }); loadAll(); }, [loadAll, run]);
  useEffect(() => { setLookup(null); if (unitId) run(async () => { setLookup(await get<UnitLookup>(`/lookups/units/${unitId}`)); }); }, [unitId, run]);

  const mine = <T extends { unitId?: string; gradebookMapping?: { unitId: string } }>(rows: T[]) => rows.filter((r) => (r.unitId ?? r.gradebookMapping?.unitId) === unitId);
  const rubricNames = lookup?.assessments.find((a) => a.id === (gm.find((g) => g.unitId === unitId)?.assessmentId ?? form.assessmentId))?.rubric?.criteria.map((c) => c.name) ?? [];

  return (
    <>
      <PortalSection title="Unit">
        <select className="input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">Choose a unit…</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.code} — {u.title}{u.vblEnabled ? " (Lab on)" : ""}</option>)}
        </select>
      </PortalSection>
      {unitId && (
        <>
          <PortalSection title="1 · Lab course">
            {mine(courses).map((c) => <Row key={c.id} label={`Lab course ${c.labCourseCode ?? "—"} · programme ${c.labProgrammeId ?? "—"} · cohort ${c.labCohortId ?? "—"}`} onDelete={() => run(async () => { await del(`/courses/${unitId}`); await loadAll(); return "Lab integration switched off for this unit; history kept."; })} />)}
            <div className="mt-3 flex flex-wrap gap-2">
              <input className="input" placeholder="Lab course code" value={form.labCourseCode} onChange={(e) => set("labCourseCode", e.target.value)} />
              <input className="input" placeholder="Lab programme id" value={form.labProgrammeId} onChange={(e) => set("labProgrammeId", e.target.value)} />
              <input className="input" placeholder="Lab cohort id" value={form.labCohortId} onChange={(e) => set("labCohortId", e.target.value)} />
              <button className="btn-primary" onClick={() => run(async () => { await post("/courses", { unitId, labCourseCode: form.labCourseCode || undefined, labProgrammeId: form.labProgrammeId || undefined, labCohortId: form.labCohortId || undefined, vblEnabled: true }); await loadAll(); return "Saved."; })}>Save &amp; enable</button>
            </div>
          </PortalSection>
          <PortalSection title="2 · Gradebook component">
            {mine(gm).map((g) => <Row key={g.id} label={`${g.assessment.title} (${g.assessment.totalMarks} marks) · competent ${g.competentScorePercent}% · not yet ${g.notYetCompetentScorePercent}%`} onDelete={() => run(async () => { await del(`/gradebook-mapping/${unitId}`); await loadAll(); return "Removed (existing posted grades are untouched)."; })} />)}
            <div className="mt-3 flex flex-wrap gap-2">
              <select className="input" value={form.assessmentId} onChange={(e) => set("assessmentId", e.target.value)}><option value="">Assessment…</option>{lookup?.assessments.map((a) => <option key={a.id} value={a.id}>{a.title} ({a.totalMarks})</option>)}</select>
              <input className="input w-28" type="number" min={0} max={100} title="% for COMPETENT" value={form.competent} onChange={(e) => set("competent", e.target.value)} />
              <input className="input w-28" type="number" min={0} max={100} title="% for NOT YET COMPETENT" value={form.notYet} onChange={(e) => set("notYet", e.target.value)} />
              <input className="input flex-1" placeholder="Rubric note (optional)" value={form.rubricNote} onChange={(e) => set("rubricNote", e.target.value)} />
              <button className="btn-primary" disabled={!form.assessmentId} onClick={() => run(async () => { await post("/gradebook-mapping", { unitId, assessmentId: form.assessmentId, competentScorePercent: Number(form.competent), notYetCompetentScorePercent: Number(form.notYet), rubricNote: form.rubricNote || undefined }); await loadAll(); return "Saved."; })}>Save</button>
            </div>
            <p className="mt-2 text-xs text-ink/50">Left and right percentages are the share of the assessment's marks awarded for a Competent / Not yet competent result.</p>
          </PortalSection>
          <PortalSection title="3 · Competency codes → learning outcomes">
            {mine(cm).map((c) => <Row key={c.id} label={`${c.labCompetencyCode} → ${c.learningOutcome.code}: ${c.learningOutcome.description}`} onDelete={() => run(async () => { await del(`/competency-mapping/${c.id}`); await loadAll(); })} />)}
            <div className="mt-3 flex flex-wrap gap-2">
              <input className="input" placeholder="Lab competency code" value={form.labCompetencyCode} onChange={(e) => set("labCompetencyCode", e.target.value)} />
              <select className="input" value={form.learningOutcomeId} onChange={(e) => set("learningOutcomeId", e.target.value)}><option value="">Learning outcome…</option>{lookup?.learningOutcomes.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.description}</option>)}</select>
              <button className="btn-primary" disabled={!form.labCompetencyCode || !form.learningOutcomeId} onClick={() => run(async () => { await post("/competency-mapping", { unitId, labCompetencyCode: form.labCompetencyCode, learningOutcomeId: form.learningOutcomeId }); set("labCompetencyCode", ""); await loadAll(); return "Saved."; })}>Add</button>
            </div>
          </PortalSection>
          <PortalSection title="4 · Lab criteria → rubric criteria">
            {mine(rm).map((r) => <Row key={r.id} label={`${r.labCriterionCode} → ${r.rubricCriterionName}`} onDelete={() => run(async () => { await del(`/rubric-mapping/${r.id}`); await loadAll(); })} />)}
            {gm.every((g) => g.unitId !== unitId) && <p className="text-sm text-ink/50">Create the gradebook component first.</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <input className="input" placeholder="Lab criterion code" value={form.labCriterionCode} onChange={(e) => set("labCriterionCode", e.target.value)} />
              <select className="input" value={form.rubricCriterionName} onChange={(e) => set("rubricCriterionName", e.target.value)}><option value="">Rubric criterion…</option>{rubricNames.map((n) => <option key={n}>{n}</option>)}</select>
              <button className="btn-primary" disabled={!form.labCriterionCode || !form.rubricCriterionName} onClick={() => run(async () => { await post("/rubric-mapping", { unitId, labCriterionCode: form.labCriterionCode, rubricCriterionName: form.rubricCriterionName }); set("labCriterionCode", ""); await loadAll(); return "Saved."; })}>Add</button>
            </div>
            <p className="mt-2 text-xs text-ink/50">A per-criterion breakdown is attached to a posted grade only when EVERY rubric criterion is mapped and the Lab reported on it; otherwise the grade posts without one.</p>
          </PortalSection>
        </>
      )}
    </>
  );
}

function Row({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-3 border-t border-line py-2 text-sm first:border-t-0">
      <span className="flex-1">{label}</span>
      <button className="btn-secondary" onClick={() => { if (window.confirm("Remove this mapping?")) onDelete(); }}>Remove</button>
    </div>
  );
}

function ActivityTab() {
  const [rows, setRows] = useState<Activity[] | null>(null);
  const [type, setType] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setRows(null);
    get<Activity[]>(`/activity${type ? `?activityType=${encodeURIComponent(type)}` : ""}`).then(setRows).catch((e) => setErr(e instanceof Error ? e.message : "Could not load activity."));
  }, [type]);
  return (
    <PortalSection title="Lab activity feed">
      <input className="input mb-4" placeholder="Filter by activity type, e.g. evidence.capture" value={type} onChange={(e) => setType(e.target.value)} />
      {err && <p className="text-sm text-red-700">{err}</p>}
      {rows === null && !err && <LoadingState />}
      {rows?.length === 0 && <p className="text-sm text-ink/50">No activity recorded yet.</p>}
      {rows?.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-3 border-t border-line py-2 text-sm first:border-t-0">
          <Badge tone="neutral">{a.activityType}</Badge>
          <strong>{a.student.fullName}</strong>
          <span className="text-xs text-ink/50">{a.student.studentNumber}{a.unit ? ` · ${a.unit.code}` : ""} · {fmt(a.occurredAt)}</span>
          {a.summary && <span className="w-full text-ink/70">{a.summary}</span>}
        </div>
      ))}
    </PortalSection>
  );
}
