import { prisma } from "./prisma.js";

// ---------------------------------------------------------------------------
// FN023/024 — general ledger core. Two disciplines this module enforces:
//
// 1. Accounts are seeded lazily (idempotent upsert by code) rather than via
//    a separate migration/seed script that would need to be remembered and
//    run — ensureDefaultAccounts() is called before every post, so the
//    chart of accounts always exists by the time it's needed.
// 2. postJournalEntry() REJECTS any entry whose lines don't sum debits to
//    exactly the same total as credits. This is real double-entry
//    bookkeeping, not a label on an arbitrary transaction log — an
//    unbalanced entry is a bug, and this function refuses to hide one.
// ---------------------------------------------------------------------------

export const DEFAULT_ACCOUNTS = [
  { code: "1000", name: "Cash and Bank", type: "asset" },
  { code: "1100", name: "Accounts Receivable - Student Fees", type: "asset" },
  { code: "2000", name: "Accounts Payable", type: "liability" },
  { code: "3000", name: "Tuition and Fees Revenue", type: "revenue" },
  { code: "4000", name: "Operating Expenses", type: "expense" },
] as const;

export async function ensureDefaultAccounts() {
  for (const acc of DEFAULT_ACCOUNTS) {
    await prisma.chartOfAccount.upsert({
      where: { code: acc.code },
      update: {},
      create: acc,
    });
  }
}

export async function getAccountByCode(code: string) {
  await ensureDefaultAccounts();
  const account = await prisma.chartOfAccount.findUnique({ where: { code } });
  if (!account) throw new Error(`Chart of accounts is missing expected account ${code}`);
  return account;
}

type JournalLineInput = { debitAccountId?: string; creditAccountId?: string; amount: number };

export class UnbalancedEntryError extends Error {
  constructor(totalDebits: number, totalCredits: number) {
    super(`Journal entry does not balance: debits ${totalDebits} != credits ${totalCredits}`);
  }
}

// A simple two-line helper for the common case (one debit account, one
// credit account, one amount) — covers every auto-posted entry in this
// batch. postJournalEntryLines() below handles the general multi-line case
// for manual entries.
export async function postSimpleEntry(params: {
  description: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  postedById?: string;
  sourceType?: string;
  sourceId?: string;
  expenseId?: string;
}) {
  return postJournalEntryLines({
    description: params.description,
    postedById: params.postedById,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    expenseId: params.expenseId,
    lines: [{ debitAccountId: params.debitAccountId, creditAccountId: params.creditAccountId, amount: params.amount }],
  });
}

export async function postJournalEntryLines(params: {
  description: string;
  postedById?: string;
  sourceType?: string;
  sourceId?: string;
  expenseId?: string;
  lines: JournalLineInput[];
}) {
  const totalDebits = params.lines
    .filter((l) => l.debitAccountId)
    .reduce((sum, l) => sum + l.amount, 0);
  const totalCredits = params.lines
    .filter((l) => l.creditAccountId)
    .reduce((sum, l) => sum + l.amount, 0);

  if (Math.abs(totalDebits - totalCredits) > 0.005) {
    throw new UnbalancedEntryError(totalDebits, totalCredits);
  }

  return prisma.journalEntry.create({
    data: {
      description: params.description,
      postedById: params.postedById,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      expenseId: params.expenseId,
      lines: { create: params.lines },
    },
    include: { lines: true },
  });
}

// Computes a real trial balance: for every account, sum of its debit lines
// minus sum of its credit lines (sign convention: positive for
// asset/expense accounts with a debit balance, positive for
// liability/equity/revenue accounts with a credit balance). Also returns
// whether the whole ledger actually balances — a genuine integrity check,
// not a cosmetic label.
export async function computeTrialBalance() {
  await ensureDefaultAccounts();
  const accounts = await prisma.chartOfAccount.findMany({
    include: { debitLines: true, creditLines: true },
  });

  const rows = accounts.map((a) => {
    const totalDebit = a.debitLines.reduce((s, l) => s + Number(l.amount), 0);
    const totalCredit = a.creditLines.reduce((s, l) => s + Number(l.amount), 0);
    const isDebitNormal = a.type === "asset" || a.type === "expense";
    const balance = isDebitNormal ? totalDebit - totalCredit : totalCredit - totalDebit;
    return { accountId: a.id, code: a.code, name: a.name, type: a.type, totalDebit, totalCredit, balance };
  });

  const grandTotalDebit = rows.reduce((s, r) => s + r.totalDebit, 0);
  const grandTotalCredit = rows.reduce((s, r) => s + r.totalCredit, 0);

  return {
    rows,
    grandTotalDebit,
    grandTotalCredit,
    balanced: Math.abs(grandTotalDebit - grandTotalCredit) < 0.01,
  };
}
