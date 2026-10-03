// Batch 71 — Insights panels: assessment analytics (KFEAT-030), monitoring (KOBS-006/007/008), service notices (KOBS-013/017/018), verification history (KFEAT-125).
import { useCallback, useEffect, useState } from "react";
import { PortalSection, StatCard, Table } from "../../components/portal/Primitives";
import { LoadingState, ErrorState, EmptyState } from "../../components/portal/StateViews";
import FormField, { textError } from "../../components/portal/FormField";
import { apiFetch } from "../../lib/api";

function useData<T>(path: string | null) {
  const [s, setS] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: !!path });
  const load = useCallback(() => {
    if (!path) return;
    setS((x) => ({ ...x, loading: true, error: undefined }));
    apiFetch<T>(path).then((data) => setS({ data, loading: false })).catch((e: Error) => setS({ error: e.message, loading: false }));
  }, [path]);
  useEffect(load, [load]);
  return { ...s, reload: load };
}
const fmt = (n: number | null | undefined, unit = "") => (n === null || n === undefined ? "—" : `${n}${unit}`);

export function AssessmentsPanel() {
  const list = useData<{ id: string; title: string; type: string; course: string; submissions: number }[]>("/insights/assessments");
  const [id, setId] = useState("");
  const stats = useData<any>(id ? `/insights/assessment/${id}/analytics` : null);
  if (list.loading) return <LoadingState />;
  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!list.data?.length) return <EmptyState title="No published assessments" />;
  const s = stats.data;
  const max = Math.max(1, ...(s?.histogram.map((h: any) => h.count) ?? [1]));
  return (
    <PortalSection title="Assessment analytics">
      <FormField id="an-pick" label="Assessment">{(p) => (
        <select {...p} className="input" value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Choose…</option>
          {list.data!.map((a) => <option key={a.id} value={a.id}>{a.course} — {a.title} ({a.submissions})</option>)}
        </select>)}
      </FormField>
      {id && stats.loading && <LoadingState />}
      {id && stats.error && <ErrorState message={stats.error} onRetry={stats.reload} />}
      {s && (s.n === 0 ? <p className="mt-4 text-sm text-ink/60">No graded submissions yet.</p> : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-6">
            <StatCard label="Graded" value={s.n} /><StatCard label="Mean" value={fmt(s.mean, "%")} /><StatCard label="Median" value={fmt(s.median, "%")} hint={`Q1 ${fmt(s.q1)} · Q3 ${fmt(s.q3)}`} />
            <StatCard label="Std dev" value={fmt(s.stdDev)} /><StatCard label="Range" value={`${fmt(s.min)}–${fmt(s.max)}`} /><StatCard label={`Pass (≥${s.assessment.passMarkPercent}%)`} value={fmt(s.passRatePercent, "%")} />
          </div>
          <div className="flex items-end gap-1" role="img" aria-label={`Score distribution by 10% band: ${s.histogram.map((h: any) => `${h.from}s: ${h.count}`).join(", ")}`}>
            {s.histogram.map((h: any) => (
              <div key={h.from} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-ink/60">{h.count}</span>
                <div className={`w-full ${h.from >= s.assessment.passMarkPercent ? "bg-navy/70" : "bg-gold"}`} style={{ height: `${Math.max(2, (h.count / max) * 90)}px` }} />
                <span className="text-[10px] text-ink/50">{h.from}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </PortalSection>
  );
}

export function MonitoringPanel() {
  const n = useData<any>("/insights/notifications"), i = useData<any>("/insights/integrations"), a = useData<any>("/insights/ai");
  return (
    <div className="space-y-8">
      <PortalSection title="Notification delivery (7 days)">
        {n.loading ? <LoadingState /> : n.error ? <ErrorState message={n.error} onRetry={n.reload} /> : (<>
          <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Created" value={n.data.total} /><StatCard label="Marked sent" value={fmt(n.data.deliveredPercent, "%")} /><StatCard label="Unsent > 1 h" value={n.data.unsentOlderThanOneHour} /></div>
          <div className="mt-3"><Table columns={["Channel", "Created", "Unsent"]} rows={n.data.byChannel.map((c: any) => [c.channel, c.created, c.unsent])} /></div>
          <p className="mt-2 text-xs text-ink/50">{n.data.note}</p>
        </>)}
      </PortalSection>
      <PortalSection title="Integrations (Virtual Business Lab)">
        {i.loading ? <LoadingState /> : i.error ? <ErrorState message={i.error} onRetry={i.reload} /> : (<>
          <div className="grid gap-4 sm:grid-cols-4"><StatCard label="Status" value={i.data.healthy ? "Healthy" : "Needs attention"} /><StatCard label="Backlog" value={`${i.data.backlogMinutes} min`} /><StatCard label="Dead letters" value={i.data.deadLetters} /><StatCard label="Last success" value={i.data.lastSuccessAt ? new Date(i.data.lastSuccessAt).toLocaleString("en-KE") : "—"} /></div>
          {i.data.recentFailures.length > 0 && <div className="mt-3"><Table columns={["Event", "Direction", "Status", "Tries", "Error"]} rows={i.data.recentFailures.map((f: any) => [f.eventType, f.direction, f.status, f.attempts, f.lastError ?? ""])} /></div>}
          <p className="mt-2 text-xs text-ink/50">{i.data.note}</p>
        </>)}
      </PortalSection>
      <PortalSection title="AI provider">
        {a.loading ? <LoadingState /> : a.error ? <ErrorState message={a.error} onRetry={a.reload} /> : (<>
          <div className="grid gap-4 sm:grid-cols-4"><StatCard label="Requests (24 h)" value={a.data.last24h.requests} /><StatCard label="Error rate (24 h)" value={fmt(a.data.last24h.errorRatePercent, "%")} /><StatCard label="p95 latency (24 h)" value={fmt(a.data.last24h.p95LatencyMs, " ms")} /><StatCard label="Blocked by safety (7 d)" value={a.data.last7d.blockedBySafety} /></div>
          {a.data.byFeature.length > 0 && <div className="mt-3"><Table columns={["Feature", "Requests (7 d)", "Failed", "Error %", "p95 ms"]} rows={a.data.byFeature.map((f: any) => [f.feature, f.requests, f.failed, fmt(f.errorRatePercent), fmt(f.p95LatencyMs)])} /></div>}
        </>)}
      </PortalSection>
    </div>
  );
}

export function ServicePanel() {
  const d = useData<any>("/notices");
  const [kind, setKind] = useState<"incident" | "maintenance">("incident");
  const [severity, setSeverity] = useState("minor");
  const [title, setTitle] = useState(""); const [message, setMessage] = useState("");
  const [startsAt, setStartsAt] = useState(""); const [endsAt, setEndsAt] = useState("");
  const [tried, setTried] = useState(false); const [err, setErr] = useState<string>();
  const [upd, setUpd] = useState<Record<string, string>>({});
  const titleErr = textError(title, "Title", 3, 120), msgErr = textError(message, "Message", 3, 1000);
  const windowErr = kind === "maintenance" ? (!startsAt || !endsAt ? "Maintenance needs a start and an end." : new Date(endsAt) <= new Date(startsAt) ? "The end must be after the start." : undefined) : undefined;
  async function create() {
    setTried(true); setErr(undefined);
    if (titleErr || msgErr || windowErr) return;
    try {
      await apiFetch("/notices", { method: "POST", body: JSON.stringify({ kind, severity, title, message, ...(kind === "maintenance" ? { startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() } : {}) }) });
      setTitle(""); setMessage(""); setStartsAt(""); setEndsAt(""); setTried(false); d.reload();
    } catch (e) { setErr((e as Error).message); }
  }
  async function act(id: string, action: string) {
    setErr(undefined);
    try { await apiFetch(`/notices/${id}`, { method: "PATCH", body: JSON.stringify({ action, text: upd[id] || undefined }) }); setUpd({ ...upd, [id]: "" }); d.reload(); } catch (e) { setErr((e as Error).message); }
  }
  if (d.loading && !d.data) return <LoadingState />;
  if (d.error) return <ErrorState message={d.error} onRetry={d.reload} />;
  const active = d.data.notices.filter((x: any) => x.status === "active");
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3"><StatCard label={`Availability (${d.data.windowDays} d)`} value={`${d.data.availabilityPercent}%`} hint={`${d.data.majorOutageMinutes} min major outage`} /><StatCard label="Active notices" value={active.length} /></div>
      <p className="text-xs text-ink/50">{d.data.note}</p>
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      <PortalSection title="Post a notice (shown to everyone in the portal)">
        <div className="grid max-w-xl gap-3">
          <FormField id="sn-kind" label="Type">{(p) => <select {...p} className="input" value={kind} onChange={(e) => setKind(e.target.value as any)}><option value="incident">Incident (something is wrong now)</option><option value="maintenance">Planned maintenance</option></select>}</FormField>
          {kind === "incident" && <FormField id="sn-sev" label="Severity" hint="'Major' counts against availability from start until resolved.">{(p) => <select {...p} className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="minor">Minor — degraded</option><option value="major">Major — unavailable</option></select>}</FormField>}
          <FormField id="sn-title" label="Title" required error={tried ? titleErr : undefined}>{(p) => <input {...p} className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />}</FormField>
          <FormField id="sn-msg" label="What users should know" required error={tried ? msgErr : undefined}>{(p) => <textarea {...p} className="input" rows={2} value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} />}</FormField>
          {kind === "maintenance" && (<>
            <FormField id="sn-from" label="Starts" required error={tried ? windowErr : undefined}>{(p) => <input {...p} type="datetime-local" className="input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />}</FormField>
            <FormField id="sn-to" label="Ends" required>{(p) => <input {...p} type="datetime-local" className="input" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />}</FormField>
          </>)}
          <button onClick={create} className="w-fit border border-line px-3 py-1 text-sm">Publish notice</button>
        </div>
      </PortalSection>
      <PortalSection title="Active">
        {active.length === 0 ? <EmptyState title="Nothing active" /> : (
          <ul className="divide-y divide-line border border-line">{active.map((n: any) => (
            <li key={n.id} className="space-y-2 px-4 py-3 text-sm">
              <p><strong>{n.title}</strong> · {n.kind}{n.kind === "incident" ? ` · ${n.severity}` : ""} · since {new Date(n.startsAt).toLocaleString("en-KE")}</p>
              <p className="text-xs text-ink/70">{n.message}</p>
              {(n.updates as any[]).map((u, k) => <p key={k} className="text-xs text-ink/60">{new Date(u.at).toLocaleString("en-KE")}: {u.text}</p>)}
              <div className="flex flex-wrap items-center gap-2">
                <input aria-label="Update text" className="input w-72 py-1" placeholder="Update or resolution note" value={upd[n.id] ?? ""} onChange={(e) => setUpd({ ...upd, [n.id]: e.target.value })} />
                <button onClick={() => act(n.id, "update")} disabled={!(upd[n.id] ?? "").trim()} className="border border-line px-2 py-1 text-xs disabled:opacity-40">Post update</button>
                <button onClick={() => act(n.id, "resolve")} disabled={!(upd[n.id] ?? "").trim()} className="border border-line px-2 py-1 text-xs disabled:opacity-40">{n.kind === "incident" ? "Resolve" : "Mark done"}</button>
                <button onClick={() => act(n.id, "cancel")} className="border border-line px-2 py-1 text-xs">Cancel</button>
              </div>
            </li>))}</ul>)}
      </PortalSection>
      <PortalSection title="History"><Table columns={["Type", "Title", "Status", "Started", "Ended"]} rows={d.data.notices.filter((x: any) => x.status !== "active").slice(0, 20).map((n: any) => [`${n.kind}${n.kind === "incident" ? ` (${n.severity})` : ""}`, n.title, n.status, new Date(n.startsAt).toLocaleString("en-KE"), n.endsAt ? new Date(n.endsAt).toLocaleString("en-KE") : "—"])} /></PortalSection>
    </div>
  );
}

export function VerificationsPanel() {
  const d = useData<any>("/insights/verifications");
  return (
    <PortalSection title="Document verification lookups (30 days)">
      {d.loading ? <LoadingState /> : d.error ? <ErrorState message={d.error} onRetry={d.reload} /> : (<>
        <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Lookups" value={d.data.lookups} /><StatCard label="Not found" value={d.data.notFound} /><StatCard label="Revoked shown" value={d.data.revokedShown} /></div>
        <div className="mt-3"><Table columns={["Document ID", "Lookups"]} rows={d.data.mostChecked.map((m: any) => [m.documentId, m.lookups])} /></div>
        <p className="mt-2 text-xs text-ink/50">{d.data.note}</p>
      </>)}
    </PortalSection>
  );
}
