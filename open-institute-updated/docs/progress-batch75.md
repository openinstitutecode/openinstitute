# Batch 75 — 12 codes touched

Checklist: `docs/checklist-batch75.md`. **No schema change.** Nothing compiled or run against a database (no npm/tsc/Postgres here); the new static-guard tests (2) pass. Run `npx tsc --noEmit && npm test` (backend) and `npm run build` (frontend) first.

- **AI tutor** returns `messageId`; new `AiFeedback` control under each tutor answer posts a rating (KAI-020). Advisor and other AI pages not wired yet.
- **My Record** gains quick links to the self-service pages.
- **Staff reports** (`/api/insights/`): `issuance-register` (+`?format=csv`), `student-register.csv`, `attachment-completion`.
- **tests/static-guards.test.ts** fails if unsafe raw SQL or raw-HTML injection is introduced.
- Runbook §6: staging/production checklist.
