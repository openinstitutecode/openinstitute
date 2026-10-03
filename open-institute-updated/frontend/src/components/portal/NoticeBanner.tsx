// Batch 71 — KOBS-018: shows active incidents and upcoming/ongoing maintenance at the top of every portal page.
import { useEffect, useState } from "react";

type Notice = { id: string; kind: "incident" | "maintenance"; severity: string; title: string; message: string; startsAt: string; endsAt: string | null };

export default function NoticeBanner() {
  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    let live = true;
    const load = () => fetch("/api/notices/active").then((r) => (r.ok ? r.json() : [])).then((d) => live && Array.isArray(d) && setNotices(d)).catch(() => undefined);
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 120_000);
    return () => { live = false; clearInterval(t); };
  }, []);
  if (!notices.length) return null;
  return (
    <div role="region" aria-label="Service notices">
      {notices.map((n) => (
        <p key={n.id} role={n.kind === "incident" ? "alert" : "status"} className={`border-b px-6 py-2 text-sm ${n.kind === "incident" ? "border-red-200 bg-red-50 text-red-700" : "border-gold/40 bg-gold/15 text-ink"}`}>
          <strong>{n.kind === "incident" ? "Service issue: " : "Planned maintenance: "}{n.title}.</strong> {n.message}
          {n.kind === "maintenance" && n.endsAt && <> ({new Date(n.startsAt).toLocaleString("en-KE")} – {new Date(n.endsAt).toLocaleString("en-KE")})</>}
        </p>
      ))}
    </div>
  );
}
