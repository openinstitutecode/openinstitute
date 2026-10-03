import "dotenv/config";
// Batch 67 — validate the environment BEFORE any module reads a secret (KSEC-002 / KOPS-003).
import "./lib/boot-check.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { observability } from "./middleware/observability.js";
import { sanitizeInput } from "./middleware/sanitize-input.js";
import { installAsyncErrorForwarding, installProcessHandlers, apiNotFound, errorHandler } from "./middleware/error-handler.js";
import { parseOrigins, originChecker } from "./lib/cors-origins.js";
import { opsRouter } from "./routes/ops.js";
import { selfServiceRouter } from "./routes/self-service.js"; // Batch 68
import { insightsRouter } from "./routes/insights.js"; // Batch 68
import { settingsRouter } from "./routes/settings.js"; // Batch 69
import { searchRouter } from "./routes/search.js"; // Batch 69
import { noticesRouter } from "./routes/notices.js"; // Batch 71
import { selfService2Router } from "./routes/self-service-2.js"; // Batch 72
import { auditStudentAccess } from "./lib/access-log.js"; // Batch 74
import { startReminderScheduler, stopReminderScheduler } from "./lib/reminder-jobs.js"; // Batch 69
import { authRouter } from "./routes/auth.js";
import { applicationsRouter } from "./routes/applications.js";
import { programmesRouter } from "./routes/programmes.js";
import { complianceRouter } from "./routes/compliance.js";
import { aiRouter } from "./routes/ai.js";
import { financeRouter } from "./routes/finance.js";
import { ledgerRouter } from "./routes/ledger.js";
import { budgetRouter } from "./routes/budget.js";
import { inventoryRouter } from "./routes/inventory.js";
import { securityRouter } from "./routes/security.js";
import { reportsRouter } from "./routes/reports.js";
import { supportRouter } from "./routes/support.js";
import { credentialsRouter } from "./routes/credentials.js";
import { examsRouter } from "./routes/exams.js";
import { resultsApprovalRouter } from "./routes/results-approval.js";
import { libraryRouter } from "./routes/library.js";
import { employersRouter } from "./routes/employers.js";
import { notificationsRouter } from "./routes/notifications.js";
import { documentsRouter } from "./routes/documents.js";
import { governanceRouter } from "./routes/governance.js";
import { integrityRouter } from "./routes/integrity.js";
import { graduationRouter } from "./routes/graduation.js";
import { kuccpsRouter } from "./routes/kuccps.js";
import { regulatoryReportsRouter } from "./routes/regulatory-reports.js";
import { complaintsRouter } from "./routes/complaints.js";
import { usersRouter } from "./routes/users.js";
import { auditRouter } from "./routes/audit.js";
import { wellbeingRouter } from "./routes/wellbeing.js";
import { communityRouter } from "./routes/community.js";
import { careerRouter } from "./routes/career.js";
import { simulationRouter } from "./routes/simulation.js";
import { curriculumRouter } from "./routes/curriculum.js";
// Batch 48 — this router existed since (at least) Batch 45 but was never
// imported or mounted anywhere, so EX004/EX007 (learning-outcome mapping +
// blueprint-based exam generation) 404'd on every call. It also could not
// have been wired in as-is: it called `requireAuth()` (invoking the
// middleware immediately, at router-definition time, instead of passing
// the function) and imported `../lib/prisma` / `../middleware/auth`
// without the `.js` extension NodeNext module resolution requires — either
// would have crashed the process at import time or failed `tsc -p
// tsconfig.json` outright, taking the whole backend down with it. Both are
// fixed in routes/learning-outcomes.ts itself; this is just the mount.
import learningOutcomesRouter from "./routes/learning-outcomes.js";
import { competencyRouter } from "./routes/competency.js";
import { rplRouter } from "./routes/rpl.js";
import { appealsRouter } from "./routes/appeals.js";
import { commandCentreRouter } from "./routes/command-centre.js";
import { meRouter } from "./routes/me.js";
import { attendanceRouter, timetableRouter } from "./routes/attendance.js";
import { departmentsRouter, tasksRouter, staffRouter, calendarRouter, timetableAdminRouter, communicationRouter, permissionAuditRouter } from "./routes/organization.js";
import { feeStructureRouter, scholarshipsRouter } from "./routes/finance-support.js";
import { rubricsRouter } from "./routes/rubrics.js";
import { badgesRouter } from "./routes/badges.js";
import { forumsRouter } from "./routes/forums.js";
import { cpdRouter, interventionsRouter } from "./routes/trainer-development.js";
import { researchRouter } from "./routes/research.js";
import { studentsRouter } from "./routes/students.js";
import { trainersRouter } from "./routes/trainers.js";
import { trainerSelfRouter } from "./routes/trainer-self.js";
import { coursesRouter } from "./routes/courses.js";
import { procurementRouter } from "./routes/procurement.js";
import { contentRouter } from "./routes/content.js";
import { mediaRouter } from "./routes/media.js";
import { quizzesRouter } from "./routes/quizzes.js";
import { quizzesV2Router } from "./routes/quizzes-v2.js"; // Batch 76
import { quizAttemptsRouter } from "./routes/quiz-attempts.js"; // Batch 76
import { assignmentsV2Router } from "./routes/assignments-v2.js"; // Batch 77
import { lmsExtrasRouter } from "./routes/lms-extras.js"; // Batch 77
import { startLessonPublisher, stopLessonPublisher } from "./lib/lesson-publisher.js"; // Batch 77
import { registryRouter } from "./routes/registry.js";
import { feedbackRouter } from "./routes/feedback.js";
import { peerReviewRouter } from "./routes/peer-review.js";
// Batch 43 imports
import tutorSessionsRouter from "./routes/tutor-sessions.js";
import accessibilityRouter from "./routes/accessibility.js";
import creditTransferRouter from "./routes/credit-transfer.js";
import programmeAccreditationRouter from "./routes/programme-accreditation.js";
import examSecurityRouter from "./routes/exam-security.js";
import similarityCheckingRouter from "./routes/similarity-checking.js";
import examAccommodationsRouter from "./routes/exam-accommodations.js"; // Batch 56 — EX018 + EX034
import liveClassesRouter from "./routes/live-classes.js";
// Batch 44 imports
import semestersRouter from "./routes/semesters.js";
import dataImportRouter from "./routes/data-import.js";
import { rolePermissionsRouter } from "./routes/role-permissions.js";
import { knowledgeBaseRouter } from "./routes/knowledge-base.js";
import { dataExportRouter } from "./routes/data-export.js";
import { integrationsRouter } from "./routes/integrations.js";
import { integrationVblRouter } from "./routes/integration-vbl.js";
import { workflowsRouter } from "./routes/workflows.js";
import { decisionsRouter } from "./routes/decisions.js";
import { institutionalAnalyticsRouter } from "./routes/institutional-analytics.js";
import { moodleWebhooksRouter } from "./moodle/webhooks.js";
import { learningPathsRouter } from "./routes/learning-paths.js";
import { scormRouter } from "./routes/scorm.js";
import { xapiRouter } from "./routes/xapi.js";
import { learningAnalyticsRouter } from "./routes/learning-analytics.js";
// Batch 64
import { vivaRouter } from "./routes/viva.js";
import { courseDeliveryRouter } from "./routes/course-delivery.js";
// Batch 66
import { prisma } from "./lib/prisma.js";
import { startIntegrationScheduler, stopIntegrationScheduler } from "./integration/scheduler.js";

// Batch 67 — KFX-049: forward rejected async handlers to the error middleware instead of crashing Node.
installAsyncErrorForwarding();
installProcessHandlers();

const app = express();

// Batch 66 — behind nginx/a load balancer every request otherwise appears to come from the proxy's
// IP, which would collapse the (now Postgres-shared) rate limiter into a single bucket for ALL
// callers. Set TRUST_PROXY to the number of proxy hops in front of the API (docker-compose: 1).
// Left unset, Express does not trust X-Forwarded-For, so a client cannot spoof its IP.
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set("trust proxy", Number.isNaN(hops) ? process.env.TRUST_PROXY : hops);
}

// Batch 67 — KOBS-011/001/003 correlation id + structured access log + metrics (replaces morgan("dev")).
app.use(observability);
app.use(helmet());
// KSEC-013 — FRONTEND_ORIGIN may list several origins; exact match only.
app.use(cors({ origin: originChecker(parseOrigins(process.env.FRONTEND_ORIGIN)) as never, exposedHeaders: ["X-Request-Id", "Retry-After"] }));
// Batch 64 — FN006 card gateway webhook. Its signature verification needs
// the *raw* request bytes (Stripe signs "<timestamp>.<raw body>"), so this
// one path gets express.raw() registered ahead of the app-wide
// express.json() below — the standard, real pattern for verifying a
// webhook signature, not a workaround. Every other route is unaffected.
app.use("/api/finance/card/webhook", express.raw({ type: "application/json" }));
// Batch 65 — VBL webhook: same reasoning as the card webhook above (signature covers the raw bytes).
app.use("/api/integration/v1/webhooks/vbl", express.raw({ type: "application/json", limit: "2mb" }));
app.use(express.json({ limit: "2mb" }));
app.use(sanitizeInput); // Batch 67 — KSEC-018

app.get("/api/health", (_req, res) => res.json({ status: "ok" })); // liveness: the process is up
// Batch 66 — readiness: the process can actually reach Postgres. Point load balancers / docker
// healthchecks here; a 503 means "do not route traffic to this instance".
app.get("/api/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready" });
  } catch (err) {
    console.error("Readiness check failed", err);
    res.status(503).json({ status: "database_unreachable" });
  }
});

app.use("/api", auditStudentAccess); // Batch 74 — KDATA-006
app.use("/api/auth", authRouter);
app.use("/api/applications", applicationsRouter);
app.use("/api/programmes", programmesRouter);
app.use("/api/compliance", complianceRouter);
app.use("/api/ai", aiRouter);
app.use("/api/finance", financeRouter);
app.use("/api/ledger", ledgerRouter);
app.use("/api/budgets", budgetRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/security", securityRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/support", supportRouter);
app.use("/api/credentials", credentialsRouter);
app.use("/api/exams", examsRouter);
app.use("/api/results-approval", resultsApprovalRouter);
app.use("/api/library", libraryRouter);
app.use("/api/employers", employersRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/governance", governanceRouter);
app.use("/api/integrity", integrityRouter);
app.use("/api/graduation", graduationRouter);
app.use("/api/kuccps", kuccpsRouter);
app.use("/api/regulatory-reports", regulatoryReportsRouter);
app.use("/api/complaints", complaintsRouter);
app.use("/api/users", usersRouter);
app.use("/api/audit", auditRouter);
app.use("/api/wellbeing", wellbeingRouter);
app.use("/api/community", communityRouter);
app.use("/api/career", careerRouter);
app.use("/api/simulation", simulationRouter);
app.use("/api/curriculum", curriculumRouter);
// Batch 48 — mounted on the same prefix as curriculumRouter: its own paths
// (":unitId/learning-outcomes", "/learning-outcomes/:id", "/questions/:id/map-outcome",
// "/programmes/:id/blueprints", "/blueprints/:id") don't collide with any
// curriculumRouter path, so both routers work side by side here. No
// frontend page calls any of these endpoints yet (confirmed by search) —
// this fix makes the API reachable and correct, it does not add a UI.
app.use("/api/curriculum", learningOutcomesRouter);
app.use("/api/competency", competencyRouter);
app.use("/api/rpl", rplRouter);
app.use("/api/appeals", appealsRouter);
app.use("/api/command-centre", commandCentreRouter);
app.use("/api/me", meRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/timetable", timetableRouter);
app.use("/api/departments", departmentsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/staff", staffRouter);
app.use("/api/academic-calendar", calendarRouter);
app.use("/api/timetable-admin", timetableAdminRouter);
app.use("/api/communication", communicationRouter);
app.use("/api/permission-audit", permissionAuditRouter);
app.use("/api/fee-structure", feeStructureRouter);
app.use("/api/scholarships", scholarshipsRouter);
app.use("/api/rubrics", rubricsRouter);
app.use("/api/badges", badgesRouter);
app.use("/api/forums", forumsRouter);
app.use("/api/cpd", cpdRouter);
app.use("/api/interventions", interventionsRouter);
app.use("/api/research", researchRouter);
app.use("/api/students", studentsRouter);
app.use("/api/trainers", trainersRouter);
app.use("/api/trainer-self", trainerSelfRouter);
app.use("/api/courses", coursesRouter);
app.use("/api/procurement", procurementRouter);
app.use("/api/content", contentRouter);
app.use("/api/media", mediaRouter);
app.use("/api/quizzes", quizzesRouter);
app.use("/api/quizzes", quizzesV2Router); // Batch 76 — quiz engine v2 (marking, regrade, release, extensions, bank tools)
app.use("/api/quiz-attempts", quizAttemptsRouter); // Batch 76 — student autosave, history, review, error reports
app.use("/api/assignments", assignmentsV2Router); // Batch 77 — assignments v2 (create/submit/late/groups/grade/moderate/release)
app.use("/api/lms", lmsExtrasRouter); // Batch 77 — content tools, gradebook, progress, communication extras
app.use("/api/registry", registryRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/peer-review", peerReviewRouter);

// Batch 43 routes
app.use("/api/tutor-sessions", tutorSessionsRouter);
app.use("/api/accessibility", accessibilityRouter);
app.use("/api/credit-transfer", creditTransferRouter);
app.use("/api/programme-accreditation", programmeAccreditationRouter);
app.use("/api/exam-security", examSecurityRouter);
app.use("/api/similarity-checking", similarityCheckingRouter);
app.use("/api/exams", examAccommodationsRouter); // Batch 56 — EX018 + EX034, same prefix as examsRouter
app.use("/api/live-classes", liveClassesRouter);

// Batch 44 routes
app.use("/api/semesters", semestersRouter);
app.use("/api/data-import", dataImportRouter);

// Batch 45
app.use("/api/role-permissions", rolePermissionsRouter);
app.use("/api/knowledge-base", knowledgeBaseRouter);
app.use("/api/data-export", dataExportRouter);
app.use("/api/integrations", integrationsRouter);
// Batch 65 — Virtual Business Lab integration (VBI namespace). See
// docs/VBL_MAIN_PORTAL_INTEGRATION_API.md.
app.use("/api/integration/v1", integrationVblRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/decisions", decisionsRouter);
app.use("/api/analytics", institutionalAnalyticsRouter);
// Moodle webhook intake — authenticated by its own shared-secret header
// (see moodle/webhooks.ts), not JWT: Moodle has no application JWT to send.
app.use("/api/moodle/webhooks", moodleWebhooksRouter);

// Batch 58 — LMS-coded completeness pass
app.use("/api/learning-paths", learningPathsRouter);
app.use("/api/scorm", scormRouter);
app.use("/api/xapi", xapiRouter);
app.use("/api/learning-analytics", learningAnalyticsRouter);

// Batch 64 — AI033 (AI viva) and AI014 (course delivery/pacing plan)
app.use("/api/viva", vivaRouter);
app.use("/api/course-delivery", courseDeliveryRouter);

// Batch 67 — operations, observability & data-governance (admin-only)
app.use("/api/ops", opsRouter);
app.use("/api/self", selfServiceRouter); // Batch 68
app.use("/api/insights", insightsRouter); // Batch 68
app.use("/api/settings", settingsRouter); // Batch 69
app.use("/api/search", searchRouter); // Batch 69
app.use("/api/notices", noticesRouter); // Batch 71
app.use("/api/self", selfService2Router); // Batch 72

// Batch 67 — KARC-005 / KFX-031: unknown /api routes → JSON 404; every error → one JSON contract.
app.use("/api", apiNotFound);
app.use(errorHandler);

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const server = app.listen(port, () => {
  console.log(`Measur Business College API listening on :${port}`);
  // Batch 66 — the VBL outbox/gradebook sweep runs on its own now (integration/scheduler.ts).
  if (startIntegrationScheduler()) console.log("Integration scheduler started");
  if (startReminderScheduler()) console.log("Reminder/retention scheduler started"); // Batch 69
  if (startLessonPublisher()) console.log("Lesson/assignment publisher started"); // Batch 77
});

// Batch 66 — graceful shutdown: stop taking new requests, stop the scheduler, release DB connections.
async function shutdown(signal: string) {
  console.log(`${signal} received — shutting down`);
  stopIntegrationScheduler();
  stopReminderScheduler();
  stopLessonPublisher(); // Batch 77
  server.close(async () => {
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15_000).unref(); // do not hang forever on a stuck connection
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
