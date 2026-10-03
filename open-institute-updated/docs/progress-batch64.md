# Batch 64 progress notes

Scope for this batch, per the brief: finish the partially-built and
not-built features remaining in the audit, and for anything that requires
real infrastructure — write the real code now, so only a real credential
purchase stands between it and going live. No mocks, no fake success
responses: every credential-gated branch added this batch fails with a
clear configuration message when its credential is absent, exactly like
every prior batch's DARAJA_*/ANTHROPIC_API_KEY branches.

Going into this batch, the audit had exactly **one ⬜ (AI033, AI viva)** and
**11 🟡 rows**, most genuinely credential-blocked. This batch closed the
one ⬜ and turned four of the 🟡 rows' actual named gaps into real code.

## AI033 — AI viva (⬜ → ✅)

Every prior batch correctly deferred this because a scored spoken exam
sounded like it needed a hosted speech model with no available credential.
What actually changed: AI034/AI035 (batch 62) already proved the browser's
own Web Speech API is a real, zero-credential way to turn speech into text
and text back into speech. This batch supplied the other real half — an
examiner "brain."

- New `AiVivaSession`/`AiVivaTurn` Prisma models — same session/transcript
  shape as EX036's `SimulationSession`/`SimulationTurn`.
- New `routes/viva.ts`: `POST /viva/turn` generates the examiner's next
  question via the existing `callAiModel` text gateway, grounded in the
  unit's real curriculum topics (`lib/curriculum.ts`'s `findRelevantTopics`
  — the same grounding the tutor uses); `PATCH /sessions/:id/end`;
  `GET /sessions/mine` (student history); `GET /sessions` (staff review
  queue, filterable to unscored); `GET /sessions/:id` (full transcript);
  `PATCH /sessions/:id/score` — a human (TRAINER/EXAMINATION_OFFICER/
  SUPER_ADMIN) always confirms the final score. The AI examiner never
  scores its own conversation, same principle as EX036 and AI037.
- `StudentViva.tsx` (`/student/viva`): uses `lib/voice.ts`'s
  `useSpeechToText`/`useTextToSpeech` hooks (already real, from AI034/035)
  so a student can genuinely have a spoken back-and-forth practice viva
  today, with a typed-answer fallback when the browser doesn't support
  Web Speech. Shows past session history with score/review status.
- `TrainerVivaReview.tsx` (`/trainer/viva-review`): staff review queue +
  transcript + score/feedback form — adapted directly from
  `TrainerSimulationReview.tsx`'s already-proven pattern.
- Nav link added to all 36 student pages carrying the canonical nav array,
  plus `trainerLinks.ts`, plus `App.tsx` routes for both new pages.

Every turn records honestly whether the student's answer actually came
from the Web Speech API (`spokenInput: true`) or a typed fallback — a
reviewer can see which parts of a session were genuinely spoken, nothing
is silently claimed as voice that wasn't.

## AI003 — second AI provider (🟡 → ✅) and AI037 — real classifier layer (stays 🟡, real upgrade added)

`ai-gateway.ts` had exactly one real implementation (`callAnthropic`)
behind a real `AI_PROVIDER` seam. Added:

- `callOpenAi()` — OpenAI's Chat Completions API called directly over
  HTTPS+JSON (no new npm dependency, same "zero new dependencies"
  discipline as every prior batch). `AI_PROVIDER=openai` +
  `OPENAI_API_KEY` now genuinely routes every AI call through it.
- `screenWithModerationModel()` — when `OPENAI_API_KEY` is configured,
  every screened input is *also* checked against OpenAI's real moderation
  model, in addition to (never instead of) the always-on regex heuristic.
  Either flagging blocks the call. A moderation-endpoint failure (no key,
  network error, non-2xx) fails open to the heuristic — it never blocks an
  otherwise-legitimate call just because the optional upgrade layer
  couldn't be reached.

AI003 moves to ✅ (a real second implementation now exists behind the
abstraction — that's what the row asked for). AI037 stays 🟡 on purpose:
the *always-on default* is still the heuristic, and a deployment with no
OpenAI key still gets only that — the row's honest boundary ("not a
trained classifier by default") still holds.

Like every other credential-gated branch in this codebase, neither of
these has executed against a real key in this sandbox — no network
access here.

## FN006/FN007/SP034 — card payment gateway (stays 🟡, real second gateway added)

Card and bank payments were manual-entry-only — a finance officer typing
in a reference after the fact, not a real gateway integration. Added a
genuine second real gateway alongside M-Pesa: Stripe Checkout Sessions.

- `POST /finance/card/checkout` — creates a real Stripe Checkout Session
  via Stripe's REST API (form-encoded body, per Stripe's actual API
  shape), stores a `PendingCardCheckout` row (same shape/purpose as
  `PendingMpesaPush`), returns the checkout URL to redirect to. Returns a
  clear 503 configuration error if `CARD_GATEWAY_SECRET_KEY` isn't set.
- `POST /finance/card/webhook` — verifies Stripe's signature scheme
  (HMAC-SHA256 over `"<timestamp>.<raw body>"`) and, on
  `checkout.session.completed`, calls the existing `recordPayment()` with
  method `"card"`. The verification logic itself lives in
  `lib/card-gateway.ts` — dependency-free (only `node:crypto`, a
  builtin) — specifically so it could be unit-tested on its own.
  **5/5 tests passing**: correct signature accepted, wrong secret
  rejected, tampered body rejected, missing header rejected, malformed
  header rejected.
- `index.ts`: registered `express.raw({ type: "application/json" })` for
  exactly the `/api/finance/card/webhook` path *before* the app-wide
  `express.json()` — the real, standard pattern for verifying a webhook
  signature (Stripe's signature is computed over the raw bytes, which the
  JSON parser would otherwise have already consumed and reserialized).
- `StudentFees.tsx`: "Pay by card instead" button alongside the existing
  M-Pesa STK-push form, redirecting to the real Stripe-hosted checkout
  page.

Stays 🟡 — same as M-Pesa itself — because it needs a real merchant
account's production secret/webhook keys, and has never executed against
one in this sandbox.

## AI014 — course delivery / pacing plan (🟡 → ✅)

Batch 61 correctly refused to close this as a small wiring gap: an agent
that autonomously teaches a whole course is a real, separate scope this
project never claimed. What's real and buildable without new
infrastructure is the specific thing the row names — "sequencing and
pacing a whole syllabus" — grounded in the course's own real content.

- New `CourseDeliveryPlan`/`CourseDeliveryPlanItem` models.
- New `routes/course-delivery.ts`: `POST /:courseId/generate` loads the
  course's real `Lesson` rows (via its modules), asks the AI gateway to
  sequence them into a week-by-week plan (structured JSON response,
  referencing lessons only by their real list position — never inventing
  one), and falls back to a deterministic even distribution
  (`lib/course-pacing.ts`, dependency-free, **5/5 tests passing**:
  no-lessons placeholder, never drops/invents a lesson, never assigns a
  week outside range, preserves original order, rejects invalid
  `totalWeeks`) whenever no AI model is configured or the response can't
  be parsed. Any real lesson the model's response leaves out still gets a
  slot in the final week, so a parsing gap never silently drops content.
- `PATCH /:courseId/items/:itemId` (trainer edits any item) and
  `PATCH /:courseId/publish` (trainer explicitly publishes) — a draft
  plan is never visible to students; `GET /:courseId` 404s for a student
  until a trainer has published.
- `TrainerCourses.tsx`: per-course "Delivery / pacing plan" panel —
  generate, inline-edit each week's title/objective, publish.
- `StudentCourses.tsx`: read-only pacing widget, shown only once
  published.

Same draft → human review → authorized decision principle as every other
AI feature in this codebase — not an autonomous teacher, and the row's
row title notwithstanding, never framed as one.

## EX014 — candidate admit cards (stays 🟡, real feature added)

Batch 56 drew a deliberate, permanent line here: biometric/photo-ID
verification is out of scope for this platform (privacy-sensitive, needs
hardware/consent this project doesn't have) — and that line is unchanged
by this batch. What batch 56's own note also flagged as a legitimate,
smaller next step was real admit cards: a printed/emailed card an
invigilator checks by eye, no automated face match anywhere.

- `Student.photoDataUrl` — a base64 photo the student uploads themselves
  (`StudentProfile.tsx`, resized+compressed client-side via `<canvas>` to
  fit comfortably under a 300KB cap before it's ever sent — no new
  dependency, same base64-JSON-field pattern the PDF knowledge-base
  upload already uses).
- New `ExamAdmitCard` model, reusing `lib/credentials.ts`'s existing
  `signDocument`/`generateDocumentId` (the same primitive transcripts and
  certificates already sign).
- `POST /exams/assessments/:id/admit-card/mine` — student self-service;
  requires a photo already on file and real enrollment in the
  assessment's course. `GET .../admit-card/mine` to re-fetch it.
- `GET /exams/assessments/:id/admit-cards` + `POST .../admit-cards/generate`
  — staff bulk-issue for every enrolled student who has a photo, reporting
  how many were skipped for lacking one.
- `GET /exams/admit-cards/verify/:documentId` — public; an invigilator
  scans the card's QR code and gets back only what's needed to check it's
  genuine (student name/number, assessment title/time, issue date) —
  deliberately never the photo itself, since the physical card already
  carries that.
- `StudentExams.tsx`: "Get admit card" per scheduled assessment, showing
  the photo + QR once issued. `AdminExams.tsx`: bulk-generate panel.

Stays 🟡 because the row's actual subject — biometric candidate
authentication — remains the permanent scope boundary batch 56 correctly
drew. Admit cards support the human identity check invigilators already
do; they don't attempt to replace it with anything automated.

## Verification

No network access and no `node_modules` in this sandbox (unchanged from
every prior batch) — `npm install`, `prisma generate`/`db push`, and a
real `tsc` type-check could not be run, and neither could anything
touching Prisma or Express directly. What *was* actually run:

- Every touched/new backend file (`viva.ts`, `course-delivery.ts`,
  `finance.ts`, `exams.ts`, `me.ts`, `ai-gateway.ts`, `course-pacing.ts`,
  `card-gateway.ts`, `index.ts`) parses and transpiles cleanly under
  `tsx` — confirmed by running each directly and checking the only
  failures are `ERR_MODULE_NOT_FOUND` for `express`/`@prisma/client`/
  `dotenv` (expected, since those packages aren't installed here), never
  a syntax or transform error. Brace/paren balance double-checked by
  script across the same file set.
- The two genuinely new pieces of pure logic this batch introduced
  (Stripe webhook signature verification, deterministic pacing
  distribution) were deliberately extracted into dependency-free
  `lib/` modules — same discipline as `lib/chunking.ts`/
  `lib/local-embedding.ts` in batch 63 — specifically so they could be
  unit-tested with no database or network involved:
  - `tests/card-gateway.test.ts` — **5/5 passing**
  - `tests/course-pacing.test.ts` — **5/5 passing**
- The full existing backend test suite was re-run after these changes:
  **94/95 passing**. The one failure (`tests/tp-libs.test.ts`) is the
  same pre-existing, unrelated failure batch 63's own progress notes
  already recorded (84/85 there, now 94/95 with 10 new passing tests
  added) — not a regression introduced by this batch.
- Everything touching Prisma (the six new models, the `Student.photoDataUrl`
  field, all the new relations) and everything touching Express (every
  new route, the `express.raw()` webhook middleware ordering) is
  real code, written against the actual existing schema/route patterns,
  but — like every schema-touching change in every prior batch —
  genuinely unverified until this project's first real `prisma db push`
  and server boot outside this sandbox.
- No credential-gated branch added this batch (`OPENAI_API_KEY`,
  `CARD_GATEWAY_SECRET_KEY`, `CARD_GATEWAY_WEBHOOK_SECRET`) has executed
  against a real key here — no network access in this sandbox, same
  boundary as `ANTHROPIC_API_KEY`/`DARAJA_*` in every prior batch.

## What's left after this batch

Per the updated `feature-audit-400.md` summary: **0 ⬜, 9 🟡, 383 ✅.**
Every remaining 🟡 row is now either genuinely credential-blocked (M-Pesa
and card gateway production credentials, an OpenAI key for the optional
AI037 classifier upgrade, true dense-embeddings semantic search) or a
deliberate, previously-documented permanent scope boundary (biometric
exam authentication, lockdown/proctored exam delivery) — not a gap this
platform's code is missing.
