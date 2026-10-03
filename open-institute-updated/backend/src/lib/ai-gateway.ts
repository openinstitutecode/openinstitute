import { ConcurrencyLimiter, OverloadedError } from "./concurrency-limiter.js";
import { dailyAiLimit } from "./ai-quota.js";
export { estimateAiCost, dailyAiLimit } from "./ai-quota.js";
import { prisma } from "./prisma.js";

// ---------------------------------------------------------------------------
// AI001 / AI003 / AI004 / AI037 — the AI gateway.
//
// Through Batch 59, every AI-backed route hand-rolled its own
// `fetch("https://api.anthropic.com/v1/messages", ...)` call (8 separate
// copies across ai.ts, career.ts, library.ts, simulation.ts). That meant no
// route could be usage-monitored, safety-screened, or pointed at a
// different provider without editing every copy individually — exactly the
// gaps AI001 ("no shared gateway"), AI003 ("hardcoded to one provider"),
// and AI004 ("not built") named. This module is the single chokepoint
// every one of those routes now calls through instead.
//
// What this genuinely is, and isn't:
//  - AI001 gateway: one function, callAiModel(), used by every AI route.
//    Confirmed by grep — after this batch, no route file outside this one
//    contains the literal string "api.anthropic.com".
//  - AI003 provider abstraction: the AI_PROVIDER env var (default
//    "anthropic") selects a provider branch below. Only "anthropic" is
//    implemented, because that's the only provider this instance has
//    credentials for — this is a real seam for a second implementation
//    later, matching the precedent lib/repositories/* already set for
//    library sources (one interface, many backends: dspace.ts, arxiv.ts,
//    crossref.ts, ...), not a fake multi-provider claim. Selecting an
//    unimplemented provider fails loudly (provider_error) rather than
//    silently falling back to Anthropic.
//  - AI004 usage monitoring: every call — success, failure, or safety
//    block — writes one AiUsageLog row (feature, user, role, latency,
//    prompt/response size, error reason). AI040's governance routes
//    (routes/ai.ts, /ai/governance/*) read this table. Logging failures
//    (e.g. migration not yet applied) never block the actual AI response —
//    they're swallowed and the caller still gets their real result.
//  - AI037 safety layer: screenUserInput() is a heuristic pattern-match
//    against real free text before it reaches the model — it catches
//    obvious prompt-injection / "ignore your instructions" attempts. It is
//    NOT a trained classifier and will not catch a rephrased or subtle
//    attempt; that remains a real, documented gap (see AI037's row in
//    docs/feature-audit-400.md). What changed is that there is now a real,
//    functioning, logged check where before there was none at all.
// ---------------------------------------------------------------------------

export type AiChatMessage = { role: "user" | "assistant"; content: string };

export type AiCallParams = {
  /** Key from AI_FEATURE_CATALOG below — drives permission checks and usage attribution. */
  feature: string;
  userId: string;
  role: string;
  system: string;
  messages: AiChatMessage[];
  maxTokens: number;
  /**
   * The real, free-typed text a user is sending this turn (if any), run
   * through the safety layer before the call. Routes whose only "input" is
   * staff-authored structured data (no student/user free text — e.g. the
   * quiz-question generator's unit/count) can omit this; there is nothing
   * for the safety layer to usefully screen there.
   */
  screenInput?: string;
};

export type AiCallResult =
  | { ok: true; text: string }
  | {
      ok: false;
      reason: "no_api_key" | "blocked_by_safety" | "provider_error" | "unconfigured_provider" | "quota_exceeded" | "overloaded";
      message: string;
    };

// AI037 — heuristic prompt-injection / jailbreak patterns. Deliberately
// narrow (favouring missed detections over false positives on ordinary
// course questions) — see the module note above on what this is not.
const SAFETY_PATTERNS: RegExp[] = [
  /ignore (all |any |the )?(previous|prior|above) instructions/i,
  /disregard (all |any |the )?(previous|prior|system) (instructions|prompt)/i,
  /reveal (your|the) (system prompt|instructions)/i,
  /forget (all|everything) (you were|you've been|you have been) told/i,
  /act as (if you have|though you have) no (rules|restrictions|filters|guardrails)/i,
];

export function screenUserInput(text: string): { blocked: boolean; pattern?: string } {
  const hit = SAFETY_PATTERNS.find((p) => p.test(text));
  return hit ? { blocked: true, pattern: hit.source } : { blocked: false };
}

async function logUsage(entry: {
  feature: string;
  userId: string;
  role: string;
  success: boolean;
  blockedBySafety: boolean;
  errorReason: string | null;
  promptChars: number;
  responseChars: number;
  latencyMs: number;
}) {
  try {
    await prisma.aiUsageLog.create({ data: entry });
  } catch {
    // AI004 logging must never take down the actual AI feature — e.g. if
    // this batch's migration hasn't been applied yet in this environment.
  }
}

// AI002 — Model management. A DB-backed override for which Anthropic
// model callAnthropic() calls, read fresh on every request (this table
// sees institutional-scale traffic, not web-scale — see the AI040 note
// on getAiUsageStats for the same reasoning). A fresh install with no row
// yet behaves exactly as every batch before this one did: the hard-coded
// DEFAULT_MODEL_ID constant. Failing to read the config (e.g. migration
// not yet applied in this environment) falls back the same way, silently
// — model selection must never be the reason an AI feature goes down.
const DEFAULT_MODEL_ID = "claude-sonnet-4-6";

export async function getActiveModelConfig(): Promise<{ modelId: string; notes: string | null; updatedById: string | null; updatedAt: Date | null }> {
  try {
    const row = await prisma.aiModelConfig.findUnique({ where: { id: "default" } });
    if (row) return { modelId: row.modelId, notes: row.notes, updatedById: row.updatedById, updatedAt: row.updatedAt };
  } catch {
    // Table may not exist yet in this environment (migration not applied) — fall through to the default.
  }
  return { modelId: DEFAULT_MODEL_ID, notes: null, updatedById: null, updatedAt: null };
}

export async function setActiveModelConfig(modelId: string, updatedById: string, notes?: string) {
  return prisma.aiModelConfig.upsert({
    where: { id: "default" },
    create: { id: "default", modelId, notes: notes ?? null, updatedById },
    update: { modelId, notes: notes ?? null, updatedById },
  });
}

// AI003 — second provider implementation, batch 64. Previously this
// abstraction had exactly one branch ("anthropic") and selecting anything
// else failed loudly by design — a real seam, but only ever proven with a
// single implementation behind it. This adds a genuine second branch
// (OpenAI's Chat Completions API — plain HTTPS+JSON, no new npm
// dependency, same "zero new dependencies" discipline batch 63 held to)
// so AI_PROVIDER=openai is real, working code, not just a documented
// intention. Like every other externally-credentialed branch in this
// gateway, it has never executed against a real key in this sandbox (no
// network access) — set OPENAI_API_KEY and AI_PROVIDER=openai to use it.
async function callOpenAi(params: AiCallParams, apiKey: string, modelId: string): Promise<AiCallResult> {
  const modelRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(aiTimeoutMs()),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: params.maxTokens,
      messages: [{ role: "system", content: params.system }, ...params.messages],
    }),
  });
  if (!modelRes.ok) {
    return { ok: false, reason: "provider_error", message: `Model provider returned an error (HTTP ${modelRes.status}).` };
  }
  const data = (await modelRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data?.choices?.[0]?.message?.content;
  if (!text) return { ok: false, reason: "provider_error", message: "The model returned no usable text." };
  return { ok: true, text };
}

const DEFAULT_OPENAI_MODEL_ID = "gpt-4o-mini";

// AI037 — real trained-classifier upgrade path. The regex heuristic in
// screenUserInput() above stays the always-on, zero-credential baseline
// (it must, since not every deployment will have an OpenAI key) — but when
// OPENAI_API_KEY is configured, every screened input is also checked
// against OpenAI's real moderation model, which catches categories
// (self-harm, hate, sexual content, violence) the narrow prompt-injection
// regex list was never designed to. A moderation-endpoint failure (no
// key, network error, non-2xx) never blocks the underlying AI call — it
// only means this batch's real classifier didn't get to weigh in that
// time, same fail-open-to-the-heuristic discipline as every other
// optional-credential branch in this codebase.
async function screenWithModerationModel(text: string): Promise<{ flagged: boolean; categories?: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { flagged: false };
  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
    signal: AbortSignal.timeout(aiTimeoutMs()),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ input: text }),
    });
    if (!res.ok) return { flagged: false };
    const data = (await res.json()) as { results?: Array<{ flagged?: boolean; categories?: Record<string, boolean> }> };
    const result = data?.results?.[0];
    if (!result?.flagged) return { flagged: false };
    const categories = Object.entries(result.categories ?? {})
      .filter(([, v]) => v === true)
      .map(([k]) => k);
    return { flagged: true, categories };
  } catch {
    return { flagged: false };
  }
}

async function callAnthropic(params: AiCallParams, apiKey: string, modelId: string): Promise<AiCallResult> {
  const modelRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(aiTimeoutMs()),
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: params.messages,
    }),
  });
  if (!modelRes.ok) {
    return { ok: false, reason: "provider_error", message: `Model provider returned an error (HTTP ${modelRes.status}).` };
  }
  const data = (await modelRes.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = data?.content?.find((b: { type: string }) => b.type === "text")?.text;
  if (!text) return { ok: false, reason: "provider_error", message: "The model returned no usable text." };
  return { ok: true, text };
}

// KPERF-015 / KFX-053 — every provider call had NO timeout, so a stalled provider held the request
// (and a DB connection upstream) open indefinitely. KPERF-014 / KAI-005 — bounded concurrency with a
// bounded queue so a burst of students cannot fan out unlimited provider calls.
const envInt = (k: string, d: number) => (Number.isInteger(Number(process.env[k])) && Number(process.env[k]) > 0 ? Number(process.env[k]) : d);
function aiTimeoutMs() { return envInt("AI_TIMEOUT_MS", 60_000); }
const aiLimiter = new ConcurrencyLimiter(envInt("AI_MAX_CONCURRENCY", 8), envInt("AI_MAX_QUEUE", 50));
export const aiLimiterStats = () => aiLimiter.stats;

async function overDailyQuota(userId: string, role: string): Promise<boolean> {
  const limit = dailyAiLimit(role);
  if (limit === 0) return false;
  try {
    const used = await prisma.aiUsageLog.count({ where: { userId, success: true, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
    return used >= limit;
  } catch {
    return false; // quota lookup must never be the reason AI goes down (same discipline as logUsage)
  }
}

/**
 * The single entry point every AI-backed route calls through. Handles
 * provider selection (AI003), safety screening (AI037), and usage logging
 * (AI004) uniformly, so no individual route needs to reimplement any of it.
 */
export async function callAiModel(params: AiCallParams): Promise<AiCallResult> {
  const startedAt = Date.now();
  const promptChars = params.system.length + params.messages.reduce((s, m) => s + m.content.length, 0);

  const record = (fields: { success: boolean; blockedBySafety: boolean; errorReason: string | null; responseChars: number }) =>
    logUsage({
      feature: params.feature,
      userId: params.userId,
      role: params.role,
      latencyMs: Date.now() - startedAt,
      promptChars,
      ...fields,
    });

  if (params.screenInput) {
    const screen = screenUserInput(params.screenInput);
    // AI037 — the real classifier runs alongside the always-on heuristic,
    // never instead of it. Either one flagging the input blocks the call.
    const modelScreen = await screenWithModerationModel(params.screenInput);
    if (screen.blocked || modelScreen.flagged) {
      await record({
        success: false,
        blockedBySafety: true,
        errorReason: screen.blocked ? "blocked_by_safety" : `blocked_by_safety:moderation_model:${modelScreen.categories?.join(",")}`,
        responseChars: 0,
      });
      return {
        ok: false,
        reason: "blocked_by_safety",
        message:
          "That message looks like an attempt to override this assistant's instructions, so it wasn't sent to the model. Please rephrase your actual question.",
      };
    }
  }

  const provider = process.env.AI_PROVIDER || "anthropic";
  if (provider !== "anthropic" && provider !== "openai") {
    await record({ success: false, blockedBySafety: false, errorReason: `unconfigured_provider:${provider}`, responseChars: 0 });
    return {
      ok: false,
      reason: "unconfigured_provider",
      message: `AI_PROVIDER="${provider}" has no implementation in this gateway — only "anthropic" and "openai" are wired up.`,
    };
  }

  const apiKey = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await record({ success: false, blockedBySafety: false, errorReason: "no_api_key", responseChars: 0 });
    return { ok: false, reason: "no_api_key", message: `${provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"} is not configured.` };
  }

  if (await overDailyQuota(params.userId, params.role)) {
    await record({ success: false, blockedBySafety: false, errorReason: "quota_exceeded", responseChars: 0 });
    return { ok: false, reason: "quota_exceeded", message: "You have reached today's AI usage limit. It resets on a rolling 24-hour basis — please try again later." };
  }

  try {
    const result = await aiLimiter.run(async () =>
      provider === "openai"
        ? await callOpenAi(params, apiKey, process.env.OPENAI_MODEL_ID || DEFAULT_OPENAI_MODEL_ID)
        : await callAnthropic(params, apiKey, (await getActiveModelConfig()).modelId)
    );
    if (result.ok) {
      await record({ success: true, blockedBySafety: false, errorReason: null, responseChars: result.text.length });
    } else {
      await record({ success: false, blockedBySafety: false, errorReason: result.reason, responseChars: 0 });
    }
    return result;
  } catch (err) {
    if (err instanceof OverloadedError) {
      await record({ success: false, blockedBySafety: false, errorReason: "overloaded", responseChars: 0 });
      return { ok: false, reason: "overloaded", message: "The AI service is busy right now. Please try again in a moment." };
    }
    await record({
      success: false,
      blockedBySafety: false,
      errorReason: err instanceof Error ? err.message.slice(0, 300) : "unknown_error",
      responseChars: 0,
    });
    return { ok: false, reason: "provider_error", message: "Could not reach the model provider. Try again shortly." };
  }
}

// ---------------------------------------------------------------------------
// AI005 / AI040 — the feature catalog. Every AI-backed endpoint in the app
// is listed here once, with the (resourceType, action) pair its permission
// check uses. Two things read this: the routes below add a hasPermission
// gate using each entry's pair (closing AI005 for the routes that
// previously only had a coarse requireRole with no override), and the
// governance routes (AI040) use it to label AiUsageLog rows and to show
// the admin which RolePermission override, if any, currently applies to
// each feature.
// ---------------------------------------------------------------------------
export const AI_FEATURE_CATALOG: {
  key: string;
  label: string;
  resourceType: string;
  action: string;
}[] = [
  { key: "trainer-assist", label: "Trainer drafting (quiz / lesson plan / summary / case study)", resourceType: "AI", action: "TRAINER_ASSIST" },
  { key: "generate-quiz-questions", label: "Structured quiz question generator", resourceType: "AI", action: "TRAINER_ASSIST" },
  { key: "tutor", label: "Student AI tutor", resourceType: "AI", action: "USE_TUTOR" },
  { key: "study-planner", label: "Study planner", resourceType: "AI", action: "STUDY_PLANNER" },
  { key: "revision-assistant", label: "Revision assistant", resourceType: "AI", action: "REVISION_ASSISTANT" },
  { key: "academic-advisor", label: "Academic advisor", resourceType: "AI", action: "USE_ACADEMIC_ADVISOR" },
  { key: "registrar-assistant", label: "Registrar assistant", resourceType: "AI", action: "REGISTRAR_ASSISTANT" },
  { key: "finance-assistant", label: "Finance assistant", resourceType: "AI", action: "FINANCE_ASSISTANT" },
  { key: "admin-assistant", label: "Administrative assistant", resourceType: "AI", action: "ADMIN_ASSISTANT" },
  { key: "generate-report", label: "Institutional report generator", resourceType: "AI", action: "GENERATE_REPORT" },
  { key: "research-assistant", label: "Research assistant", resourceType: "AI", action: "RESEARCH_ASSISTANT" },
  { key: "librarian", label: "AI librarian", resourceType: "AI", action: "LIBRARIAN" },
  { key: "literature-summary", label: "Literature summarizer", resourceType: "AI", action: "LITERATURE_SUMMARY" },
  { key: "qa-assistant", label: "QA assistant", resourceType: "AI", action: "QA_ASSISTANT" },
  { key: "remediation-generator", label: "Remediation generator", resourceType: "AI", action: "REMEDIATION_GENERATOR" },
  { key: "marking-assistant", label: "Marking assistant", resourceType: "AI", action: "MARKING_ASSISTANT" },
  { key: "cv-draft", label: "CV bullet-point drafting", resourceType: "AI", action: "CV_DRAFT" },
  { key: "mock-interview", label: "Mock interview partner", resourceType: "AI", action: "MOCK_INTERVIEW" },
  { key: "semantic-search", label: "Library semantic search", resourceType: "AI", action: "SEMANTIC_SEARCH" },
  { key: "simulation", label: "Business simulation partner", resourceType: "AI", action: "SIMULATION" },
];

// AI040 — aggregate usage for the governance centre. Grouped in JS rather
// than a raw SQL GROUP BY so this stays portable and simple to read; the
// table is small enough (institutional AI traffic, not web-scale) for this
// to be fine.
export async function getAiUsageStats(sinceDays = 30) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.aiUsageLog.findMany({ where: { createdAt: { gte: since } } });

  const byFeature = new Map<string, { calls: number; successes: number; blocked: number; failures: number; totalLatencyMs: number }>();
  for (const row of rows) {
    const bucket = byFeature.get(row.feature) ?? { calls: 0, successes: 0, blocked: 0, failures: 0, totalLatencyMs: 0 };
    bucket.calls += 1;
    bucket.totalLatencyMs += row.latencyMs;
    if (row.blockedBySafety) bucket.blocked += 1;
    else if (row.success) bucket.successes += 1;
    else bucket.failures += 1;
    byFeature.set(row.feature, bucket);
  }

  const labelByKey = new Map(AI_FEATURE_CATALOG.map((f) => [f.key, f.label]));

  return {
    sinceDays,
    totalCalls: rows.length,
    totalSuccesses: rows.filter((r) => r.success).length,
    totalBlocked: rows.filter((r) => r.blockedBySafety).length,
    totalFailures: rows.filter((r) => !r.success && !r.blockedBySafety).length,
    byFeature: Array.from(byFeature.entries()).map(([feature, stats]) => ({
      feature,
      label: labelByKey.get(feature) ?? feature,
      ...stats,
      avgLatencyMs: stats.calls > 0 ? Math.round(stats.totalLatencyMs / stats.calls) : 0,
    })),
  };
}

export async function getRecentSafetyBlocks(limit = 50) {
  return prisma.aiUsageLog.findMany({
    where: { blockedBySafety: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
