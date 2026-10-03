// Batch 67 — read-only operations & data-governance endpoints for administrators.
//   KOBS-003 / KOBS-014  GET /metrics, /metrics.prom        request latency, error rate, memory/CPU/event-loop
//   KOBS-019 / KFEAT-075 GET /health/deps                   dependency + integration status overview
//   KDB-005              (DB latency inside /health/deps)
//   KAI-005 / KAI-021    GET /ai/status                     limiter state + estimated cost by feature
//   KDATA-001            GET /data-classification           per-model data classes from the live schema
//   KFEAT-069            GET /duplicates/students           duplicate-record candidates
//   KFEAT-053            GET /financial-exceptions          duplicate / overpaid / drifted payments
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { snapshot, toPrometheus } from "../lib/metrics.js";
import { aiLimiterStats, estimateAiCost } from "../lib/ai-gateway.js";
import { classifyModels } from "../lib/data-classification.js";
import { groupDuplicateStudents, findDuplicatePayments, invoiceAnomalies } from "../lib/ops-analysis.js";

export const opsRouter = Router();

const TECH = ["SUPER_ADMIN", "ICT_ADMIN", "PRINCIPAL"];
const configured = (...keys: string[]) => keys.every((k) => Boolean(process.env[k]));

opsRouter.get("/metrics", requireAuth, requireRole(...TECH), (_req, res) => res.json(snapshot()));

// Prometheus scrape: either a signed-in technical admin, or a scraper presenting METRICS_TOKEN.
opsRouter.get("/metrics.prom", (req, res, next) => {
  const token = process.env.METRICS_TOKEN;
  if (token && req.headers["x-metrics-token"] === token) return res.type("text/plain").send(toPrometheus());
  return requireAuth(req, res, () => requireRole(...TECH)(req, res, () => res.type("text/plain").send(toPrometheus())));
});

opsRouter.get("/health/deps", requireAuth, requireRole(...TECH), async (_req, res) => {
  const t0 = Date.now();
  let db: { ok: boolean; latencyMs: number; error?: string };
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = { ok: true, latencyMs: Date.now() - t0 };
  } catch (e) {
    db = { ok: false, latencyMs: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" };
  }
  // "configured" = credentials/URL present. It does NOT prove the remote service is reachable.
  const integrations = {
    ai: { configured: process.env.AI_PROVIDER === "openai" ? configured("OPENAI_API_KEY") : configured("ANTHROPIC_API_KEY"), provider: process.env.AI_PROVIDER ?? "anthropic" },
    moodle: { configured: configured("MOODLE_BASE_URL", "MOODLE_WS_TOKEN") },
    virtualBusinessLab: { configured: configured("VBL_INTEGRATION_URL"), schedulerEnabled: process.env.INTEGRATION_SCHEDULER_ENABLED ?? "auto" },
    email: { configured: configured("SMTP_HOST", "SMTP_USER", "SMTP_PASS") },
    mpesa: { configured: configured("DARAJA_CONSUMER_KEY", "DARAJA_CONSUMER_SECRET", "DARAJA_SHORTCODE") },
    card: { configured: configured("CARD_GATEWAY_SECRET_KEY") },
    liveClasses: { configured: configured("BBB_SERVER_URL", "BBB_SHARED_SECRET") },
    analyticsPseudonymSecret: { configured: (process.env.ANALYTICS_PSEUDONYM_SECRET ?? "").length >= 32 }, // Batch 69 — required in production for /insights/pseudonymised-results
    reminderScheduler: { configured: process.env.REMINDER_SCHEDULER_ENABLED === "true" },
  };
  const status = !db.ok ? "down" : "up";
  res.status(db.ok ? 200 : 503).json({ status, checkedAt: new Date().toISOString(), database: db, integrations, ai: aiLimiterStats(), uptimeSeconds: Math.round(process.uptime()) });
});

opsRouter.get("/ai/status", requireAuth, requireRole(...TECH, "QA_OFFICER"), async (_req, res) => {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await prisma.aiUsageLog.groupBy({ by: ["feature"], where: { createdAt: { gte: since } }, _count: { _all: true }, _sum: { promptChars: true, responseChars: true } });
  const features = rows.map((r) => ({
    feature: r.feature,
    calls: r._count._all,
    promptChars: r._sum.promptChars ?? 0,
    responseChars: r._sum.responseChars ?? 0,
    estimatedCost: estimateAiCost(r._sum.promptChars ?? 0, r._sum.responseChars ?? 0),
  }));
  const costs = features.map((f) => f.estimatedCost);
  res.json({
    windowDays: 30,
    limiter: aiLimiterStats(),
    features,
    totalEstimatedCost: costs.every((c) => c !== null) && costs.length ? Number(costs.reduce((a, c) => a + (c as number), 0).toFixed(4)) : null,
    note: "Cost is an estimate from character counts (~4 chars/token) and AI_COST_PER_1K_* env prices; null when prices are not configured.",
  });
});

opsRouter.get("/data-classification", requireAuth, requireRole("SUPER_ADMIN", "ICT_ADMIN", "PRINCIPAL", "QA_OFFICER", "AUDITOR"), (req, res) => {
  const all = classifyModels(Prisma.dmmf.datamodel.models.map((m) => ({ name: m.name, fields: m.fields.map((f) => ({ name: f.name, kind: f.kind })) })));
  const only = typeof req.query.model === "string" ? req.query.model : undefined;
  const summary: Record<string, number> = {};
  for (const m of all) summary[m.highestSensitivity] = (summary[m.highestSensitivity] ?? 0) + 1;
  res.json({ modelsByHighestSensitivity: summary, models: only ? all.filter((m) => m.model === only) : all.map(({ model, highestSensitivity }) => ({ model, highestSensitivity })) });
});

opsRouter.get("/duplicates/students", requireAuth, requireRole("SUPER_ADMIN", "REGISTRAR", "ADMISSIONS_OFFICER", "ICT_ADMIN"), async (_req, res) => {
  const LIMIT = 20000;
  const rows = await prisma.student.findMany({ select: { id: true, studentNumber: true, fullName: true, programmeId: true, intake: true }, take: LIMIT + 1 });
  const groups = groupDuplicateStudents(rows.slice(0, LIMIT));
  res.json({ groups, groupCount: groups.length, scanned: Math.min(rows.length, LIMIT), truncated: rows.length > LIMIT, note: "Candidates for human review (same normalised name, programme and intake). Nothing is merged automatically." });
});

opsRouter.get("/financial-exceptions", requireAuth, requireRole("SUPER_ADMIN", "FINANCE_OFFICER", "ACCOUNTANT", "PRINCIPAL", "AUDITOR"), async (_req, res) => {
  const now = new Date();
  const recent = await prisma.payment.findMany({ where: { reversedAt: null, paidAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }, select: { id: true, invoiceId: true, amount: true, paidAt: true, reference: true }, take: 20000 });
  const invoices = await prisma.invoice.findMany({ where: { amountPaid: { gt: 0 } }, select: { id: true, amountDue: true, amountPaid: true, payments: { where: { reversedAt: null }, select: { amount: true } } }, orderBy: { createdAt: "desc" }, take: 5000 });
  const { overpaid, mismatched } = invoiceAnomalies(invoices.map((i) => ({ id: i.id, amountDue: Number(i.amountDue), amountPaid: Number(i.amountPaid), livePaymentsTotal: i.payments.reduce((a, p) => a + Number(p.amount), 0) })));
  const overdue = await prisma.invoice.count({ where: { status: { not: "paid" }, dueDate: { lt: now } } });
  res.json({
    generatedAt: now.toISOString(),
    possibleDuplicatePayments: findDuplicatePayments(recent.map((p) => ({ ...p, amount: Number(p.amount) }))),
    overpaidInvoices: overpaid,
    invoicesWhoseTotalDiffersFromPayments: mismatched,
    overdueUnpaidInvoiceCount: overdue,
    note: "Detection only — nothing is corrected automatically. Payments window: last 30 days; invoices: most recent 5,000 with a payment.",
  });
});
