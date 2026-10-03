// Batch 68 — KFEAT-041/043/009/002: fee account, statement download, calendar export, progression.
// Batch 71 — inline field validation (KUX-007/KACC-004) on the ticket and data-request forms.
// Batch 70 — data-subject requests (KDATA-007); ticket creation is idempotent (KFX-048).
// Batch 69 — KFEAT-020 workload, KFEAT-007 engagement, KFEAT-082 notification preferences, KFEAT-006/088 my tickets + rating, KDATA-007 data export.
import { useEffect, useState, useCallback } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, StatCard, Table, Badge } from "../../components/portal/Primitives";
import { LoadingState, ErrorState } from "../../components/portal/StateViews";
import FormField, { textError } from "../../components/portal/FormField";
import { apiFetch, apiFetchBlob, openOrDownloadBlob, useCurrentUserName, newIdempotencyKey } from "../../lib/api";

const links = [
  { to: "/student/dashboard", label: "Dashboard" },
  { to: "/student/fees", label: "Fees" },
  { to: "/student/account", label: "Account & Progress" },
  { to: "/student/record", label: "My Record" },
  { to: "/student/timetable", label: "Timetable" },
];
type Fee = { outstanding: number; overdueCount: number; activeHolds: number; nextDue: { semester: string; dueDate: string; outstanding: number; bucket: string } | null; invoices: { id: string; semester: string; dueDate: string; amountDue: number; amountPaid: number; outstanding: number; bucket: string }[] };
type Prog = { programme: string; academicStatus: string; totalUnitsInProgramme: number; completedUnits: number; percentComplete: number; creditsEarned: number; toRepeat: { code: string; title: string; semester: string }[]; bySemester: Record<string, { completed: number; failed: number; inProgress: number; creditsEarned: number }> };
const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;
const tone = (b: string) => (b === "overdue" ? "danger" : b === "due_soon" ? "warn" : b === "settled" ? "ok" : "neutral") as "ok" | "warn" | "danger" | "neutral";

export default function StudentAccount() {
  const userName = useCurrentUserName();
  const [fee, setFee] = useState<Fee>();
  const [prog, setProg] = useState<Prog>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([apiFetch<Fee>("/self/fee-account"), apiFetch<Prog>("/self/progression")]).then(([f, p]) => { setFee(f); setProg(p); }).catch((e: Error) => setError(e.message));
  }, []);
  async function download(path: string) {
    setBusy(true);
    try { const { blob, filename } = await apiFetchBlob(path); openOrDownloadBlob(blob, filename ?? "download"); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-3xl font-medium">Account &amp; progress</h1>
      {error && <div className="mt-6"><ErrorState message={error} /></div>}
      {!error && (!fee || !prog) && <LoadingState />}
      {fee && prog && (
        <div className="mt-6 space-y-8">
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Outstanding fees" value={kes(fee.outstanding)} hint={fee.overdueCount ? `${fee.overdueCount} overdue` : "Nothing overdue"} />
            <StatCard label="Next due" value={fee.nextDue ? new Date(fee.nextDue.dueDate).toLocaleDateString("en-KE") : "—"} hint={fee.nextDue ? `${fee.nextDue.semester} · ${kes(fee.nextDue.outstanding)}` : undefined} />
            <StatCard label="Programme complete" value={`${prog.percentComplete}%`} hint={`${prog.completedUnits}/${prog.totalUnitsInProgramme} units`} />
            <StatCard label="Credits earned" value={prog.creditsEarned} />
          </div>
          {fee.activeHolds > 0 && <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">You have {fee.activeHolds} active financial hold(s). Contact the finance office.</p>}
          <PortalSection title="Invoices" action={
            <span className="flex gap-2">
              <button disabled={busy} onClick={() => download("/self/statement?format=csv")} className="border border-line px-3 py-1 text-sm">Statement (CSV)</button>
              <button disabled={busy} onClick={() => download("/self/calendar.ics")} className="border border-line px-3 py-1 text-sm">Calendar (.ics)</button>
            </span>}>
            <Table columns={["Semester", "Due", "Billed", "Paid", "Outstanding", "Status"]} rows={fee.invoices.map((i) => [i.semester, new Date(i.dueDate).toLocaleDateString("en-KE"), kes(i.amountDue), kes(i.amountPaid), kes(i.outstanding), <Badge key={i.id} tone={tone(i.bucket)}>{i.bucket.replace("_", " ")}</Badge>])} />
          </PortalSection>
          <PortalSection title="Progress by semester">
            <Table columns={["Semester", "Completed", "In progress", "Failed", "Credits"]} rows={Object.entries(prog.bySemester).map(([s, v]) => [s, v.completed, v.inProgress, v.failed, v.creditsEarned])} />
            {prog.toRepeat.length > 0 && <p className="mt-3 text-sm">To repeat: {prog.toRepeat.map((u) => `${u.code} (${u.semester})`).join(", ")}</p>}
          </PortalSection>
          <Workload />
          <Engagement />
          <MyTickets />
          <Preferences />
          <DataRequests />
          <PortalSection title="My data">
            <p className="text-sm text-ink/70">Download a copy of the personal data this portal holds for your account (profile, enrolments, fees, submissions, notifications, support tickets).</p>
            <button disabled={busy} onClick={() => download("/self/data-export")} className="mt-3 border border-line px-3 py-1 text-sm">Download my data (JSON)</button>
          </PortalSection>
        </div>
      )}
    </PortalShell>
  );
}

function useLoad<T>(path: string) {
  const [d, setD] = useState<T>();
  const [err, setErr] = useState<string>();
  const load = useCallback(() => { apiFetch<T>(path).then(setD).catch((e: Error) => setErr(e.message)); }, [path]);
  useEffect(load, [load]);
  return { d, err, reload: load };
}

function Workload() {
  const { d, err } = useLoad<{ total: number; heaviestWeek: string | null; weeks: { weekStart: string; count: number; items: { kind: string; title: string; course?: string; due: string; marks: number }[] }[] }>("/self/workload");
  return (
    <PortalSection title="Due in the next 3 weeks">
      {err ? <p className="text-sm text-red-700">{err}</p> : !d ? <LoadingState /> : d.total === 0 ? <p className="text-sm text-ink/60">Nothing due. Enjoy the breathing room.</p> : (
        d.weeks.map((w) => (
          <div key={w.weekStart} className="mb-4 last:mb-0">
            <p className="mb-1 text-xs font-medium text-ink/60">Week of {new Date(w.weekStart).toLocaleDateString("en-KE")} · {w.count} item(s){w.weekStart === d.heaviestWeek && d.weeks.length > 1 ? " · busiest" : ""}</p>
            <Table columns={["Due", "Type", "Course", "Title", "Marks"]} rows={w.items.map((i) => [new Date(i.due).toLocaleDateString("en-KE"), i.kind, i.course ?? "", i.title, i.marks])} />
          </div>
        ))
      )}
    </PortalSection>
  );
}

function Engagement() {
  const { d, err } = useLoad<{ weeks: { weekStart: string; minutesStudied: number; lessonsCompleted: number }[]; activeDays: number; currentStreakDays: number }>("/self/engagement");
  const max = Math.max(1, ...(d?.weeks.map((w) => w.minutesStudied) ?? [1]));
  return (
    <PortalSection title="Study activity (8 weeks)">
      {err ? <p className="text-sm text-red-700">{err}</p> : !d ? <LoadingState /> : (
        <>
          <p className="mb-3 text-sm text-ink/70">{d.activeDays} active day(s) · current streak {d.currentStreakDays} day(s)</p>
          <div className="flex items-end gap-2" role="img" aria-label={`Minutes studied per week: ${d.weeks.map((w) => w.minutesStudied).join(", ")}`}>
            {d.weeks.map((w) => (
              <div key={w.weekStart} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full bg-navy/70" style={{ height: `${Math.max(2, (w.minutesStudied / max) * 80)}px` }} title={`${w.minutesStudied} min, ${w.lessonsCompleted} lesson(s)`} />
                <span className="text-[10px] text-ink/50">{w.weekStart.slice(5)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </PortalSection>
  );
}

type Ticket = { id: string; subject: string; status: string; priority: string; createdAt: string; rating: number | null };
function MyTickets() {
  const { d, err, reload } = useLoad<Ticket[]>("/support/tickets/mine");
  const [subject, setSubject] = useState(""); const [body, setBody] = useState(""); const [msg, setMsg] = useState<string>();
  const [tried, setTried] = useState(false);
  const [ticketKey, setTicketKey] = useState(newIdempotencyKey); // one key per submission attempt; a retry/double click replays the first result
  const subjectErr = textError(subject, "Subject", 2, 200), bodyErr = textError(body, "Details", 2, 5000);
  async function raise() {
    setMsg(undefined); setTried(true);
    if (subjectErr || bodyErr) return;
    try { await apiFetch("/support/tickets", { method: "POST", headers: { "Idempotency-Key": ticketKey }, body: JSON.stringify({ subject, body }) }); setSubject(""); setBody(""); setTried(false); setTicketKey(newIdempotencyKey()); reload(); } catch (e) { setMsg((e as Error).message); }
  }
  async function rate(id: string, rating: number) { await apiFetch(`/support/tickets/${id}/rating`, { method: "POST", body: JSON.stringify({ rating }) }).then(reload).catch((e: Error) => setMsg(e.message)); }
  return (
    <PortalSection title="My support requests">
      {err ? <p className="text-sm text-red-700">{err}</p> : !d ? <LoadingState /> : (
        <>
          {d.length > 0 && <Table columns={["Subject", "Status", "Priority", "Rate"]} rows={d.map((t) => [t.subject, <Badge key={t.id} tone={t.status === "resolved" ? "ok" : t.status === "escalated" ? "warn" : "neutral"}>{t.status.replace("_", " ")}</Badge>, t.priority,
            t.status !== "resolved" ? "—" : t.rating ? `${t.rating}/5` : <span key={t.id + "r"} className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`Rate ${n} out of 5`} onClick={() => rate(t.id, n)} className="border border-line px-1.5 text-xs">{n}</button>)}</span>])} />}
          <div className="mt-4 grid gap-2">
            <FormField id="tk-subject" label="Subject" required error={tried ? subjectErr : undefined}>{(p) => <input {...p} className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />}</FormField>
            <FormField id="tk-body" label="Details" required error={tried ? bodyErr : undefined} hint="Include what you tried and any error you saw.">{(p) => <textarea {...p} className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />}</FormField>
            <button onClick={raise} className="w-fit border border-line px-3 py-1 text-sm">Raise request</button>
            {msg && <p role="alert" className="text-xs text-red-700">{msg}</p>}
          </div>
        </>
      )}
    </PortalSection>
  );
}

type Prefs = { inApp: boolean; email: boolean; sms: boolean; mutedCategories: string[]; categories: string[] };
function Preferences() {
  const { d, err } = useLoad<Prefs>("/notifications/preferences");
  const [p, setP] = useState<Prefs>(); const [saved, setSaved] = useState<string>();
  useEffect(() => { if (d) setP(d); }, [d]);
  if (err) return <PortalSection title="Notification preferences"><p className="text-sm text-red-700">{err}</p></PortalSection>;
  if (!p) return <PortalSection title="Notification preferences"><LoadingState /></PortalSection>;
  const toggleCat = (c: string) => setP({ ...p, mutedCategories: p.mutedCategories.includes(c) ? p.mutedCategories.filter((x) => x !== c) : [...p.mutedCategories, c] });
  async function save() {
    try { await apiFetch("/notifications/preferences", { method: "PUT", body: JSON.stringify({ inApp: p!.inApp, email: p!.email, sms: p!.sms, mutedCategories: p!.mutedCategories }) }); setSaved("Saved."); } catch (e) { setSaved((e as Error).message); }
  }
  return (
    <PortalSection title="Notification preferences">
      <fieldset className="flex flex-wrap gap-4 text-sm"><legend className="mb-1 text-xs text-ink/60">Deliver by</legend>
        {(["inApp", "email", "sms"] as const).map((k) => <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.checked })} />{k === "inApp" ? "In-app" : k.toUpperCase() === "SMS" ? "SMS" : "Email"}</label>)}
      </fieldset>
      <fieldset className="mt-3 flex flex-wrap gap-4 text-sm"><legend className="mb-1 text-xs text-ink/60">Mute these reminders</legend>
        {p.categories.map((c) => <label key={c} className="flex items-center gap-2"><input type="checkbox" checked={p.mutedCategories.includes(c)} onChange={() => toggleCat(c)} />{c}</label>)}
      </fieldset>
      <button onClick={save} className="mt-3 border border-line px-3 py-1 text-sm">Save preferences</button>
      {saved && <span role="status" className="ml-3 text-xs text-ink/60">{saved}</span>}
    </PortalSection>
  );
}

type DReq = { id: string; type: string; status: string; dueAt: string; urgency: string; resolutionNote: string | null };
const TYPES: [string, string][] = [["access", "A copy of my data"], ["correction", "Correct my data"], ["erasure", "Delete my data"], ["restriction", "Restrict how it is used"], ["objection", "Object to its use"]];
function DataRequests() {
  const { d, err, reload } = useLoad<DReq[]>("/self/data-requests");
  const [type, setType] = useState("access"); const [details, setDetails] = useState(""); const [msg, setMsg] = useState<string>();
  const [key, setKey] = useState(newIdempotencyKey);
  const detailsErr = details.length > 2000 ? "Details must be at most 2000 characters." : undefined;
  async function raise() {
    setMsg(undefined);
    if (detailsErr) return;
    try { await apiFetch("/self/data-requests", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ type, details: details || undefined }) }); setDetails(""); setKey(newIdempotencyKey()); reload(); }
    catch (e) { setMsg((e as Error).message); }
  }
  return (
    <PortalSection title="Data requests">
      <p className="text-sm text-ink/70">Ask the institution to give you, correct, restrict or delete personal data it holds. Some records (for example results and fee history) must be kept by law; you will be told what was done and why.</p>
      {err ? <p className="mt-2 text-sm text-red-700">{err}</p> : !d ? <LoadingState /> : d.length > 0 && (
        <div className="mt-3"><Table columns={["Type", "Status", "Response due", "Outcome"]} rows={d.map((r) => [r.type, <Badge key={r.id} tone={r.status === "completed" ? "ok" : r.status === "rejected" ? "warn" : r.urgency === "overdue" ? "danger" : "neutral"}>{r.status.replace("_", " ")}</Badge>, new Date(r.dueAt).toLocaleDateString("en-KE"), r.resolutionNote ?? "—"])} /></div>
      )}
      <div className="mt-4 grid gap-2">
        <label className="text-xs text-ink/60" htmlFor="dr-type">Request</label>
        <select id="dr-type" className="input w-auto" value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <FormField id="dr-details" label="Details (optional)" error={detailsErr} hint="Tell us which records or what should change.">{(p) => <textarea {...p} className="input" rows={2} value={details} onChange={(e) => setDetails(e.target.value)} />}</FormField>
        <button onClick={raise} className="w-fit border border-line px-3 py-1 text-sm">Submit request</button>
        {msg && <p role="alert" className="text-xs text-red-700">{msg}</p>}
      </div>
    </PortalSection>
  );
}
