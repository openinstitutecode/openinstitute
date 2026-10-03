import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge, StatCard } from "../../components/portal/Primitives";
import { apiFetch, apiFetchBlob, openOrDownloadBlob, useCurrentUserName } from "../../lib/api";
import { LoadingState } from "../../components/portal/StateViews";

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

type Account = { id: string; code: string; name: string; type: string };
type TrialBalanceRow = { accountId: string; code: string; name: string; type: string; totalDebit: number; totalCredit: number; balance: number };
type TrialBalance = { rows: TrialBalanceRow[]; grandTotalDebit: number; grandTotalCredit: number; balanced: boolean };

export default function AdminLedger() {
  const userName = useCurrentUserName();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [trial, setTrial] = useState<TrialBalance | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Account[]>("/ledger/accounts").then(setAccounts).catch((err) => setError(err instanceof Error ? err.message : "Could not load accounts."));
    apiFetch<TrialBalance>("/ledger/trial-balance").then(setTrial).catch(() => undefined);
  }
  useEffect(load, []);

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">General ledger</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Real double-entry bookkeeping — every posted entry's debits and
        credits balance, enforced by the backend, not just displayed.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {trial && (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard label="Total debits" value={`KES ${trial.grandTotalDebit.toLocaleString()}`} />
          <StatCard label="Total credits" value={`KES ${trial.grandTotalCredit.toLocaleString()}`} />
          <StatCard label="Ledger status" value={trial.balanced ? "Balanced" : "OUT OF BALANCE"} />
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Trial balance">
          {trial && (
            <ul className="divide-y divide-line">
              {trial.rows.map((r) => (
                <li key={r.accountId} className="flex items-center justify-between py-2 text-sm">
                  <span>{r.code} — {r.name}</span>
                  <span className={r.balance < 0 ? "text-navy-dark" : ""}>KES {r.balance.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </PortalSection>

        <ManualEntry accounts={accounts ?? []} onPosted={load} />
      </div>

      <div className="mt-6">
        <ExportLedgerButton />
      </div>

      <div className="mt-6">
        <FinanceAuditTrail />
      </div>
    </PortalShell>
  );
}

function ManualEntry({ accounts, onPosted }: { accounts: Account[]; onPosted: () => void }) {
  const [description, setDescription] = useState("");
  const [debitAccountId, setDebitAccountId] = useState("");
  const [creditAccountId, setCreditAccountId] = useState("");
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPosted(false);
    try {
      await apiFetch("/ledger/entries", {
        method: "POST",
        body: JSON.stringify({ description, lines: [{ debitAccountId, creditAccountId, amount }] }),
      });
      setPosted(true);
      setDescription("");
      setAmount(0);
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Entry rejected — check it balances.");
    }
  }

  return (
    <PortalSection title="Post a manual journal entry">
      <form onSubmit={submit} className="space-y-3">
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="input" />
        <select value={debitAccountId} onChange={(e) => setDebitAccountId(e.target.value)} className="input">
          <option value="">Debit account…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
          ))}
        </select>
        <select value={creditAccountId} onChange={(e) => setCreditAccountId(e.target.value)} className="input">
          <option value="">Credit account…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
          ))}
        </select>
        <input type="number" min={0.01} step={0.01} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} placeholder="Amount" className="input" />
        <button type="submit" className="btn-primary">Post entry</button>
      </form>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {posted && <Badge tone="ok">Posted</Badge>}
    </PortalSection>
  );
}

// Was `<a href="/api/ledger/export.csv">`, which never worked: this app
// authenticates with a Bearer token, not a cookie session, so a plain
// browser navigation to an authenticated route 401s. Same fix as EX039's
// results-slip/CSV buttons — fetch with the token, then trigger the
// download from the returned blob.
function ExportLedgerButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function download() {
    setBusy(true);
    setError(null);
    try {
      const { blob, filename } = await apiFetchBlob("/ledger/export.csv");
      openOrDownloadBlob(blob, filename ?? "ledger-export.csv");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export the ledger.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button onClick={download} disabled={busy} className="btn-secondary disabled:opacity-50">Export full ledger (CSV)</button>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
    </>
  );
}

// FN037 — finance audit trail: who recorded a payment, approved or
// rejected a refund, reversed a payment, cleared an expense, or posted a
// manual journal entry, and when — the AuditLog rows the finance routes
// now write (see finance.ts/procurement.ts/ledger.ts), filterable by
// action.
type FinanceAuditEntry = {
  id: string;
  action: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { fullName: string } | null;
};
function FinanceAuditTrail() {
  const [entries, setEntries] = useState<FinanceAuditEntry[] | null>(null);
  const [action, setAction] = useState("");

  function load() {
    const qs = action ? `?action=${encodeURIComponent(action)}` : "";
    apiFetch<FinanceAuditEntry[]>(`/ledger/audit-trail${qs}`).then(setEntries).catch(() => setEntries(null));
  }
  useEffect(load, [action]);

  return (
    <PortalSection title="Finance audit trail">
      <div className="mb-3 flex items-center gap-2">
        <select value={action} onChange={(e) => setAction(e.target.value)} className="input">
          <option value="">All actions</option>
          <option value="PAYMENT_RECORDED">Payment recorded</option>
          <option value="REFUND_APPROVED">Refund approved</option>
          <option value="REFUND_REJECTED">Refund rejected</option>
          <option value="PAYMENT_REVERSED">Payment reversed</option>
          <option value="EXPENSE_PAID">Expense paid</option>
          <option value="MANUAL_JOURNAL_ENTRY">Manual journal entry</option>
        </select>
      </div>
      {!entries && <LoadingState />}
      {entries && entries.length === 0 && <p className="text-sm text-ink/50">No finance actions recorded yet.</p>}
      {entries && entries.length > 0 && (
        <ul className="divide-y divide-line">
          {entries.map((e) => (
            <li key={e.id} className="py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{e.action.replace(/_/g, " ")}</span>
                <span className="text-xs text-ink/45">{new Date(e.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-xs text-ink/50">
                {e.user?.fullName ?? "System"} · {JSON.stringify(e.metadata)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </PortalSection>
  );
}
