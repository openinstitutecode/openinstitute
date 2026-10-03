# Measur Business College Portal <-> Virtual Business Lab — Integration Architecture

Two independently deployable systems, one academic ecosystem. **Neither codebase was merged into the other.**

```
 STUDENT/TRAINER ── logs in once ──> MEASUR BUSINESS COLLEGE PORTAL (system of record: identity, enrolment, official grades)
                                        │  POST /api/integration/v1/sso/assertion  (short-lived signed assertion)
                                        ▼
                       ┌────────── Integration layer ──────────┐
   portal -> Lab:      │ IntegrationEvent ledger (idempotent)   │   Lab -> portal:
   enrollment.*        │ HMAC-signed, keyed, rotating creds     │   assessment.decided
   staff.assigned      │ retry + backoff + dead-letter          │   simulation.completed
   student.status_*    │ resync + DR tooling + dashboards       │   activity.logged
   assessment.*        └───────────────────────────────────────┘
                                        ▼
                     VIRTUAL BUSINESS LAB (system of record: companies, simulations, evidence, competency decisions)
```

## Ownership (never violated)
| Portal owns | Lab owns |
|---|---|
| student & staff identity, registration number, units, enrolment, official grades, transcripts | virtual companies, simulations, evidence (hash-chained), assessor decisions, competency status |

The Lab **cannot** write an official grade. A Lab decision arrives as `VirtualLabAssessmentResult` (`PENDING_APPROVAL`); only a portal trainer/admin approval posts a `Submission` to the gradebook.

## Key design decisions
1. **VBL is competency-based** (`COMPETENT` / `NOT_YET_COMPETENT`), has no percentage. "Grade sync" therefore = outcome sync + a configurable outcome->% mapping per unit (`IntegrationGradebookMapping`).
2. **Decisions are immutable in the Lab** (DB triggers). An "amendment" is a *new attempt* linked by `previousExternalAssessmentId` -> `supersedesResultId`; a portal-side correction is an explicit *reversal* (reason required, original approval preserved, posted grade zeroed and annotated, never deleted).
3. **Enrolment is keyed on Unit** in the portal, so a portal Unit maps to a Lab programme/unit/cohort (`IntegrationCourseMapping`).
4. **Failure isolation:** portal writes the ledger row synchronously and delivers asynchronously; a down Lab never blocks registration. The Lab writes the outbox row in the same DB transaction as the decision.
5. **A FAILED event is reprocessed on redelivery; only a RECEIVED one is a duplicate.** (A real bug found and fixed in both systems — see COMPLETION_REPORT.)
6. **Evidence is referenced, not copied** (id, version, source, content hash).
7. **Signatures cover the exact raw bytes** (`express.raw` on the webhook path).

## Where things live
Portal: `src/integration/` (signing, credentials, events, vbl-events, lab-results, gradebook, resync, dashboard, rate-limit, versioning), `src/routes/integration-vbl.ts`, models at the end of `prisma/schema.prisma`, `e2e/`, `scripts/`.
Lab: `vbl/services/integration.py`, hooks in `assessment.py` (`emit_decision_events`, `resync_unsent_decisions`) and `competency.py`, `tools/sync_worker.py`, `tools/dr_replay_failed_events.py`, `vbl/api_version.py`, `vbl/static/lab.html` (SSO landing page — the Lab has no other frontend).
