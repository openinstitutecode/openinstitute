import { FormEvent, useState } from "react";
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

type Flag = {
  id: string;
  flagType: string;
  severity: "info" | "warning" | "critical" | string;
  details: string;
  flaggedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

// EX016 — automatic activity events (tab-switch etc.), distinct from the
// one-time Flag check above.
type ActivityEvent = { id: string; eventType: string; occurredAt: string };
type ActivityLog = { sessionId: string; events: ActivityEvent[]; tabHiddenCount: number };

const toneFor: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  info: "neutral",
  warning: "warn",
  critical: "danger",
};

export default function AdminExamSecurity() {
  const userName = useCurrentUserName();
  const [sessionId, setSessionId] = useState("");
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [activity, setActivity] = useState<ActivityLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function fetchFlags() {
    if (!sessionId.trim()) return;
    setBusy(true);
    try {
      const f = await apiFetch<Flag[]>(`/exam-security/${sessionId.trim()}/flags`);
      setFlags(f);
      const a = await apiFetch<ActivityLog>(`/exam-security/${sessionId.trim()}/activity`);
      setActivity(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load flags.");
    } finally {
      setBusy(false);
    }
  }

  function loadFlags(e: FormEvent) {
    e.preventDefault();
    setError(null);
    fetchFlags();
  }

  async function markReviewed(flagId: string) {
    try {
      await apiFetch(`/exam-security/${sessionId.trim()}/flags/${flagId}/review`, { method: "PATCH" });
      fetchFlags();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save review.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Exam session security</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Browser/environment checks are <strong>advisory only</strong> — they
        never block a student from taking an exam. Flags here (VM markers,
        automation tooling, unusual screen size, and similar) are for an
        examiner to review, not an automated finding of misconduct.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8">
        <PortalSection title="Look up an exam session">
          <form onSubmit={loadFlags} className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Exam session ID</span>
              <input value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="input mt-1.5 w-80" placeholder="cku1a2b3c..." />
            </label>
            <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
              {busy ? "Loading…" : "Load flags"}
            </button>
          </form>

          {flags && (
            <div className="mt-6 border-t border-line pt-4">
              {flags.length === 0 && <p className="text-sm text-ink/50">No security flags recorded for this session.</p>}
              <ul className="divide-y divide-line">
                {flags.map((f) => (
                  <li key={f.id} className="py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">{f.flagType.replace(/_/g, " ")}</p>
                        <p className="mt-1 text-xs text-ink/55">{f.details}</p>
                        <p className="mt-1 text-xs text-ink/40">{new Date(f.flaggedAt).toLocaleString()}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Badge tone={toneFor[f.severity] ?? "neutral"}>{f.severity}</Badge>
                        {f.reviewedAt ? (
                          <span className="text-xs text-ink/45">Reviewed</span>
                        ) : (
                          <button onClick={() => markReviewed(f.id)} className="text-xs font-medium text-forest hover:underline">
                            Mark reviewed
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </PortalSection>

        {activity && (
          <PortalSection title="Activity log">
            <p className="text-sm text-ink/60">
              {activity.tabHiddenCount === 0
                ? "No tab-switching detected during this attempt."
                : `Tab left the exam ${activity.tabHiddenCount} time(s) during this attempt.`}{" "}
              Advisory only, same as the flags above.
            </p>
            {activity.events.length > 0 && (
              <ul className="mt-3 divide-y divide-line text-xs text-ink/55">
                {activity.events.map((e) => (
                  <li key={e.id} className="flex justify-between py-2">
                    <span>{e.eventType.replace(/_/g, " ")}</span>
                    <span>{new Date(e.occurredAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </PortalSection>
        )}
      </div>
    </PortalShell>
  );
}
