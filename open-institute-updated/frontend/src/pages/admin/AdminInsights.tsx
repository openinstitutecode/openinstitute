// Batch 68 — KFEAT-051/060/061/108/089/124/050/115: read-only dashboards + reminder runs.
// Batch 71 — Assessments (KFEAT-030), Monitoring (KOBS-006/007/008), Service notices (KOBS-013/017/018), verification history (KFEAT-125).
// Batch 70 — Operations queues (KFEAT-056), Security (KFEAT-067/KSEC-030), Privacy data requests (KDATA-007).
// Batch 69 — KPIs vs targets (KFEAT-059), library analytics + link check (KFEAT-100/098), job history (KOBS-005), invoice reconcile (KFX-026), retention preview (KDATA-003).
import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, StatCard, Table } from "../../components/portal/Primitives";
import { LoadingState, ErrorState, EmptyState } from "../../components/portal/StateViews";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { AssessmentsPanel, MonitoringPanel, ServicePanel, VerificationsPanel } from "./InsightPanels";

const links = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/operations", label: "Operations & Data Governance" },
  { to: "/admin/insights", label: "Insights & Reminders" },
  { to: "/admin/settings", label: "System Settings" },
];
const TABS = ["Operations", "KPIs", "Finance", "Retention", "Course performance", "Assessments", "Attachments", "Support", "Awards", "Library", "Security", "Privacy", "Monitoring", "Service", "Jobs"] as const;
type Tab = (typeof TABS)[number];
const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;

function Panel<T>({ path, children }: { path: string; children: (d: T) => React.ReactNode }) {
  const [s, setS] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const load = useCallback(() => { setS({ loading: true }); apiFetch<T>(path).then((data) => setS({ data, loading: false })).catch((e: Error) => setS({ error: e.message, loading: false })); }, [path]);
  useEffect(load, [load]);
  if (s.loading) return <LoadingState />;
  if (s.error || !s.data) return <ErrorState message={s.error ?? "No data."} onRetry={load} />;
  return <>{children(s.data)}</>;
}

function ReminderButton({ path, label }: { path: string; label: string }) {
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true); setMsg(undefined);
    try { const r = await apiFetch<{ candidates: number; created: number; skipped: number }>(path, { method: "POST", body: "{}" }); setMsg(`${r.created} sent, ${r.skipped} skipped (already reminded this week).`); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  return <span className="flex items-center gap-3"><button disabled={busy} onClick={run} className="border border-line px-3 py-1 text-sm">{busy ? "Sending…" : label}</button>{msg && <span role="status" className="text-xs text-ink/60">{msg}</span>}</span>;
}

function ActionButton({ path, label, render }: { path: string; label: string; render: (r: any) => string }) {
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function run() { setBusy(true); setMsg(undefined); try { setMsg(render(await apiFetch(path, { method: "POST", body: "{}" }))); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } }
  return <span className="flex items-center gap-3"><button disabled={busy} onClick={run} className="border border-line px-3 py-1 text-sm">{busy ? "Working…" : label}</button>{msg && <span role="status" className="text-xs text-ink/60">{msg}</span>}</span>;
}

function DataRequestsPanel() {
  const [rows, setRows] = useState<any[]>();
  const [err, setErr] = useState<string>();
  const [note, setNote] = useState<Record<string, string>>({});
  const load = useCallback(() => { apiFetch<any[]>("/insights/data-requests").then(setRows).catch((e: Error) => setErr(e.message)); }, []);
  useEffect(load, [load]);
  async function act(id: string, status: string) {
    setErr(undefined);
    try { await apiFetch(`/insights/data-requests/${id}`, { method: "PATCH", body: JSON.stringify({ status, resolutionNote: note[id] || undefined }) }); load(); } catch (e) { setErr((e as Error).message); }
  }
  if (!rows && !err) return <LoadingState />;
  return (
    <PortalSection title="Data-subject requests (oldest deadline first)">
      {err && <p role="alert" className="mb-2 text-sm text-red-700">{err}</p>}
      {rows?.length === 0 ? <EmptyState title="No data requests" /> : (
        <ul className="divide-y divide-line border border-line">
          {rows?.map((r) => (
            <li key={r.id} className="space-y-2 px-4 py-3 text-sm">
              <p><strong>{r.type}</strong> · {r.requester} ({r.requesterRole}) · due {new Date(r.dueAt).toLocaleDateString("en-KE")} · <span className={r.urgency === "overdue" ? "text-red-700" : ""}>{r.status.replace("_", " ")}{r.urgency === "overdue" ? " — OVERDUE" : ""}</span></p>
              {r.details && <p className="text-xs text-ink/70">{r.details}</p>}
              {(r.status === "received" || r.status === "in_progress") ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input aria-label="Outcome note" className="input w-72 py-1" placeholder="What was done, or why refused" value={note[r.id] ?? ""} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} />
                  {r.status === "received" && <button onClick={() => act(r.id, "in_progress")} className="border border-line px-2 py-1 text-xs">Start</button>}
                  <button onClick={() => act(r.id, "completed")} className="border border-line px-2 py-1 text-xs">Complete</button>
                  <button onClick={() => act(r.id, "rejected")} className="border border-line px-2 py-1 text-xs">Refuse</button>
                </div>
              ) : <p className="text-xs text-ink/60">Outcome: {r.resolutionNote}</p>}
            </li>
          ))}
        </ul>
      )}
    </PortalSection>
  );
}

export default function AdminInsights() {
  const userName = useCurrentUserName();
  const [tab, setTab] = useState<Tab>("Operations");
  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-3xl font-medium">Insights &amp; reminders</h1>
      <div role="tablist" aria-label="Insight sections" className="mt-6 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium ${tab === t ? "border-b-2 border-navy text-navy" : "text-ink/60"}`}>{t}</button>)}
      </div>
      <div role="tabpanel" className="mt-6 space-y-8">
        {tab === "Operations" && (
          <Panel<any> path="/insights/operations">{(d) => (
            <PortalSection title="Waiting for a person">
              <div className="grid gap-4 sm:grid-cols-5">{d.queues.map((q: any) => <StatCard key={q.key} label={q.label} value={q.count} />)}</div>
            </PortalSection>)}</Panel>
        )}
        {tab === "KPIs" && (
          <Panel<any> path="/insights/kpis">{(d) => (<>
            <div className="grid gap-4 sm:grid-cols-4">
              {d.kpis.map((k: any) => <StatCard key={k.key} label={k.label} value={k.value === null ? "—" : k.unit === "%" ? `${k.value}%` : k.value} hint={`${k.status === "unknown" ? "no data" : k.status === "ok" ? "on target" : k.status === "warn" ? "near target" : "off target"} · target ${k.direction === "min" ? "≥" : "≤"} ${k.target}${k.unit === "%" ? "%" : ""}`} />)}
            </div>
            <p className="text-xs text-ink/50">{d.note}</p>
          </>)}</Panel>
        )}
        {tab === "Finance" && (
          <Panel<any> path="/insights/finance-dashboard">{(d) => (<>
            <div className="grid gap-4 sm:grid-cols-4">
              <StatCard label="Billed" value={kes(d.totalBilled)} /><StatCard label="Collected" value={kes(d.totalCollected)} hint={`${d.collectionRatePercent}% collection rate`} />
              <StatCard label="Overdue" value={kes(d.outstandingBuckets.overdue.amount)} hint={`${d.outstandingBuckets.overdue.count} invoices`} /><StatCard label="Active holds" value={d.activeHolds} />
            </div>
            <PortalSection title="Monthly collections" action={<ReminderButton path="/insights/reminders/fees" label="Send fee reminders" />}>
              <Table columns={["Month", "Collected"]} rows={d.monthlyCollections.map((m: any) => [m.month, kes(m.amount)])} />
            </PortalSection>
            <PortalSection title="Invoice reconciliation" action={<ActionButton path="/insights/reconcile-invoices" label="Check for mismatches" render={(r) => `${r.mismatches} of ${r.scanned} invoices differ from their payments (preview only — nothing changed).`} />}>
              <p className="text-sm text-ink/60">Compares each invoice's paid amount and status with its non-reversed payments. Applying fixes is a deliberate API call (<code>?apply=true</code>).</p>
            </PortalSection>
            <PortalSection title="By payment method"><Table columns={["Method", "Payments", "Amount"]} rows={d.byMethod.map((m: any) => [m.method, m.payments, kes(m.amount)])} /></PortalSection>
          </>)}</Panel>
        )}
        {tab === "Retention" && (
          <Panel<any> path="/insights/retention">{(d) => (<>
            <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Students (excl. graduates)" value={d.overall.total} /><StatCard label="Retention" value={`${d.overall.retentionPercent}%`} /><StatCard label="Attrition" value={`${d.overall.attritionPercent}%`} hint="withdrawn + excluded" /></div>
            <PortalSection title="Cohorts (highest attrition first)"><Table columns={["Programme", "Intake", "Students", "Attrition %"]} rows={d.cohorts.map((c: any) => [c.programme, c.intake, c.total, c.attritionPercent])} /></PortalSection>
          </>)}</Panel>
        )}
        {tab === "Course performance" && (
          <Panel<any> path="/insights/course-performance">{(d) => (
            <PortalSection title="Pass rate by course (lowest first)">
              {d.courses.length === 0 ? <EmptyState title="No graded submissions yet" /> : <Table columns={["Course", "Assessments", "Scored", "Average %", "Pass rate %"]} rows={d.courses.map((c: any) => [c.course, c.assessments, c.scoredSubmissions, c.averagePercent, c.passRatePercent])} />}
              <p className="mt-2 text-xs text-ink/50">{d.note}</p>
            </PortalSection>)}</Panel>
        )}
        {tab === "Assessments" && <AssessmentsPanel />}
        {tab === "Monitoring" && <MonitoringPanel />}
        {tab === "Service" && <ServicePanel />}
        {tab === "Attachments" && (
          <Panel<any> path="/insights/attachments">{(d) => (<>
            <div className="grid gap-4 sm:grid-cols-4">
              {Object.entries(d.byStatus).map(([k, v]) => <StatCard key={k} label={k} value={v as number} />)}
              <StatCard label="Logbook sign-off" value={`${d.logbook.signOffPercent}%`} hint={`${d.logbook.signedOff}/${d.logbook.entries}`} />
              <StatCard label="Ending in 14 days" value={d.endingWithin14Days} />
            </div>
            <PortalSection title="Students with no logbook entry in 8+ days" action={<ReminderButton path="/insights/reminders/logbooks" label="Send logbook reminders" />}>
              {d.staleLogbooks.length === 0 ? <EmptyState title="All active placements are up to date" /> : <Table columns={["Student", "Number", "Last entry"]} rows={d.staleLogbooks.map((s: any) => [s.student, s.studentNumber, s.lastEntry ? new Date(s.lastEntry).toLocaleDateString("en-KE") : "never"])} />}
            </PortalSection>
          </>)}</Panel>
        )}
        {tab === "Support" && (
          <Panel<any> path="/insights/support">{(d) => (<>
            {d.alert && <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{d.alert}</p>}
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6"><StatCard label="Tickets" value={d.total} /><StatCard label="Unresolved" value={d.open} /><StatCard label="Handled by AI" value={`${d.aiHandledPercent}%`} /><StatCard label="Avg resolution" value={d.avgResolutionHours === null ? "—" : `${d.avgResolutionHours} h`} hint={d.medianResolutionHours === null ? undefined : `median ${d.medianResolutionHours} h`} /><StatCard label="Avg rating" value={d.avgRating === null ? "—" : `${d.avgRating}/5`} hint={`${d.ratedCount} rated`} /><StatCard label="Satisfied (4-5)" value={d.satisfiedPercent === null ? "—" : `${d.satisfiedPercent}%`} /></div>
            <PortalSection title="By status"><Table columns={["Status", "Tickets"]} rows={Object.entries(d.byStatus).map(([k, v]) => [k, v as number])} /><p className="mt-2 text-xs text-ink/50">{d.note}</p></PortalSection>
          </>)}</Panel>
        )}
        {tab === "Awards" && (
          <Panel<any> path="/insights/awards">{(d) => (<>
            <div className="grid gap-4 sm:grid-cols-2"><StatCard label="Certificates issued" value={d.totalIssued} /><StatCard label="Revoked" value={d.totalRevoked} /></div>
            <PortalSection title="By qualification"><Table columns={["Qualification", "Issued", "Revoked"]} rows={d.byQualification.map((q: any) => [q.qualification, q.issued, q.revoked])} /></PortalSection>
            <VerificationsPanel />
          </>)}</Panel>
        )}
        {tab === "Library" && (
          <Panel<any> path="/insights/library">{(d) => (<>
            <div className="grid gap-4 sm:grid-cols-4">
              {Object.entries(d.events).map(([k, v]) => <StatCard key={k} label={`${k} (90 d)`} value={v as number} />)}
              <StatCard label="External links checked" value={`${d.links.checked}/${d.links.withExternalUrl}`} hint={`${d.links.broken.length} broken`} />
            </div>
            <PortalSection title="Most used resources (90 days)"><Table columns={["Title", "Type", "Events"]} rows={d.topResources.map((r: any) => [r.title, r.type ?? "", r.events])} /></PortalSection>
            <PortalSection title="Broken links" action={<ActionButton path="/insights/library/check-links" label="Check next 40 links" render={(r) => `${r.checked} checked, ${r.broken} broken, ${r.remaining} not yet in this run.`} />}>
              {d.links.broken.length === 0 ? <EmptyState title="No broken links recorded" /> : <Table columns={["Resource", "URL", "Problem"]} rows={d.links.broken.map((b: any) => [b.title, b.url, b.status ?? b.error ?? "failed"])} />}
            </PortalSection>
          </>)}</Panel>
        )}
        {tab === "Security" && (
          <Panel<any> path="/insights/security">{(d) => (<>
            <div className="grid gap-4 sm:grid-cols-4">
              <StatCard label={`Failed sign-ins (${d.windowDays} d)`} value={d.failedLogins} />
              {Object.entries(d.byReason).map(([k, v]) => <StatCard key={k} label={k.replace(/_/g, " ")} value={v as number} />)}
            </div>
            <PortalSection title="Most targeted accounts"><Table columns={["Account (masked)", "Attempts"]} rows={d.topTargets.map((t: any) => [t.account, t.attempts])} /></PortalSection>
            <PortalSection title="Most active sources"><Table columns={["IP address", "Attempts"]} rows={d.topSources.map((t: any) => [t.ip, t.attempts])} /></PortalSection>
            <PortalSection title="Audit-log activity by action"><Table columns={["Action", "Count"]} rows={d.auditActions.map((a: any) => [a.action, a.count])} /><p className="mt-2 text-xs text-ink/50">{d.note}</p></PortalSection>
          </>)}</Panel>
        )}
        {tab === "Privacy" && <DataRequestsPanel />}
        {tab === "Jobs" && (
          <Panel<any> path="/insights/jobs">{(d) => (<>
            <p className="text-sm text-ink/70">Scheduler: <strong>{d.schedulerEnabled ? "on" : "off"}</strong> (set <code>REMINDER_SCHEDULER_ENABLED=true</code> to run reminders and retention daily). Failures alert admins in-app.</p>
            <PortalSection title="Latest run per job" action={<ActionButton path="/insights/retention/purge" label="Preview retention purge" render={(r) => `Would delete ${r.failedLoginAttempts} login attempts, ${r.passwordResetTokens} reset tokens, ${r.readNotifications} old read notifications.`} />}>
              {d.latest.length === 0 ? <EmptyState title="No job has run yet" /> : <Table columns={["Job", "Started", "Trigger", "Result"]} rows={d.latest.map((j: any) => [j.job, new Date(j.startedAt).toLocaleString("en-KE"), j.trigger, j.finishedAt ? (j.ok ? JSON.stringify(j.summary) : `FAILED: ${j.error}`) : "running…"])} />}
            </PortalSection>
          </>)}</Panel>
        )}
      </div>
    </PortalShell>
  );
}
