# Batch 76 — LMS quiz engine v2 (feature codes LMS-QZ-001 … 080)

Source list: `docs/MEASUR_LMS_Moodle_Feature_Codes.csv` (800 codes, 19 modules).
Per-feature status: `docs/MEASUR_LMS_Moodle_Feature_Status.csv` (QZ rows filled in; every other module is "Not audited").

## Result for the QZ module (80 features)
- 47 done in this batch, 24 already existed, 9 partial (listed below). None skipped silently.

## What was built
Backend
- `lib/quiz-engine.ts` — pure engine: 12 question types, scoring (partial credit, negative marking, tolerance), grading methods, availability, visibility, random draws, pagination, CSV import/export, item statistics. 25 tests in `tests/quiz-engine.test.ts`; includes a legacy-parity test proving older mcq/short/essay quizzes score exactly as before.
- `lib/quiz-delivery.ts` — per-student question resolution incl. seeded random draws.
- `routes/exams.ts` — availability (+explanations), take (window, group, extension, cooldown, resume draft), submit (engine v2, visibility rules), lapsed attempts mark autosaved answers.
- `routes/quizzes.ts` — new settings, all question types, version snapshot on edit, publish-time validation, analytics v2.
- `routes/quizzes-v2.ts` (new) — marking queue, manual marks, regrade, answer-key correction, results release, attempts, extensions, error reports, bank import/export/duplicate/archive/versions/try.
- `routes/quiz-attempts.ts` (new) — student autosave, attempt history, review, error report.
- `routes/me.ts` — `/me/results` now honours a quiz's result-visibility setting.
- Schema (additive, applied by `prisma db push`): new columns on `Question`, `Assessment`, `QuestionResponse`; new models `QuestionVersion`, `QuestionReport`, `QuizAttemptDraft`, `QuizExtension`.

Frontend
- `components/quiz/*` — question editor (all types), student answer inputs, trainer panels (marking, attempts, release, regrade, extensions, reports, bank import/export).
- `TrainerQuizBuilder.tsx`, `StudentExams.tsx` — wired to all of the above.

## NOT verified in this environment
No `node_modules` / Prisma client / database here, so the routes and React pages were syntax-checked only and have not been run, type-checked or built. Run `npm ci && npx prisma generate && npm run build` in both apps, then `npm test`, before deploying. The engine's 25 tests did run and pass. Five older test files fail here with and without these changes (missing packages).

## Known gaps (partial features)
- QZ-016/017/018 media: link-based; no upload button in the question editor.
- QZ-044 try-a-question: API only.
- QZ-051/052/053: grading method applies in the Assessment Centre, attempts panel and review. Grades & Transcript, registry standing and analytics still read raw per-attempt scores.
- QZ-067 manual re-mark of an already-graded answer: API only (the queue UI shows ungraded answers).
- QZ-072: per-question comments only; no overall comment per attempt.
- Not counted as partial, but worth knowing: the audited answer-key correction (used by QZ-068) has no UI button yet; the Regrade panel does.

## Moodle
Nothing in this batch touches the Moodle integration. These features apply to CUSTOM-engine courses; how quiz-builder behaves for MOODLE-engine courses was not changed or re-checked.
