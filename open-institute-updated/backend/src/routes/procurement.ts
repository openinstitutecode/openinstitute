import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { getAccountByCode } from "../lib/ledger.js";
import { bucketAmounts } from "../lib/analytics-buckets.js";

export const procurementRouter = Router();

// Suppliers
procurementRouter.get("/suppliers", requireAuth, requireRole("FINANCE_OFFICER", "SUPER_ADMIN"), async (_req, res) => {
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  res.json(suppliers);
});

const supplierSchema = z.object({ name: z.string().min(2), contactEmail: z.string().email().optional(), contactPhone: z.string().optional() });

procurementRouter.post("/suppliers", requireAuth, requireRole("FINANCE_OFFICER", "SUPER_ADMIN"), async (req, res) => {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid supplier." });
  const supplier = await prisma.supplier.create({ data: parsed.data });
  res.status(201).json(supplier);
});

// Purchase orders
procurementRouter.get("/purchase-orders", requireAuth, requireRole("FINANCE_OFFICER", "SUPER_ADMIN"), async (_req, res) => {
  const orders = await prisma.purchaseOrder.findMany({ include: { supplier: true }, orderBy: { createdAt: "desc" } });
  res.json(orders);
});

const poSchema = z.object({ supplierId: z.string(), description: z.string().min(2), amount: z.number().positive() });

procurementRouter.post("/purchase-orders", requireAuth, requireRole("FINANCE_OFFICER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = poSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid purchase order." });
  const po = await prisma.purchaseOrder.create({
    data: { ...parsed.data, requestedById: req.user!.id },
  });
  res.status(201).json(po);
});

const poStatusSchema = z.object({ status: z.enum(["approved", "ordered", "received", "cancelled"]) });

procurementRouter.patch("/purchase-orders/:id/status", requireAuth, requireRole("FINANCE_OFFICER", "PRINCIPAL", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = poStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid status." });
  const po = await prisma.purchaseOrder.update({
    where: { id: req.params.id },
    data: {
      status: parsed.data.status,
      approvedById: parsed.data.status === "approved" ? req.user!.id : undefined,
    },
  });
  res.json(po);
});

// Expenses
procurementRouter.get("/expenses", requireAuth, requireRole("FINANCE_OFFICER", "SUPER_ADMIN"), async (_req, res) => {
  const expenses = await prisma.expense.findMany({ orderBy: { incurredAt: "desc" } });
  res.json(expenses);
});

const expenseSchema = z.object({
  category: z.enum(["utilities", "salaries", "maintenance", "supplies", "other"]),
  description: z.string().min(2),
  amount: z.number().positive(),
  incurredAt: z.string().datetime(),
});

procurementRouter.post("/expenses", requireAuth, requireRole("FINANCE_OFFICER", "SUPER_ADMIN"), async (req, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid expense." });

  const expense = await prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: { ...parsed.data, incurredAt: new Date(parsed.data.incurredAt) },
    });
    // FN022 — recorded as a liability (Accounts Payable) at creation time,
    // accrual-basis: the institution owes this regardless of when it's
    // actually paid out. /expenses/:id/pay below is what later clears it.
    const expenseAccount = await getAccountByCode("4000");
    const payable = await getAccountByCode("2000");
    await tx.journalEntry.create({
      data: {
        description: `Expense recorded — ${created.category}: ${created.description}`,
        sourceType: "expense",
        sourceId: created.id,
        expenseId: created.id,
        lines: { create: [{ debitAccountId: expenseAccount.id, creditAccountId: payable.id, amount: Number(created.amount) }] },
      },
    });
    return created;
  });

  res.status(201).json(expense);
});

// FN022 — clears the Accounts Payable liability for a specific expense:
// Dr Accounts Payable, Cr Cash. An expense with paidAt still null is what
// GET /accounts-payable below counts as outstanding.
procurementRouter.patch(
  "/expenses/:id/pay",
  requireAuth,
  requireRole("FINANCE_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const expense = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!expense) return res.status(404).json({ message: "Expense not found." });
    if (expense.paidAt) return res.status(409).json({ message: "This expense is already marked as paid." });

    const updated = await prisma.$transaction(async (tx) => {
      const payable = await getAccountByCode("2000");
      const cash = await getAccountByCode("1000");
      await tx.journalEntry.create({
        data: {
          description: `Expense paid — ${expense.category}: ${expense.description}`,
          sourceType: "expense",
          sourceId: expense.id,
          expenseId: expense.id,
          lines: { create: [{ debitAccountId: payable.id, creditAccountId: cash.id, amount: Number(expense.amount) }] },
        },
      });
      return tx.expense.update({ where: { id: expense.id }, data: { paidAt: new Date() } });
    });

    // FN037 — finance audit trail (same discipline as recordPayment/refund/
    // reversal in finance.ts): who cleared this liability, and when.
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "EXPENSE_PAID",
        entityType: "Finance",
        entityId: expense.id,
        metadata: { category: expense.category, amount: Number(expense.amount) },
      },
    });

    res.json(updated);
  }
);

// FN022 — accounts payable: the real sum of expenses recorded but not yet
// paid, grouped by category. This is the actual liability balance, not a
// separately maintained number that could drift from it.
procurementRouter.get(
  "/accounts-payable",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const unpaid = await prisma.expense.findMany({ where: { paidAt: null }, orderBy: { incurredAt: "asc" } });
    const totalPayable = unpaid.reduce((s, e) => s + Number(e.amount), 0);
    const byCategory = unpaid.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount);
      return acc;
    }, {});
    res.json({ totalPayable, byCategory, expenses: unpaid });
  }
);

// Assets
procurementRouter.get("/assets", requireAuth, requireRole("FINANCE_OFFICER", "ICT_ADMIN", "SUPER_ADMIN"), async (_req, res) => {
  const assets = await prisma.asset.findMany({ orderBy: { acquiredAt: "desc" } });
  res.json(assets);
});

const assetSchema = z.object({
  name: z.string().min(2),
  category: z.enum(["ict", "furniture", "vehicle", "equipment", "other"]),
  serialNumber: z.string().optional(),
  location: z.string().optional(),
  acquiredAt: z.string().datetime(),
  value: z.number().positive(),
});

procurementRouter.post("/assets", requireAuth, requireRole("FINANCE_OFFICER", "ICT_ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const parsed = assetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid asset." });
  const asset = await prisma.asset.create({
    data: { ...parsed.data, acquiredAt: new Date(parsed.data.acquiredAt) },
  });
  res.status(201).json(asset);
});

// FN033/FN034 — a real, computed revenue-vs-expense summary rather than a
// static illustrative report.
procurementRouter.get("/summary", requireAuth, requireRole("FINANCE_OFFICER", "PRINCIPAL", "SUPER_ADMIN"), async (_req, res) => {
  const [payments, expenses, assets, unpaidInvoices, unpaidExpenses] = await Promise.all([
    prisma.payment.aggregate({ _sum: { amount: true } }),
    prisma.expense.aggregate({ _sum: { amount: true } }),
    prisma.asset.aggregate({ _sum: { value: true } }),
    prisma.invoice.findMany({ where: { status: { in: ["unpaid", "partial", "overdue"] } } }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { paidAt: null } }),
  ]);

  const totalReceivable = unpaidInvoices.reduce((s, i) => s + (Number(i.amountDue) - Number(i.amountPaid)), 0);

  res.json({
    totalRevenue: payments._sum.amount ?? 0,
    totalExpenses: expenses._sum.amount ?? 0,
    netPosition: Number(payments._sum.amount ?? 0) - Number(expenses._sum.amount ?? 0),
    totalAssetValue: assets._sum.value ?? 0,
    accountsReceivable: totalReceivable,
    accountsPayable: unpaidExpenses._sum.amount ?? 0,
  });
});

// FN034 — Revenue analytics: the /summary route above was always a single
// point-in-time snapshot with no way to see whether the institution's
// position is improving or worsening. This buckets real Payment/Expense
// rows into calendar months using the same lib/analytics-buckets.ts logic
// AD037's institutional analytics already relies on (and is unit-tested
// there), so a real month-over-month revenue/expense/net trend, not a
// simulated one.
procurementRouter.get(
  "/revenue-trend",
  requireAuth,
  requireRole("FINANCE_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (req, res) => {
    const months = Math.min(24, Math.max(3, Number(req.query.months) || 12));
    const [payments, expenses] = await Promise.all([
      prisma.payment.findMany({ where: { reversedAt: null }, select: { paidAt: true, amount: true } }),
      prisma.expense.findMany({ select: { incurredAt: true, amount: true } }),
    ]);

    const revenueByMonth = bucketAmounts(
      payments.map((p) => ({ date: p.paidAt, amount: Number(p.amount) })),
      months
    );
    const expensesByMonth = bucketAmounts(
      expenses.map((e) => ({ date: e.incurredAt, amount: Number(e.amount) })),
      months
    );
    const expenseByMonthMap = new Map(expensesByMonth.map((e) => [e.month, e.total]));

    const trend = revenueByMonth.map((r) => {
      const expenseTotal = expenseByMonthMap.get(r.month) ?? 0;
      return { month: r.month, revenue: r.total, expenses: expenseTotal, net: Math.round((r.total - expenseTotal) * 100) / 100 };
    });

    res.json({ months, trend });
  }
);

// ---------------------------------------------------------------------------
// FN035 — programme economics: real revenue collected for a programme's
// students, minus expenses actually tagged to that programme. Honest about
// its limit: institution-wide overhead (an Expense with no programmeId) is
// reported separately as "unallocated" rather than force-split across
// programmes with an invented allocation formula.
// ---------------------------------------------------------------------------
procurementRouter.get(
  "/programme-economics",
  requireAuth,
  requireRole("FINANCE_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const programmes = await prisma.programme.findMany({
      include: { students: { include: { user: true } }, expenses: true },
    });

    const rows = await Promise.all(
      programmes.map(async (p) => {
        const invoices = await prisma.invoice.findMany({ where: { student: { programmeId: p.id } } });
        const revenue = invoices.reduce((s, i) => s + Number(i.amountPaid), 0);
        const directExpenses = p.expenses.reduce((s, e) => s + Number(e.amount), 0);
        return {
          programmeId: p.id,
          programmeName: p.name,
          enrolledCount: p.students.length,
          revenueCollected: revenue,
          directExpenses,
          netContribution: revenue - directExpenses,
        };
      })
    );

    const unallocatedExpenses = await prisma.expense.aggregate({
      _sum: { amount: true },
      where: { programmeId: null },
    });

    res.json({ byProgramme: rows, unallocatedInstitutionalExpenses: unallocatedExpenses._sum.amount ?? 0 });
  }
);

// ---------------------------------------------------------------------------
// FN036 — cash-flow forecasting. Honest about what this is: a simple,
// point-in-time projection over REAL scheduled amounts already on record
// (installment due dates for expected inflow, unpaid expenses for expected
// outflow) — not a statistical or trend-based forecast model. If nothing
// is scheduled, the projection is empty rather than invented.
// ---------------------------------------------------------------------------
procurementRouter.get(
  "/cashflow-forecast",
  requireAuth,
  requireRole("FINANCE_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 86400000);

    const upcomingInstallments = await prisma.installmentScheduleItem.findMany({
      where: { paidAt: null, dueDate: { gte: now, lte: in90Days } },
      orderBy: { dueDate: "asc" },
    });
    const unpaidExpenses = await prisma.expense.findMany({
      where: { paidAt: null },
      orderBy: { incurredAt: "asc" },
    });

    const expectedInflow = upcomingInstallments.reduce((s, i) => s + Number(i.amount), 0);
    const expectedOutflow = unpaidExpenses.reduce((s, e) => s + Number(e.amount), 0);

    res.json({
      windowDays: 90,
      expectedInflow,
      expectedOutflow,
      projectedNetChange: expectedInflow - expectedOutflow,
      upcomingInstallments,
      unpaidExpenses,
      note: "Simple point-in-time projection over scheduled installments and recorded-but-unpaid expenses — not a trend-based or statistical forecast.",
    });
  }
);
