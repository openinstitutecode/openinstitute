// Batch 69 — KOBS-005/009/017: run a job once across instances (advisory lock), record it, alert admins on failure.
import { createHash } from "node:crypto";
import { prisma } from "./prisma.js";
import { logger } from "./logger.js";

const lockKey = (name: string) => BigInt(createHash("sha1").update(`kvbdtc-job:${name}`).digest().readUInt32BE(0)) + 7_000_000_000n;

export type JobOutcome<T> = { ran: false; reason: "locked" } | { ran: true; ok: true; summary: T } | { ran: true; ok: false; error: string };

export async function runJob<T extends object>(name: string, fn: () => Promise<T>, trigger: "scheduler" | "manual" = "scheduler"): Promise<JobOutcome<T>> {
  return prisma.$transaction(async (tx) => {
    const [{ locked }] = (await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${lockKey(name)}::bigint) AS locked`) as Array<{ locked: boolean }>;
    if (!locked) return { ran: false as const, reason: "locked" as const };
    const run = await prisma.scheduledJobRun.create({ data: { job: name, trigger } });
    try {
      const summary = await fn();
      await prisma.scheduledJobRun.update({ where: { id: run.id }, data: { ok: true, finishedAt: new Date(), summary: summary as object } });
      return { ran: true as const, ok: true as const, summary };
    } catch (e) {
      const error = e instanceof Error ? e.message.slice(0, 500) : "failed";
      logger.error?.(`job ${name} failed`, { error });
      await prisma.scheduledJobRun.update({ where: { id: run.id }, data: { ok: false, finishedAt: new Date(), error } });
      await alertAdmins(`Background job failed: ${name}`, error).catch(() => undefined);
      return { ran: true as const, ok: false as const, error };
    }
  }, { timeout: 10 * 60 * 1000, maxWait: 5_000 });
}

// In-app alert to technical admins; one per job per day so a failing job doesn't flood the inbox.
async function alertAdmins(title: string, body: string) {
  const since = new Date(Date.now() - 86_400_000);
  const admins = await prisma.user.findMany({ where: { role: { in: ["SUPER_ADMIN", "ICT_ADMIN"] }, isActive: true }, select: { id: true } });
  const already = await prisma.notification.findMany({ where: { title, createdAt: { gte: since }, userId: { in: admins.map((a) => a.id) } }, select: { userId: true } });
  const seen = new Set(already.map((a) => a.userId));
  const fresh = admins.filter((a) => !seen.has(a.id));
  if (fresh.length) await prisma.notification.createMany({ data: fresh.map((a) => ({ userId: a.id, channel: "in_app", title, body, sentAt: new Date() })) });
}
