# Batch 66 progress notes

Brief: finish the partial features, replace every fake/in-memory store with Postgres code, finish the
backend. The sandbox had **no internet, no Postgres, no `node_modules`** — so everything below was
written and syntax/type-shim checked, and only the pure-logic tests actually ran (**34 passed**).
Everything that touches Postgres is **written but never executed**; the checklist at the end is what
you need to run.

Also fixed on arrival: `routes/integration-vbl.ts` had a stray `});` (syntax error — the backend
would not have compiled). The zip was named `batch65` but its folder was `kvbdtc-batch64`; this one is `kvbdtc-batch66`.

## 1. In-memory state → Postgres

| Was | Now |
|---|---|
| Rate limiter: per-process `Map` (lost on restart, per-instance) | `IntegrationRateLimitBucket` table; one atomic `INSERT … ON CONFLICT DO UPDATE` advances the window (`integration/rate-limit.ts`). Fails **open** (logged) if Postgres is unreachable. |
| Outbox: read-then-send, retry spacing decided by how often something polled | `IntegrationEvent.nextAttemptAt`; `claimDueEvents()` = one `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)` that also leases the rows for 120 s. Per-event backoff 15 s → 1 h cap, 8 attempts then DEAD_LETTER. |
| Nothing ran delivery | `integration/scheduler.ts`: timer → dispatch + gradebook sweep + bucket cleanup, guarded by `pg_try_advisory_xact_lock` so one instance runs each tick. |
| Tests + E2E used hand-written in-memory Prisma fakes | Removed. `tests/db/*` (78 tests) and `e2e/portal-e2e-server.ts` run against real Postgres. `tests/helpers/db.ts` is the harness. (The only remaining "fake" is a fake req/res for a middleware test.) |

Left as-is on purpose: the Moodle role-id cache and the SCORM/media caches are performance caches
of re-derivable data, not state; the vector search (`lib/vector-search.ts`) reads chunks from Postgres
and scans them in JS — moving it to pgvector needs a Postgres extension I could not test, so it stays.

## 2. Partial features finished

- **VBI027 Rubric mapping** — `IntegrationRubricCriterionMapping`, admin CRUD, `rubric-mapping.ts`. Rules: met → full marks, not met → 0; a portal criterion fed by several Lab criteria is met only if all are; **any** unmapped criterion or missing verdict withholds the whole `criteriaScores` (never guesses). `Submission.score` stays outcome-driven.
- **VBI036 Activity sync** — `VirtualLabActivity` table; all activity types stored (unknown kept), idempotent on `eventId`, unknown student → FAILED and retried. Endpoints: `GET /activity` (trainer: own units), `GET /me/lab-activity`.
- **VBI038 Dashboard** — admin console `/admin/virtual-lab` (Health, Events with keyset pagination, Credentials with one-time reveal + rotation, Mappings for course/gradebook/competency/rubric, Activity), plus the paged `GET /events`.
- **Trainer scoping** — a TRAINER can list/approve/reject only results for units they teach (`Course.trainerId`); admins unrestricted. (Was: any trainer, any result.)
- **Atomic review** — approve/reject/reverse are one conditional `UPDATE … WHERE status = <expected>` in a transaction with the audit row; the loser of a race gets 409. Gradebook posting + `postedAt` commit together.
- **Credential encryption** — `secret-box.ts` AES-256-GCM, key in `INTEGRATION_SECRET_ENCRYPTION_KEY`; legacy plaintext rows still work until `scripts/encrypt-integration-secrets.ts` is run.
- **Mapping CRUD gaps** — DELETE for gradebook/competency/course mappings, bulk dead-letter requeue, unit lookups.
- **KUCCPS** — `Programme.kuccpsCode` + `GET/PATCH /kuccps/programme-codes`; the intake export uses it and reports rows still on the slug fallback in the `X-Kuccps-Rows-Missing-Programme-Code` header. (Closes the TODO.)

## 3. Backend hardening

`/api/ready` (Postgres ping), graceful SIGTERM/SIGINT shutdown, `TRUST_PROXY`, and `lib/jwt-secret.ts`
(production refuses a missing/placeholder `JWT_SECRET`; also used by `signed-url.ts` and `scorm-storage.ts`,
which each had their own published development fallback).

## 4. NOT done / depends on something else

- **Lab repo change needed** for VBI027 and VBI036 to show data: the Lab must send `criteria` on `assessment.decided` and richer `activity.logged` (fields are in `contracts/vbl-portal-events.json`, all optional, no version bump). The Lab repo was not in this zip. Until then the portal behaves as before for those two.
- Rows still 🟡 in `feature-audit-400.md` (SP034, FN006, FN007 need production Daraja/Stripe credentials; AI007/AI011 are lexical rather than dense retrieval; AI037 is a heuristic; EX013–015 are intentional scope boundaries) — unchanged; they cannot be finished from code alone.
- Frontends are syntax-checked with esbuild only, never compiled or rendered.
- No SSRF guard on `VBL_INTEGRATION_URL` (admin-set env), SSO is still shared-secret HMAC.

## 5. WHAT YOU NEED TO TEST (in this order)

**A. Schema** — `cd backend && npm install && npx prisma validate && npx prisma generate`, then `npx prisma db push` on a scratch DB. New: `IntegrationRateLimitBucket`, `VirtualLabActivity`, `IntegrationRubricCriterionMapping`; new columns `IntegrationEvent.nextAttemptAt`, `VirtualLabAssessmentResult.criteria`, `Programme.kuccpsCode`; back-relations on `Student`, `Unit`, `IntegrationGradebookMapping`. Do **not** add a `prisma/migrations` folder (the entrypoint would switch to `migrate deploy` and skip these).

**B. Compile** — `npx tsc --noEmit` and `cd ../frontend && npm run build`. I could only type-check with shims; expect to fix small things, most likely in `routes/integration-vbl.ts` and `pages/admin/AdminVirtualLab.tsx`.

**C. Pure tests** — `npm test` (should be green; 34 of these ran here).

**D. Postgres tests** — `createdb kvbdtc_test && DATABASE_URL=…/kvbdtc_test npx prisma db push && TEST_DATABASE_URL=…/kvbdtc_test npm run test:db` (78 tests; the DB name must contain "test", it TRUNCATEs). Highest-risk items, in order:
1. **Raw SQL**: `rate-limit.ts` (interval arithmetic with `::double precision`, `GREATEST/CEIL/EXTRACT`), `events.ts claimDueEvents` (enum-typed columns compared to string literals — if Postgres complains `operator does not exist: "IntegrationEventStatus" = text`, cast the literals: `'PENDING'::"IntegrationEventStatus"`; same for `direction`), `scheduler.ts` (`${bigint}::bigint` parameter binding of `5_784_284_001n`).
2. **Concurrency**: `dispatch.test.ts` (disjoint claims, no double delivery), `lab-results.test.ts` (two reviewers → one 200 + one 409), `rate-limit.test.ts` (50 concurrent hits, max 10 → exactly 10 admitted), `scheduler.test.ts` (advisory lock).
3. **Gradebook transaction + criteriaScores** (`gradebook.test.ts`).
4. **Fixtures** in `tests/helpers/db.ts` assume required columns as of this schema; if `prisma db push` reports a required field I missed, that is where to add it.

**E. E2E** — `E2E_DATABASE_URL=…/kvbdtc_e2e VBL_REPO=<lab repo> python3 e2e/run_e2e.py` (3 scenarios; note the changed expectations: retries wait out a backoff, so the test calls `/admin/backdate` to fast-forward; activity is asserted as a table row, not an audit line).

**F. By hand** — set `VBL_INTEGRATION_URL`, start the API, watch for "Integration scheduler started"; `POST /api/integration/v1/scheduler/run`; open `/admin/virtual-lab` and step through each tab; issue a credential (secret shown once), revoke it; set `INTEGRATION_SECRET_ENCRYPTION_KEY`, issue another, confirm the DB column starts `enc:v1:`, run `scripts/encrypt-integration-secrets.ts --dry-run` then for real; log in as a trainer who does **not** teach a unit and confirm `/trainer/virtual-lab` hides its results and approve returns 403; hit `/api/ready` with Postgres stopped (expect 503); start with `NODE_ENV=production` and no `JWT_SECRET` (expect a refusal to boot); `PATCH /kuccps/programme-codes/:id` then export intake and check the header.

**G. Multi-instance** — run two API instances against one DB with `TRUST_PROXY` set behind nginx; confirm the log shows ticks from only one at a time and a burst of >120 webhook calls/minute is limited across both.
