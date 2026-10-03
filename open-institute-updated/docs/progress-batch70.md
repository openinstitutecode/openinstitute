# Batch 70 — 14 codes updated, ownership audit at zero

Checklist: `docs/checklist-batch70.md`. **Needs `npx prisma db push`** — new tables `DataRequest`, `IdempotencyRecord`; new relation on `User`. Additive.

**Verification:** 17 pure-logic tests (batch 69 + 70) pass in a temp copy with a stubbed Prisma client. Routes, queries and React pages are syntax-checked only — run `npx tsc --noEmit && npm test` first.

## Behaviour changes to know about
- Course-scoped reads now return **404 to people who are not enrolled in / teaching the course**: `content/assignments/course/:id`, `content/study-groups/course/:id`, `forums/course/:id`, `courses/:id/announcements` (GET), `courses/:id/moodle-launch`. Oversight roles keep access. Tell trainers/students if a previously visible page goes empty.
- Nine catalogue-style reads (career roles, competency by programme, fee structure, learning path, rubric, office hours, KB source, completion rule) stay open to any signed-in user by decision; the list and reason are in `scripts/audit-routes.mjs`. Remove one from `CATALOGUE_OK` if you disagree.
- `Idempotency-Key` is opt-in: no header, no change in behaviour.

## New
Data requests (student + staff) · Operations queues · Security dashboard · assessment analytics API · overdue-task and scheduled-report jobs (run daily when `REMINDER_SCHEDULER_ENABLED=true`) · full notification centre · branding/flags wired into the portal shell · retention purge also clears idempotency records >2 days.

## Still open from this area
Feature flags don't switch anything yet · assessment analytics has no screen · reminders/reports are in-app only · confirm the data-request deadline with counsel (KDATA-008).
