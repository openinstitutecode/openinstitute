# Moodle Integration — Implementation and Verification Status

Last updated: 2026-10-03

This file contains archived implementation notes from earlier batches.
Use this section for the current state; the batch notes below are historical
and may describe checks or gaps that have since changed.

## Current state

- Moodle REST calls, user/course mapping, course creation/update, student enrolment and unenrolment, SSO launch URLs, live-class listing, course admin controls, and an authenticated inbound webhook endpoint are implemented in `backend/src/moodle/` and the related course routes.
- Moodle SSO fails closed unless `MOODLE_SSO_WS_TOKEN` is present; it no longer falls back to the general Web Services token.
- Failed webhook deliveries are recorded separately from successful processing so a retry is not discarded as a duplicate. Only successful event processing is used as the deduplication marker.
- Moodle enrollment IDs are not currently available from the Moodle API call used here. The app no longer stores the Moodle user ID in the `moodleEnrolmentId` field; the corrective migration clears values written by the earlier incorrect lookup.
- Backend build and 238 unit tests pass; the Moodle REST parameter encoding and SSO-token guard have targeted tests. Backend dependency audit reports no vulnerabilities.
- None of the above verifies credentials, plugins, configured webhook payloads, or end-to-end behavior against the institution's live Moodle instance. Moodle features that have no implementation here remain incomplete; the full feature-code tracker must not be treated as complete.

## Archived implementation notes

**Schema** (additive, nothing existing changed):
- `Course.lmsEngine` (`LmsEngine` enum, default `CUSTOM`), `moodleCourseId`, `moodleSyncedAt`
- `User.moodleUserId`
- `Enrollment.moodleEnrolmentId`
- Migration **not yet run** — `npx prisma migrate dev --name add_moodle_integration_fields` still needs to happen against a real Postgres instance.

**`backend/src/moodle/` module** — all new files, syntax-checked, not yet build- or integration-tested:
- `client.ts` — Web Services REST client. Token override support added (for the separately-scoped SSO token, least privilege).
- `types.ts`, `roleMap.ts` — as before.
- `userSync.ts`, `courseSync.ts`, `enrolment.ts` — as before. The `enrolment.ts` enrolment-id lookup gap from the previous pass is unchanged — still needs checking against a real instance.
- `sso.ts` — **rebuilt from scratch this pass.** The original OAuth2/OIDC plan didn't actually fit: your auth is a stateless JWT with no browser session, which an OIDC redirect flow needs. Switched to **auth_userkey** (Catalyst IT, a real documented Moodle plugin built for exactly this). Requires installing it in Moodle — it is NOT core, correcting what the first architecture pass said.
- `liveClasses.ts` — lists BigBlueButton activities via `core_course_get_contents` (a real, stable core function) rather than guessing at a bigbluebuttonbn-specific listing function that isn't consistently documented across versions.
- `webhooks.ts` — event intake. Requires **tool_trigger** (Catalyst IT) in Moodle to actually send events — Moodle core has no outbound webhook system. The payload shape assumed is a reasonable default; confirm against your actual tool_trigger rule configuration.

**Wired into existing routes (this is new — nothing was wired in before this pass):**
- `GET /api/courses/:id` — now branches on `lmsEngine`. `CUSTOM` courses get byte-for-byte the same response as before. `MOODLE` courses get a `moodle: { liveClasses }` block appended, with a fallback so a Moodle outage degrades the course page rather than 500ing it.
- `POST /api/courses/:id/moodle-launch` (new endpoint) — mints an SSO launch URL for the requesting user via `sso.ts`.
- `POST /api/moodle/webhooks/events` (new, registered in `index.ts`) — receives Moodle events. Authenticated by a shared-secret header (Moodle has no JWT to send), not by `requireAuth`.

**Infra:**
- `docker-compose.yml` — `moodle` + `moodledb` services, self-hosted per your confirmation, own volumes, no shared DB with the app's Postgres.
- `backend/.env.example` — `MOODLE_BASE_URL`, `MOODLE_WS_TOKEN`, `MOODLE_SSO_WS_TOKEN` (separate, narrowly-scoped token for auth_userkey), `MOODLE_WEBHOOK_SECRET`, `BBB_SERVER_URL`, `BBB_SHARED_SECRET`.

**Plugins now confirmed as required in Moodle admin (none of this is automatic from the compose file going up):**
- `auth_userkey` — SSO
- `mod_bigbluebuttonbn` — live classes (needs your self-hosted BBB server's URL + shared secret)
- `tool_trigger` — outbound event webhooks

## Explicitly NOT done — do not treat this as finished

- **Migration never run.** The schema file has the right changes in it; the database does not have them yet.
- **Never built.** `npm run build` hasn't executed against these files anywhere.
- **Never run against a live Moodle.** Every API call in every `moodle/*.ts` file is written against Moodle's documented contracts but has zero live confirmation.
- **BigBlueButton server not configured** — `BBB_SERVER_URL`/`BBB_SHARED_SECRET` are placeholders; you need a running self-hosted BBB instance and to configure `mod_bigbluebuttonbn` in Moodle to point at it.
- **No frontend changes.** The API now returns a `moodle` block and a launch endpoint exists, but nothing in `frontend/src` calls either yet. A student clicking "My Courses" today sees no visible change.
- **AI tutor not extended.** `ai.ts` doesn't yet know about `MOODLE`-mode courses or retrieve their content.
- **No tests.** None of the 15 test cases from the original brief exist yet.
- **The enrolment-id lookup gap** from the previous pass is unresolved.
- **The `wantsurl` course-targeting in `sso.ts`** relies on general Moodle login redirect behaviour that isn't part of auth_userkey's own documented contract — needs live confirmation it actually lands on the right course page.

## Realistic next steps, in order

1. Get Moodle actually running from `docker-compose.yml` and reachable
2. Run the Prisma migration against a real Postgres
3. Install `auth_userkey`, `mod_bigbluebuttonbn`, `tool_trigger` in Moodle; generate the tokens/secrets the `.env.example` now lists
4. `npm run build` on the backend and fix whatever the real Prisma/Express types surface that couldn't be caught by syntax checking alone
5. Manually test `POST /:id/moodle-launch` against the live instance and confirm the redirect actually lands on the course
6. Frontend: surface the `moodle.liveClasses` block and the launch button for `MOODLE`-mode courses
7. AI retrieval branch, webhook payload confirmation, then tests

---

## Batch 47 — admin course management, frontend wiring, deployment automation

Addresses the six concrete blockers identified at the end of Batch 46
("wired" meant code paths existed, not that anything was runnable) and
steps 3 and 6 above.

**Backend — admin course management (`backend/src/routes/courses.ts`), new:**
- `GET /api/courses` — full course listing for the admin dashboard.
- `GET /api/courses/admin/form-options` — units/trainers for the create form, plus `moodleConfigured`.
- `POST /api/courses`, `PATCH /api/courses/:id` — create/edit a course, including setting `lmsEngine`. Setting/keeping `lmsEngine=MOODLE` triggers `ensureMoodleCourse` + `updateMoodleCourse` automatically; a Moodle-side failure sets `moodleStatus: "pending"` on the response instead of failing the save.
- `POST /api/courses/:id/moodle-sync` — manual retry for a course stuck `pending`.
- Switching a course into MOODLE mode now also bulk-enrols every student with an active enrollment in that unit (best-effort per student, via the existing `enrolStudent`) — previously a switch would silently strand already-enrolled students.
- This closes the gap called out in Batch 46 verbatim: *"No course is actually in MOODLE mode. There's no admin UI for this yet — someone would need to hand-set a Course row's `lmsEngine` to MOODLE directly in the database."* There's now an admin UI.

**Frontend, new:**
- `frontend/src/pages/admin/AdminCourses.tsx` (`/admin/courses`) — create/edit courses, toggle CUSTOM/MOODLE, see per-course Moodle sync status, retry a stuck sync.
- `StudentCourses.tsx` now branches on `lmsEngine`: a MOODLE course shows a "Launch course in Moodle ↗" button (calls the `POST /:id/moodle-launch` endpoint that existed since Batch 46 but nothing ever called) and lists live classes if any. This closes: *"No frontend changes... nothing in `frontend/src` calls either yet."*

**Deployment automation, new (`moodle/`, `scripts/`):**
- `moodle/Dockerfile` — extends `bitnami/moodle:latest`, downloads `auth_userkey`, `mod_bigbluebuttonbn`, `tool_trigger` from their real GitHub repos into the right plugin-type folders at build time. On a fresh `docker compose up`, Moodle's own installer picks these up with no manual admin-UI plugin install. `docker-compose.yml`'s `moodle` service now builds this instead of pulling the bare image.
- `moodle/finish-plugin-install.sh` — one idempotent command (`docker compose exec moodle bash /finish-plugin-install.sh`) that finishes plugin installation for an *already-installed* Moodle volume (the one case the automatic installer won't handle by itself).
- `moodle/provision-moodle.php` — replaces the ~15-click, 4-screen manual token setup in Site administration > Server > Web services with one command (`docker compose exec moodle php /provision-moodle.php`): enables web services + REST, creates the `kvbdtc_integration` service with exactly the wsfunctions this codebase calls, creates a dedicated service account, and prints `MOODLE_WS_TOKEN` / `MOODLE_SSO_WS_TOKEN` ready to paste into `.env`. Idempotent.
- `scripts/setup-env.sh` — generates `backend/.env` *and* repo-root `.env` (docker-compose's `${VAR}` substitution reads the latter, not `backend/.env` — a real trap this avoids) with actual random `JWT_SECRET`/`MOODLE_WEBHOOK_SECRET` instead of the placeholder strings.
- `docker-compose.yml` — the backend service previously hardcoded `MOODLE_WS_TOKEN` and never passed through `MOODLE_SSO_WS_TOKEN`, `MOODLE_WEBHOOK_SECRET`, `MOODLE_DEFAULT_CATEGORY_ID`, `BBB_SERVER_URL`, `BBB_SHARED_SECRET` at all — all now wired via `${VAR}` substitution from the root `.env`.

**Explicitly NOT done in this pass — same honesty standard as Batch 46:**
- **None of this has run.** No Docker daemon / network access in this environment — the Dockerfile's plugin download, `provision-moodle.php`'s calls into Moodle's `webservice` class, and the course-management routes' interaction with a real Prisma client are all unverified beyond syntax checking (TypeScript: `ts.transpileModule`, no diagnostics; PHP: manual review only, no `php -l` available here; YAML: `yaml.safe_load`, valid).
- **Plugin repo refs are best-effort.** `moodle/Dockerfile` pins each plugin to its default branch (`master`/`main`), not a release tag matched to your Moodle version — check https://moodle.org/plugins before a production build.
- **`auth_userkey`'s exact wsfunction name is unconfirmed against a live install.** `provision-moodle.php` uses `auth_userkey_request_login_url` to match what `sso.ts` already calls, flagged inline as the thing to check first if that step fails.
- **`mod_bigbluebuttonbn` config and `tool_trigger`'s webhook rule are still manual** — both are Moodle-admin-UI configuration (a BBB server URL/secret, a trigger rule), not something a CLI script can invent on your behalf. `finish-plugin-install.sh` prints exactly where to do each.
- **AI tutor extension, webhook payload confirmation, tests** — unchanged from Batch 46, still pending.

**Next steps, in order, to get this actually running:**
1. `bash scripts/setup-env.sh`
2. `docker compose up -d db moodledb moodle` — build the custom Moodle image and let it install
3. `docker compose exec moodle bash /finish-plugin-install.sh`
4. Configure `mod_bigbluebuttonbn` and the `tool_trigger` rule per that script's printed instructions (manual, admin UI)
5. `docker compose exec moodle php /provision-moodle.php` — copy the printed tokens into both `.env` and `backend/.env`
6. Enable "User key" under Authentication methods in Moodle, mapping field = username
7. `docker compose up -d --build backend frontend`
8. In the admin dashboard (`/admin/courses`), create a course with delivery engine = MOODLE, confirm it shows a real `Moodle #<id>` badge, then check the enrolled student sees the launch button on `/student/courses`
