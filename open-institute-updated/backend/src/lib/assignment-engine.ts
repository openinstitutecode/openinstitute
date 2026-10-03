// Batch 77 — assignments v2 (LMS-ASG-001…040). Pure logic, no database, so it can be unit-tested.
import { scoreStats } from "./score-stats.js";

export const r2 = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------ settings
export type AssignmentRules = {
  status: string;
  dueAt: Date;
  releaseAt: Date | null;
  cutoffAt: Date | null;
  lateMode: string; // NONE | PENALTY | ACCEPT
  latePenaltyPctPerDay: number;
  latePenaltyMaxPct: number;
  maxResubmissions: number;
  allowText: boolean;
  allowFiles: boolean;
  maxFiles: number;
  maxFileMb: number;
  allowedKinds: string[];
  requireEvidence: boolean;
};

export type WindowState = "NOT_OPEN" | "OPEN" | "LATE" | "CLOSED";
export type Window = { state: WindowState; reason: string; effectiveDueAt: Date; lateMinutes: number; lateDays: number; penaltyPct: number };

/** ASG004/005/019/022 — can this student hand in right now, and at what cost? */
export function submissionWindow(a: AssignmentRules, now: Date, grantedDueAt?: Date | null): Window {
  const due = grantedDueAt && grantedDueAt > a.dueAt ? grantedDueAt : a.dueAt;
  const base = { effectiveDueAt: due, lateMinutes: 0, lateDays: 0, penaltyPct: 0 };
  if (a.status === "DRAFT") return { ...base, state: "NOT_OPEN", reason: "This assignment has not been published yet." };
  if (a.status === "ARCHIVED") return { ...base, state: "CLOSED", reason: "This assignment has been archived." };
  if (a.releaseAt && a.releaseAt > now) return { ...base, state: "NOT_OPEN", reason: `Opens ${a.releaseAt.toISOString()}.` };
  if (now <= due) return { ...base, state: "OPEN", reason: "Open for submission." };
  const lateMinutes = Math.ceil((now.getTime() - due.getTime()) / 60_000);
  const lateDays = Math.ceil(lateMinutes / 1440);
  if (a.lateMode === "NONE") return { ...base, state: "CLOSED", reason: "The deadline has passed and late work is not accepted.", lateMinutes, lateDays };
  if (a.cutoffAt && now > a.cutoffAt && a.cutoffAt > due) return { ...base, state: "CLOSED", reason: "The late-submission window has closed.", lateMinutes, lateDays };
  const penaltyPct = a.lateMode === "PENALTY" ? latePenaltyPct(lateDays, a.latePenaltyPctPerDay, a.latePenaltyMaxPct) : 0;
  return { ...base, state: "LATE", reason: penaltyPct > 0 ? `Late: ${penaltyPct}% will be deducted.` : "Late, but accepted without penalty.", lateMinutes, lateDays, penaltyPct };
}

export function latePenaltyPct(lateDays: number, perDay: number, maxPct: number): number {
  if (lateDays <= 0) return 0;
  return r2(Math.min(Math.max(0, maxPct), Math.max(0, perDay) * lateDays));
}

export function applyPenalty(raw: number, pct: number): number {
  return r2(Math.max(0, raw * (1 - Math.min(100, Math.max(0, pct)) / 100)));
}

/** ASG023 — may the student hand in again? `versionCount` is how many versions exist (1 = original only). */
export function resubmitAllowance(maxResubmissions: number, versionCount: number): { allowed: boolean; remaining: number } {
  const used = Math.max(0, versionCount - 1);
  const remaining = Math.max(0, maxResubmissions - used);
  return { allowed: remaining > 0, remaining };
}

// --------------------------------------------------------------------- files
export const FILE_KINDS = ["pdf", "word", "excel", "powerpoint", "text", "audio", "video", "image", "archive"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

const EXT_KIND: Record<string, FileKind> = {
  ".pdf": "pdf", ".doc": "word", ".docx": "word", ".xls": "excel", ".xlsx": "excel", ".ppt": "powerpoint", ".pptx": "powerpoint",
  ".txt": "text", ".mp3": "audio", ".m4a": "audio", ".wav": "audio", ".ogg": "audio", ".oga": "audio", ".opus": "audio", ".weba": "audio",
  ".mp4": "video", ".m4v": "video", ".mov": "video", ".webm": "video", ".ogv": "video",
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image", ".webp": "image", ".zip": "archive",
};

export function fileKindOf(filename: string): FileKind | null {
  const m = /\.[A-Za-z0-9]{1,8}$/.exec(filename);
  return m ? EXT_KIND[m[0].toLowerCase()] ?? null : null;
}

/** ASG009-016 — does the set of files meet the assignment's rules? Returns plain-language problems. */
export function validateFiles(files: { name: string; sizeBytes: number }[], a: Pick<AssignmentRules, "allowFiles" | "maxFiles" | "maxFileMb" | "allowedKinds">): string[] {
  const out: string[] = [];
  if (files.length && !a.allowFiles) return ["This assignment does not accept file uploads."];
  if (files.length > a.maxFiles) out.push(`At most ${a.maxFiles} file(s) may be attached.`);
  for (const f of files) {
    const kind = fileKindOf(f.name);
    if (a.allowedKinds.length && (!kind || !a.allowedKinds.includes(kind))) out.push(`${f.name}: only ${a.allowedKinds.join(", ")} files are accepted.`);
    if (f.sizeBytes > a.maxFileMb * 1048576) out.push(`${f.name}: larger than the ${a.maxFileMb} MB limit.`);
  }
  return out;
}

/** ASG008-016/018 — is there enough content to hand in? Drafts may be empty. */
export function validateContent(text: string | null | undefined, fileCount: number, a: Pick<AssignmentRules, "allowText" | "allowFiles" | "requireEvidence">, isDraft: boolean): string[] {
  const out: string[] = [];
  const hasText = !!text && text.trim().length > 0;
  if (hasText && !a.allowText) out.push("This assignment does not accept typed answers.");
  if (isDraft) return out;
  if (!hasText && fileCount === 0) out.push("Add a typed answer or attach at least one file.");
  if (a.requireEvidence && fileCount === 0) out.push("Practical evidence is required — attach at least one file.");
  return out;
}

// -------------------------------------------------------------------- rubric
export type Criterion = { name: string; description?: string; maxMarks: number };

export function validateCriteria(criteria: unknown, totalMarks: number): { ok: true; criteria: Criterion[] } | { ok: false; message: string } {
  if (!Array.isArray(criteria) || criteria.length === 0) return { ok: false, message: "Add at least one rubric criterion." };
  const out: Criterion[] = [];
  const seen = new Set<string>();
  for (const c of criteria as Record<string, unknown>[]) {
    const name = typeof c?.name === "string" ? c.name.trim() : "";
    const maxMarks = Number(c?.maxMarks);
    if (!name) return { ok: false, message: "Every criterion needs a name." };
    if (!Number.isFinite(maxMarks) || maxMarks <= 0) return { ok: false, message: `Criterion "${name}" needs marks above zero.` };
    if (seen.has(name.toLowerCase())) return { ok: false, message: `Criterion "${name}" appears twice.` };
    seen.add(name.toLowerCase());
    out.push({ name, description: typeof c.description === "string" ? c.description : undefined, maxMarks });
  }
  const sum = r2(out.reduce((s, c) => s + c.maxMarks, 0));
  if (sum !== r2(totalMarks)) return { ok: false, message: `Criteria add up to ${sum} marks but the assignment is out of ${totalMarks}.` };
  return { ok: true, criteria: out };
}

export function scoreRubric(criteria: Criterion[], given: { name: string; score: number }[]): { total: number; rows: { name: string; maxMarks: number; score: number }[]; errors: string[] } {
  const errors: string[] = [];
  const byName = new Map(given.map((g) => [g.name.toLowerCase(), g.score]));
  const rows = criteria.map((c) => {
    const s = byName.get(c.name.toLowerCase());
    if (s === undefined) errors.push(`No mark given for "${c.name}".`);
    else if (!Number.isFinite(s) || s < 0 || s > c.maxMarks) errors.push(`"${c.name}" must be between 0 and ${c.maxMarks}.`);
    return { name: c.name, maxMarks: c.maxMarks, score: Number.isFinite(s) ? Math.min(c.maxMarks, Math.max(0, s as number)) : 0 };
  });
  for (const g of given) if (!criteria.some((c) => c.name.toLowerCase() === g.name.toLowerCase())) errors.push(`Unknown criterion "${g.name}".`);
  return { total: r2(rows.reduce((s, r) => s + r.score, 0)), rows, errors };
}

// --------------------------------------------------------------- annotations
export type Annotation = { start: number; end: number; quote: string; comment: string };

/** ASG026/034 — keep only well-formed highlights that point inside the text. */
export function cleanAnnotations(text: string, raw: unknown): { ok: true; annotations: Annotation[] } | { ok: false; message: string } {
  if (!Array.isArray(raw)) return { ok: false, message: "Annotations must be a list." };
  const out: Annotation[] = [];
  for (const a of raw as Record<string, unknown>[]) {
    const start = Number(a?.start), end = Number(a?.end);
    const comment = typeof a?.comment === "string" ? a.comment.trim() : "";
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) return { ok: false, message: "An annotation points outside the submitted text." };
    if (!comment) return { ok: false, message: "Every annotation needs a comment." };
    out.push({ start, end, quote: text.slice(start, end).slice(0, 300), comment: comment.slice(0, 1000) });
  }
  out.sort((x, y) => x.start - y.start);
  return { ok: true, annotations: out };
}

// ----------------------------------------------------------------- versions
/** ASG036 — how much changed between two versions of a text answer (word multiset difference). */
export function textChange(before: string, after: string): { added: number; removed: number; unchangedPct: number } {
  const words = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean);
  const count = (ws: string[]) => ws.reduce((m, w) => m.set(w, (m.get(w) ?? 0) + 1), new Map<string, number>());
  const a = count(words(before)), b = count(words(after));
  let added = 0, removed = 0, same = 0;
  for (const [w, n] of b) { const o = a.get(w) ?? 0; added += Math.max(0, n - o); same += Math.min(n, o); }
  for (const [w, n] of a) removed += Math.max(0, n - (b.get(w) ?? 0));
  const total = same + added + removed;
  return { added, removed, unchangedPct: total ? r2((same / total) * 100) : 100 };
}

// ---------------------------------------------------------------- moderation
/** ASG035 — a deterministic sample of submission ids for second marking (same inputs → same sample). */
export function moderationSample(ids: string[], pct: number, seed: string): string[] {
  if (pct <= 0 || ids.length === 0) return [];
  const n = Math.min(ids.length, Math.max(1, Math.ceil((ids.length * Math.min(100, pct)) / 100)));
  const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  return [...ids].sort((x, y) => hash(seed + x) - hash(seed + y) || x.localeCompare(y)).slice(0, n);
}

// ----------------------------------------------------------------- analytics
export type SubRow = { studentUserId: string; score: number | null; isLate: boolean; isDraft: boolean; submittedAt: Date; gradedAt: Date | null; needsRegrade?: boolean };

/** ASG038 — one-screen performance summary for an assignment. */
export function assignmentAnalytics(totalMarks: number, subs: SubRow[], enrolled: number, passMarkPercent = 40) {
  const handedIn = subs.filter((s) => !s.isDraft);
  const graded = handedIn.filter((s) => s.score !== null);
  const percents = graded.map((s) => (totalMarks > 0 ? ((s.score as number) / totalMarks) * 100 : 0));
  const stats = scoreStats(percents, passMarkPercent);
  const late = handedIn.filter((s) => s.isLate).length;
  return {
    enrolled,
    handedIn: handedIn.length,
    drafts: subs.length - handedIn.length,
    notSubmitted: Math.max(0, enrolled - handedIn.length),
    graded: graded.length,
    awaitingGrading: handedIn.length - graded.length,
    awaitingRegrade: handedIn.filter((s) => s.needsRegrade).length,
    late,
    onTimeRatePercent: handedIn.length ? r2(((handedIn.length - late) / handedIn.length) * 100) : null,
    submissionRatePercent: enrolled ? r2((handedIn.length / enrolled) * 100) : null,
    stats,
  };
}

/** ASG018 — plain-text receipt shown (and notified) after a successful hand-in. */
export function receiptText(title: string, at: Date, versionNo: number, fileCount: number, isLate: boolean, extra?: string | null): string {
  return [`Receipt: "${title}"`, `Received ${at.toISOString()} (version ${versionNo}${isLate ? ", late" : ""}).`, `${fileCount} file(s) attached.`, extra ?? ""].filter(Boolean).join(" ");
}

/** ASG029 — the mark a competency decision is worth in the gradebook (COMPETENT = full marks). */
export function competencyScore(result: string, totalMarks: number): number | null {
  if (result === "COMPETENT") return totalMarks;
  if (result === "NOT_YET_COMPETENT") return 0;
  return null;
}
