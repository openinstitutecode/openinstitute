import { prisma } from "../lib/prisma.js";

// VBI037/038 — Integration Health / Synchronization Dashboard read model. One function, no HTTP,
// so the numbers an admin sees are testable independently of the route that serves them.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any; // a PrismaClient (default) or a transaction client

const STATUSES = ["PENDING", "PROCESSING", "SENT", "RECEIVED", "FAILED", "DEAD_LETTER", "DUPLICATE_IGNORED"] as const;
const DIRECTIONS = ["PORTAL_TO_VBL", "VBL_TO_PORTAL"] as const;

export async function buildDashboard(db: Db = prisma, now: Date = new Date()) {
  const eventCounts: Record<string, Record<string, number>> = {};
  for (const direction of DIRECTIONS) {
    eventCounts[direction] = {};
    for (const status of STATUSES) {
      eventCounts[direction][status] = await db.integrationEvent.count({ where: { direction, status } });
    }
  }

  const oldestPending = await db.integrationEvent.findFirst({
    where: { direction: "PORTAL_TO_VBL", status: { in: ["PENDING", "FAILED"] } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, eventType: true },
  });
  const lastSent = await db.integrationEvent.findFirst({ where: { direction: "PORTAL_TO_VBL", status: "SENT" }, orderBy: { processedAt: "desc" }, select: { processedAt: true } });
  const lastReceived = await db.integrationEvent.findFirst({ where: { direction: "VBL_TO_PORTAL", status: "RECEIVED" }, orderBy: { processedAt: "desc" }, select: { processedAt: true } });
  const lastFailure = await db.integrationEvent.findFirst({ where: { status: { in: ["FAILED", "DEAD_LETTER"] } }, orderBy: { updatedAt: "desc" }, select: { lastError: true, eventType: true, updatedAt: true } });

  const [studentsMapped, staffMapped, unitsMapped, activeCredentials, gradebookMappings, competencyMappings] = await Promise.all([
    db.integrationStudentMapping.count({ where: { labUserId: { not: null } } }),
    db.integrationStaffMapping.count({ where: { labUserId: { not: null } } }),
    db.integrationCourseMapping.count(),
    db.integrationCredential.count({ where: { status: "ACTIVE" } }),
    db.integrationGradebookMapping.count(),
    db.integrationCompetencyMapping.count(),
  ]);

  const labResults: Record<string, number> = {};
  for (const status of ["PENDING_APPROVAL", "APPROVED", "REJECTED", "REVERSED"]) {
    labResults[status] = await db.virtualLabAssessmentResult.count({ where: { status } });
  }
  const approvedUnposted = await db.virtualLabAssessmentResult.count({ where: { status: "APPROVED", postedAt: null } });
  const [labActivities, rubricMappings, recentActivityRows] = await Promise.all([
    db.virtualLabActivity.count(),
    db.integrationRubricCriterionMapping.count(),
    db.virtualLabActivity.groupBy({ by: ["activityType"], _count: { _all: true }, orderBy: { _count: { activityType: "desc" } }, take: 10 }),
  ]);

  const oldestPendingAgeSeconds = oldestPending ? Math.max(0, Math.round((now.getTime() - new Date(oldestPending.createdAt).getTime()) / 1000)) : null;
  const deadLetters = eventCounts.PORTAL_TO_VBL.DEAD_LETTER + eventCounts.VBL_TO_PORTAL.DEAD_LETTER;
  const failed = eventCounts.PORTAL_TO_VBL.FAILED + eventCounts.VBL_TO_PORTAL.FAILED;
  // A simple, explainable traffic-light: RED if anything is dead-lettered, AMBER if anything is
  // failing/backlogged or approved results are stuck unposted, otherwise GREEN.
  const health = deadLetters > 0 ? "RED" : failed > 0 || approvedUnposted > 0 || (oldestPendingAgeSeconds ?? 0) > 900 ? "AMBER" : "GREEN";

  return {
    health,
    eventCounts,
    oldestPendingAgeSeconds,
    oldestPendingEventType: oldestPending?.eventType ?? null,
    lastSentToLab: lastSent?.processedAt ?? null,
    lastReceivedFromLab: lastReceived?.processedAt ?? null,
    lastFailure: lastFailure ? { eventType: lastFailure.eventType, error: lastFailure.lastError, at: lastFailure.updatedAt } : null,
    mappings: { students: studentsMapped, staff: staffMapped, units: unitsMapped, gradebook: gradebookMappings, competency: competencyMappings, rubricCriteria: rubricMappings },
    activity: { total: labActivities, byType: recentActivityRows.map((r: { activityType: string; _count: { _all: number } }) => ({ activityType: r.activityType, count: r._count._all })) },
    activeCredentials,
    labResults,
    approvedUnposted,
  };
}

// VBI038 — the paged event ledger behind the admin Synchronization Dashboard. Keyset pagination
// on (createdAt, id) so a page never skips or repeats rows while new events keep arriving.
export interface EventListFilter {
  direction?: string;
  status?: string;
  eventType?: string;
  take?: number;
  cursor?: string; // id of the last row of the previous page
}

export async function listEvents(filter: EventListFilter, db: Db = prisma) {
  const take = Math.min(Math.max(filter.take ?? 50, 1), 200);
  const rows = await db.integrationEvent.findMany({
    where: {
      ...(filter.direction ? { direction: filter.direction } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.eventType ? { eventType: filter.eventType } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    select: { id: true, eventId: true, direction: true, eventType: true, entityType: true, entityId: true, status: true, attempts: true, lastError: true, nextAttemptAt: true, processedAt: true, createdAt: true },
  });
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  return { events: page, nextCursor: hasMore ? page[page.length - 1].id : null };
}
