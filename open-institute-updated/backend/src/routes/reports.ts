import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { REPORT_ROLES } from "../lib/access.js";
import { runSavedReport } from "../lib/report-runner.js";

export const reportsRouter = Router();

// ---------------------------------------------------------------------------
// AD035 — report builder: a saved report definition (which entity, which
// filters) that can be run on demand, returning real data for that
// entity — not a static mockup of what a report "would" look like.
// ---------------------------------------------------------------------------
const reportSchema = z.object({
  name: z.string().min(2),
  entity: z.enum(["students", "finance", "compliance", "research"]),
  filters: z.record(z.any()).optional(),
});

reportsRouter.post(
  "/",
  requireAuth,
  requireRole("PRINCIPAL", "REGISTRAR", "FINANCE_OFFICER", "QA_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide name and entity." });
    const report = await prisma.savedReport.create({ data: { ...parsed.data, createdById: req.user!.id } });
    res.status(201).json(report);
  }
);

reportsRouter.get("/", requireAuth, async (_req: AuthedRequest, res) => {
  const reports = await prisma.savedReport.findMany({ orderBy: { createdAt: "desc" } });
  res.json(reports);
});

// Runs a saved report's entity query for real, right now — the only
// "execution" this system performs; nothing here is scheduled to run
// unattended (batch 70: the scheduled-reports job in lib/reminder-jobs.ts now notifies subscribers).
reportsRouter.get("/:id/run", requireAuth, requireRole(...REPORT_ROLES), async (req: AuthedRequest, res) => {
  const report = await prisma.savedReport.findUnique({ where: { id: req.params.id } });
  if (!report) return res.status(404).json({ message: "Report not found." });

  const data = await runSavedReport(report.entity);

  await prisma.scheduledReportSubscription.updateMany({
    where: { reportId: report.id },
    data: { lastRunAt: new Date() },
  });

  res.json({ report: { name: report.name, entity: report.entity }, rowCount: data.length, data });
});

// ---------------------------------------------------------------------------
// AD036 — "scheduled" reports. Honest about the limit here: this sandbox
// has no cron/scheduler (the same limitation already documented for
// FN020's payment reminders), so a subscription only records who wants a
// report and how often — it is never claimed to fire automatically. A
// real deployment would put GET /:id/run above behind an actual
// scheduler using this table's rows as its configuration.
// ---------------------------------------------------------------------------
const subscriptionSchema = z.object({ reportId: z.string(), frequency: z.enum(["daily", "weekly", "monthly"]) });

reportsRouter.post("/subscriptions", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = subscriptionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide reportId and frequency." });
  const subscription = await prisma.scheduledReportSubscription.create({
    data: { ...parsed.data, recipientId: req.user!.id },
  });
  res.status(201).json(subscription);
});

reportsRouter.get("/subscriptions/mine", requireAuth, async (req: AuthedRequest, res) => {
  const subscriptions = await prisma.scheduledReportSubscription.findMany({
    where: { recipientId: req.user!.id },
    include: { report: { select: { name: true, entity: true } } },
  });
  res.json(subscriptions);
});
