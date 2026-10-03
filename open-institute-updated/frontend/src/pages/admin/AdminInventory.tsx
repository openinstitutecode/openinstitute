import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
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

type Item = { id: string; name: string; category: string; unit: string; quantityOnHand: number; reorderLevel: number; lowStock: boolean };

export default function AdminInventory() {
  const userName = useCurrentUserName();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [reorderLevel, setReorderLevel] = useState(0);
  const [txItemId, setTxItemId] = useState("");
  const [txType, setTxType] = useState<"restock" | "consumption" | "adjustment">("restock");
  const [txQuantity, setTxQuantity] = useState(0);

  function load() {
    apiFetch<Item[]>("/inventory/items").then(setItems).catch((err) => setError(err instanceof Error ? err.message : "Could not load inventory."));
  }
  useEffect(load, []);

  async function addItem(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/inventory/items", { method: "POST", body: JSON.stringify({ name, category, unit, reorderLevel }) });
      setName(""); setCategory(""); setUnit(""); setReorderLevel(0);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add item.");
    }
  }

  async function recordTransaction(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/inventory/transactions", { method: "POST", body: JSON.stringify({ itemId: txItemId, type: txType, quantity: txQuantity }) });
      setTxQuantity(0);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record transaction.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Inventory</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Consumable stock, distinct from the fixed asset register. Quantity on
        hand is maintained from a real transaction ledger, not a bare counter.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Items">
          <ul className="divide-y divide-line">
            {items?.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2 text-sm">
                <span>{i.name} ({i.category})</span>
                <div className="flex items-center gap-2">
                  <span>{i.quantityOnHand} {i.unit}</span>
                  {i.lowStock && <Badge tone="warn">Low stock</Badge>}
                </div>
              </li>
            ))}
          </ul>
          <form onSubmit={addItem} className="mt-4 space-y-2 border-t border-line pt-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" className="input" />
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="input" />
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit (e.g. reams, boxes)" className="input" />
            <input type="number" min={0} value={reorderLevel || ""} onChange={(e) => setReorderLevel(Number(e.target.value))} placeholder="Reorder level" className="input" />
            <button type="submit" className="btn-primary">Add item</button>
          </form>
        </PortalSection>

        <PortalSection title="Record a transaction">
          <form onSubmit={recordTransaction} className="space-y-3">
            <select value={txItemId} onChange={(e) => setTxItemId(e.target.value)} className="input">
              <option value="">Choose item…</option>
              {items?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <select value={txType} onChange={(e) => setTxType(e.target.value as typeof txType)} className="input">
              <option value="restock">Restock</option>
              <option value="consumption">Consumption</option>
              <option value="adjustment">Adjustment</option>
            </select>
            <input type="number" value={txQuantity || ""} onChange={(e) => setTxQuantity(Number(e.target.value))} placeholder="Quantity" className="input" />
            <button type="submit" className="btn-primary">Record</button>
          </form>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
