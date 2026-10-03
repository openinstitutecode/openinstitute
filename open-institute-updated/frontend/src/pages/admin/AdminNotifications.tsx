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

type Notice = {
  id: string;
  channel: string;
  title: string;
  body: string;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
};

export default function AdminNotifications() {
  const userName = useCurrentUserName();
  const [mine, setMine] = useState<Notice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [userIds, setUserIds] = useState("");
  const [channel, setChannel] = useState<"email" | "sms" | "push" | "in_app">("in_app");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  function loadMine() {
    apiFetch<Notice[]>("/notifications/mine")
      .then(setMine)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load notifications."));
  }
  useEffect(loadMine, []);

  async function markRead(id: string) {
    try {
      await apiFetch(`/notifications/${id}/read`, { method: "PATCH" });
      loadMine();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark as read.");
    }
  }

  async function sendBroadcast(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const ids = userIds
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      setError("Provide at least one user ID.");
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{ results: { userId: string; sent?: boolean }[] }>("/notifications/broadcast", {
        method: "POST",
        body: JSON.stringify({ userIds: ids, channel, title, body }),
      });
      setNotice(`Sent to ${res.results.length} recipient${res.results.length === 1 ? "" : "s"}.`);
      setUserIds("");
      setTitle("");
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send broadcast.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Notifications</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Your own notifications on the left. Broadcasting to a set of users
        is restricted to Registrar, Admissions Officer, Principal and Super
        Admin.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}
      {notice && <p className="mt-4 text-sm text-forest">{notice}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="My notifications">
          {mine && mine.length === 0 && <p className="text-sm text-ink/50">Nothing yet.</p>}
          <ul className="divide-y divide-line">
            {mine?.map((n) => (
              <li key={n.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="mt-1 text-xs text-ink/55">{n.body}</p>
                    <p className="mt-1 text-xs text-ink/40">
                      {n.channel} · {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {n.readAt ? <Badge tone="neutral">Read</Badge> : <Badge tone="warn">Unread</Badge>}
                    {!n.readAt && (
                      <button onClick={() => markRead(n.id)} className="text-xs font-medium text-forest hover:underline">
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </PortalSection>

        <PortalSection title="Broadcast">
          <form onSubmit={sendBroadcast} className="space-y-3">
            <textarea
              value={userIds}
              onChange={(e) => setUserIds(e.target.value)}
              placeholder="Recipient user IDs — one per line or comma-separated"
              rows={3}
              className="input"
              required
            />
            <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} className="input">
              <option value="in_app">In-app</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="push">Push</option>
            </select>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="input" required />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" rows={4} className="input" required />
            <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
              {busy ? "Sending…" : "Send broadcast"}
            </button>
          </form>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
