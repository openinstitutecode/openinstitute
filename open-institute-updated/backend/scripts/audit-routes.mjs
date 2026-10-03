// KSEC-009 / KSEC-007 / KAPI-001 — static route audit.
//   node scripts/audit-routes.mjs               guard summary; exit 1 on a NEW unguarded route (CI)
//   node scripts/audit-routes.mjs --md          markdown table of every route
//   node scripts/audit-routes.mjs --ownership   auth-only routes taking an :id whose handler never looks at req.user (IDOR candidates)
import { inventory } from "./route-inventory.mjs";
const rows = inventory();
// Reviewed: public forms, credential verification, payment callback, token-signed file routes, public settings.
const PUBLIC_OK = new Set(["POST /api/applications", "POST /api/applications/:refNumber/documents", "POST /api/auth/login", "POST /api/auth/forgot-password", "POST /api/auth/reset-password", "POST /api/complaints", "GET /api/compliance/public-status", "GET /api/credentials/verify/:documentId", "GET /api/credentials/verify-student/:studentNumber", "GET /api/employers/postings", "GET /api/exams/admit-cards/verify/:documentId", "POST /api/finance/mpesa/callback", "GET /api/media/file/:id", "GET /api/programmes", "GET /api/programmes/:slug", "POST /api/rpl/apply", "GET /api/scorm/content/:packageId/*", "GET /api/settings/public", "GET /api/notices/active"]);
const none = rows.filter((r) => r.guard === "NONE" && !PUBLIC_OK.has(`${r.method} ${r.path}`));
// Reviewed batch 70: catalogue-style reads whose response is identical for every signed-in user and holds no personal data.
const CATALOGUE_OK = new Set(["GET /api/career/roles/:programmeSlug", "GET /api/competency/programme/:programmeId", "GET /api/competency/programme/:programmeId/matrix", "GET /api/content/courses/:courseId/completion-rule", "GET /api/knowledge-base/sources/:id", "GET /api/learning-paths/:id", "GET /api/rubrics/:assessmentId", "GET /api/trainer-self/office-hours/:trainerId", "GET (unmounted)/:programmeId"]);
const OWNER_HINT = /req\.user|courseGate|staffGuard|projectGate|canTeachCourse|hasPermission|assertCanAccess|requireOwner/;
if (process.argv.includes("--ownership")) {
  const sus = rows.filter((r) => r.guard === "auth" && r.params.length && !OWNER_HINT.test(r.text) && !CATALOGUE_OK.has(`${r.method} ${r.path}`));
  console.log(`auth-only routes with an id parameter: ${rows.filter((r) => r.guard === "auth" && r.params.length).length}; handler never references the caller: ${sus.length}`);
  for (const r of sus) console.log(`  ${r.method.padEnd(6)} ${r.path}  (${r.file})`);
  process.exit(process.argv.includes("--strict") && sus.length ? 1 : 0);
}
if (process.argv.includes("--md")) {
  console.log("| Method | Path | File | Guard |\n|---|---|---|---|");
  for (const r of [...rows].sort((a, b) => a.path.localeCompare(b.path))) console.log(`| ${r.method} | ${r.path} | ${r.file} | ${r.guard} |`);
} else {
  const by = rows.reduce((a, r) => ((a[r.guard] = (a[r.guard] ?? 0) + 1), a), {});
  console.log(`routes: ${rows.length}`, by);
  if (none.length) { console.log("\nNew route(s) with no guard and not on the reviewed public list:"); for (const r of none) console.log(`  ${r.method.padEnd(6)} ${r.path}  (${r.file})`); }
}
process.exit(none.length ? 1 : 0);
