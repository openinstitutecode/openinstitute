-- Earlier Moodle webhook code marked an event processed before handling it,
-- preventing retries after failures. Preserve those legacy deduplication
-- markers under the new processed action.
UPDATE "AuditLog"
SET "action" = 'MOODLE_WEBHOOK_PROCESSED'
WHERE "action" = 'MOODLE_WEBHOOK';

-- The old enrolment lookup returned the Moodle user id, not an enrolment id.
-- Clear values written by that buggy code; new synchronization leaves this
-- deprecated column null.
UPDATE "Enrollment"
SET "moodleEnrolmentId" = NULL
WHERE "moodleEnrolmentId" IS NOT NULL;
