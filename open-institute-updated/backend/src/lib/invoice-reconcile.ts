// Batch 69 — KFX-026/KFEAT-044: what an invoice's paid amount and status SHOULD be, from its non-reversed payments.
export function planInvoiceFix(
  inv: { amountDue: unknown; amountPaid: unknown; status: string; dueDate: Date },
  payments: { amount: unknown; reversedAt?: Date | null }[],
  now = new Date()
): { amountPaid: number; status: string; previous: { amountPaid: number; status: string } } | null {
  const due = Number(inv.amountDue), had = Number(inv.amountPaid);
  const paid = Math.round(payments.filter((p) => !p.reversedAt).reduce((a, p) => a + Number(p.amount), 0) * 100) / 100;
  // "overdue" is set by the overdue sweep; keep it while the invoice is still unpaid and past due so we don't fight that job.
  const status = paid >= due ? "paid" : inv.status === "overdue" && inv.dueDate < now ? "overdue" : paid > 0 ? "partial" : "unpaid";
  if (Math.abs(paid - had) < 0.005 && status === inv.status) return null;
  return { amountPaid: paid, status, previous: { amountPaid: had, status: inv.status } };
}
