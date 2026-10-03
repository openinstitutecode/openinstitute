import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge, StatCard } from "../../components/portal/Primitives";
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

type FailedLogins = { totalAttempts: number; repeatedTargets: { email: string; count: number }[]; recent: { email: string; reason: string; attemptedAt: string }[] };
type MfaStatus = { totalActiveUsers: number; withoutMfaCount: number; withoutMfa: { email: string; role: string }[] };
type ApiKeyRow = { id: string; label: string; createdAt: string; revokedAt: string | null; lastUsedAt: string | null };

export default function AdminSecurity() {
  const userName = useCurrentUserName();
  const [failedLogins, setFailedLogins] = useState<FailedLogins | null>(null);
  const [mfa, setMfa] = useState<MfaStatus | null>(null);
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<FailedLogins>("/security/failed-logins").then(setFailedLogins).catch((err) => setError(err instanceof Error ? err.message : "Could not load."));
    apiFetch<MfaStatus>("/security/mfa-status").then(setMfa).catch(() => undefined);
    apiFetch<ApiKeyRow[]>("/security/api-keys").then(setKeys).catch(() => undefined);
  }
  useEffect(load, []);

  async function createKey(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setRawKey(null);
    try {
      const res = await apiFetch<{ rawKey: string }>("/security/api-keys", { method: "POST", body: JSON.stringify({ label: newKeyLabel }) });
      setRawKey(res.rawKey);
      setNewKeyLabel("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create key.");
    }
  }

  async function revoke(id: string) {
    await apiFetch(`/security/api-keys/${id}/revoke`, { method: "PATCH" }).catch(() => undefined);
    load();
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Security centre</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Real failed-login attempts and MFA enrollment status — not a cosmetic security score.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {(failedLogins || mfa) && (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard label="Failed logins (last 200)" value={failedLogins?.totalAttempts ?? "—"} />
          <StatCard label="Repeated targets" value={failedLogins?.repeatedTargets.length ?? "—"} />
          <StatCard label="Active users without MFA" value={mfa?.withoutMfaCount ?? "—"} />
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Recent failed logins">
          <ul className="divide-y divide-line max-h-72 overflow-y-auto">
            {failedLogins?.recent.map((a, i) => (
              <li key={i} className="py-2 text-sm">
                {a.email} — <span className="text-xs text-ink/50">{a.reason.replace("_", " ")}</span>
                <p className="text-xs text-ink/40">{new Date(a.attemptedAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        </PortalSection>

        <PortalSection title="Users without MFA">
          <ul className="divide-y divide-line max-h-72 overflow-y-auto">
            {mfa?.withoutMfa.map((u, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span>{u.email}</span>
                <Badge tone="warn">{u.role}</Badge>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>

      <div className="mt-6">
        <PortalSection title="API keys">
          <form onSubmit={createKey} className="flex gap-2">
            <input value={newKeyLabel} onChange={(e) => setNewKeyLabel(e.target.value)} placeholder="Key label (e.g. Mobile App)" className="input flex-1" />
            <button type="submit" className="btn-primary shrink-0">Create key</button>
          </form>
          {rawKey && (
            <p className="mt-2 rounded border border-line bg-cream p-2 text-xs">
              Copy this now — it will not be shown again: <span className="font-mono">{rawKey}</span>
            </p>
          )}
          <ul className="mt-3 divide-y divide-line">
            {keys?.map((k) => (
              <li key={k.id} className="flex items-center justify-between py-2 text-sm">
                <span>{k.label}</span>
                <div className="flex items-center gap-2">
                  {k.revokedAt ? <Badge tone="danger">Revoked</Badge> : <Badge tone="ok">Active</Badge>}
                  {!k.revokedAt && <button onClick={() => revoke(k.id)} className="text-xs text-navy-dark underline decoration-dotted">Revoke</button>}
                </div>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
