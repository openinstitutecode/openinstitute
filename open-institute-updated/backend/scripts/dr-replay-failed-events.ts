// VBI050 — Integration Disaster Recovery (portal side). Mirrors
// tools/dr_replay_failed_events.py on the VBL side exactly: once whatever
// caused a batch of PORTAL_TO_VBL events to exhaust their retries and
// become DEAD_LETTER is actually fixed, bulk-reset them to PENDING so the
// next dispatchPendingEvents() pass (or a scheduled worker calling it)
// picks them all back up. Nothing here is new logic — same status
// transition the single-event POST /outbox/:eventId/requeue route uses.
//
// Usage: npx tsx scripts/dr-replay-failed-events.ts [--dry-run]
//
// Batch 66: also clears nextAttemptAt so a replayed event is due immediately, and the scheduler
// (integration/scheduler.ts) delivers it on its next tick without anyone calling /outbox/dispatch.
import { prisma } from "../src/lib/prisma.js";

async function replay(dryRun: boolean) {
  const events = await prisma.integrationEvent.findMany({ where: { direction: "PORTAL_TO_VBL", status: "DEAD_LETTER" }, orderBy: { createdAt: "asc" } });
  console.log(`Found ${events.length} DEAD_LETTER outbound event(s).`);
  const requeued: string[] = [];
  for (const event of events) {
    if (dryRun) {
      console.log(`  [dry-run] would requeue ${event.eventId} (${event.eventType}, ${event.attempts} attempts, lastError=${event.lastError ?? "none"})`);
      continue;
    }
    await prisma.integrationEvent.update({ where: { id: event.id }, data: { status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: null } });
    requeued.push(event.eventId);
    console.log(`  requeued ${event.eventId} (${event.eventType})`);
  }
  if (!dryRun) console.log(`Requeued ${requeued.length} event(s). The scheduler will deliver them on its next tick (or POST /scheduler/run).`);
  return requeued;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  await replay(dryRun);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
