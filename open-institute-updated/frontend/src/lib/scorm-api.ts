// LMS022 — a real SCORM 1.2 runtime API object. A SCO (the content inside
// the launched iframe) discovers this by walking window.parent looking for
// an object named exactly "API" with these exact method names — that's the
// SCORM 1.2 spec, not a naming choice we get to make. Persists to the
// backend on LMSCommit/LMSFinish; loads the student's saved state once on
// LMSInitialize. Covers the cmi.core.* subset every SCORM 1.2 package
// actually uses in practice (lesson_status, score, session_time,
// suspend_data, lesson_location) — not the full, rarely-implemented
// cmi.interactions.* array.
import { apiFetch } from "./api";

type Attempt = {
  lessonStatus: string;
  scoreRaw: number | null;
  scoreMin: number | null;
  scoreMax: number | null;
  lessonLocation: string | null;
  suspendData: string | null;
};

const ERROR_STRINGS: Record<string, string> = {
  "0": "No error",
  "101": "General exception",
  "201": "Invalid argument error",
  "301": "Not initialized",
  "401": "Not implemented error",
};

export function createScormApi(packageId: string, initial: Attempt) {
  let initialized = false;
  let finished = false;
  let lastError = "0";
  const cmi: Record<string, string> = {
    "cmi.core.lesson_status": initial.lessonStatus || "not attempted",
    "cmi.core.score.raw": initial.scoreRaw != null ? String(initial.scoreRaw) : "",
    "cmi.core.score.min": initial.scoreMin != null ? String(initial.scoreMin) : "",
    "cmi.core.score.max": initial.scoreMax != null ? String(initial.scoreMax) : "100",
    "cmi.core.lesson_location": initial.lessonLocation ?? "",
    "cmi.suspend_data": initial.suspendData ?? "",
    "cmi.core.session_time": "00:00:00",
    "cmi.core.student_id": "",
    "cmi.core.student_name": "",
    "cmi.core.credit": "credit",
    "cmi.core.entry": initial.lessonStatus && initial.lessonStatus !== "not attempted" ? "resume" : "ab-initio",
    "cmi.core.exit": "",
  };
  const startedAt = Date.now();

  function sessionSeconds(): number {
    return Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  }

  async function persist() {
    const scoreRaw = cmi["cmi.core.score.raw"];
    const scoreMin = cmi["cmi.core.score.min"];
    const scoreMax = cmi["cmi.core.score.max"];
    try {
      await apiFetch(`/scorm/attempts/${packageId}`, {
        method: "PUT",
        body: JSON.stringify({
          lessonStatus: cmi["cmi.core.lesson_status"] || undefined,
          scoreRaw: scoreRaw ? Number(scoreRaw) : null,
          scoreMin: scoreMin ? Number(scoreMin) : null,
          scoreMax: scoreMax ? Number(scoreMax) : null,
          lessonLocation: cmi["cmi.core.lesson_location"] || null,
          suspendData: cmi["cmi.suspend_data"] || null,
          sessionTimeSeconds: sessionSeconds(),
        }),
      });
    } catch {
      // Best-effort — a failed commit shouldn't crash the SCO. The next
      // commit (or LMSFinish) will resend the accumulated session time.
    }
  }

  return {
    LMSInitialize(_param: string) {
      if (initialized) { lastError = "101"; return "false"; }
      initialized = true;
      lastError = "0";
      return "true";
    },
    LMSFinish(_param: string) {
      if (!initialized) { lastError = "301"; return "false"; }
      finished = true;
      void persist();
      lastError = "0";
      return "true";
    },
    LMSGetValue(name: string) {
      if (!initialized) { lastError = "301"; return ""; }
      lastError = "0";
      return cmi[name] ?? "";
    },
    LMSSetValue(name: string, value: string) {
      if (!initialized || finished) { lastError = "301"; return "false"; }
      cmi[name] = value;
      lastError = "0";
      return "true";
    },
    LMSCommit(_param: string) {
      if (!initialized) { lastError = "301"; return "false"; }
      void persist();
      lastError = "0";
      return "true";
    },
    LMSGetLastError() {
      return lastError;
    },
    LMSGetErrorString(code: string) {
      return ERROR_STRINGS[code] ?? "Unknown error";
    },
    LMSGetDiagnostic(code: string) {
      return ERROR_STRINGS[code] ?? "";
    },
  };
}

export type ScormApi = ReturnType<typeof createScormApi>;
