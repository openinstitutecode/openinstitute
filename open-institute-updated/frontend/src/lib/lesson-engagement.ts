import { useEffect, useRef } from "react";
import { apiFetch } from "./api";

// LMS029 — sends a time-on-task heartbeat every 30s while the lesson is
// open and the tab is visible (paused via the Page Visibility API rather
// than counting background time as "on task"). LMS023 — also emits one
// xAPI "experienced" statement on open, matching the de-facto standard verb
// for "the learner engaged with this content" used by most real LRS clients.
export function useLessonEngagement(lessonId: string | null | undefined) {
  const emittedExperienced = useRef<string | null>(null);

  useEffect(() => {
    if (!lessonId) return;
    if (emittedExperienced.current !== lessonId) {
      emittedExperienced.current = lessonId;
      apiFetch("/xapi/statements", {
        method: "POST",
        body: JSON.stringify({ verb: "experienced", objectId: `lesson:${lessonId}` }),
      }).catch(() => undefined);
    }

    const HEARTBEAT_MS = 30000;
    let elapsedSinceBeat = 0;
    const tick = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      elapsedSinceBeat += 1000;
      if (elapsedSinceBeat >= HEARTBEAT_MS) {
        elapsedSinceBeat = 0;
        apiFetch("/learning-analytics/heartbeat", {
          method: "POST",
          body: JSON.stringify({ lessonId, seconds: Math.round(HEARTBEAT_MS / 1000) }),
        }).catch(() => undefined);
      }
    }, 1000);

    return () => window.clearInterval(tick);
  }, [lessonId]);
}

// LMS023 — call when a lesson is marked complete, so the learning-record
// stream reflects real completions, not just "experienced" opens.
export function emitLessonCompleted(lessonId: string) {
  apiFetch("/xapi/statements", {
    method: "POST",
    body: JSON.stringify({ verb: "completed", objectId: `lesson:${lessonId}`, result: { completion: true } }),
  }).catch(() => undefined);
}
