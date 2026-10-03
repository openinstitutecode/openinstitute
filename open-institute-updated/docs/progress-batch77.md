# Batch 77 — LMS features (ASG, GRD, CNT, COM, PRG)

101 features done, 9 partial. Per-feature status and notes: `docs/MEASUR_LMS_Moodle_Feature_Status.csv` (rows marked "Batch 77").

Backend: `lib/assignment-engine.ts`, `lib/gradebook-engine.ts` (pure, 10 tests in `tests/batch77-libs.test.ts`), `lib/lesson-publisher.ts`,
`routes/assignments-v2.ts` (/api/assignments), `routes/lms-extras.ts` (/api/lms); legacy `POST /content/assignments/submit` now uses the same hand-in path
(deadline, late rules, groups, versioning); learners no longer see draft/unreleased assignments. Job `assignment-reminders` added to reminder-jobs.
Schema (additive, `prisma db push`): Assignment/Submission/Lesson columns; AssignmentGroup(+Member), AssignmentExtension, SubmissionVersion, LessonBookmark, LessonNote,
LessonView, MaterialDownload, LessonAttachment, LessonTemplate, LessonReviewComment, GradeWeight, ForumSubscription, SupportIntervention.
Frontend: student Assignment Centre (rewritten), My Learning Tools; trainer Assignments v2 (setup + marking), LMS Tools (gradebook, weights, analysis, engagement, content stats, interventions, notices, import/export).

Not verified here: the full backend/frontend `tsc` build and the Prisma client generation (no network in the build sandbox) — run `npx prisma generate && npm run build` in both folders first.
Lesson-page UI is in: student bookmark/notes/materials (`components/lesson/StudentLessonTools.tsx`), trainer materials/schedule/notify/template/reviews panel in the lesson builder (`components/lesson/TrainerLessonExtras.tsx`), and feedback-file upload in the assignment marking panel. Reviews are only in the trainer builder so far (QA officers have the API but no screen of their own).
