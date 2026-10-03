# Event catalog
Wire contract for Lab->portal events: `contracts/vbl-portal-events.json` (identical copy in both repos; validated by tests on both sides).

**Portal -> Lab:** `enrollment.created` (provisions student, adds cohort) · `enrollment.cancelled` (removes cohort membership; history untouched) · `staff.assigned` (provisions trainer) · `student.status_changed` (any non-ACTIVE deactivates the Lab account) · `assessment.approved|rejected|reversed` (confirmation; reversal only mutates an APPROVED confirmation) · `grade.posted` (ledgered).
**Lab -> portal:** `assessment.decided` (outcome, competency, evidence ref, attemptNo, previousExternalAssessmentId) · `simulation.completed` (every competency of the unit COMPETENT) · `activity.logged` (evidence capture).
Every event has a unique `eventId`; idempotent by it. Statuses: PENDING -> SENT/RECEIVED, FAILED (retried), DEAD_LETTER (after 8 attempts; recover with requeue / DR tool).

**Batch 66 additive optional fields (contract revision 2026-09-29, no version bump):**
- `assessment.decided.criteria` — `[{code, met, name?, comment?}]`. The portal stores it on the result, maps it onto the Rubric when an admin has mapped the criteria (VBI027), and shows it to trainer and student. Malformed entries are dropped.
- `activity.logged` — `activityType` (required; the Lab's dotted vocabulary, unknown values are kept), plus optional `activityEntityType`, `activityRef`, `activitySummary` (500 chars kept), `activityData` (object), `occurredAt` (ISO-8601), `registrationNumber`. Stored as `VirtualLabActivity` rows, idempotent on `eventId`. An event for an unknown student fails and is retried (like `assessment.decided`).
- Retry spacing for Portal -> Lab events is per event: 15s doubling to a 1h cap, 8 attempts, then DEAD_LETTER.
