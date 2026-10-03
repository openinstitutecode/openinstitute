# Batch 79 — release hardening

## Changes

- Added a checked-in initial Prisma migration and switched container startup to `prisma migrate deploy` rather than applying schema changes with `prisma db push`.
- First-run seeding now requires an institution-selected admin email and a unique password of at least 8 characters. No built-in administrator credential is published.
- Added authorization and balance checks to M-Pesa and card checkout, validated callback amounts, and serialized ledger payment writes against the invoice row to prevent concurrent overpayment.
- Production M-Pesa callbacks require a configured constant-time checked callback token.
- Repaired CSV import parsing and validation, stopped imports from creating users with blank passwords or fabricating submissions, and connected staff imports to `StaffProfile`.
- Fixed Windows path handling in the route inventory helper and several Prisma mismatches and runtime defects uncovered by strict compilation.
- Added the release readiness review in `docs/production-readiness.md`.

## Verification

- Backend TypeScript compilation: passed.
- Frontend TypeScript compilation: passed.
- Frontend production bundle: passed through Vite's programmatic API; the CLI config loader cannot traverse a protected parent directory in this workspace.
- Prisma schema validation: passed.
- Backend non-database tests: 236 passed.
- Database-backed tests, Docker image build, live payment-provider checks, and end-to-end deployment checks: not run in this environment.
- The 800-row feature tracker still has 610 unaudited and 14 partial entries. This batch does not claim the full platform feature inventory is complete.
