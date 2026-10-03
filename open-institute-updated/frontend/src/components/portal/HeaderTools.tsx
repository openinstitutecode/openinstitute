// Batch 69 — KFX-014 unread badge + KUX-009 notification centre, KUX-014 global search, KUX-012 theme toggle.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../../lib/api";
import { currentTheme, setTheme, type Theme } from "../../lib/theme";

type Notice = { id: string; title: string; body: string; createdAt: string; readAt: string | null };

export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const refreshCount = useCallback(() => { apiFetch<{ unread: number }>("/notifications/mine/unread-count").then((r) => setUnread(r.unread)).catch(() => undefined); }, []);
  useEffect(() => {
    refreshCount();
    const t = setInterval(() => { if (!document.hidden) refreshCount(); }, 60_000); // no push channel yet; poll only while the tab is visible
    return () => clearInterval(t);
  }, [refreshCount]);
  async function toggle() {
    const next = !open; setOpen(next);
    if (next) apiFetch<Notice[]>("/notifications/mine").then((r) => setItems(r.slice(0, 10))).catch(() => setItems([]));
  }
  async function markAll() { await apiFetch("/notifications/mine/read-all", { method: "POST", body: "{}" }).catch(() => undefined); setUnread(0); setItems((x) => x.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))); }
  return (
    <div className="relative">
      <button onClick={toggle} aria-haspopup="true" aria-expanded={open} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative px-2 py-1 text-sm text-ink/70 hover:text-ink">
        <span aria-hidden>🔔</span>
        {unread > 0 && <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-gold px-1 text-center text-[10px] font-semibold leading-[1.1rem] text-ink">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 z-40 mt-2 w-80 border border-line bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <p className="text-sm font-medium">Notifications</p>
            <button onClick={markAll} disabled={!unread} className="text-xs text-navy disabled:opacity-40">Mark all read</button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink/50">Nothing yet.</li>}
            {items.map((n) => (
              <li key={n.id} className={`border-b border-line px-4 py-3 text-sm last:border-0 ${n.readAt ? "text-ink/60" : "font-medium"}`}>
                <p>{n.title}</p><p className="mt-0.5 text-xs font-normal text-ink/60">{n.body}</p>
                <p className="mt-1 text-[11px] font-normal text-ink/40">{new Date(n.createdAt).toLocaleString("en-KE")}</p>
              </li>
            ))}
          </ul>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2 text-center text-xs text-navy">See all notifications</Link>
        </div>
      )}
    </div>
  );
}

type Hit = { type: string; title: string; subtitle?: string; url: string };
export function GlobalSearch() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => { apiFetch<{ results: Hit[] }>(`/search?q=${encodeURIComponent(q.trim())}`).then((r) => { setHits(r.results); setOpen(true); }).catch(() => setHits([])); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div ref={box} className="relative hidden w-72 sm:block">
      <label className="sr-only" htmlFor="global-search">Search the portal</label>
      <input id="global-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder="Search programmes, library, students…" className="input py-1.5" autoComplete="off" />
      {open && q.trim().length >= 2 && (
        <ul role="listbox" aria-label="Search results" className="absolute z-40 mt-1 max-h-80 w-full overflow-y-auto border border-line bg-white shadow-lg">
          {hits.length === 0 && <li className="px-3 py-3 text-sm text-ink/50">No matches.</li>}
          {hits.map((h, i) => (
            <li key={i} role="option" aria-selected="false">
              <button className="block w-full px-3 py-2 text-left text-sm hover:bg-navy/[0.06]" onClick={() => { setOpen(false); setQ(""); nav(h.url); }}>
                <span className="font-medium">{h.title}</span>
                <span className="ml-2 font-mono text-[10px] uppercase text-ink/45">{h.type}</span>
                {h.subtitle && <span className="block text-xs text-ink/55">{h.subtitle}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ThemeToggle() {
  const [t, setT] = useState<Theme>(currentTheme());
  const next: Theme = t === "dark" ? "light" : "dark";
  return <button onClick={() => { setTheme(next); setT(next); }} aria-label={`Switch to ${next} mode`} className="px-2 py-1 text-sm text-ink/70 hover:text-ink"><span aria-hidden>{t === "dark" ? "☀️" : "🌙"}</span></button>;
}
