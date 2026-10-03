// Batch 72 — pure helpers behind the easy-win endpoints (no DB, no Express).
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v ?? 0);

// KFEAT-005 — allowed academic-status moves (registry decides; this only states the rules).
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  ACTIVE: ["ON_LEAVE", "SUSPENDED", "WITHDRAWN", "GRADUATED", "EXCLUDED"],
  ON_LEAVE: ["ACTIVE", "WITHDRAWN"],
  SUSPENDED: ["ACTIVE", "EXCLUDED", "WITHDRAWN"],
  WITHDRAWN: [], GRADUATED: [], EXCLUDED: [],
};
export const nextStatuses = (s: string) => STATUS_TRANSITIONS[s] ?? [];
export const canTransition = (from: string, to: string) => nextStatuses(from).includes(to);

// KFEAT-008/118 — computed transcript: credit-weighted GPA on a 4.0 scale from the shared A–E bands.
const POINTS: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, E: 0 };
export type TranscriptEnrol = { semester: string; status: string; finalGrade: string | null; unit: { code: string; title: string; creditHours: number } };
export function buildTranscript(rows: TranscriptEnrol[]) {
  const graded = rows.filter((r) => r.finalGrade && r.finalGrade in POINTS);
  const credits = graded.reduce((a, r) => a + r.unit.creditHours, 0);
  const points = graded.reduce((a, r) => a + r.unit.creditHours * POINTS[r.finalGrade!], 0);
  const bySem = new Map<string, TranscriptEnrol[]>();
  for (const r of rows) bySem.set(r.semester, [...(bySem.get(r.semester) ?? []), r]);
  return {
    gpa: credits ? round2(points / credits) : null, creditsGraded: credits,
    creditsPassed: graded.filter((r) => r.finalGrade !== "E").reduce((a, r) => a + r.unit.creditHours, 0),
    semesters: [...bySem.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([semester, list]) => ({ semester, units: list.map((r) => ({ code: r.unit.code, title: r.unit.title, credits: r.unit.creditHours, status: r.status, grade: r.finalGrade })) })),
  };
}

// KFEAT-010 — progression alerts from data the student can already see.
export type AlertInput = { enrollments: { status: string; unit: { code: string } }[]; attendance: { present: boolean }[]; invoices: { amountDue: unknown; amountPaid: unknown; dueDate: Date }[]; holds: number; now?: Date };
export type Alert = { code: string; severity: "info" | "warning" | "critical"; message: string };
export function progressionAlerts(i: AlertInput): Alert[] {
  const now = i.now ?? new Date(); const out: Alert[] = [];
  const failed = i.enrollments.filter((e) => e.status === "failed");
  if (failed.length) out.push({ code: "FAILED_UNITS", severity: failed.length > 2 ? "critical" : "warning", message: `${failed.length} failed unit(s): ${failed.map((f) => f.unit.code).join(", ")}. Ask about resit or reassessment.` });
  if (i.attendance.length >= 5) {
    const pct = Math.round((i.attendance.filter((a) => a.present).length / i.attendance.length) * 100);
    if (pct < 75) out.push({ code: "LOW_ATTENDANCE", severity: pct < 60 ? "critical" : "warning", message: `Attendance is ${pct}% across ${i.attendance.length} recorded sessions.` });
  }
  const overdue = i.invoices.filter((v) => num(v.amountDue) - num(v.amountPaid) > 0 && v.dueDate < now);
  if (overdue.length) out.push({ code: "FEES_OVERDUE", severity: "warning", message: `${overdue.length} overdue invoice(s) totalling KES ${round2(overdue.reduce((a, v) => a + num(v.amountDue) - num(v.amountPaid), 0))}.` });
  if (i.holds) out.push({ code: "FINANCIAL_HOLD", severity: "critical", message: `${i.holds} active financial hold(s) may block results or registration.` });
  return out;
}

// KFEAT-040 — CSV with quote escaping and spreadsheet-formula neutralising (=,+,-,@ prefixed with ').
export function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const cell = (v: unknown) => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

// KFEAT-049 — outstanding balances by age past due date.
export function agingBuckets(invoices: { amountDue: unknown; amountPaid: unknown; dueDate: Date }[], now = new Date()) {
  const b = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  for (const v of invoices) {
    const out = num(v.amountDue) - num(v.amountPaid); if (out <= 0) continue;
    const late = Math.floor((now.getTime() - v.dueDate.getTime()) / 86_400_000);
    if (late <= 0) b.current += out; else if (late <= 30) b.d1_30 += out; else if (late <= 60) b.d31_60 += out; else if (late <= 90) b.d61_90 += out; else b.d90plus += out;
  }
  return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, round2(v)])) as typeof b;
}

// KFEAT-004 — what a student can do themselves, with the API route behind each.
export const SELF_SERVICES = [
  { key: "fees", label: "View fees and statement", path: "/api/self/fee-account" },
  { key: "transcript", label: "View my transcript", path: "/api/self/transcript" },
  { key: "documents", label: "My documents", path: "/api/self/documents" },
  { key: "alerts", label: "Progress alerts", path: "/api/self/alerts" },
  { key: "tickets", label: "Raise or track a support ticket", path: "/api/support/tickets/mine" },
  { key: "data", label: "Request my data / correction", path: "/api/self/data-requests" },
  { key: "prefs", label: "Notification preferences", path: "/api/notifications/preferences" },
  { key: "privacy", label: "Acknowledge privacy notice", path: "/api/self/privacy-notice" },
] as const;

// KAI-018 — retrieved document text is DATA. Neutralise lines that try to instruct the model, keep the rest.
const INJECTION = [/ignore (all |any )?(previous|prior|above) (instructions|prompts?)/i, /disregard (the )?(system|previous|above)/i, /you are now\b/i, /^\s*(system|assistant)\s*:/i, /reveal (your )?(system )?prompt/i, /do not (tell|inform) the (user|student)/i];
export function neutraliseRetrieved(text: string) {
  let hits = 0;
  const clean = text.split(/\r?\n/).map((line) => (INJECTION.some((p) => p.test(line)) ? (hits++, "[line removed: instruction-like text in source document]") : line)).join("\n");
  return { text: clean, removed: hits };
}
export const RATING_VALUES = ["helpful", "not_helpful", "wrong", "unsafe"] as const;
