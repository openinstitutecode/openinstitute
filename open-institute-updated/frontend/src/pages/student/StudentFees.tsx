import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Table, Badge, StatCard } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { LoadingState } from "../../components/portal/StateViews";

const links = [
  { to: "/student/dashboard", label: "Dashboard" },
  { to: "/student/profile", label: "My Profile" },
  { to: "/student/id-card", label: "Digital ID" },
  { to: "/student/roadmap", label: "Programme Roadmap" },
  { to: "/student/courses", label: "My Courses" },
  { to: "/student/assignments", label: "Assignment Centre" },
  { to: "/student/exams", label: "Assessment Centre" },
  { to: "/student/alerts", label: "Academic Alerts" },
  { to: "/student/notebook", label: "Knowledge Notebook" },
  { to: "/student/portfolio", label: "Digital Portfolio" },
  { to: "/student/advisor", label: "AI Study Advisor" },
  { to: "/student/letters", label: "Official Letters" },
  { to: "/student/receipts", label: "Payment Receipts" },
  { to: "/student/research", label: "Research Workspace" },
  { to: "/student/messages", label: "Messages & Office Hours" },
  { to: "/student/forums", label: "Discussion Forums" },
  { to: "/student/timetable", label: "Timetable" },
  { to: "/student/attendance", label: "Attendance" },
  { to: "/student/achievements", label: "Achievements" },
  { to: "/student/library", label: "Digital Library" },
  { to: "/student/tutor", label: "AI Tutor" },
  { to: "/student/career", label: "Career Services" },
  { to: "/student/job-matches", label: "Job Matches" },
  { to: "/student/simulation", label: "Business Simulation Lab" },
  { to: "/student/virtual-lab", label: "Virtual Business Lab" },
  { to: "/student/viva", label: "AI Viva Practice" },
  { to: "/student/passport", label: "Competency Passport" },
  { to: "/student/grades", label: "Grades & Transcript" },
  { to: "/student/appeals", label: "Appeals" },
  { to: "/student/fees", label: "Fees" },
  { to: "/student/account", label: "Account & Progress" },
  { to: "/student/attachment", label: "Industrial Attachment" },
  { to: "/student/graduation", label: "Graduation Status" },
  { to: "/student/wellbeing", label: "Counselling & Support" },
  { to: "/student/events", label: "Clubs & Events" },
  { to: "/student/support", label: "Support" },
  { to: "/student/accessibility", label: "Accessibility Settings" },
  { to: "/student/credit-transfer", label: "Credit Transfer" },
  { to: "/student/tutor-sessions", label: "Tutor Session History" },
];

type Receipt = {
  id: string;
  amount: string;
  method: string;
  reference: string;
  paidAt: string;
};

type Invoice = {
  id: string;
  semester: string;
  amountDue: string;
  amountPaid: string;
  status: string;
  dueDate: string;
  lineItems?: { id: string; description: string; quantity: number; unitPrice: string; amount: string }[];
};

type FinancialClearance = {
  clear: boolean;
  feeBalance: number;
  feeClearance: boolean;
  activeHold: { reason: string; placedAt: string } | null;
};

export default function StudentFees() {
  const userName = useCurrentUserName();
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("8400");
  const [invoiceId, setInvoiceId] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "sent" | "confirmed" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [clearance, setClearance] = useState<FinancialClearance | null>(null);

  useEffect(() => {
    apiFetch<Receipt[]>("/me/receipts")
      .then(setReceipts)
      .catch(() => setReceipts([]));
    apiFetch<Invoice[]>("/finance/invoices/mine")
      .then(setInvoices)
      .catch(() => setInvoices([]));
    apiFetch<FinancialClearance>("/me/financial-clearance")
      .then(setClearance)
      .catch(() => setClearance(null));
  }, []);

  const unpaidInvoices = (invoices ?? []).filter((i) => Number(i.amountDue) > Number(i.amountPaid));

  // SP034 — default the payment to the soonest-due unpaid invoice, once
  // invoices load, so the push is linked to something real by default.
  useEffect(() => {
    if (!invoiceId && unpaidInvoices.length > 0) {
      const soonest = [...unpaidInvoices].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
      setInvoiceId(soonest.id);
      setAmount(String(Number(soonest.amountDue) - Number(soonest.amountPaid)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices]);

  async function handlePay(e: FormEvent) {
    e.preventDefault();
    if (!invoiceId) {
      setStatus("error");
      setMessage("Choose which invoice this payment is for.");
      return;
    }
    setStatus("pending");
    setMessage(null);
    try {
      await apiFetch("/finance/mpesa/stk-push", {
        method: "POST",
        body: JSON.stringify({ phone, amount: Number(amount), invoiceId }),
      });
      setStatus("sent");
      setMessage("Check your phone for the M-Pesa PIN prompt.");
      pollForConfirmation(invoiceId);
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error
          ? `${err.message} (M-Pesa integration requires Safaricom Daraja credentials to be configured.)`
          : "Something went wrong."
      );
    }
  }

  // Once the push is sent, watch for the callback landing (it arrives from
  // Safaricom asynchronously) so the student sees real confirmation instead
  // of just "we sent a prompt" and silence.
  function pollForConfirmation(forInvoiceId: string) {
    const startedAt = Date.now();
    const before = invoices?.find((i) => i.id === forInvoiceId);
    const interval = setInterval(async () => {
      if (Date.now() - startedAt > 45_000) {
        clearInterval(interval);
        return;
      }
      try {
        const fresh = await apiFetch<Invoice[]>("/finance/invoices/mine");
        setInvoices(fresh);
        const after = fresh.find((i) => i.id === forInvoiceId);
        if (before && after && Number(after.amountPaid) > Number(before.amountPaid)) {
          setStatus("confirmed");
          setMessage("Payment received — your balance has been updated.");
          apiFetch<Receipt[]>("/me/receipts").then(setReceipts).catch(() => undefined);
          clearInterval(interval);
        }
      } catch {
        // keep polling silently — a transient failure here shouldn't
        // interrupt the student's flow
      }
    }, 4000);
  }

  const totalBalance = invoices?.reduce((s, i) => s + (Number(i.amountDue) - Number(i.amountPaid)), 0) ?? 0;
  const totalPaid = invoices?.reduce((s, i) => s + Number(i.amountPaid), 0) ?? 0;
  const nextDue = invoices?.filter((i) => Number(i.amountDue) > Number(i.amountPaid))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Fees</h1>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Balance due" value={`KES ${totalBalance.toLocaleString()}`} />
        <StatCard label="Next due date" value={nextDue ? new Date(nextDue.dueDate).toLocaleDateString() : "—"} />
        <StatCard label="Total paid" value={`KES ${totalPaid.toLocaleString()}`} />
      </div>

      {clearance && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3">
          <Badge tone={clearance.clear ? "ok" : "danger"}>
            {clearance.clear ? "Financially clear" : "Not financially clear"}
          </Badge>
          <span className="text-sm text-ink/60">
            {clearance.clear
              ? "No outstanding balance or active hold on your account."
              : clearance.activeHold
              ? `Active hold: ${clearance.activeHold.reason}`
              : `Outstanding balance of KES ${clearance.feeBalance.toLocaleString()}`}
          </span>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <PortalSection title="Statement">
            {invoices === null && <LoadingState />}
            {invoices && invoices.length === 0 && <p className="text-sm text-ink/50">No invoices on your account yet.</p>}
            {invoices && invoices.length > 0 && (
              <Table
                columns={["Semester", "Due date", "Amount due", "Fee breakdown", "Status"]}
                rows={invoices.map((i) => [
                  i.semester,
                  new Date(i.dueDate).toLocaleDateString(),
                  `KES ${Number(i.amountDue).toLocaleString()}`,
                  i.lineItems?.length
                    ? <ul className="space-y-1 text-left text-xs">{i.lineItems.map((line) => <li key={line.id}>{line.description}: KES {Number(line.amount).toLocaleString()}</li>)}</ul>
                    : "—",
                  <Badge tone={i.status === "paid" ? "ok" : i.status === "overdue" ? "danger" : "warn"}>{i.status}</Badge>,
                ])}
              />
            )}
          </PortalSection>

          <PortalSection title="Receipts">
            {receipts === null && <LoadingState />}
            {receipts && receipts.length === 0 && (
              <p className="text-sm text-ink/50">No payments recorded on your account yet.</p>
            )}
            {receipts && receipts.length > 0 && (
              <Table
                columns={["Date", "Reference", "Method", "Amount"]}
                rows={receipts.map((r) => [
                  new Date(r.paidAt).toLocaleDateString(),
                  r.reference,
                  r.method,
                  `KES ${Number(r.amount).toLocaleString()}`,
                ])}
              />
            )}
          </PortalSection>
        </div>

        <PortalSection title="Pay with M-Pesa">
          <form onSubmit={handlePay} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Which invoice</span>
              <select required value={invoiceId} onChange={(e) => {
                setInvoiceId(e.target.value);
                const inv = unpaidInvoices.find((i) => i.id === e.target.value);
                if (inv) setAmount(String(Number(inv.amountDue) - Number(inv.amountPaid)));
              }} className="input mt-1.5">
                <option value="" disabled>Select an invoice</option>
                {unpaidInvoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.semester} — balance KES {(Number(i.amountDue) - Number(i.amountPaid)).toLocaleString()}
                  </option>
                ))}
              </select>
              {unpaidInvoices.length === 0 && <p className="mt-1 text-xs text-ink/45">No outstanding invoices.</p>}
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">M-Pesa number</span>
              <input
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XX XXX XXX"
                className="input mt-1.5"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Amount (KES)</span>
              <input
                required
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input mt-1.5"
              />
            </label>
            <button type="submit" disabled={status === "pending" || !invoiceId} className="btn-primary w-full justify-center">
              {status === "pending" ? "Sending prompt…" : "Send STK push"}
            </button>
            {message && (
              <p className={`text-xs ${status === "error" ? "text-navy-dark" : status === "confirmed" ? "text-forest font-medium" : "text-forest"}`}>
                {message}
              </p>
            )}
          </form>
          <CardCheckout invoiceId={invoiceId} amount={amount} />
        </PortalSection>
      </div>
    </PortalShell>
  );
}

// FN006 — card payment gateway, batch 64. A second real gateway alongside
// M-Pesa: creates a Stripe Checkout Session server-side and redirects here
// to complete payment. Requires CARD_GATEWAY_SECRET_KEY to be configured —
// otherwise this surfaces that configuration error directly, same honesty
// as the M-Pesa STK push above.
function CardCheckout({ invoiceId, amount }: { invoiceId: string; amount: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function payByCard() {
    if (!invoiceId || !amount) {
      setError("Choose an invoice and amount first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ checkoutUrl: string }>("/finance/card/checkout", {
        method: "POST",
        body: JSON.stringify({ invoiceId, amount: Number(amount) }),
      });
      window.location.href = res.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start card checkout.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <button type="button" onClick={payByCard} disabled={loading} className="btn-secondary w-full justify-center disabled:opacity-50">
        {loading ? "Redirecting…" : "Pay by card instead"}
      </button>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
    </div>
  );
}
