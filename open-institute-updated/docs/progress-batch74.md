# Batch 74 — 19 codes touched

Checklist: `docs/checklist-batch74.md`. **No schema change.** Nothing compiled or run against a database (no npm/tsc/Postgres here); 10 pure-logic tests pass. Run `npx tsc --noEmit && npm test` (backend) and `npm run build` (frontend) first.

- **Student "My Record" page** (`/student/record`, link on Account): profile, alerts, announcements, unofficial transcript, documents, privacy-notice acknowledgement — uses batch 72 endpoints.
- **Record-access audit:** staff reads of registry student records and the student list write `STUDENT_RECORD_VIEWED`; `GET /insights/record-access` (Security area roles) summarises by user.
- **Refund approval limit:** new setting `finance.limits` → `refundApprovalLimitKes` (default 0 = off). Above it only Principal / Super Admin can approve.
- `GET /insights/moodle-health` live probe (Jobs area roles).
- `node backend/scripts/gen-arch-docs.mjs` regenerates `docs/architecture.md` (routes, lib usage, models, tests).

Known: `accessibility.ts` shows 0 handlers and no mount in the generated doc (looks unused or mounted another way — not checked).
