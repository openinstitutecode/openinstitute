// Batch 70 — KDATA-007. The response period is configuration, not law: confirm it with your data protection officer or counsel
// (KDATA-008 legal review is still open) and set DATA_REQUEST_RESPONSE_DAYS accordingly. Default 14.
export const DATA_REQUEST_TYPES = ["access", "correction", "erasure", "restriction", "objection"] as const;
export const responseDays = (env: NodeJS.ProcessEnv = process.env) => { const n = Number(env.DATA_REQUEST_RESPONSE_DAYS); return Number.isInteger(n) && n >= 1 && n <= 90 ? n : 14; };
export const dueDateFor = (created: Date, env: NodeJS.ProcessEnv = process.env) => new Date(created.getTime() + responseDays(env) * 86_400_000);
export function requestUrgency(r: { status: string; dueAt: Date }, now = new Date()): "closed" | "overdue" | "due_soon" | "on_track" {
  if (r.status === "completed" || r.status === "rejected") return "closed";
  const days = (r.dueAt.getTime() - now.getTime()) / 86_400_000;
  return days < 0 ? "overdue" : days <= 3 ? "due_soon" : "on_track";
}
