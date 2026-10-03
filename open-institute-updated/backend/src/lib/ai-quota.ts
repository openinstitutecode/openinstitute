// Pure quota / cost helpers split out of ai-gateway.ts so they can be unit-tested without Prisma.
// KAI-004 — per-user rolling 24 h quota, counted from AiUsageLog (shared across instances).
// 0 disables. Students default lower than staff; override with AI_DAILY_LIMIT_<ROLE> or AI_DAILY_LIMIT_DEFAULT.
export function dailyAiLimit(role: string, env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[`AI_DAILY_LIMIT_${role}`] ?? env.AI_DAILY_LIMIT_DEFAULT;
  if (raw !== undefined && raw !== "" && Number.isInteger(Number(raw)) && Number(raw) >= 0) return Number(raw);
  return role === "STUDENT" ? 100 : 300;
}
// KAI-021 — rough cost estimate from character counts (~4 chars/token). Prices come from env because
// they change; with no prices configured the estimate is reported as null rather than invented.
export function estimateAiCost(promptChars: number, responseChars: number, env: NodeJS.ProcessEnv = process.env): number | null {
  const inP = Number(env.AI_COST_PER_1K_INPUT_TOKENS), outP = Number(env.AI_COST_PER_1K_OUTPUT_TOKENS);
  if (!Number.isFinite(inP) || !Number.isFinite(outP) || env.AI_COST_PER_1K_INPUT_TOKENS === undefined) return null;
  return Number((((promptChars / 4) / 1000) * inP + ((responseChars / 4) / 1000) * outP).toFixed(4));
}

