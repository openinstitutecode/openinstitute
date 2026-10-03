// Batch 69 — KFEAT-066/070/073/059: edit validated system settings (feature flags, branding, academic rules, KPI targets, privacy notice).
import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { LoadingState, ErrorState } from "../../components/portal/StateViews";
import { apiFetch, useCurrentUserName } from "../../lib/api";

const links = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/insights", label: "Insights & Reminders" },
  { to: "/admin/settings", label: "System Settings" },
];
type Row = { key: string; value: unknown; isDefault: boolean; defaultValue: unknown; updatedAt: string | null };
const HELP: Record<string, string> = {
  "feature.flags": "Map of flag name → true/false (public). Wired today: ui.global-search and ui.theme-toggle (set false to hide; anything unset is on).",
  branding: "institutionName, primaryColor (#RRGGBB), optional tagline, supportEmail, footerText. Public.",
  "kpi.targets": "Targets for the Insights → KPIs tab. Percentages 0–100; maxOpenTickets is a whole number.",
  "academic.rules": "Default pass mark used by course-performance and KPI reports. Grade entry still uses the fixed scale in code.",
  "privacy.notice": "version, summary (10+ chars) and optional url. Public — shown to applicants and students.",
};

function Editor({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const [text, setText] = useState(JSON.stringify(row.value, null, 2));
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  async function save() {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { setMsg({ ok: false, text: "That is not valid JSON." }); return; }
    try { await apiFetch(`/settings/${row.key}`, { method: "PUT", body: JSON.stringify(parsed) }); setMsg({ ok: true, text: "Saved." }); onSaved(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }
  return (
    <PortalSection title={row.key} action={<Badge tone={row.isDefault ? "neutral" : "ok"}>{row.isDefault ? "default" : "customised"}</Badge>}>
      <p className="mb-2 text-xs text-ink/60">{HELP[row.key]}</p>
      <label className="sr-only" htmlFor={`s-${row.key}`}>{row.key} value (JSON)</label>
      <textarea id={`s-${row.key}`} className="input font-mono text-xs" rows={Math.min(12, text.split("\n").length + 1)} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <div className="mt-2 flex items-center gap-3">
        <button onClick={save} className="border border-line px-3 py-1 text-sm">Save</button>
        <button onClick={() => setText(JSON.stringify(row.defaultValue, null, 2))} className="text-xs text-navy">Load default</button>
        {msg && <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-ink/60" : "text-red-700"}`}>{msg.text}</span>}
      </div>
    </PortalSection>
  );
}

export default function AdminSettings() {
  const userName = useCurrentUserName();
  const [rows, setRows] = useState<Row[]>();
  const [error, setError] = useState<string>();
  const load = () => apiFetch<Row[]>("/settings").then(setRows).catch((e: Error) => setError(e.message));
  useEffect(() => { load(); }, []);
  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-3xl font-medium">System settings</h1>
      <p className="mt-2 text-sm text-ink/60">Every change is validated on the server and written to the audit log. Only Super Admin and ICT Admin can save.</p>
      <div className="mt-6 space-y-6">
        {error && <ErrorState message={error} onRetry={load} />}
        {!rows && !error && <LoadingState />}
        {rows?.map((r) => <Editor key={r.key + (r.updatedAt ?? "")} row={r} onSaved={load} />)}
      </div>
    </PortalShell>
  );
}
