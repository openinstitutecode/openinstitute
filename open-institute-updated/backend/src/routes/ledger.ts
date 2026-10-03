import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { ensureDefaultAccounts, computeTrialBalance, postJournalEntryLines, UnbalancedEntryError } from "../lib/ledger.js";

export const ledgerRouter = Router();

// FN024 — chart of accounts. Seeded lazily so this always has the default
// five accounts even before any transaction has posted.
ledgerRouter.get(
  "/accounts",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    await ensureDefaultAccounts();
    const accounts = await prisma.chartOfAccount.findMany({ orderBy: { code: "asc" } });
    res.json(accounts);
  }
);

const newAccountSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
});

ledgerRouter.post(
  "/accounts",
  requireAuth,
  requireRole("FINANCE_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = newAccountSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide a code, name, and account type." });
    const account = await prisma.chartOfAccount.create({ data: parsed.data }).catch(() => null);
    if (!account) return res.status(409).json({ message: "An account with that code already exists." });
    res.status(201).json(account);
  }
);

// FN023 — general ledger: a real trial balance computed from every posted
// journal line. `balanced` is a genuine check (total debits == total
// credits across the whole ledger), not a cosmetic status.
ledgerRouter.get(
  "/trial-balance",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const result = await computeTrialBalance();
    res.json(result);
  }
);

ledgerRouter.get(
  "/entries",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const entries = await prisma.journalEntry.findMany({
      include: { lines: { include: { debitAccount: true, creditAccount: true } } },
      orderBy: { date: "desc" },
      take: 200,
    });
    res.json(entries);
  }
);

// Manual journal entry (e.g. an adjusting entry) — the same balance
// enforcement as every auto-posted entry, no exception for humans.
const manualEntrySchema = z.object({
  description: z.string().min(3),
  lines: z
    .array(
      z.object({
        debitAccountId: z.string().optional(),
        creditAccountId: z.string().optional(),
        amount: z.number().positive(),
      })
    )
    .min(1),
});

ledgerRouter.post(
  "/entries",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = manualEntrySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide a description and at least one balanced line." });

    try {
      const entry = await postJournalEntryLines({
        description: parsed.data.description,
        postedById: req.user!.id,
        sourceType: "manual",
        lines: parsed.data.lines,
      });
      // FN037 — finance audit trail (same discipline as the other finance
      // mutation points). A manual adjusting entry is exactly the kind of
      // action an audit trail exists for.
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "MANUAL_JOURNAL_ENTRY",
          entityType: "Finance",
          entityId: entry.id,
          metadata: { description: parsed.data.description, lineCount: parsed.data.lines.length },
        },
      });
      res.status(201).json(entry);
    } catch (err) {
      if (err instanceof UnbalancedEntryError) {
        return res.status(400).json({ message: err.message });
      }
      throw err;
    }
  }
);

// FN037 — finance audit trail: a real, filterable "who did what, when"
// view over the AuditLog rows the finance routes now write (payments,
// refunds, reversals, expense payments, manual journal entries) — distinct
// from GET /entries above, which lists the accounting journal lines
// themselves rather than the actor who triggered them.
ledgerRouter.get(
  "/audit-trail",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const action = typeof req.query.action === "string" ? req.query.action : undefined;
    const entries = await prisma.auditLog.findMany({
      where: { entityType: "Finance", ...(action ? { action } : {}) },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json(entries);
  }
);
// (not a specific proprietary accounting-software import format like
// QuickBooks IIF, since faithfully implementing one of those without a
// real target system to test against would be a false claim).
ledgerRouter.get(
  "/export.csv",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const entries = await prisma.journalEntry.findMany({
      include: { lines: { include: { debitAccount: true, creditAccount: true } } },
      orderBy: { date: "asc" },
    });
    const rows = ["Date,Description,Account,Debit,Credit"];
    for (const e of entries) {
      for (const l of e.lines) {
        if (l.debitAccount) {
          rows.push(`${e.date.toISOString()},"${e.description}",${l.debitAccount.code} ${l.debitAccount.name},${l.amount},`);
        }
        if (l.creditAccount) {
          rows.push(`${e.date.toISOString()},"${e.description}",${l.creditAccount.code} ${l.creditAccount.name},,${l.amount}`);
        }
      }
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=ledger-export.csv");
    res.send(rows.join("\n"));
  }
);
