# Batch 69 — batch 68 limits closed + 36 checklist codes updated

Checklist: `docs/checklist-batch69.md` (replaces batch 68's). **Needs `npx prisma db push`** — new: `NotificationPreference`, `SystemSetting`, `ScheduledJobRun`; new `HelpdeskTicket` columns (priority, assignedToId, resolvedAt, rating, ratingComment, ratedAt). All additive.

**Verification:** `tests/batch69-libs.test.ts` (10 tests) passes in a temp copy with a stubbed Prisma client and zod 3.23 — that covers roles, pseudonym secret, KPIs, ticket stats, invoice reconcile, link check, week buckets, project access rule, retention windows, settings schemas. Routes, Prisma queries and React pages are syntax-checked only. Run `npx tsc --noEmit && npm test` first; expect a few type fixes.

## Batch 68 limits, resolved
| Limit | Now |
|---|---|
| No resolution time / satisfaction | tickets store resolvedAt + rating; Insights → Support shows average/median hours and % satisfied |
| Pseudonym secret fell back to JWT_SECRET | production requires `ANALYTICS_PSEUDONYM_SECRET` (32+); dev derives a separate key |
| Role lists were guesses | one file (`lib/insight-roles.ts`), env override `INSIGHTS_ROLES_<AREA>`, and RolePermission rows (resource `INSIGHTS`) can narrow any role |
| Route audit only checked guard presence | `audit-routes.mjs --ownership` found real gaps — **fixed 9** (see below) |
| Reminders not scheduled | daily scheduler with advisory lock, honours notification preferences, records runs, alerts admins on failure |

## Security fixes you should know about (found by the ownership audit)
`GET /reports/:id/run` was open to **any signed-in user** (student lists, invoices) → now PRINCIPAL/REGISTRAR/FINANCE_OFFICER/QA_OFFICER/SUPER_ADMIN. Research notes, bibliography, literature matrix, milestones, IP records and mentorships, installment plans, peer reviews, reading-list items and task status now check ownership/role. A wrong id returns 404, not 403. If someone relied on the old open behaviour, they will now see 404/403.

## New
Notification bell + unread badge, header search, dark mode (all portals) · student Account page: workload, study activity, my tickets + rating, notification preferences, download my data · admin Insights: KPIs, library + link check, jobs, invoice reconcile preview, retention preview · Admin → System Settings · `GET /api/settings/public` · `docs/openapi.json` (`npm run docs:openapi`).

## Things to know
- Scheduler is off until `REMINDER_SCHEDULER_ENABLED=true`. It sends **in-app** notifications only.
- `POST /insights/reconcile-invoices` and `/retention/purge` only preview unless `?apply=true`.
- Dark mode: pages with hard-coded reds/golds and the public site were not contrast-checked.
- 14 auth-only routes with an `:id` still never look at the caller (mostly by-course/programme catalogue reads). Run `npm run audit:routes -- --ownership` and decide each.
