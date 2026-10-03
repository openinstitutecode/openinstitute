# Integration API (v1)
Portal base: `/api/integration/v1`. Every response carries `X-Integration-Api-Version: v1`; send `Accept-Version: v1` to pin (unsupported pin -> 400). Roles: `ICT_ADMIN`/`SUPER_ADMIN` unless stated. Webhook: 120 req/min/IP; SSO issuance 20/min/user.

| Method & path | Who | Purpose |
|---|---|---|
| GET `/health` | admin | counts + last sent/received |
| GET `/dashboard` | admin | health colour (GREEN/AMBER/RED), event counts by direction/status, backlog age, mappings, unposted approvals, recent events |
| POST/GET `/courses` | admin | Unit <-> Lab mapping; enables the unit for the Lab |
| POST/GET `/gradebook-mapping` | admin | component + score % per unit; **backfills** already-approved results |
| POST/GET `/competency-mapping` | admin | Lab competency code -> portal LearningOutcome |
| POST/GET `/credentials`, POST `/credentials/:id/revoke` | admin | rotating webhook credentials (secret shown once) |
| POST `/sso/assertion` | student/trainer | signed 60s assertion for the Lab |
| POST `/webhooks/vbl` | Lab (signed) | inbound events |
| GET `/lab-results?status=` , GET `/me/lab-results` | trainer/admin ; student | review queue ; own results |
| POST `/lab-results/:id/approve` \| `reject` | trainer/admin | review (approve posts the grade if mapped) |
| POST `/lab-results/:id/reverse` | admin | `{reason}` required |
| POST `/outbox/dispatch`, GET `/outbox/dead-letter`, POST `/outbox/:eventId/requeue` | admin | delivery + recovery |
| GET `/events?direction=&status=&eventType=&cursor=&take=` | admin | paged ledger (keyset; `nextCursor` null on the last page) |
| POST `/scheduler/run` ; POST `/outbox/requeue-dead-letter` | admin | run one scheduler tick now ; bulk requeue of every dead letter |
| GET `/activity?studentId=&unitId=&activityType=&take=` ; GET `/me/lab-activity` | trainer (own units)/admin ; student | synchronized Lab activity feed (VBI036) |
| POST/GET `/rubric-mapping`, DELETE `/rubric-mapping/:id` | admin | Lab criterion code -> portal Rubric criterion name (VBI027); POST needs the unit's gradebook mapping and validates the criterion name |
| DELETE `/gradebook-mapping/:unitId`, `/competency-mapping/:id`, `/courses/:unitId` | admin | remove a mapping (posted grades / recorded results are kept; deleting a course mapping also switches `vblEnabled` off) |
| GET `/lookups/units`, GET `/lookups/units/:unitId` | admin | pickers for the console: units; a unit's assessments (with rubric criteria) and learning outcomes |

**Batch 66 behaviour changes:** `GET /lab-results` and approve/reject are limited to units the calling TRAINER teaches (403 otherwise; admins unrestricted). Approve/reject/reverse are atomic: a concurrent second reviewer gets 409. `POST /outbox/:eventId/requeue` and bulk requeue clear the retry backoff. Health adds `schedulerEnabled` and `credentialEncryption`. The API host also exposes `GET /api/ready` (Postgres reachability).
| POST `/students/:id/resync`, POST `/units/:id/resync` | admin | re-send Lab presence; audit-logged |

Lab base: `/integration/v1` — `GET /health`, `POST /sso`, `POST /webhooks/portal`, `GET /dashboard`, `GET /outbox`, `GET /outbox/dead-letter`, `POST /outbox/{event_id}/requeue`, `POST /resync/decisions`, `POST/GET /credentials`, `POST /credentials/{id}/revoke`, `POST /courses`, `GET /lab` (SSO landing page).
Lab admin routes need permission `user.manage` (institution_admin).

**Signing:** headers `x-<src>-timestamp`, `x-<src>-signature` = HMAC-SHA256(secret, `"<timestamp>.<raw body>"`) hex, `x-<src>-key-id`. Deliveries older than 5 min are rejected. Portal->Lab uses `x-portal-*` (direction `PORTAL_TO_VBL`), Lab->portal `x-vbl-*` (`VBL_TO_PORTAL`).
