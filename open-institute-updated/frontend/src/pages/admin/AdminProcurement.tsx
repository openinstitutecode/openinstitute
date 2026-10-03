import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { StatCard, PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";

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

type Summary = { totalRevenue: string; totalExpenses: string; netPosition: number; totalAssetValue: string };
type Expense = { id: string; category: string; description: string; amount: string; incurredAt: string; paidAt: string | null };
type Asset = { id: string; name: string; category: string; value: string; status: string };

export default function AdminProcurement() {
  const userName = useCurrentUserName();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [expCategory, setExpCategory] = useState("supplies");
  const [expDescription, setExpDescription] = useState("");
  const [expAmount, setExpAmount] = useState(0);
  const [expDate, setExpDate] = useState("");

  function loadAll() {
    apiFetch<Summary>("/procurement/summary").then(setSummary).catch(() => setSummary(null));
    apiFetch<Expense[]>("/procurement/expenses").then(setExpenses).catch(() => setExpenses([]));
    apiFetch<Asset[]>("/procurement/assets").then(setAssets).catch(() => setAssets([]));
  }
  useEffect(loadAll, []);

  async function payExpense(id: string) {
    await apiFetch(`/procurement/expenses/${id}/pay`, { method: "PATCH" }).catch(() => undefined);
    apiFetch<Expense[]>("/procurement/expenses").then(setExpenses).catch(() => undefined);
  }

  async function addExpense(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/procurement/expenses", {
        method: "POST",
        body: JSON.stringify({
          category: expCategory,
          description: expDescription,
          amount: expAmount,
          incurredAt: new Date(expDate).toISOString(),
        }),
      });
      setExpDescription("");
      setExpAmount(0);
      setExpDate("");
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save expense.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Procurement, expenses &amp; assets</h1>
      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {summary && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total revenue (all-time)" value={`KES ${Number(summary.totalRevenue).toLocaleString()}`} />
          <StatCard label="Total expenses" value={`KES ${Number(summary.totalExpenses).toLocaleString()}`} />
          <StatCard label="Net position" value={`KES ${summary.netPosition.toLocaleString()}`} />
          <StatCard label="Total asset value" value={`KES ${Number(summary.totalAssetValue).toLocaleString()}`} />
        </div>
      )}

      <RevenueTrendPanel />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <PortalSection title="Recent expenses">
          <p className="text-xs text-ink/45">
            Full accounts-payable aging is on the <a href="/admin/receivable-payable" className="underline">AR / AP page</a>.
          </p>
          {expenses && expenses.length === 0 && <p className="mt-2 text-sm text-ink/50">No expenses recorded yet.</p>}
          <ul className="mt-2 divide-y divide-line">
            {expenses?.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p>{e.description}</p>
                  <p className="text-xs text-ink/45">{e.category} · {new Date(e.incurredAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">KES {Number(e.amount).toLocaleString()}</span>
                  {e.paidAt ? (
                    <Badge tone="ok">Paid</Badge>
                  ) : (
                    <button onClick={() => payExpense(e.id)} className="text-xs text-navy underline decoration-dotted">Mark paid</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </PortalSection>

        <PortalSection title="Log an expense">
          <form onSubmit={addExpense} className="space-y-4">
            <select value={expCategory} onChange={(e) => setExpCategory(e.target.value)} className="input">
              <option value="utilities">Utilities</option>
              <option value="salaries">Salaries</option>
              <option value="maintenance">Maintenance</option>
              <option value="supplies">Supplies</option>
              <option value="other">Other</option>
            </select>
            <input required value={expDescription} onChange={(e) => setExpDescription(e.target.value)} placeholder="Description" className="input" />
            <input required type="number" min={1} value={expAmount || ""} onChange={(e) => setExpAmount(Number(e.target.value))} placeholder="Amount (KES)" className="input" />
            <input required type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} className="input" />
            <button type="submit" className="btn-primary w-full justify-center">Save expense</button>
          </form>
        </PortalSection>
      </div>

      <div className="mt-6">
        <PortalSection title="Asset register">
          {assets && assets.length === 0 && <p className="text-sm text-ink/50">No assets on file yet.</p>}
          {assets && assets.length > 0 && (
            <ul className="divide-y divide-line">
              {assets.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-3 text-sm">
                  <span>{a.name} <span className="text-xs text-ink/40">({a.category})</span></span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs">KES {Number(a.value).toLocaleString()}</span>
                    <Badge tone={a.status === "in_use" ? "ok" : "neutral"}>{a.status.replace("_", " ")}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PortalSection>
      </div>

      {/* FN030 — purchase order management: real supplier + PO workflow. */}
      <div className="mt-6">
        <PurchaseOrders />
      </div>
    </PortalShell>
  );
}

function PurchaseOrders() {
  type Supplier = { id: string; name: string };
  type PO = { id: string; description: string; amount: string; status: string; supplier: { name: string } };
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [orders, setOrders] = useState<PO[] | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Supplier[]>("/procurement/suppliers").then(setSuppliers).catch(() => setSuppliers([]));
    apiFetch<PO[]>("/procurement/purchase-orders").then(setOrders).catch(() => setOrders([]));
  }
  useEffect(load, []);

  async function addSupplier(e: FormEvent) {
    e.preventDefault();
    if (!newSupplierName.trim()) return;
    try {
      await apiFetch("/procurement/suppliers", { method: "POST", body: JSON.stringify({ name: newSupplierName }) });
      setNewSupplierName("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add supplier.");
    }
  }

  async function createPO(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/procurement/purchase-orders", { method: "POST", body: JSON.stringify({ supplierId, description, amount }) });
      setDescription(""); setAmount(0);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create purchase order.");
    }
  }

  async function updateStatus(id: string, status: "approved" | "ordered" | "received" | "cancelled") {
    await apiFetch(`/procurement/purchase-orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }).catch(() => undefined);
    load();
  }

  const nextStatus: Record<string, "approved" | "ordered" | "received" | null> = {
    draft: "approved",
    approved: "ordered",
    ordered: "received",
    received: null,
    cancelled: null,
  };

  return (
    <PortalSection title="Purchase orders">
      <ul className="divide-y divide-line">
        {orders?.map((po) => (
          <li key={po.id} className="py-3 text-sm">
            <div className="flex items-center justify-between">
              <span>{po.description} — {po.supplier.name}</span>
              <Badge tone={po.status === "received" ? "ok" : po.status === "cancelled" ? "danger" : "neutral"}>{po.status}</Badge>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xs text-ink/50">KES {Number(po.amount).toLocaleString()}</span>
              <div className="flex gap-2">
                {nextStatus[po.status] && (
                  <button onClick={() => updateStatus(po.id, nextStatus[po.status]!)} className="text-xs text-navy underline decoration-dotted">
                    Mark {nextStatus[po.status]}
                  </button>
                )}
                {po.status !== "received" && po.status !== "cancelled" && (
                  <button onClick={() => updateStatus(po.id, "cancelled")} className="text-xs text-navy-dark underline decoration-dotted">Cancel</button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
        <form onSubmit={createPO} className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/50">New purchase order</p>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="input">
            <option value="">Choose supplier…</option>
            {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="input" />
          <input type="number" min={1} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} placeholder="Amount (KES)" className="input" />
          <button type="submit" className="btn-primary">Create purchase order</button>
        </form>
        <form onSubmit={addSupplier} className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/50">New supplier</p>
          <input value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} placeholder="Supplier name" className="input" />
          <button type="submit" className="btn-secondary">Add supplier</button>
        </form>
      </div>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
    </PortalSection>
  );
}

// FN034 — Revenue analytics: the summary StatCards above are a single
// point-in-time snapshot; this is the real month-over-month trend behind
// them (revenue, expenses, and the resulting net position), bucketed with
// the same lib/analytics-buckets.ts logic AD037's institutional analytics
// already uses (and is unit-tested there). Distinct from AD037's own
// revenue-only trend (payments collected per month, shown on the
// Institutional Analytics page) — this one adds expenses and net position,
// which that page doesn't cover.
type TrendPoint = { month: string; revenue: number; expenses: number; net: number };
function RevenueTrendPanel() {
  const [trend, setTrend] = useState<TrendPoint[] | null>(null);

  useEffect(() => {
    apiFetch<{ trend: TrendPoint[] }>("/procurement/revenue-trend?months=12")
      .then((d) => setTrend(d.trend))
      .catch(() => setTrend(null));
  }, []);

  if (!trend) return null;
  const max = Math.max(1, ...trend.map((t) => Math.max(t.revenue, t.expenses)));

  return (
    <PortalSection title="Revenue vs expenses — 12-month trend (FN034)">
      <div className="space-y-2">
        {trend.map((t) => (
          <div key={t.month} className="flex items-center gap-3 text-xs">
            <span className="w-16 shrink-0 text-ink/50">{t.month}</span>
            <div className="h-3 flex-1 bg-navy/[0.06]">
              <div className="h-3 bg-navy" style={{ width: `${Math.max(2, (t.revenue / max) * 100)}%` }} />
            </div>
            <div className="h-3 flex-1 bg-navy-dark/[0.06]">
              <div className="h-3 bg-navy-dark" style={{ width: `${Math.max(2, (t.expenses / max) * 100)}%` }} />
            </div>
            <span className={`w-24 shrink-0 text-right ${t.net >= 0 ? "text-ink/70" : "text-navy-dark"}`}>
              net {t.net.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink/45">
        <span className="inline-block h-2 w-2 bg-navy" /> revenue &nbsp;
        <span className="inline-block h-2 w-2 bg-navy-dark" /> expenses
      </p>
    </PortalSection>
  );
}
