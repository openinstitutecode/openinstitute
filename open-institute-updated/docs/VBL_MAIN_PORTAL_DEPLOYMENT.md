# Deployment
**Both systems stay separate.** Deploy order: 1) apply portal schema (`npx prisma validate && npx prisma migrate dev` — **never run in the build sandbox, do this first**), 2) deploy Lab, 3) deploy portal, 4) configure, 5) run the scheduler.

Portal env: `VBL_INTEGRATION_URL` (Lab base, e.g. https://lab.example/), `VBL_PUBLIC_URL`, `PORTAL_SSO_SECRET`, `PORTAL_WEBHOOK_SECRET` (signs portal->Lab; bootstrap fallback), `VBL_WEBHOOK_SECRET` (verifies Lab->portal; bootstrap fallback).
Lab env: `VBL_SECRET`, `VBL_DB`, `PORTAL_SSO_SECRET` (same value), `PORTAL_WEBHOOK_SECRET` (same value), `VBL_WEBHOOK_SECRET` (same value), `VBL_DEFAULT_INSTITUTION_CODE`, `PORTAL_WEBHOOK_URL` (worker target = `<portal>/api/integration/v1/webhooks/vbl`).
Prefer issuing DB credentials (`POST /credentials`) over long-lived env secrets, then unset the env fallbacks.

Schedulers (nothing runs delivery by itself): portal — call `POST /outbox/dispatch` (or `dispatchPendingEvents()`) every ~15 s; Lab — `python3 tools/sync_worker.py --interval 15`. Run **one** of each.
First-time setup: create the Lab institution -> map each Lab-enabled unit (`POST /courses` on both sides) -> map gradebook + competencies -> issue credentials -> run `POST /units/:id/resync` for units with existing enrolments.

**Batch 66 additions**
- Rate limiter, outbox claiming and the scheduler all use Postgres, so several portal instances are safe. Behind nginx/a load balancer set `TRUST_PROXY=<hops>` or every caller shares one rate-limit bucket.
- Scheduler: on by default when `VBL_INTEGRATION_URL` is set (`INTEGRATION_SCHEDULER_ENABLED=false` to disable, `INTEGRATION_SCHEDULER_INTERVAL_SECONDS`, default 30). One instance runs each tick (advisory lock); `POST /scheduler/run` runs a tick on demand. You no longer need to call `/outbox/dispatch` yourself. Failed events back off 15s, 30s, 1m ... 1h per event.
- Set `INTEGRATION_SECRET_ENCRYPTION_KEY` (`openssl rand -hex 32`; required in production), then run `npx tsx scripts/encrypt-integration-secrets.ts --dry-run` and once without `--dry-run` to encrypt credentials issued before batch 66. Back the key up separately from the database.
- Production refuses to start with a missing/placeholder `JWT_SECRET`.
- Health checks: `/api/health` = process up; `/api/ready` = Postgres reachable (use for load balancers).
- Apply the schema with `npx prisma db push` (this repo has no `prisma/migrations`; adding one folder would make the entrypoint switch to `migrate deploy` and skip the new tables).
