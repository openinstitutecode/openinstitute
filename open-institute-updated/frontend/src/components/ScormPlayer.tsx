import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { createScormApi } from "../lib/scorm-api";

type ScormLaunch = { packageId: string; manifestTitle: string | null; launchUrl: string };
type Attempt = { lessonStatus: string; scoreRaw: number | null; scoreMin: number | null; scoreMax: number | null; lessonLocation: string | null; suspendData: string | null };

// LMS022 — renders the trainer's uploaded SCORM package in an iframe and
// installs window.API (the SCORM 1.2 runtime, see lib/scorm-api.ts) on THIS
// window before the iframe navigates, since the SCO looks for it via
// window.parent.API. Same-origin only (the content is served from this
// app's own /api/scorm/content/... route) — that's a SCORM 1.2 constraint,
// not something this player relaxes.
export default function ScormPlayer({ lessonId }: { lessonId: string }) {
  const [launch, setLaunch] = useState<ScormLaunch | null>(null);
  const [status, setStatus] = useState<Attempt["lessonStatus"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const apiRef = useRef<ReturnType<typeof createScormApi> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const l = await apiFetch<ScormLaunch>(`/scorm/lesson/${lessonId}`);
        const attempt = await apiFetch<Attempt>(`/scorm/attempts/${l.packageId}`);
        if (cancelled) return;
        apiRef.current = createScormApi(l.packageId, attempt);
        (window as any).API = apiRef.current;
        setStatus(attempt.lessonStatus);
        setLaunch(l);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this SCORM package.");
      }
    })();
    return () => {
      cancelled = true;
      if ((window as any).API === apiRef.current) delete (window as any).API;
    };
  }, [lessonId]);

  // Poll the saved attempt every 10s while open, just to reflect the
  // lesson_status the SCO has been committing (LMSCommit writes happen
  // inside the iframe, invisible to this component otherwise).
  useEffect(() => {
    if (!launch) return;
    const id = window.setInterval(async () => {
      try {
        const attempt = await apiFetch<Attempt>(`/scorm/attempts/${launch.packageId}`);
        setStatus(attempt.lessonStatus);
      } catch {
        /* transient — try again next tick */
      }
    }, 10000);
    return () => window.clearInterval(id);
  }, [launch]);

  if (error) return <p className="text-sm text-navy-dark">{error}</p>;
  if (!launch) return <p className="text-sm text-ink/50">Loading SCORM package…</p>;

  const STATUS_LABEL: Record<string, string> = {
    passed: "Passed", completed: "Completed", failed: "Not yet passed",
    incomplete: "In progress", browsed: "Browsed", "not attempted": "Not started",
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-ink/60">
        <span>{launch.manifestTitle ?? "SCORM package"}</span>
        {status && <span className="rounded-full bg-navy/10 px-2 py-0.5 font-medium text-navy">{STATUS_LABEL[status] ?? status}</span>}
      </div>
      <iframe src={launch.launchUrl} title={launch.manifestTitle ?? "SCORM content"} className="h-[36rem] w-full rounded-sm border border-line bg-white" />
    </div>
  );
}
