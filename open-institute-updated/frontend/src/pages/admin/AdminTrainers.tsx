import { Fragment, FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
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

type TrainerRow = {
  id: string;
  fullName: string;
  department: string | null;
  email: string;
  tvetaLicenceNumber: string | null;
  licenceExpiry: string | null;
  licenceStatus: "valid" | "expiring" | "expired" | "unknown";
  licenceVerified: boolean;
  licenceVerifiedAt: string | null;
  licenceDocumentUrl: string | null;
  courseCount: number;
};

const statusTone: Record<TrainerRow["licenceStatus"], "ok" | "warn" | "danger" | "neutral"> = {
  valid: "ok",
  expiring: "warn",
  expired: "danger",
  unknown: "neutral",
};

type UnlinkedUser = { id: string; email: string; isActive: boolean };

export default function AdminTrainers() {
  const userName = useCurrentUserName();
  const [trainers, setTrainers] = useState<TrainerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [unlinkedUsers, setUnlinkedUsers] = useState<UnlinkedUser[]>([]);
  const [newUserId, setNewUserId] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newDepartment, setNewDepartment] = useState("");
  const [newLicenceNumber, setNewLicenceNumber] = useState("");
  const [newLicenceExpiry, setNewLicenceExpiry] = useState("");
  const [newLicenceDocUrl, setNewLicenceDocUrl] = useState("");
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDepartment, setEditDepartment] = useState("");
  const [editLicenceNumber, setEditLicenceNumber] = useState("");
  const [editLicenceExpiry, setEditLicenceExpiry] = useState("");
  const [editLicenceDocUrl, setEditLicenceDocUrl] = useState("");
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  function loadTrainers() {
    apiFetch<TrainerRow[]>("/trainers")
      .then(setTrainers)
      .catch((err) =>
        setError(
          err instanceof Error
            ? `${err.message} — you need HR_OFFICER, PRINCIPAL, QA_OFFICER, or SUPER_ADMIN.`
            : "Could not load trainers."
        )
      );
  }

  function loadUnlinked() {
    apiFetch<UnlinkedUser[]>("/trainers/unlinked-users")
      .then(setUnlinkedUsers)
      .catch(() => setUnlinkedUsers([]));
  }

  useEffect(() => {
    loadTrainers();
    loadUnlinked();
  }, []);

  async function createTrainer(e: FormEvent) {
    e.preventDefault();
    setCreateMsg(null);
    try {
      await apiFetch("/trainers", {
        method: "POST",
        body: JSON.stringify({
          userId: newUserId,
          fullName: newFullName,
          department: newDepartment || undefined,
          tvetaLicenceNumber: newLicenceNumber || undefined,
          licenceExpiry: newLicenceExpiry ? new Date(newLicenceExpiry).toISOString() : undefined,
          licenceDocumentUrl: newLicenceDocUrl || undefined,
        }),
      });
      setCreateMsg("Trainer profile created.");
      setNewUserId("");
      setNewFullName("");
      setNewDepartment("");
      setNewLicenceNumber("");
      setNewLicenceExpiry("");
      setNewLicenceDocUrl("");
      loadTrainers();
      loadUnlinked();
    } catch (err) {
      setCreateMsg(err instanceof Error ? err.message : "Could not create trainer profile.");
    }
  }

  function startEdit(t: TrainerRow) {
    setEditingId(t.id);
    setEditDepartment(t.department ?? "");
    setEditLicenceNumber(t.tvetaLicenceNumber ?? "");
    setEditLicenceExpiry(t.licenceExpiry ? t.licenceExpiry.slice(0, 10) : "");
    setEditLicenceDocUrl(t.licenceDocumentUrl ?? "");
    setEditMsg(null);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditMsg(null);
    try {
      await apiFetch(`/trainers/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          department: editDepartment || undefined,
          tvetaLicenceNumber: editLicenceNumber || undefined,
          licenceExpiry: editLicenceExpiry ? new Date(editLicenceExpiry).toISOString() : undefined,
          licenceDocumentUrl: editLicenceDocUrl || undefined,
        }),
      });
      setEditMsg("Saved. Any change to the licence number/expiry clears prior verification.");
      setEditingId(null);
      loadTrainers();
    } catch (err) {
      setEditMsg(err instanceof Error ? err.message : "Could not save changes.");
    }
  }

  // TP039 — the actual verification action: HR/Principal confirming the
  // licence on file is real, distinct from it just being typed into a form.
  async function verifyLicence(id: string) {
    setVerifyingId(id);
    try {
      await apiFetch(`/trainers/${id}/verify-licence`, { method: "PATCH" });
      loadTrainers();
    } catch (err) {
      setEditMsg(err instanceof Error ? err.message : "Could not verify licence.");
    } finally {
      setVerifyingId(null);
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Trainers &amp; HR</h1>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8">
        <PortalSection title="Add a trainer profile">
          <p className="mb-3 text-xs text-ink/45">
            The account must already exist with role TRAINER (create it on
            the Users &amp; RBAC page first) — this only creates the
            trainer-specific profile (department, licence) on top of it.
          </p>
          <form onSubmit={createTrainer} className="grid gap-3 sm:grid-cols-2">
            <select
              className="rounded border border-line px-3 py-2 text-sm"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              required
            >
              <option value="">Select TRAINER-role user without a profile…</option>
              {unlinkedUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </select>
            <input
              className="rounded border border-line px-3 py-2 text-sm"
              placeholder="Full name"
              value={newFullName}
              onChange={(e) => setNewFullName(e.target.value)}
              required
            />
            <input
              className="rounded border border-line px-3 py-2 text-sm"
              placeholder="Department"
              value={newDepartment}
              onChange={(e) => setNewDepartment(e.target.value)}
            />
            <input
              className="rounded border border-line px-3 py-2 text-sm"
              placeholder="TVETA licence number"
              value={newLicenceNumber}
              onChange={(e) => setNewLicenceNumber(e.target.value)}
            />
            <input
              type="date"
              className="rounded border border-line px-3 py-2 text-sm"
              value={newLicenceExpiry}
              onChange={(e) => setNewLicenceExpiry(e.target.value)}
            />
            <input
              className="rounded border border-line px-3 py-2 text-sm sm:col-span-2"
              placeholder="Licence document URL (scanned certificate)"
              value={newLicenceDocUrl}
              onChange={(e) => setNewLicenceDocUrl(e.target.value)}
            />
            <button type="submit" className="rounded bg-navy px-4 py-2 text-sm text-white">
              Create trainer profile
            </button>
          </form>
          {createMsg && <p className="mt-2 text-sm text-ink/60">{createMsg}</p>}
        </PortalSection>
      </div>

      <div className="mt-8">
        <PortalSection title="Trainer licences">
          {!trainers && !error && <LoadingState />}
          {trainers && trainers.length === 0 && <p className="text-sm text-ink/50">No trainers on file yet.</p>}
          {trainers && trainers.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink/50">
                    <th className="pb-3 pr-4 font-medium">Trainer</th>
                    <th className="pb-3 pr-4 font-medium">Department</th>
                    <th className="pb-3 pr-4 font-medium">Licence no.</th>
                    <th className="pb-3 pr-4 font-medium">Expiry</th>
                    <th className="pb-3 pr-4 font-medium">Courses</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 font-medium">Verified</th>
                    <th className="pb-3 font-medium">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {trainers.map((t) => (
                    <Fragment key={t.id}>
                      <tr key={t.id}>
                        <td className="py-3 pr-4">{t.fullName}<br /><span className="text-xs text-ink/40">{t.email}</span></td>
                        <td className="py-3 pr-4">{t.department ?? "—"}</td>
                        <td className="py-3 pr-4 font-mono text-xs">{t.tvetaLicenceNumber ?? "—"}</td>
                        <td className="py-3 pr-4">{t.licenceExpiry ? new Date(t.licenceExpiry).toLocaleDateString() : "—"}</td>
                        <td className="py-3 pr-4">{t.courseCount}</td>
                        <td className="py-3 pr-4">
                          <Badge tone={statusTone[t.licenceStatus]}>{t.licenceStatus}</Badge>
                        </td>
                        <td className="py-3 pr-4">
                          {t.licenceVerified ? (
                            <Badge tone="ok">Verified {t.licenceVerifiedAt ? new Date(t.licenceVerifiedAt).toLocaleDateString() : ""}</Badge>
                          ) : (
                            <button
                              className="text-xs font-medium text-navy underline disabled:opacity-50"
                              disabled={!t.tvetaLicenceNumber || verifyingId === t.id}
                              onClick={() => verifyLicence(t.id)}
                            >
                              {verifyingId === t.id ? "Verifying…" : "Verify"}
                            </button>
                          )}
                          {t.licenceDocumentUrl && (
                            <a href={t.licenceDocumentUrl} target="_blank" rel="noreferrer" className="ml-2 text-xs text-ink/40 underline">
                              doc
                            </a>
                          )}
                        </td>
                        <td className="py-3">
                          <button
                            className="text-xs text-navy underline"
                            onClick={() => (editingId === t.id ? setEditingId(null) : startEdit(t))}
                          >
                            {editingId === t.id ? "Cancel" : "Edit"}
                          </button>
                        </td>
                      </tr>
                      {editingId === t.id && (
                        <tr key={`${t.id}-edit`}>
                          <td colSpan={8} className="bg-cream/50 py-3">
                            <form onSubmit={saveEdit} className="flex flex-wrap items-end gap-3 px-2">
                              <input
                                className="rounded border border-line px-2 py-1 text-sm"
                                placeholder="Department"
                                value={editDepartment}
                                onChange={(e) => setEditDepartment(e.target.value)}
                              />
                              <input
                                className="rounded border border-line px-2 py-1 text-sm"
                                placeholder="Licence number"
                                value={editLicenceNumber}
                                onChange={(e) => setEditLicenceNumber(e.target.value)}
                              />
                              <input
                                type="date"
                                className="rounded border border-line px-2 py-1 text-sm"
                                value={editLicenceExpiry}
                                onChange={(e) => setEditLicenceExpiry(e.target.value)}
                              />
                              <input
                                className="rounded border border-line px-2 py-1 text-sm"
                                placeholder="Licence document URL"
                                value={editLicenceDocUrl}
                                onChange={(e) => setEditLicenceDocUrl(e.target.value)}
                              />
                              <button type="submit" className="rounded bg-navy px-3 py-1 text-sm text-white">
                                Save
                              </button>
                              {editMsg && <span className="text-xs text-ink/60">{editMsg}</span>}
                            </form>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PortalSection>
      </div>

      <p className="mt-2 text-xs text-ink/45">
        Activating/deactivating a trainer's account happens on the Users
        &amp; RBAC page — that's the single audited source of truth for
        account status (USER_DEACTIVATED / USER_REACTIVATED), so it isn't
        duplicated here.
      </p>

      <p className="mt-4 text-xs text-ink/45">
        Licence expiry alerts fire automatically 90, 30, and 7 days before
        expiry — that alerting job isn't wired up yet; this table currently
        just reflects live status computed on each page load.
      </p>
    </PortalShell>
  );
}
