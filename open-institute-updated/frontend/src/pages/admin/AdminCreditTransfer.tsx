import { useEffect, useState } from "react";
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

type Request = {
  id: string;
  fromUnitName: string;
  requestedAt: string;
  status: string;
  student: { user: { name?: string | null; email: string }; programme: { name: string } };
  toUnit: { title: string; code: string; programme: { name: string } };
};

export default function AdminCreditTransfer() {
  const userName = useCurrentUserName();
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [prereqOk, setPrereqOk] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    apiFetch<Request[]>("/credit-transfer/pending")
      .then(setRequests)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load pending requests."));
  }
  useEffect(load, []);

  async function decide(id: string, status: "approved" | "rejected") {
    setBusyId(id);
    setError(null);
    try {
      await apiFetch(`/credit-transfer/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          adminFeedback: feedback[id] ?? "",
          prerequisiteCheck: prereqOk[id] ?? false,
        }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record decision.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Credit transfer requests</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Students submit these from their own portal. Registrar / Super
        Admin only. Approving does not automatically create an enrolment
        record — the request itself is stamped as approved and audit
        logged.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8">
        <PortalSection title="Pending requests">
          {requests && requests.length === 0 && <p className="text-sm text-ink/50">Nothing pending.</p>}
          <ul className="divide-y divide-line">
            {requests?.map((r) => (
              <li key={r.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {r.student.user.name ?? r.student.user.email} <Badge tone="neutral">{r.student.programme.name}</Badge>
                    </p>
                    <p className="mt-1 text-xs text-ink/55">
                      Transfer credit from <strong>{r.fromUnitName}</strong> towards{" "}
                      <strong>
                        {r.toUnit.code} — {r.toUnit.title}
                      </strong>{" "}
                      ({r.toUnit.programme.name})
                    </p>
                    <p className="mt-1 text-xs text-ink/40">Requested {new Date(r.requestedAt).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={prereqOk[r.id] ?? false}
                      onChange={(e) => setPrereqOk((p) => ({ ...p, [r.id]: e.target.checked }))}
                    />
                    Prerequisites verified
                  </label>
                  <input
                    value={feedback[r.id] ?? ""}
                    onChange={(e) => setFeedback((f) => ({ ...f, [r.id]: e.target.value }))}
                    placeholder="Feedback to student (optional)"
                    className="input flex-1 min-w-[16rem]"
                  />
                  <button onClick={() => decide(r.id, "approved")} disabled={busyId === r.id} className="btn-primary disabled:opacity-50">
                    Approve
                  </button>
                  <button
                    onClick={() => decide(r.id, "rejected")}
                    disabled={busyId === r.id}
                    className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
