# Batch 67 — quick-wins pass

Scope (per brief): easy codes from the enterprise master prompt, minimal tests/docs. Full status per code: `docs/checklist-batch67.md`.

**Verification honesty:** no npm/Postgres/node_modules in the sandbox. `tests/batch67-libs.test.ts` (17 tests, pure logic) passes; all edited/new TS/TSX files were syntax-checked with the TypeScript transpiler only. Nothing was type-checked against Prisma/Express types, compiled by Vite, or run against a database.

## Needs `prisma db push` (new model + indexes)
`PasswordResetToken`; indexes on `FailedLoginAttempt(email,attemptedAt)` and `(ipAddress,attemptedAt)`; `User.passwordResetTokens` back-relation.

## Behaviour changes to know about
- **Production boot now fails** if `JWT_SECRET` < 32 chars/placeholder, `FRONTEND_ORIGIN` unset or `*`, or a numeric tuning var is malformed.
- **Login lockout:** 5 failures / 15 min per account (30 per IP) → HTTP 429 + `Retry-After`. Tunable via `LOGIN_*` env.
- **Password policy** (10+ chars, 3 character classes) applies to admin-created users, reset and change. Existing passwords are untouched.
- **Credential signing key:** in production without `CREDENTIAL_SIGNING_SECRET` it is now derived from `JWT_SECRET`, so documents signed earlier with the old public default key will fail verification — set `CREDENTIAL_SIGNING_SECRET` to the old value only if you had set one, otherwise re-issue.
- **AI:** per-user daily quota (students 100, others 300, `AI_DAILY_LIMIT_*`, 0 = off), concurrency 8 / queue 50, 60 s timeout. New failure reasons `quota_exceeded`, `overloaded` (existing routes show `result.message`).
- **Error bodies** now carry `code` and `requestId`; unknown `/api/*` returns JSON 404.
- **Frontend:** all pages except Home/Login/NotFound are `React.lazy`. `tsc -b` may flag small typing issues in the new files.
- nginx now sends a CSP (`script-src 'self'`). If the SPA or an embed breaks, check the browser console for CSP violations first.

## First things to run
1. `cd backend && npm install && npx prisma generate && npx tsc --noEmit && npm test`
2. `npx prisma db push`; `cd ../frontend && npm run build`
3. Start API, open **Admin → Operations & Data Governance**; try forgot-password (needs SMTP, else the link is only generated, not sent); `scripts/smoke.sh http://localhost:8080`.

## Not done on purpose
`lib/ssrf-guard.ts` is built but not wired into the VBL dispatcher: VBL usually lives on a private Docker host, so enabling it needs `OUTBOUND_ALLOW_HOSTS=vbl` first. `lib/resilience.ts`, `lib/ttl-cache.ts`, `lib/pagination.ts` are ready but unused by existing routes.
