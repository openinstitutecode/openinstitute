import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, StatCard, Table, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { LoadingState } from "../../components/portal/StateViews";

const links = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/admin-assistant", label: "AI Admin Assistant" },
  { to: "/admin/ai-governance", label: "AI Governance Centre" },
  { to: "/admin/role-permissions", label: "Role Permissions" },
  { to: "/admin/support-tickets", label: "Support Tickets" },
];

type UsageStats = {
  sinceDays: number;
  totalCalls: number;
  totalSuccesses: number;
  totalBlocked: number;
  totalFailures: number;
  byFeature: {
    feature: string;
    label: string;
    calls: number;
    successes: number;
    blocked: number;
    failures: number;
    avgLatencyMs: number;
  }[];
};

type CatalogueEntry = {
  key: string;
  label: string;
  resourceType: string;
  action: string;
  overrides: { role: string; isGranted: boolean }[];
};

type SafetyBlock = {
  id: string;
  feature: string;
  userId: string;
  role: string;
  createdAt: string;
};

// AI040 — AI governance centre. Everything on this page reads real data
// written by lib/ai-gateway.ts (AiUsageLog) and the real RolePermission
// overrides AI005 introduced — there is nothing simulated here; a quiet
// institution with no AI traffic yet will genuinely show all zeros.
type ModelConfig = { modelId: string; notes: string | null; updatedById: string | null; updatedAt: string | null };

// AI002 — Model management: reads/writes the real AiModelConfig row the
// gateway (lib/ai-gateway.ts) now consults on every call instead of a
// hard-coded model string. Editing is SUPER_ADMIN-only server-side; other
// governance-audience roles see this panel read-only.
function ModelConfigPanel() {
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ModelConfig>("/ai/governance/model-config")
      .then((c) => {
        setConfig(c);
        setDraft(c.modelId);
      })
      .catch(() => undefined);
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await apiFetch<ModelConfig>("/ai/governance/model-config", {
        method: "PATCH",
        body: JSON.stringify({ modelId: draft }),
      });
      setConfig(updated);
      setMessage("Saved. Takes effect on the next AI call — nothing needs a restart.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save — you may need SUPER_ADMIN to edit this.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8">
      <PortalSection title="Active model (AI002)">
        <p className="mb-4 text-xs text-ink/50">
          The model id every AI-backed feature calls through the gateway. Editable without a code change or
          redeploy — SUPER_ADMIN only. Still only the "anthropic" provider is wired up (AI003); this changes which
          model within that provider is used, not the provider itself.
        </p>
        {config ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-ink/60">Model id</span>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} className="input w-72" />
            </label>
            <button onClick={save} disabled={saving || draft === config.modelId} className="btn-primary">
              {saving ? "Saving…" : "Save"}
            </button>
            {config.updatedAt && (
              <span className="text-xs text-ink/45">
                Last changed {new Date(config.updatedAt).toLocaleString()}
                {config.updatedById ? ` by ${config.updatedById}` : ""}
              </span>
            )}
          </div>
        ) : (
          <LoadingState />
        )}
        {message && <p className="mt-2 text-xs text-navy-dark">{message}</p>}
      </PortalSection>
    </div>
  );
}

export default function AdminAiGovernance() {
  const userName = useCurrentUserName();
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueEntry[] | null>(null);
  const [safetyBlocks, setSafetyBlocks] = useState<SafetyBlock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    apiFetch<UsageStats>(`/ai/governance/usage?days=${days}`)
      .then(setUsage)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load usage stats."));
  }, [days]);

  useEffect(() => {
    apiFetch<CatalogueEntry[]>("/ai/governance/feature-catalog")
      .then(setCatalogue)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the feature catalogue."));
    apiFetch<SafetyBlock[]>("/ai/governance/safety-log")
      .then(setSafetyBlocks)
      .catch(() => setSafetyBlocks([]));
  }, []);

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">AI governance centre</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Every AI-backed feature now calls through one shared gateway. This page reads the real usage log and
        permission overrides that gateway writes — not a simulated dashboard.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <ModelConfigPanel />

      <div className="mt-6 flex items-center gap-3 text-sm">
        <span className="text-ink/60">Window:</span>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-sm px-3 py-1 ${days === d ? "bg-ink text-white" : "border border-line"}`}
          >
            {d} days
          </button>
        ))}
      </div>

      {usage && (
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <StatCard label="Total AI calls" value={usage.totalCalls} hint={`Last ${usage.sinceDays} days`} />
          <StatCard label="Succeeded" value={usage.totalSuccesses} />
          <StatCard label="Failed (no key / provider error)" value={usage.totalFailures} />
          <StatCard label="Blocked by safety layer" value={usage.totalBlocked} />
        </div>
      )}

      <div className="mt-8">
        <PortalSection title="Usage by feature">
          {usage && usage.byFeature.length > 0 ? (
            <Table
              columns={["Feature", "Calls", "Succeeded", "Failed", "Blocked", "Avg latency"]}
              rows={usage.byFeature.map((f) => [
                f.label,
                String(f.calls),
                String(f.successes),
                String(f.failures),
                String(f.blocked),
                `${f.avgLatencyMs} ms`,
              ])}
            />
          ) : (
            <p className="text-sm text-ink/50">No AI calls recorded in this window yet.</p>
          )}
        </PortalSection>
      </div>

      <div className="mt-8">
        <PortalSection title="Feature catalogue & permission overrides (AI005)">
          <p className="mb-4 text-xs text-ink/50">
            Every AI-backed endpoint in the app, and any role-specific override configured on it. Change overrides
            from Role Permissions (resource type "AI").
          </p>
          {catalogue ? (
            <Table
              columns={["Feature", "Permission key", "Overrides"]}
              rows={catalogue.map((c) => [
                c.label,
                `${c.resourceType} / ${c.action}`,
                c.overrides.length
                  ? c.overrides
                      .map((o) => `${o.role}: ${o.isGranted ? "allowed" : "blocked"}`)
                      .join(", ")
                  : "none — default allow",
              ])}
            />
          ) : (
            <LoadingState />
          )}
        </PortalSection>
      </div>

      <div className="mt-8">
        <PortalSection title="Safety layer — recent blocks (AI037)">
          <p className="mb-4 text-xs text-ink/50">
            Heuristic prompt-injection screening, not a trained classifier — see docs/feature-audit-400.md for what
            it does and does not catch.
          </p>
          {safetyBlocks && safetyBlocks.length > 0 ? (
            <Table
              columns={["Feature", "Role", "When"]}
              rows={safetyBlocks.map((b) => [
                b.feature,
                <Badge key={b.id} tone="warn">{b.role}</Badge>,
                new Date(b.createdAt).toLocaleString(),
              ])}
            />
          ) : (
            <p className="text-sm text-ink/50">No safety-layer blocks recorded.</p>
          )}
        </PortalSection>
      </div>
    </PortalShell>
  );
}
