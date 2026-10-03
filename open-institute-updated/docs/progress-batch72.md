# Batch 72 — 15 codes updated (quick-win pass)

Checklist: `docs/checklist-batch72.md`. **No schema change** — no `prisma db push` needed. Mostly read-only endpoints on existing tables; **API only, no new pages**.

**Verification:** 6 new pure-logic tests (`tests/batch72-libs.test.ts`) pass; route files syntax-checked and `audit-routes.mjs --ownership` still reports 0 problems. Routes/queries are NOT executed (no npm/Postgres in sandbox): run `npx tsc --noEmit && npm test` first.

## New endpoints
- Student `/api/self/`: `profile`, `documents`, `services`, `transcript`, `alerts`, `announcements`, `bookmarks`, `reading-lists` (+items), `privacy-notice` (+`/acknowledge`), `ai-feedback`.
- Staff `/api/insights/`: `finance-report` (+`?format=csv`), `competency`, `competency.csv`, `exam-incidents`, `status-lifecycle`, `ai-feedback`.
- AI: passages retrieved from ingested documents have instruction-like lines stripped before prompting.

## Things to know
- `finance-report` is cached 60 s per instance, so figures can lag a minute.
- Transcript GPA uses A=4…E=0 weighted by credit hours; it is labelled unofficial.
- Status-lifecycle is rules only; the registry change workflow does not enforce it yet.
