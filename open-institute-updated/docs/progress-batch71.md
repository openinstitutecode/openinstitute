# Batch 71 — 17 codes updated

Checklist: `docs/checklist-batch71.md`. **Needs `npx prisma db push`** — new tables `ServiceNotice`, `CredentialVerification` (additive).

**Verification:** 23 pure-logic + static-RBAC tests (batches 69–71) pass in a temp copy with a stubbed Prisma client. Routes, queries and React pages are syntax-checked only — run `npx tsc --noEmit && npm test` first.

## New
- **Service notices** (`/api/notices`, Insights → Service): incidents and planned maintenance; banner in every portal page; 30-day availability from incidents marked "major".
- **Monitoring** tab: notification delivery, VBL integration backlog/dead letters, AI provider error rate and latency.
- **Assessments** tab: score distribution per assessment. **Awards** tab now shows document-verification lookups (public verifier logs each lookup; IP stored only as a keyed hash).
- `GET /library?type=&licence=&subject=` filters.
- `FormField` (inline errors, aria wiring) on the student ticket/data-request forms and the notice form.
- `Idempotency-Key` sent by finance record-payment and public application forms.
- Feature flags `ui.global-search`, `ui.theme-toggle` now actually switch things (System Settings → feature.flags, set to false).
- Static RBAC test (`tests/batch71-rbac-and-notices.test.ts`) — fails if a new insights route lacks a role guard.

## Things to know
- Public verifier now writes one row per lookup. Volume grows with public traffic; no purge rule yet — add one to `retentionPurge` if it becomes large.
- Availability is a manual record, not uptime monitoring.
- Email/SMS delivery remains a stub, so Monitoring will show email/SMS as unsent.
