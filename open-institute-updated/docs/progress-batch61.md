# Batch 61 progress notes — closing real gaps, and a large audit correction

Scope: asked to pick ~10-15 items marked partial (🟡) or not-built (⬜) in
`docs/feature-audit-400.md` and fully wire them end to end. Before writing
any code, each candidate was checked against the actual repo — route file,
frontend page, and registration in `index.ts`/`App.tsx` — rather than
trusted from the audit table alone.

## The headline finding: the audit table was very stale

Most of the candidates picked from the 🟡 list turned out to already be
fully built and wired. Not "close, needs a UI" — actually done, backend
and frontend, registered and reachable. It looks like a substantial amount
of work across batches 53–59 (learning paths, SCORM/xAPI, offline sync,
PWA manifest, live classes, content library, completion/prerequisite
enforcement, accessibility settings, course certificates, lesson-level
content approval, the quiz/exam take pipeline) was never reflected back
into this master table, which is supposed to be re-checked after every
batch (its own instruction, line 8). That clearly lapsed for a stretch.

**25 rows were corrected as pure documentation fixes** — verified done,
nothing built this batch: LMS001, LMS003, LMS007, LMS012, LMS013, LMS017,
LMS018, LMS019, LMS020, LMS021, LMS022, LMS023, LMS024, LMS025, LMS026,
LMS027, LMS028, LMS029, LMS036, LMS037, LMS039, AI006, AI015 (=SP024),
AI017 (=SP028), AI029 (=TP036), AI030 (=TP035), EX040 (=RG029). Each row
now says exactly what was checked (which file, which route, which
registration) so a future batch doesn't have to redo this investigation
from scratch, and doesn't quietly re-break by trusting a stale note either
way.

This is not padding: reimplementing any of these blind — which "10 to 15
partially built features" would ordinarily have invited — would have
produced duplicate or conflicting code sitting next to already-working
features. Checking first was the actual work.

## What was genuinely built this batch

### LMS015 — Course announcements
`courses.ts`'s `CourseAnnouncement` model and `POST`/`GET
/:courseId/announcements` routes existed but were called by *nothing* —
not the trainer side, not the student side. Added `CourseAnnouncementForm`
(post + list, collapsible) to `TrainerCourses.tsx` and
`CourseAnnouncementsWidget` (read-only feed) to `StudentCourses.tsx`. This
is distinct from TP029's `/trainer-self/announcements`, which pushes a
one-off `Notification`; this is a persistent, re-readable feed per course.

### FN034 — Revenue analytics trend
New `GET /procurement/revenue-trend?months=N`, bucketing real
`Payment`/`Expense` rows by calendar month using `lib/analytics-buckets.ts`
— the same unit-tested logic AD037's institutional analytics already
relies on. Adds revenue, expenses, *and* net position per month; AD037's
own trend only covers revenue. Rendered as a simple bar-per-month
`RevenueTrendPanel` in `AdminProcurement.tsx`, next to the existing
point-in-time summary cards.

### FN037 — Finance audit trail
The real gap here was bigger than the audit note suggested: no finance
route ever wrote to `AuditLog` at all. `JournalEntry.sourceType`/`sourceId`
is bookkeeping metadata (what a payment posted against), not an audit
trail (who did it, when). Added `AuditLog.create()` at every finance
mutation point:
- `POST /finance/payments` → `PAYMENT_RECORDED`
- `PATCH /finance/refunds/:id/decide` → `REFUND_APPROVED`/`REFUND_REJECTED`
- `PATCH /finance/payments/:id/reverse` → `PAYMENT_REVERSED`
- `PATCH /procurement/expenses/:id/pay` → `EXPENSE_PAID`
- `POST /ledger/entries` (manual journal entry) → `MANUAL_JOURNAL_ENTRY`

New `GET /ledger/audit-trail` (filterable by action) and a "Finance audit
trail" panel in `AdminLedger.tsx`. Also fixed, in passing, a real bug
found while in that file: the ledger CSV export button was
`<a href="/api/ledger/export.csv">`, which could never have worked — this
app authenticates with a Bearer token in `localStorage`, not a cookie
session, so a plain browser navigation to an authenticated route 401s.
Added `apiFetchBlob`/`openOrDownloadBlob` to `lib/api.ts` (fetch with the
token, trigger the download from the blob) and used it for both this and
EX039's report buttons below.

### AI024 — Adaptive learning (automatic difficulty)
New `GET /ai/suggested-difficulty`: averages the student's last 10 graded
submission percentages and maps to beginner/intermediate/advanced
(`lib/weakness-detection.ts`'s `suggestDifficulty()`, unit-tested — 4/4
passing, including the no-history-defaults-to-intermediate case).
`AiTutor.tsx` applies it once, on first load, as the difficulty selector's
default; picking a different value manually clears the "auto-suggested"
label and is never overridden again for that session. This is a
suggestion, not a lock — the manual selector still works exactly as
before.

### AI026 — Weakness detection
New `lib/weakness-detection.ts` `computeWeakTopics()` (9/9 unit tests
passing, shared file with AI024's function above): real per-topic accuracy
from graded `QuestionResponse` rows, using the `Question.topic` field that
already existed on every question but was never read by anything
analytical. A topic needs ≥3 graded attempts and <60% accuracy to be
flagged — a single wrong answer isn't a pattern. This replaces
command-centre.ts's institution-wide "students who've gone quiet 12+ days"
count as the answer to "does this system detect weaknesses" — that
heuristic detects disengagement, not weakness, and never was per-student
or per-topic.

`GET /learning-analytics/weakness/me` + a "Topics to revise" panel in
`StudentLearningAnalytics.tsx`. `GET /learning-analytics/weakness/:studentId`
also exists for trainer/staff use, but **has no dedicated UI yet** — there
was no existing per-student trainer page to slot it into, and building one
from scratch felt like scope creep on an 11-item batch. Left honestly
open; the route works if called directly.

### EX032 — Similarity checking upgrade
Added `shingleSimilarity()` — n-gram (3-word shingle) Jaccard — alongside
the existing bag-of-words `jaccardSimilarity()` in `lib/similarity.ts`.
13/13 unit tests pass, including one that proves the point: two answers
with the exact same words fully shuffled score 100% on bag-of-words but
much lower on shingles, because no genuine 3-word run survives a shuffle.
A submission is now flagged if *either* metric crosses its threshold (70%
bag-of-words or 55% shingle), catching more real copying — same phrasing,
reordered — without inviting more false positives from a single
loose metric. `similarity-checking.ts` stores both scores; `checkMethod`
is now `"word_overlap+shingle"`. Still honestly word-overlap only, not
semantic/paraphrase-aware — that needs an embedding model this system has
no credentialed access to, the same limit AI007 (RAG) already documents.

### EX034 — Practical checklist UI
The backend (`PracticalChecklist`/`PracticalChecklistResult` models,
`lib/practical-checklist.ts`'s unit-tested `computeOverallOutcome()`, the
routes in `exam-accommodations.ts`) was fully built in batch 56 with no
frontend at all. New `TrainerPracticalChecklist.tsx` — build a checklist
(mandatory/optional criteria) for an assessment, then score each
submission competent/not-yet-competent per criterion. Routed at
`/trainer/practical-checklist`, linked from the trainer nav.

### EX036 — Simulation lab persistence
The Business Simulation Lab (`routes/simulation.ts`) was a fully
stateless AI chat endpoint: every `/turn` call was a one-shot reply with
no session, no transcript, and no way for a trainer to ever see or score
what a student did in it. Added:
- `SimulationSession` + `SimulationTurn` schema models (see note on schema
  changes below)
- The first `/turn` call in a scenario creates a session; every turn after
  is persisted
- `PATCH /simulation/sessions/:id/end` closes it for review
- `GET /simulation/sessions` (trainer queue, filterable to unscored),
  `GET /simulation/sessions/:id` (full transcript, owner or staff),
  `GET /simulation/sessions/mine` (student's own history)
- `PATCH /simulation/sessions/:id/score` — a trainer-confirmed score,
  deliberately a separate human step. Same principle as AI037's safety
  layer and AI033's (still correctly unbuilt) human-conducted viva: an AI
  counterpart is a practice partner, not the assessor of its own
  conversation.

`StudentSimulation.tsx` now tracks the session id through the
conversation, has an "End session & submit for review" action, and shows
past session history with score/status. New
`TrainerSimulationReview.tsx` lists ended sessions, opens the transcript,
and records the score — routed at `/trainer/simulation-review`.

### EX039 — Assessment reports (download buttons)
Backend (`lib/exam-reports.ts`, unit-tested, the CSV export and results
slip routes) was built in batch 56; nothing in `AdminExams.tsx` linked to
either. New "Assessment reports" panel: load an assessment's submissions,
download the CSV, or open any submission's results slip — using the same
`apiFetchBlob` helper as FN037's ledger export fix above, for the same
reason (Bearer-token auth, not cookies).

### AI036 — Multilingual AI (bigger gap than documented)
The audit's prior note said the tutor's `language` param was "a real,
working instruction" — true of the backend, but investigation found *no
frontend page ever sent it*. The feature was unreachable by an actual
user. Fixed properly:
- Added real language selectors (English/Kiswahili) to `AiTutor.tsx`
  (already had the backend field), `StudentAiAdvisor.tsx` (study planner —
  backend field added this batch), and `StudentCareer.tsx` (CV drafting —
  backend field added this batch, since a CV for a Kenyan employer is a
  plausible real use for a Swahili draft)
- All three use the same `language: "en" | "sw"` → system-prompt
  instruction pattern the tutor originated; still an instruction to the
  model, not a separately verified translation layer — that limit is
  unchanged and stated honestly in the audit row.

### AI014 — investigated, deliberately left open
`/ai/tutor` is genuinely capable per-exchange (multi-turn via
`TutorSession`, knowledge-base + library-fallback grounding, now-adaptive
difficulty, bilingual) but is still one Q&A exchange at a time.
"Full-course delivery" — autonomously sequencing and pacing a whole
syllabus — is a real, separate lesson-planning-engine feature, not a small
wiring gap like the others closed this batch. A token change here would
misrepresent the scope rather than close it. Left at 🟡 with an honest note
instead of a fake fix.

## Schema changes

Two new models in `backend/prisma/schema.prisma`: `SimulationSession` and
`SimulationTurn` (EX036), plus two new back-relations on `User`
(`simulationSessions`, `simulationSessionsScored`). No new
`postgresql`-incompatible types were used.

## IMPORTANT — what has and has not been verified

Same sandbox constraints as prior batches: **no network, no Docker, no
Postgres, no Node dependencies installed** (`backend/node_modules` and
`frontend/node_modules` are both empty in this environment), so `npm
install`/`prisma generate`/`prisma db push` could not be run. Nothing here
has executed against a real database, a real Anthropic API key, or a real
browser. What *was* actually run:

- Every edited/new `.ts` file syntax-checked with `node
  --experimental-strip-types --check` — passes on all of them.
- Every edited/new `.tsx` file bundle-checked with the `esbuild` binary
  bundled inside the globally-installed `tsx` package (the same approach
  prior batches used) — passes on all of them, catching import errors and
  JSX/TSX syntax errors that a plain syntax check would miss.
- Two new pure-logic modules were given real unit tests and actually run
  with `tsx --test`, not just written and assumed correct:
  - `backend/tests/similarity.test.ts` — 13/13 passing (including the new
    `shingleSimilarity` tests)
  - `backend/tests/weakness-detection.test.ts` — 9/9 passing (new file,
    covers both `computeWeakTopics` and `suggestDifficulty`)
  - Running the full suite (`tests/*.test.ts`) surfaces one **pre-existing,
    unrelated** failure — `tests/tp-libs.test.ts` fails because the `zod`
    package isn't installed in this sandbox (confirmed by inspecting the
    error; not something this batch touched or broke).
- The Prisma schema was hand-checked for balanced braces and consistent
  relation naming, but **`prisma generate`/`db push` has not run against
  it** — the new `SimulationSession`/`SimulationTurn` models are
  unverified by an actual Prisma Client until that happens on first real
  boot, same caveat every schema-touching batch before this one has
  carried.

## What's still open after this batch

- AI014 (full-course AI delivery — see above, deliberately not touched)
- AI026's trainer-facing weakness view (route exists, no UI)
- AI002, AI008–012 (real RAG infra), AI025 (mastery prediction), AI033–035
  (voice/viva) — unchanged, still correctly blocked on infrastructure this
  environment has no credentials for
- SP034/FN006/FN007 (M-Pesa/Daraja — needs real credentials)
- AI003, AI037, EX013–015 (deliberately-scoped permanent limits, not gaps)

None of the above should be read as done. Full current counts are at the
bottom of `docs/feature-audit-400.md`.
