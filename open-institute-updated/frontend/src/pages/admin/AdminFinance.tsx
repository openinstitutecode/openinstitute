import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { StatCard, PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName, newIdempotencyKey } from "../../lib/api";

const links = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/command-centre", label: "Command Centre" },
  { to: "/admin/admissions", label: "Admissions" },
  { to: "/admin/students", label: "Students" },
  { to: "/admin/staff", label: "Staff Management" },
  { to: "/admin/academic-calendar", label: "Academic Calendar" },
  { to: "/admin/timetable-admin", label: "Timetable Management" },
  { to: "/admin/communication", label: "Communication Centre" },
  { to: "/admin/permission-audit", label: "Permission Audit" },
  { to: "/admin/security", label: "Security Centre" },
  { to: "/admin/reports", label: "Report Builder" },
  { to: "/admin/admin-assistant", label: "AI Admin Assistant" },
  { to: "/admin/ai-governance", label: "AI Governance Centre" },
  { to: "/admin/registry", label: "Registry Actions" },
  { to: "/admin/statistics", label: "Academic Statistics" },
  { to: "/admin/qualifications", label: "Qualification Register" },
  { to: "/admin/exams", label: "Examinations" },
  { to: "/admin/results-approval", label: "Results Approval" },
  { to: "/admin/curriculum", label: "Curriculum" },
  { to: "/admin/library", label: "Digital Library" },
  { to: "/admin/library-admin", label: "Library Administration" },
  { to: "/admin/finance", label: "Finance" },
  { to: "/admin/ledger", label: "General Ledger" },
  { to: "/admin/receivable-payable", label: "AR / AP" },
  { to: "/admin/installments", label: "Installment Plans" },
  { to: "/admin/budgets", label: "Budgets" },
  { to: "/admin/inventory", label: "Inventory" },
  { to: "/admin/financial-planning", label: "Financial Planning" },
  { to: "/admin/fee-structure", label: "Fee Structure" },
  { to: "/admin/procurement", label: "Procurement & Assets" },
  { to: "/admin/compliance", label: "Compliance & QA" },
  { to: "/admin/qa-governance", label: "QA Governance" },
  { to: "/admin/course-evaluations", label: "Course & Trainer Evaluations" },
  { to: "/admin/internal-audits", label: "Internal Audits" },
  { to: "/admin/corrective-actions", label: "Corrective Actions" },
  { to: "/admin/complaints", label: "Complaints" },
  { to: "/admin/governance", label: "Governance" },
  { to: "/admin/integrity", label: "Academic Integrity" },
  { to: "/admin/appeals", label: "Appeals" },
  { to: "/admin/rpl", label: "RPL Applications" },
  { to: "/admin/graduation", label: "Graduation Audit" },
  { to: "/admin/kuccps", label: "KUCCPS Exchange" },
  { to: "/admin/users", label: "Users & RBAC" },
  { to: "/admin/audit-log", label: "Audit Log" },
  { to: "/admin/operations", label: "Operations & Data Governance" },
  { to: "/admin/departments", label: "Departments & Tasks" },
  { to: "/admin/research", label: "Research & Innovation" },
  { to: "/admin/trainers", label: "Trainers & HR" },
  { to: "/admin/support-tickets", label: "Support Tickets" },
  { to: "/admin/documents", label: "Document Management" },
  { to: "/admin/data-export", label: "Data Export" },
  { to: "/admin/data-import", label: "Data Import" },
  { to: "/admin/integrations", label: "Integration Centre" },
  { to: "/admin/role-permissions", label: "Role Permissions" },
  { to: "/admin/semesters", label: "Semester Management" },
  { to: "/admin/programme-accreditation", label: "Programme Accreditation" },
  { to: "/admin/credit-transfer", label: "Credit Transfer" },
  { to: "/admin/exam-security", label: "Exam Security" },
  { to: "/admin/similarity-checking", label: "Similarity Checking" },
  { to: "/admin/knowledge-base", label: "Knowledge Base" },
  { to: "/admin/notifications", label: "Notifications" },
  { to: "/admin/workflows", label: "Workflow Engine" },
  { to: "/admin/institutional-analytics", label: "Institutional Analytics" },
  { to: "/admin/decision-centre", label: "Executive Decision Centre" },
];

type Invoice = {
  id: string;
  semester: string;
  amountDue: string;
  amountPaid: string;
  status: string;
  student: { fullName: string; studentNumber: string };
  payments: { reference: string; method: string; paidAt: string; amount: string }[];
};

export default function AdminFinance() {
  const userName = useCurrentUserName();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Invoice[]>("/finance/invoices")
      .then(setInvoices)
      .catch((err) =>
        setError(
          err instanceof Error
            ? `${err.message} — you need FINANCE_OFFICER, ACCOUNTANT, or SUPER_ADMIN.`
            : "Could not load invoices."
        )
      );
  }, []);

  const totalCollected = invoices?.reduce((s, i) => s + Number(i.amountPaid), 0) ?? 0;
  const totalOutstanding =
    invoices?.reduce((s, i) => s + Math.max(0, Number(i.amountDue) - Number(i.amountPaid)), 0) ?? 0;
  const overdueCount = invoices?.filter((i) => i.status === "overdue").length ?? 0;
  const collectionRate =
    invoices && invoices.length > 0
      ? Math.round((totalCollected / (totalCollected + totalOutstanding || 1)) * 100)
      : null;

  const allPayments = invoices
    ?.flatMap((inv) => inv.payments.map((p) => ({ ...p, student: inv.student })))
    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
    .slice(0, 10);

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Finance overview</h1>
      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {invoices && (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Collected" value={`KES ${totalCollected.toLocaleString()}`} />
            <StatCard label="Outstanding" value={`KES ${totalOutstanding.toLocaleString()}`} />
            <StatCard label="Collection rate" value={collectionRate !== null ? `${collectionRate}%` : "—"} />
            <StatCard label="Overdue invoices" value={overdueCount} />
          </div>

          <div className="mt-8">
            <PortalSection title="Recent payments">
              {allPayments && allPayments.length === 0 && <p className="text-sm text-ink/50">No payments recorded yet.</p>}
              {allPayments && allPayments.length > 0 && (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-ink/50">
                      <th className="pb-3 pr-4 font-medium">Student</th>
                      <th className="pb-3 pr-4 font-medium">Amount</th>
                      <th className="pb-3 pr-4 font-medium">Method</th>
                      <th className="pb-3 pr-4 font-medium">Reference</th>
                      <th className="pb-3 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {allPayments.map((p) => (
                      <tr key={p.reference}>
                        <td className="py-3 pr-4">{p.student.fullName}</td>
                        <td className="py-3 pr-4">KES {Number(p.amount).toLocaleString()}</td>
                        <td className="py-3 pr-4">{p.method}</td>
                        <td className="py-3 pr-4 font-mono text-xs">{p.reference}</td>
                        <td className="py-3">{new Date(p.paidAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </PortalSection>
          </div>

          <div className="mt-6">
            <PortalSection title="Overdue accounts">
              {invoices.filter((i) => i.status === "overdue").length === 0 ? (
                <p className="text-sm text-ink/50">No overdue accounts.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {invoices
                    .filter((i) => i.status === "overdue")
                    .map((i) => (
                      <li key={i.id} className="flex items-center justify-between py-3 text-sm">
                        <span>{i.student.fullName}</span>
                        <Badge tone="danger">
                          KES {(Number(i.amountDue) - Number(i.amountPaid)).toLocaleString()}
                        </Badge>
                      </li>
                    ))}
                </ul>
              )}
            </PortalSection>
          </div>
        </>
      )}

      {/* FN003 — student invoice creation, grounded in the real fee
          structure for the student's programme/semester. */}
      <div className="mt-8">
        <CreateInvoice />
      </div>

      {/* FN005/FN010 — record a real payment for any method, then issue a
          signed receipt for it. FN009 — reconciliation check.
          FN018 — financial holds. */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <RecordPayment onRecorded={() => window.location.reload()} />
        <Reconciliation />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <FinancialHolds />
        <FinanceAssistant />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Refunds />
        <ReverseAndRemind />
      </div>
    </PortalShell>
  );
}

function Refunds() {
  type Refund = { id: string; amount: string; reason: string; payment: { reference: string; invoice: { student: { fullName: string } } } };
  const [pending, setPending] = useState<Refund[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Refund[]>("/finance/refunds/pending").then(setPending).catch((err) => setError(err instanceof Error ? err.message : "Could not load refunds."));
  }
  useEffect(load, []);

  async function decide(id: string, decision: "approved" | "rejected") {
    try {
      await apiFetch(`/finance/refunds/${id}/decide`, { method: "PATCH", body: JSON.stringify({ decision }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not decide — you may be the original requester.");
    }
  }

  return (
    <PortalSection title="Pending refunds">
      {error && <p className="text-xs text-navy-dark">{error}</p>}
      {pending && pending.length === 0 && <p className="text-sm text-ink/50">Nothing pending.</p>}
      <ul className="divide-y divide-line">
        {pending?.map((r) => (
          <li key={r.id} className="py-3 text-sm">
            <p>{r.payment.invoice.student.fullName} — KES {Number(r.amount).toLocaleString()} ({r.payment.reference})</p>
            <p className="mt-1 text-xs text-ink/50">{r.reason}</p>
            <div className="mt-2 flex gap-2">
              <button className="btn-primary" onClick={() => decide(r.id, "approved")}>Approve</button>
              <button className="btn-secondary" onClick={() => decide(r.id, "rejected")}>Reject</button>
            </div>
          </li>
        ))}
      </ul>
    </PortalSection>
  );
}

function ReverseAndRemind() {
  const [paymentId, setPaymentId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reversed, setReversed] = useState(false);
  const [reminderResult, setReminderResult] = useState<{ remindersCreated: number } | null>(null);

  async function reverse(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setReversed(false);
    try {
      await apiFetch(`/finance/payments/${paymentId}/reverse`, { method: "PATCH", body: JSON.stringify({ reason }) });
      setReversed(true);
      setPaymentId("");
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reverse that payment.");
    }
  }

  async function runReminders() {
    try {
      setReminderResult(await apiFetch("/finance/reminders/run", { method: "POST" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run reminders.");
    }
  }

  return (
    <PortalSection title="Reverse a payment / run reminders">
      <form onSubmit={reverse} className="space-y-2">
        <input value={paymentId} onChange={(e) => setPaymentId(e.target.value)} placeholder="Payment ID" className="input" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reversal reason" className="input" />
        <button type="submit" className="btn-secondary">Reverse payment</button>
      </form>
      {reversed && <p className="mt-2 text-xs text-forest">Reversed.</p>}

      <div className="mt-4 border-t border-line pt-3">
        <p className="text-xs text-ink/50">
          On-demand only — this sandbox has no cron/scheduler, so a real
          deployment would run this on a timer instead of a button.
        </p>
        <button onClick={runReminders} className="btn-primary mt-2 w-full justify-center">Run overdue reminders now</button>
        {reminderResult && <p className="mt-2 text-xs text-forest">{reminderResult.remindersCreated} reminder(s) created.</p>}
      </div>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
    </PortalSection>
  );
}

function RecordPayment({ onRecorded }: { onRecorded: () => void }) {
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<"bank" | "card" | "cash">("bank");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ documentId: string } | null>(null);
  const [payKey, setPayKey] = useState(newIdempotencyKey); // Batch 71 — a double click replays the first result instead of recording twice

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setReceipt(null);
    try {
      const payment = await apiFetch<{ id: string }>("/finance/payments", {
        method: "POST",
        headers: { "Idempotency-Key": payKey },
        body: JSON.stringify({ invoiceId, amount, method, reference }),
      });
      setPayKey(newIdempotencyKey());
      const r = await apiFetch<{ documentId: string }>(`/finance/receipts/${payment.id}`, { method: "POST" });
      setReceipt(r);
      onRecorded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record payment.");
    }
  }

  return (
    <PortalSection title="Record a payment">
      <form onSubmit={submit} className="space-y-3">
        <input value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} placeholder="Invoice ID" className="input" />
        <input type="number" min={1} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} placeholder="Amount (KES)" className="input" />
        <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="input">
          <option value="bank">Bank transfer</option>
          <option value="card">Card</option>
          <option value="cash">Cash</option>
        </select>
        <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference / receipt number" className="input" />
        <button type="submit" className="btn-primary">Record payment &amp; issue receipt</button>
      </form>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {receipt && <p className="mt-2 text-xs text-forest">Recorded — receipt {receipt.documentId} issued.</p>}
    </PortalSection>
  );
}

function Reconciliation() {
  type Result = { totalInvoicesChecked: number; mismatchCount: number; mismatches: { invoiceId: string; amountPaidOnInvoice: number; sumOfPayments: number }[] };
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    try {
      setResult(await apiFetch<Result>("/finance/reconciliation"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run reconciliation.");
    }
  }

  return (
    <PortalSection title="Payment reconciliation">
      <p className="text-xs text-ink/50">Verifies every invoice's recorded balance actually equals the sum of its real payments.</p>
      <button onClick={run} className="btn-secondary mt-3 w-full justify-center">Run reconciliation</button>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {result && (
        <div className="mt-3">
          <Badge tone={result.mismatchCount === 0 ? "ok" : "danger"}>
            {result.mismatchCount === 0 ? "All clear" : `${result.mismatchCount} mismatch(es)`}
          </Badge>
          <p className="mt-1 text-xs text-ink/45">{result.totalInvoicesChecked} invoices checked.</p>
          {result.mismatches.map((m) => (
            <p key={m.invoiceId} className="mt-1 text-xs text-ink/60">
              {m.invoiceId}: invoice says {m.amountPaidOnInvoice}, payments sum to {m.sumOfPayments}
            </p>
          ))}
        </div>
      )}
    </PortalSection>
  );
}

type Clearance = {
  clear: boolean;
  feeBalance: number;
  feeClearance: boolean;
  activeHold: { id: string; reason: string; placedAt: string } | null;
};

function FinancialHolds() {
  const [studentId, setStudentId] = useState("");
  const [reason, setReason] = useState("");
  const [holds, setHolds] = useState<{ id: string; reason: string; placedAt: string; releasedAt: string | null }[] | null>(null);
  const [clearance, setClearance] = useState<Clearance | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function place(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/finance/holds", { method: "POST", body: JSON.stringify({ studentId, reason }) });
      setReason("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place hold.");
    }
  }

  async function load() {
    if (!studentId) return;
    try {
      setHolds(await apiFetch<{ id: string; reason: string; placedAt: string; releasedAt: string | null }[]>(`/finance/holds/${studentId}`));
    } catch {
      setHolds([]);
    }
    // FN019 — standalone financial clearance check, separate from the
    // hold list above: a student can be hold-free and still carry an
    // outstanding balance, or vice versa (a hold placed for a reason
    // unrelated to the current fee figure). Both facts matter to a finance
    // officer deciding whether to sign off on something, so show both.
    try {
      setClearance(await apiFetch<Clearance>(`/finance/clearance/${studentId}`));
    } catch {
      setClearance(null);
    }
  }

  async function release(id: string) {
    await apiFetch(`/finance/holds/${id}/release`, { method: "PATCH" }).catch(() => undefined);
    load();
  }

  return (
    <PortalSection title="Financial holds & clearance">
      <p className="text-xs text-ink/50">An active hold blocks transcript and certificate issuance until released.</p>
      <input value={studentId} onChange={(e) => setStudentId(e.target.value)} onBlur={load} placeholder="Student ID" className="input mt-3" />

      {clearance && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
          <Badge tone={clearance.clear ? "ok" : "danger"}>
            {clearance.clear ? "Clear" : "Not clear"}
          </Badge>
          <span className="text-xs text-ink/60">
            Fee balance: KES {clearance.feeBalance.toLocaleString()}
            {clearance.activeHold ? ` · active hold: ${clearance.activeHold.reason}` : ""}
          </span>
        </div>
      )}

      <form onSubmit={place} className="mt-3 flex gap-2">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="input flex-1" />
        <button type="submit" className="btn-primary shrink-0">Place hold</button>
      </form>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      <ul className="mt-3 divide-y divide-line">
        {holds?.map((h) => (
          <li key={h.id} className="flex items-center justify-between py-2 text-sm">
            <span>{h.reason}</span>
            {h.releasedAt ? <Badge tone="neutral">Released</Badge> : (
              <button onClick={() => release(h.id)} className="text-xs text-navy underline decoration-dotted">Release</button>
            )}
          </li>
        ))}
      </ul>
    </PortalSection>
  );
}

function FinanceAssistant() {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const userMessage = { role: "user" as const, content: input };
    setMessages((m) => [...m, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ reply: string }>("/ai/finance-assistant", {
        method: "POST",
        body: JSON.stringify({ message: userMessage.content }),
      });
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the assistant.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalSection title="AI finance assistant">
      <p className="text-xs text-ink/50">Grounded in a live fact sheet of real totals — not a full query engine.</p>
      <div className="mt-3 space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === "user" ? "font-medium" : "text-ink/75"}`}>{m.content}</div>
        ))}
        {loading && <p className="text-sm text-ink/40">Thinking…</p>}
        {error && <p className="text-sm text-navy-dark">{error}</p>}
      </div>
      <form onSubmit={submit} className="mt-3 flex gap-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. What's our net position?" className="input flex-1" />
        <button type="submit" className="btn-primary" disabled={loading}>Ask</button>
      </form>
    </PortalSection>
  );
}

// FN003 — student invoices: real fee-structure-grounded creation. A
// found-and-fixed gap — no route anywhere used to create an Invoice at
// all before this batch, not even the seed script.
function CreateInvoice() {
  const [studentId, setStudentId] = useState("");
  const [semester, setSemester] = useState("");
  const [semesterNumber, setSemesterNumber] = useState(1);
  const [dueDate, setDueDate] = useState("");
  const [overrideAmount, setOverrideAmount] = useState<number | "">("");
  const [result, setResult] = useState<{ invoice: { amountDue: string }; feeBreakdown: { item: string; amount: number }[]; wasOverride: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<typeof result>("/finance/invoices", {
        method: "POST",
        body: JSON.stringify({
          studentId, semester, semesterNumber,
          dueDate: new Date(dueDate).toISOString(),
          overrideAmount: overrideAmount === "" ? undefined : overrideAmount,
        }),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invoice — check the fee structure is set up for this programme/semester.");
    }
  }

  return (
    <PortalSection title="Create a student invoice">
      <p className="text-xs text-ink/50">
        Amount is computed from the real fee structure for the student's programme and semester,
        minus any scholarship/sponsorship on record — not a manually typed total, unless you
        explicitly override it below.
      </p>
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="Student ID" className="input" />
        <input value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="Semester label (e.g. 2026-S1)" className="input" />
        <input type="number" min={1} value={semesterNumber} onChange={(e) => setSemesterNumber(Number(e.target.value))} placeholder="Semester number (for fee lookup)" className="input" />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
        <input type="number" min={1} value={overrideAmount} onChange={(e) => setOverrideAmount(e.target.value ? Number(e.target.value) : "")} placeholder="Override amount (optional)" className="input sm:col-span-2" />
        <button type="submit" className="btn-primary sm:col-span-2">Create invoice</button>
      </form>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {result && (
        <div className="mt-3 border-t border-line pt-3 text-sm">
          <p className="font-medium">Amount due: KES {Number(result.invoice.amountDue).toLocaleString()}{result.wasOverride ? " (override)" : ""}</p>
          {result.feeBreakdown.length > 0 && (
            <ul className="mt-1 text-xs text-ink/60">
              {result.feeBreakdown.map((f, i) => (
                <li key={i}>{f.item}: KES {f.amount.toLocaleString()}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </PortalSection>
  );
}
