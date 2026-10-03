// Pure helpers behind the read-only admin analysis endpoints (routes/ops.ts).

// KFEAT-069 — duplicate-record detection. Groups students that share a normalised name within the same
// programme + intake. Candidates for review, never auto-merged.
export type StudentLite = { id: string; studentNumber: string; fullName: string; programmeId: string; intake: string };
export const normaliseName = (n: string) => n.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean).sort().join(" ");

export function groupDuplicateStudents(rows: StudentLite[]): { key: string; students: StudentLite[] }[] {
  const groups = new Map<string, StudentLite[]>();
  for (const r of rows) {
    const name = normaliseName(r.fullName);
    if (!name) continue;
    const key = `${name}|${r.programmeId}|${r.intake}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  return [...groups.entries()].filter(([, v]) => v.length > 1).map(([key, students]) => ({ key, students }));
}

// KFEAT-053 (+ KFX-026 detection) — financial exceptions.
export type PaymentLite = { id: string; invoiceId: string; amount: number; paidAt: Date; reference: string };
export type InvoiceLite = { id: string; amountDue: number; amountPaid: number; livePaymentsTotal: number };

/** Same invoice + same amount within `windowMinutes` of each other: likely a double submit / double webhook. */
export function findDuplicatePayments(payments: PaymentLite[], windowMinutes = 10): PaymentLite[][] {
  const byKey = new Map<string, PaymentLite[]>();
  for (const p of payments) (byKey.get(`${p.invoiceId}|${p.amount.toFixed(2)}`) ?? byKey.set(`${p.invoiceId}|${p.amount.toFixed(2)}`, []).get(`${p.invoiceId}|${p.amount.toFixed(2)}`)!).push(p);
  const out: PaymentLite[][] = [];
  for (const list of byKey.values()) {
    list.sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
    let cluster: PaymentLite[] = [];
    for (const p of list) {
      if (cluster.length && p.paidAt.getTime() - cluster[cluster.length - 1].paidAt.getTime() > windowMinutes * 60_000) {
        if (cluster.length > 1) out.push(cluster);
        cluster = [];
      }
      cluster.push(p);
    }
    if (cluster.length > 1) out.push(cluster);
  }
  return out;
}

const cents = (n: number) => Math.round(n * 100);
export function invoiceAnomalies(invoices: InvoiceLite[]): { overpaid: InvoiceLite[]; mismatched: InvoiceLite[] } {
  return {
    overpaid: invoices.filter((i) => cents(i.amountPaid) > cents(i.amountDue)),
    // amountPaid should equal the sum of non-reversed payments; a difference means the ledger and the invoice drifted.
    mismatched: invoices.filter((i) => cents(i.amountPaid) !== cents(i.livePaymentsTotal)),
  };
}
