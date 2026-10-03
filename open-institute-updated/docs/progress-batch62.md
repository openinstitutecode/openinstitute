# Batch 62 progress notes

Scope: continue from batch 61 — pick remaining 🟡/⬜ items from
`docs/feature-audit-400.md` and either fully wire them or, where real
infrastructure (credentials, an embeddings model, hosted speech
services) is genuinely missing, write the honest code that doesn't need
it and document the boundary precisely, per this batch's brief: write
code even without infrastructure, and be thorough and honest about which
is which.

Same investigation discipline as batch 61: every candidate was checked
against the actual repo (route file, frontend page, schema) before
writing anything, not trusted from the audit table alone.

## Another stale-audit finding

### LMS008–011 — PDF/video/audio/interactive lessons
Marked ⬜ ("contentType field exists, no playback UI"). Actually already
fully built: `LessonView.tsx`'s `MediaPlayer` renders video/audio with
native controls (seeking works — the server honours Range requests),
images, inline PDFs, and a download fallback for other documents, with a
low-bandwidth tap-to-load gate (LMS025) for anything heavy.
`StudentCourses.tsx`'s `LessonPlayer` frames `contentType: "interactive"`
content in an iframe, and hands `contentType: "scorm"` off to a dedicated
`ScormPlayer` backed by a real SCORM 1.2 JS API shim and xAPI logging
(`routes/scorm.ts`, `routes/xapi.ts`) — built in an earlier batch
(LMS022) but never reflected back into this row. **Pure documentation
fix, nothing built this batch.**

## What was genuinely built this batch

### AI025 — Mastery prediction
The `lib/weakness-detection.ts` module note (written in batch 61) said
this "correctly remains unbuilt — it needs a labelled dataset and a
model this system has neither of." That's true of a *trained* mastery
model. It is not true of every reasonable reading of "mastery
prediction" — AI024's `suggestDifficulty()` and AI026's
`computeWeakTopics()` are exactly this category of thing (real data, a
simple deterministic rule, not a classifier) and both count as real,
built features in this audit. So this batch built AI025 the same way:

New `lib/mastery-prediction.ts`, `predictMastery()`:
- Pulls a student's real graded `Submission` scores (assessment- and
  assignment-based both have a real `totalMarks`), groups them by the
  unit the underlying course belongs to, and turns each into a percent.
- Recency-weighted mean (attempt *i*, 0-indexed oldest-first, gets weight
  *i+1* — the latest attempt in a run of N carries N× the weight of the
  first) rather than a plain average, so a student who struggled early
  and has since improved isn't dragged down by their first attempt
  forever.
- A plain ordinary-least-squares slope across attempt order gives a
  trend direction (`improving` / `declining` / `stable`, with a ±1.5
  points/attempt deadband so ordinary score noise doesn't read as a
  trend) and feeds `predictedNextPercent = weightedAverage + slope`,
  clamped to [0, 100].
- Mastery band (`not_yet_competent` / `developing` / `competent` /
  `mastered`) is read off the predicted percent using the same
  40/60/80 thresholds the rest of the platform already uses informally.
- Confidence (`low`/`medium`/`high`) scales with attempt count — a
  prediction from 2 attempts is honestly labelled low-confidence.

**10/10 unit tests passing** (`backend/tests/mastery-prediction.test.ts`):
empty input, single attempt, a clean upward trend, a clean downward
trend, flat/noisy scores staying "stable", recency weighting actually
outweighing a plain mean, clamping at 100, confidence banding, mastery
banding, and out-of-order input being sorted before use.

`GET /learning-analytics/mastery/me` + a new "Mastery prediction" panel
in `StudentLearningAnalytics.tsx`, right below the existing weakness
panel. `GET /learning-analytics/mastery/:studentId` for trainer/staff
also exists (same permission set as AI026's `weakness/:studentId`) but,
like that route, has no dedicated UI to slot into yet — there still
isn't a per-student trainer profile page anywhere in the app. Left
honestly open rather than bolted onto an unrelated page.

**What this explicitly is not:** a trained model, a probability with any
statistical calibration behind it, or anything that has seen a labelled
training set. The panel copy says so directly ("a deterministic trend
projection... not a trained prediction model").

### AI034 — Voice AI (voice input) & AI035 — Text-to-speech
Both were ⬜. Both are now genuinely, functionally built — using the
browser's own Web Speech API (`SpeechRecognition` for input,
`speechSynthesis` for read-aloud), which needs **no new backend, no
credentials, and no infrastructure this sandbox lacks**. This is
meaningfully different from AI033 (AI viva), which needs real
conversational speech infrastructure — turn-taking, a spoken-dialogue
model — and correctly stays ⬜; voice-as-an-input-method and a scored
spoken exam are different problems.

New `frontend/src/lib/voice.ts`:
- `useSpeechToText(language)` — wraps `SpeechRecognition` /
  `webkitSpeechRecognition`. Returns a live-updating `transcript` as the
  student speaks, a `listening` flag, and a `supported` flag that's
  honestly `false` in browsers without it (Firefox, Safari, as of this
  writing) rather than silently failing.
- `useTextToSpeech(language)` — wraps `speechSynthesis`. `speak(text)`
  cancels any in-flight utterance first (one voice at a time), and
  `speaking` reflects the browser's own `onstart`/`onend` events, not an
  assumed duration — so the UI can never claim to be "reading" after
  playback has actually stopped or been interrupted.
- Both take the same `"en" | "sw"` language flag the tutor's own
  multilingual selector (AI036) already uses, mapped to `en-US` /
  `sw-KE`. Kiswahili quality depends entirely on the voices the user's
  own browser/OS ships — this app has no control over that and the code
  comments say so; it is not a verified translation or synthesis layer.

Wired into `AiTutor.tsx`: a 🎤 button next to the message input (visible
only when `sttSupported`) that starts/stops listening and fills the
input as the transcript updates; a "Read aloud" / "Stop reading" toggle
next to "Save to notebook" on every tutor reply (visible only when
`ttsSupported`). Both respect the page's existing language selector.

### AI002 — Model management
Was ⬜. Through batch 61, `callAnthropic()` in `lib/ai-gateway.ts` sent a
literal string, `"claude-sonnet-4-6"`, to the Anthropic API — the only
way to point every AI-backed feature at a different model was to edit
that string in source and redeploy. New:
- Schema: `AiModelConfig` — a singleton row (`id: "default"`) holding
  `modelId`, optional `notes`, and who/when it was last changed.
- `lib/ai-gateway.ts`: `getActiveModelConfig()` reads that row on every
  `callAiModel()` call, falling back silently to the same hard-coded
  default (`DEFAULT_MODEL_ID = "claude-sonnet-4-6"`) if the row doesn't
  exist yet or the table can't be read (e.g. migration not applied in
  this environment) — model configuration must never be the reason an
  AI feature goes down. `setActiveModelConfig()` upserts it.
- `GET /ai/governance/model-config` (same governance-audience roles as
  the rest of AI040's pages) and `PATCH /ai/governance/model-config`
  (SUPER_ADMIN only — deliberately narrower than read access, and
  writes a real `AI_MODEL_CONFIG_CHANGED` `AuditLog` row).
- A new "Active model (AI002)" panel at the top of
  `AdminAiGovernance.tsx` — shows the current model id, who last changed
  it and when, and an editable field for SUPER_ADMIN.

Honest scope note carried over from AI003's own row: this still only
manages the model **within** the one wired "anthropic" provider branch —
it is not a multi-provider registry, and AI003 (a second provider
implementation) remains correctly 🟡.

## Schema changes

One new model in `backend/prisma/schema.prisma`: `AiModelConfig` (AI002).
No new relations on any other model, no `postgresql`-incompatible types.

## IMPORTANT — what has and has not been verified

Same sandbox constraints as every prior batch: **no network, no Docker,
no Postgres, no Node dependencies installed** (`backend/node_modules` and
`frontend/node_modules` are both empty), so `npm install` /
`prisma generate` / `prisma db push` could not be run, and neither could
a real `tsc` type-check (no TypeScript compiler installed in this
environment beyond the syntax/bundle checkers below). Nothing here has
executed against a real database, a real Anthropic API key, or a real
browser. What *was* actually run:

- Every edited/new `.ts` file syntax-checked with
  `node --experimental-strip-types --check` — passes on all of them
  (`lib/ai-gateway.ts`, `routes/ai.ts`, `routes/learning-analytics.ts`,
  `lib/mastery-prediction.ts`).
- Every edited/new `.tsx`/`.ts` frontend file bundle-checked with the
  `esbuild` binary bundled inside the globally-installed `tsx` package
  (same approach batches 60–61 used) — passes on
  `AdminAiGovernance.tsx`, `StudentLearningAnalytics.tsx`, `voice.ts`,
  and `AiTutor.tsx`. This catches import errors and JSX/TSX syntax
  errors, not type errors — no `tsc` ran.
- `lib/mastery-prediction.ts` has a real unit test file, actually run
  with `tsx --test`, not just written and assumed correct:
  `backend/tests/mastery-prediction.test.ts` — **10/10 passing**,
  including two assertions that were initially wrong (comparing the
  prediction against the single latest raw score rather than the
  recency-weighted average) and were caught and fixed by actually
  running the suite, not by inspection.
- The voice features (`lib/voice.ts`, the mic/read-aloud buttons in
  `AiTutor.tsx`) cannot be exercised at all in this sandbox — there is no
  browser here, headless or otherwise, and the Web Speech API is a
  browser capability with no server-side equivalent to test against.
  They compile and bundle cleanly, and the logic (transcript
  accumulation, one-utterance-at-a-time cancellation, honest `supported`
  flags) was written and reviewed carefully, but "genuinely works in a
  real browser" is asserted here, not independently verified in this
  session — the same honesty standard this doc tries to hold everything
  else to.
- The Prisma schema addition (`AiModelConfig`) was hand-checked for
  balanced braces and a sane default id, but **`prisma generate`/
  `db push` has not run against it** — unverified by an actual Prisma
  Client until first real boot, same caveat every schema-touching batch
  before this one has carried. `getActiveModelConfig()`'s try/catch
  fallback is specifically there so this doesn't take down the AI
  gateway if the migration lags behind a deploy.

## What's still open after this batch

- AI008–012 (real embeddings-based RAG infrastructure) — unchanged,
  still correctly blocked on credentials/infra this environment doesn't
  have.
- AI033 (AI viva) — unchanged, needs real conversational speech
  infrastructure; distinct from AI034/AI035, now built.
- AI003 (a second AI provider implementation) — unchanged, real seam,
  no second provider's credentials to implement against.
- AI014 (full-course AI delivery) — unchanged from batch 61's
  investigation; a real, separate lesson-planning-engine scope, not a
  wiring gap.
- AI025's and AI026's trainer-facing per-student views — routes exist,
  no dedicated trainer UI page to slot them into yet.
- SP034/FN006/FN007 (M-Pesa/Daraja) — needs real production credentials.
- EX013–015 (deliberately-scoped permanent exam-security limits, not
  gaps).

None of the above should be read as done. Full current counts are at the
bottom of `docs/feature-audit-400.md`.
