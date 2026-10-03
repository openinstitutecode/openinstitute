import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, StatCard, Table, Badge } from "../../components/portal/Primitives";
import { LoadingState, ErrorState, EmptyState } from "../../components/portal/StateViews";
import { apiFetch, useCurrentUserName } from "../../lib/api";

const links = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/operations", label: "Operations & Data Governance" },
  { to: "/admin/audit-log", label: "Audit Log" },
];

const TABS = ["Service status", "Performance", "Data classification", "Duplicate records", "Financial exceptions", "AI usage"] as const;
type Tab = (typeof TABS)[number];

// Small loader: one endpoint → { data | error | loading }, with retry.
function useEndpoint<T>(path: string) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const load = useCallback(() => {
    setState({ loading: true });
    apiFetch<T>(path).then((data) => setState({ data, loading: false })).catch((e: Error) => setState({ error: e.message, loading: false }));
  }, [path]);
  useEffect(load, [load]);
  return { ...state, reload: load };
}

function Panel<T>({ path, children }: { path: string; children: (d: T) => React.ReactNode }) {
  const { data, error, loading, reload } = useEndpoint<T>(path);
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "No data."} onRetry={reload} />;
  return <>{children(data)}</>;
}

type Deps = { status: string; database: { ok: boolean; latencyMs: number; error?: string }; integrations: Record<string, { configured: boolean; provider?: string }>; ai: { active: number; queued: number; maxConcurrent: number; maxQueue: number }; uptimeSeconds: number };
type Metrics = { uptimeSeconds: number; totalRequests: number; serverErrorRate: number; statusClasses: Record<string, number>; slowestRoutes: { route: string; count: number; avgMs: number; maxMs: number; p95MsUpperBound: number | null }[]; process: { rssMb: number; heapUsedMb: number; cpuUserMs: number; eventLoopDelayP99Ms: number }; note: string };
type Classified = { modelsByHighestSensitivity: Record<string, number>; models: { model: string; highestSensitivity: string }[] };
type Dupes = { groups: { key: string; students: { id: string; studentNumber: string; fullName: string; intake: string }[] }[]; scanned: number; truncated: boolean; note: string };
type FinEx = { possibleDuplicatePayments: { id: string; invoiceId: string; amount: number; paidAt: string; reference: string }[][]; overpaidInvoices: { id: string; amountDue: number; amountPaid: number }[]; invoicesWhoseTotalDiffersFromPayments: { id: string; amountPaid: number; livePaymentsTotal: number }[]; overdueUnpaidInvoiceCount: number; note: string };
type AiStatus = { limiter: { active: number; queued: number; maxConcurrent: number; maxQueue: number }; features: { feature: string; calls: number; estimatedCost: number | null }[]; totalEstimatedCost: number | null; note: string };

const fmtUptime = (s: number) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;

export default function AdminOperations() {
  const userName = useCurrentUserName();
  const [tab, setTab] = useState<Tab>("Service status");

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-3xl font-medium">Operations &amp; data governance</h1>
      <div role="tablist" aria-label="Operations sections" className="mt-6 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium ${tab === t ? "border-b-2 border-navy text-navy" : "text-ink/60 hover:text-ink"}`}>
            {t}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-6 space-y-8">
        {tab === "Service status" && (
          <Panel<Deps> path="/ops/health/deps">
            {(d) => (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatCard label="Database" value={d.database.ok ? "Up" : "DOWN"} hint={`${d.database.latencyMs} ms round-trip`} />
                  <StatCard label="Uptime" value={fmtUptime(d.uptimeSeconds)} />
                  <StatCard label="AI queue" value={`${d.ai.active}/${d.ai.maxConcurrent} running`} hint={`${d.ai.queued} waiting (max ${d.ai.maxQueue})`} />
                </div>
                <PortalSection title="Integrations">
                  <Table columns={["Service", "Configured"]} rows={Object.entries(d.integrations).map(([k, v]) => [k, <Badge key={k} tone={v.configured ? "ok" : "neutral"}>{v.configured ? "configured" : "not configured"}</Badge>])} />
                  <p className="mt-2 text-xs text-ink/50">“Configured” means credentials/URL are present — it does not prove the remote service is reachable.</p>
                </PortalSection>
              </>
            )}
          </Panel>
        )}

        {tab === "Performance" && (
          <Panel<Metrics> path="/ops/metrics">
            {(m) => (
              <>
                <div className="grid gap-4 sm:grid-cols-4">
                  <StatCard label="Requests" value={m.totalRequests} hint={`since ${fmtUptime(m.uptimeSeconds)} ago`} />
                  <StatCard label="Server error rate" value={`${(m.serverErrorRate * 100).toFixed(2)}%`} />
                  <StatCard label="Memory (RSS)" value={`${m.process.rssMb} MB`} hint={`heap ${m.process.heapUsedMb} MB`} />
                  <StatCard label="Event-loop delay p99" value={`${m.process.eventLoopDelayP99Ms} ms`} />
                </div>
                <PortalSection title="Slowest routes (avg)">
                  {m.slowestRoutes.length === 0 ? <EmptyState title="Not enough traffic yet" hint="Routes appear once they have handled at least 3 requests." /> : (
                    <Table columns={["Route", "Calls", "Avg ms", "Max ms", "p95 ≤ ms"]} rows={m.slowestRoutes.map((r) => [r.route, r.count, r.avgMs, r.maxMs, r.p95MsUpperBound ?? "—"])} />
                  )}
                  <p className="mt-2 text-xs text-ink/50">{m.note}</p>
                </PortalSection>
              </>
            )}
          </Panel>
        )}

        {tab === "Data classification" && (
          <Panel<Classified> path="/ops/data-classification">
            {(c) => (
              <PortalSection title="Models by most sensitive class they hold">
                <div className="mb-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  {Object.entries(c.modelsByHighestSensitivity).map(([k, v]) => <StatCard key={k} label={k.replace("_", " ")} value={v} />)}
                </div>
                <Table columns={["Model", "Highest sensitivity"]} rows={c.models.filter((m) => m.highestSensitivity !== "operational").map((m) => [m.model, m.highestSensitivity.replace("_", " ")])} />
                <p className="mt-2 text-xs text-ink/50">Derived automatically from the live schema by field-name rules — a starting point for the data register, to be reviewed by the data-protection officer.</p>
              </PortalSection>
            )}
          </Panel>
        )}

        {tab === "Duplicate records" && (
          <Panel<Dupes> path="/ops/duplicates/students">
            {(d) => (
              <PortalSection title={`Possible duplicate students (${d.groups.length} groups, ${d.scanned} scanned)`}>
                {d.groups.length === 0 ? <EmptyState title="No duplicate candidates found" /> : (
                  <Table columns={["Name", "Student numbers", "Intake"]} rows={d.groups.map((g) => [g.students[0].fullName, g.students.map((s) => s.studentNumber).join(", "), g.students[0].intake])} />
                )}
                <p className="mt-2 text-xs text-ink/50">{d.note}{d.truncated ? " Result truncated at 20,000 records." : ""}</p>
              </PortalSection>
            )}
          </Panel>
        )}

        {tab === "Financial exceptions" && (
          <Panel<FinEx> path="/ops/financial-exceptions">
            {(f) => (
              <>
                <div className="grid gap-4 sm:grid-cols-4">
                  <StatCard label="Possible duplicate payments" value={f.possibleDuplicatePayments.length} hint="last 30 days" />
                  <StatCard label="Overpaid invoices" value={f.overpaidInvoices.length} />
                  <StatCard label="Ledger drift" value={f.invoicesWhoseTotalDiffersFromPayments.length} hint="invoice ≠ sum of payments" />
                  <StatCard label="Overdue unpaid" value={f.overdueUnpaidInvoiceCount} />
                </div>
                {f.possibleDuplicatePayments.length > 0 && (
                  <PortalSection title="Possible duplicate payments">
                    <Table columns={["Invoice", "Amount", "References", "Times"]} rows={f.possibleDuplicatePayments.map((g) => [g[0].invoiceId, g[0].amount.toFixed(2), g.map((p) => p.reference).join(", "), g.map((p) => new Date(p.paidAt).toLocaleString()).join(" · ")])} />
                  </PortalSection>
                )}
                <p className="text-xs text-ink/50">{f.note}</p>
              </>
            )}
          </Panel>
        )}

        {tab === "AI usage" && (
          <Panel<AiStatus> path="/ops/ai/status">
            {(a) => (
              <PortalSection title="AI usage, last 30 days">
                <div className="mb-4 grid gap-4 sm:grid-cols-3">
                  <StatCard label="Running / max" value={`${a.limiter.active}/${a.limiter.maxConcurrent}`} hint={`${a.limiter.queued} queued`} />
                  <StatCard label="Estimated cost" value={a.totalEstimatedCost === null ? "Not configured" : a.totalEstimatedCost.toFixed(2)} />
                </div>
                <Table columns={["Feature", "Calls", "Est. cost"]} rows={a.features.map((f) => [f.feature, f.calls, f.estimatedCost ?? "—"])} />
                <p className="mt-2 text-xs text-ink/50">{a.note}</p>
              </PortalSection>
            )}
          </Panel>
        )}
      </div>
    </PortalShell>
  );
}
