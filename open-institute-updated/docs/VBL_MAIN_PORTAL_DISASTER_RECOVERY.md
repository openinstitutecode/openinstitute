# Disaster recovery runbook (VBI050)
Nothing is lost during an outage: portal events sit in `IntegrationEvent`, Lab events in `integration_events`, both written with the business change. After 8 failed attempts an event becomes `DEAD_LETTER` and stops retrying.
1. **Find the cause first** (dashboard `lastFailure`). Requeueing before it's fixed just dead-letters again.
2. Fix it (portal/Lab restored, credential re-issued, mapping created).
3. Lab: `VBL_DB=... python3 tools/dr_replay_failed_events.py --actor-user-id <admin> --dry-run` then without `--dry-run`. Portal: `npx tsx scripts/dr-replay-failed-events.ts --dry-run` then without.
4. Run the delivery loops; watch dashboard go GREEN.
5. Decisions made before a mapping existed: `POST /integration/v1/resync/decisions` (Lab). Students/units missing from the Lab: `POST /students/:id/resync` / `/units/:id/resync` (portal). Approved-but-unposted grades: re-save the gradebook mapping (backfills) or resync the unit.
All replays are safe to repeat (idempotent by eventId / per-decision event id). Back up both databases: the ledgers are the recovery source.
