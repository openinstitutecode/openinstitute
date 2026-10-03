// EX039 — Assessment reports: formatted, exportable versions of the
// EX037 analytics data. Pure formatting logic, no DB access, so it's
// unit-testable. See tests/exam-reports.test.ts.

import { INSTITUTION_NAME, LETTERHEAD_CSS, letterheadHtml } from "./brand.js";

export type StudentResultRow = {
  studentUserId: string;
  score: number | null;
  totalMarks: number;
};

/** Escapes a CSV field per RFC 4180: wraps in quotes if it contains a
 * comma, quote, or newline, doubling any embedded quotes. */
function csvField(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Builds a CSV export of one assessment's results: one row per graded
 * submission, with student id, raw score, total marks, percentage, and
 * pass/fail against a 50% line (matching the EX037 analytics endpoint's
 * own pass-rate definition, so the two never disagree).
 */
export function buildResultsCsv(rows: StudentResultRow[]): string {
  const header = ["studentUserId", "score", "totalMarks", "percentage", "outcome"].join(",");
  const lines = rows.map((r) => {
    if (r.score === null) {
      return [csvField(r.studentUserId), "", csvField(r.totalMarks), "", "ungraded"].join(",");
    }
    const pct = r.totalMarks > 0 ? (r.score / r.totalMarks) * 100 : 0;
    const outcome = pct >= 50 ? "pass" : "fail";
    return [csvField(r.studentUserId), csvField(r.score), csvField(r.totalMarks), csvField(Math.round(pct * 100) / 100), outcome].join(",");
  });
  return [header, ...lines].join("\n") + "\n";
}

export type ResultsSlipData = {
  studentUserId: string;
  assessmentTitle: string;
  unitTitle: string;
  score: number | null;
  totalMarks: number;
  feedback: string | null;
  gradedAt: string | null;
};

/** Escapes text for safe inclusion in the HTML slip (no template injection
 * from a student-entered feedback string, a unit title, etc). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Builds a single printable results slip as a self-contained HTML page. */
export function buildResultsSlipHtml(data: ResultsSlipData): string {
  const pct = data.score !== null && data.totalMarks > 0 ? (data.score / data.totalMarks) * 100 : null;
  const outcome = pct === null ? "Not yet graded" : pct >= 50 ? "PASS" : "FAIL";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Results slip — ${escapeHtml(data.assessmentTitle)} — ${escapeHtml(INSTITUTION_NAME)}</title>
<style>
  body { font-family: sans-serif; max-width: 640px; margin: 40px auto; color: #1a1a1a; }
  h1 { font-size: 1.25rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; }
  td, th { text-align: left; padding: 0.5rem 0; border-bottom: 1px solid #ddd; }
  .outcome { font-weight: bold; }
  .pass { color: #1a7a3a; }
  .fail { color: #a11; }
${LETTERHEAD_CSS}
  @media print { body { margin: 0 auto; } }
</style>
</head>
<body>
  ${letterheadHtml("Results slip")}
  <h1>${escapeHtml(data.assessmentTitle)}</h1>
  <p>${escapeHtml(data.unitTitle)}</p>
  <table>
    <tr><th>Student</th><td>${escapeHtml(data.studentUserId)}</td></tr>
    <tr><th>Score</th><td>${data.score === null ? "Not yet graded" : `${data.score} / ${data.totalMarks}${pct !== null ? ` (${Math.round(pct)}%)` : ""}`}</td></tr>
    <tr><th>Outcome</th><td class="outcome ${outcome === "PASS" ? "pass" : outcome === "FAIL" ? "fail" : ""}">${escapeHtml(outcome)}</td></tr>
    ${data.gradedAt ? `<tr><th>Graded</th><td>${escapeHtml(new Date(data.gradedAt).toLocaleString())}</td></tr>` : ""}
    ${data.feedback ? `<tr><th>Feedback</th><td>${escapeHtml(data.feedback)}</td></tr>` : ""}
  </table>
</body>
</html>
`;
}
