// Batch 70 — KUX-009 / KFEAT-086: full notification history for any signed-in role (paged, filterable).
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PortalShell from "../components/portal/PortalShell";
import { PortalSection } from "../components/portal/Primitives";
import { LoadingState, ErrorState, EmptyState } from "../components/portal/StateViews";
import { apiFetch, useCurrentUserName } from "../lib/api";

type Item = { id: string; channel: string; title: string; body: string; createdAt: string; readAt: string | null };
type Page = { items: Item[]; page: number; totalPages: number; total: number };

export default function NotificationCentre() {
  const userName = useCurrentUserName();
  const nav = useNavigate();
  const [page, setPage] = useState(1);
  const [unread, setUnread] = useState(false);
  const [channel, setChannel] = useState("");
  const [data, setData] = useState<Page>();
  const [error, setError] = useState<string>();
  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(page), ...(unread ? { unread: "true" } : {}), ...(channel ? { channel } : {}) });
    setError(undefined);
    apiFetch<Page>(`/notifications/history?${q}`).then(setData).catch((e: Error) => setError(e.message));
  }, [page, unread, channel]);
  useEffect(load, [load]);
  async function markRead(id: string) { await apiFetch(`/notifications/${id}/read`, { method: "PATCH", body: "{}" }).catch(() => undefined); load(); }
  async function markAll() { await apiFetch("/notifications/mine/read-all", { method: "POST", body: "{}" }).catch(() => undefined); load(); }
  return (
    <PortalShell role="Notifications" links={[{ to: "/notifications", label: "Notification centre" }]} userName={userName}>
      <div className="flex items-center gap-4">
        <h1 className="font-display text-3xl font-medium">Notifications</h1>
        <button onClick={() => nav(-1)} className="text-sm text-navy">← Back</button>
      </div>
      <PortalSection title="History" action={<button onClick={markAll} className="border border-line px-3 py-1 text-sm">Mark all read</button>}>
        <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={unread} onChange={(e) => { setPage(1); setUnread(e.target.checked); }} />Unread only</label>
          <label className="flex items-center gap-2">Channel
            <select className="input w-auto py-1" value={channel} onChange={(e) => { setPage(1); setChannel(e.target.value); }}>
              <option value="">All</option><option value="in_app">In-app</option><option value="email">Email</option><option value="sms">SMS</option>
            </select>
          </label>
        </div>
        {error && <ErrorState message={error} onRetry={load} />}
        {!data && !error && <LoadingState />}
        {data && data.items.length === 0 && <EmptyState title="No notifications match" />}
        {data && data.items.length > 0 && (
          <ul className="divide-y divide-line border border-line">
            {data.items.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                <div className={n.readAt ? "text-ink/60" : ""}>
                  <p className={n.readAt ? "" : "font-medium"}>{n.title}</p>
                  <p className="mt-0.5 text-xs text-ink/60">{n.body}</p>
                  <p className="mt-1 text-[11px] text-ink/40">{new Date(n.createdAt).toLocaleString("en-KE")} · {n.channel.replace("_", "-")}</p>
                </div>
                {!n.readAt && <button onClick={() => markRead(n.id)} className="shrink-0 text-xs text-navy">Mark read</button>}
              </li>
            ))}
          </ul>
        )}
        {data && data.totalPages > 1 && (
          <div className="mt-4 flex items-center gap-3 text-sm">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="border border-line px-3 py-1 disabled:opacity-40">Previous</button>
            <span>Page {data.page} of {data.totalPages}</span>
            <button disabled={page >= data.totalPages} onClick={() => setPage(page + 1)} className="border border-line px-3 py-1 disabled:opacity-40">Next</button>
          </div>
        )}
      </PortalSection>
    </PortalShell>
  );
}
