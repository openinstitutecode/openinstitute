# Batch 68 — quick-wins pass 2

Checklist: `docs/checklist-batch68.md` (replaces the batch 67 file). No schema changes, no `prisma db push` needed.

**Verification:** `tests/batch68-libs.test.ts` (6 pure-logic tests) passes; new TS/TSX files are syntax-checked only. Nothing was type-checked against Prisma/Express, built by Vite, or run against a database. Run `npx tsc --noEmit && npm test` first.

## New
- `GET /api/self/{fee-account,statement,calendar.ics,progression}` + student page **Account & Progress** (`/student/account`).
- `GET /api/insights/{finance-dashboard,retention,course-performance,attachments,support,awards,pseudonymised-results}`, `POST /api/insights/reminders/{fees,logbooks}` + admin page **Insights & Reminders** (`/admin/insights`).
- `backend/scripts/audit-routes.mjs` (run in CI): lists route guards; fails on a new route with no auth guard that is not on its reviewed public list.

## Things to know
- Reminders are in-app notifications only, sent when an admin presses the button, and skipped for anyone reminded in the last 7 days.
- `pseudonymised-results` uses `ANALYTICS_PSEUDONYM_SECRET` (falls back to `JWT_SECRET`); changing the secret changes every pseudonym.
- Support tickets store no resolved-at time or rating, so resolution time and satisfaction are not reported.
- Role lists are in `insights.ts` (`FIN`, `ACAD`, `ATT`); adjust if your roles differ.
