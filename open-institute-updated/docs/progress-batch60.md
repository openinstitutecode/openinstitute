# Batch 60 progress notes — AI College Engine: shared gateway, permissions, governance

Scope: Section F of `docs/feature-audit-400.md` (AI COLLEGE ENGINE) listed
40 AI items. This batch closes the infrastructure cluster that every other
AI feature sits on top of — AI001 (gateway), AI003 (provider abstraction),
AI004 (usage monitoring), AI005 (fine-grained permissions), AI037 (safety
layer), AI038 (human escalation), AI040 (governance centre) — plus AI036
(multilingual, cheap to add once the gateway existed). It does **not**
touch AI008–012 (true RAG/embeddings/vector search), AI025 (mastery
prediction), AI033 (viva), or AI034/035 (voice/TTS) — those need
infrastructure (a vector DB, a speech API) this environment has no
credentials or connectivity for, and are left at their prior status rather
than faked.

## IMPORTANT — what has and has not been verified

Same sandbox constraints as every prior batch: **no network, no Docker, no
Postgres, no Node dependencies installed**, so `npm install`/`prisma
generate`/`prisma migrate dev`/`prisma db push` could not be run and
nothing here has executed against a real database or the Anthropic API.
What *was* done instead:

- Every edited `.ts` file was syntax-checked with `node
  --experimental-strip-types --check`; the one new `.tsx` file
  (`AdminAiGovernance.tsx`) and a sample of the 61 other admin pages
  touched by the nav-link insertion were bundle-checked with the
  `esbuild` binary bundled with `tsx`. All pass — this catches syntax
  errors, not type errors; a full `tsc -p tsconfig.json` / `vite build`
  still needs to run in an environment with `node_modules` installed.
- Confirmed by grep, post-refactor: no file under `backend/src/routes/`
  contains the literal string `api.anthropic.com` anymore — the only
  places that string appears in the backend are inside
  `backend/src/lib/ai-gateway.ts` itself.
- The nav-link insertion into 61 existing admin pages was done with a
  Perl one-liner matching the exact, verified-identical line each page
  already had (`{ to: "/admin/admin-assistant", label: "AI Admin
  Assistant" },`), skipping any file where the target line was already
  present, then spot-verified on five pages by grep and esbuild bundle.

**Run a Prisma migration before deploying this batch**
(`npx prisma migrate dev --name ai_gateway_governance_batch60` from
`backend/`, or `npx prisma db push` per this project's established
no-migrations-folder convention) — the new `AiUsageLog` model is a schema
change. Then run `npm run build` in both `backend/` and `frontend/`.

## AI001 — shared AI gateway

Before this batch, eight route handlers (4 in `ai.ts`, 2 in `career.ts`, 1
each in `library.ts` and `simulation.ts`) each called
`fetch("https://api.anthropic.com/v1/messages", ...)` directly, with
near-identical but independently-maintained boilerplate for headers, error
handling, and response parsing. `backend/src/lib/ai-gateway.ts` is now the
one place that happens; every route calls `callAiModel()` (or the local
`callClaude()` wrapper in `ai.ts`, which itself now just calls
`callAiModel()`). Confirmed by the grep above — nothing outside
`ai-gateway.ts` talks to a model provider directly anymore.

## AI003 — provider abstraction

`AI_PROVIDER` env var (documented in `.env.example`, default
`"anthropic"`) selects a provider branch inside `callAiModel()`. Only
`"anthropic"` is implemented — that's the only provider this instance has
credentials for. This is a real, structural seam for a second provider
later (the same one-interface-many-backends shape `lib/repositories/*`
already uses for library sources — `dspace.ts`, `arxiv.ts`, `crossref.ts`,
etc.), not a claim that multiple providers work today. Setting
`AI_PROVIDER` to anything else makes every AI feature fail loudly
(`unconfigured_provider`, visible in the AI040 governance dashboard)
instead of silently falling back to Anthropic.

## AI004 — usage monitoring

New `AiUsageLog` Prisma model. Every `callAiModel()` invocation — success,
provider failure, missing API key, or safety block — writes one row:
`feature`, `userId`, `role`, `success`, `blockedBySafety`, `errorReason`,
`promptChars`, `responseChars`, `latencyMs`. Logging failures (e.g. this
batch's migration not yet applied in some environment) are swallowed
inside `logUsage()` — they never block or alter the actual AI response the
caller gets. `getAiUsageStats()` aggregates this table by feature for the
governance centre (AI040); nothing else in the codebase tracked AI usage
before this.

## AI005 — fine-grained AI permissions

Before this batch, only the tutor, trainer-assist, and academic-advisor
routes checked `hasPermission(role, "AI", <action>)` — every other AI
route (registrar/finance/admin-assistant, generate-report,
research-assistant, librarian, literature-summary, qa-assistant,
remediation-generator, marking-assistant, study-planner,
revision-assistant, plus career.ts's cv-draft/mock-interview, library.ts's
semantic-search, and simulation.ts) only had a coarse `requireRole` with
no way for a SUPER_ADMIN to disable it per-role without editing code. All
20 AI-backed endpoints now check `hasPermission()` with an action key from
the new `AI_FEATURE_CATALOG` in `ai-gateway.ts`, which is the single
canonical list of every AI feature's (resourceType, action) pair — used
by both the permission checks and the AI040 catalogue view.

## AI036 — multilingual AI

The tutor endpoint (`POST /ai/tutor`) takes an optional `language: "en" |
"sw"` field (default `"en"`, so nothing changes for an existing caller).
When set to `"sw"`, the system prompt instructs the model to answer in
Swahili. This is a real, working instruction — not a translation layer
with any verification behind it; there's no separate check that the
model's Swahili is actually correct, only that it was asked for. Left at
🟡 in the audit for that reason, same honesty standard as the rest of this
codebase's AI notes.

## AI037 — safety layer

`screenUserInput()` in `ai-gateway.ts` runs a small set of regex patterns
against real user-typed free text (the `screenInput` param passed to
`callAiModel()`) before it reaches the model — catching things like
"ignore all previous instructions" or "reveal your system prompt". Routes
whose only input is staff-authored structured data (e.g. the quiz
question generator's unit/count, which has no student free text) don't
pass `screenInput`, matching the gateway's own contract — there's nothing
for the layer to usefully screen there. **This is a heuristic
pattern-matcher, not a trained classifier** — it will not catch a
rephrased or subtle prompt-injection attempt. That remains a real,
documented gap. What changed is that there is now a real, functioning,
logged check where before there was none — every block writes an
`AiUsageLog` row with `blockedBySafety: true`, visible in the AI040
dashboard's safety log.

## AI038 — human escalation

New `POST /ai/escalate`. Reuses the existing `HelpdeskTicket` model — it
already had an unused `handledByAi Boolean` column (see
`routes/support.ts`), which this batch is the first thing to actually set
`true`. An escalation creates a real ticket (`status: "escalated"`)
pre-filled with the student's actual question and, if supplied, what the
AI assistant told them — so whoever picks it up from the helpdesk queue
has real context instead of a blank ticket. No new ticket system was
invented; this is the existing one, finally wired to something.

## AI040 — AI governance centre

Three new routes, all `PRINCIPAL`/`DEPUTY_PRINCIPAL`/`SUPER_ADMIN`-gated:

- `GET /ai/governance/usage?days=N` — `getAiUsageStats()` aggregated over
  the last N days (default 30), broken down per feature.
- `GET /ai/governance/feature-catalog` — the full `AI_FEATURE_CATALOG`,
  joined against real `RolePermission` rows so an admin can see exactly
  which override, if any, currently applies to each AI feature (AI005).
- `GET /ai/governance/safety-log` — the 50 most recent
  `blockedBySafety: true` rows (AI037).

New frontend page `frontend/src/pages/admin/AdminAiGovernance.tsx`,
routed at `/admin/ai-governance`, showing all three as stat cards and
tables. Its nav link (`{ to: "/admin/ai-governance", label: "AI
Governance Centre" }`) was inserted into all 61 other admin pages'
sidebar link arrays, immediately after the existing "AI Admin Assistant"
link, so it's reachable from every admin screen the way every other admin
nav item already is.

## Feature-audit-400.md — status changes

Section F rows updated: AI001 ⬜→✅, AI003 🟡→✅ (with the "only one
provider implemented" caveat kept in the note, not hidden), AI004 ⬜→✅,
AI005 🟡→✅, AI036 ⬜→🟡, AI037 🟡→🟡 (upgraded in substance — see above —
but a heuristic layer earns 🟡, not ✅, same standard as every other
partial item in this file), AI038 ⬜→✅, AI040 ⬜→✅.

## What's still open in Section F after this batch

AI002 (model version management UI), AI006/007 (whatever the audit's
remaining unlisted items were before this batch — re-check against the
live file), AI008–012 (real RAG: chunking, embeddings, a vector index —
every "semantic search" in this codebase today, including the one
improved in this batch, is prompt-based relevance ranking over catalogue
metadata, not embedding similarity over full document content), AI025
(mastery prediction — would need a real model trained on the assessment
data, not a prompt), AI033 (AI viva — no scoping done yet), AI034/035
(voice input/TTS — different API surface entirely, no credentials
available here). None of these were touched this batch; none should be
read as done.
