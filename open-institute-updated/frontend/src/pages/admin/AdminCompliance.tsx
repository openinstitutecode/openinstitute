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

type ComplianceRow = {
  id: string;
  regulator: string;
  category: string;
  requirement: string;
  mandatory: boolean;
  status: string;
  evidenceDocUrl: string | null;
  nextReviewDue: string | null;
};

const statusTone: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  met: "ok",
  in_progress: "warn",
  pending: "neutral",
  expired: "danger",
};

export default function AdminCompliance() {
  const userName = useCurrentUserName();
  const [rows, setRows] = useState<ComplianceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ComplianceRow[]>("/compliance")
      .then(setRows)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load the evidence vault.")
      );
  }, []);

  const grouped = rows?.reduce<Record<string, ComplianceRow[]>>((acc, r) => {
    (acc[r.regulator] ??= []).push(r);
    return acc;
  }, {});

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Accreditation evidence vault</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Every regulatory requirement, its current status, and the evidence
        behind it — ready to show an inspector directly from this screen.
      </p>

      {error && <p className="mt-6 text-sm text-navy-dark">{error}</p>}

      {grouped &&
        Object.entries(grouped).map(([regulator, items]) => (
          <div key={regulator} className="mt-8">
            <PortalSection title={regulator}>
              <div className="divide-y divide-line">
                {items.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <p>{r.requirement}</p>
                      {r.nextReviewDue && (
                        <p className="text-xs text-ink/40">
                          Next review: {new Date(r.nextReviewDue).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {r.category !== "general" && <Badge tone="neutral">{r.category.replace("_", " ")}</Badge>}
                      {r.evidenceDocUrl ? (
                        <a href={r.evidenceDocUrl} className="text-xs text-navy hover:underline">
                          Evidence
                        </a>
                      ) : (
                        <span className="text-xs text-ink/30">No evidence filed</span>
                      )}
                      <Badge tone={statusTone[r.status] ?? "neutral"}>{r.status.replace("_", " ")}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </PortalSection>
          </div>
        ))}

      {/* AI022/QA040 — AI QA assistant, grounded in real compliance data. */}
      <div className="mt-8">
        <QaAssistant />
      </div>

      {/* AD020 — institutional records: policy documents plus an
          aggregated real view combining them with meeting minutes and
          calendar events. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <PolicyDocuments />
        <InstitutionalRecords />
      </div>
    </PortalShell>
  );
}

function PolicyDocuments() {
  type Doc = { id: string; title: string; category: string; version: number; documentUrl: string };
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<"academic" | "financial" | "hr" | "it" | "safeguarding" | "other">("academic");
  const [documentUrl, setDocumentUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Doc[]>("/compliance/policy-documents").then(setDocs).catch(() => setDocs([]));
  }
  useEffect(load, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/compliance/policy-documents", { method: "POST", body: JSON.stringify({ title, category, documentUrl }) });
      setTitle(""); setDocumentUrl("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add document.");
    }
  }

  return (
    <PortalSection title="Policy documents">
      <ul className="divide-y divide-line">
        {docs?.map((d) => (
          <li key={d.id} className="py-2 text-sm">
            <a href={d.documentUrl} target="_blank" rel="noreferrer" className="underline">{d.title}</a>
            <span className="ml-2 text-xs text-ink/45">v{d.version} · {d.category}</span>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-3 space-y-2 border-t border-line pt-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="input" />
        <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="input">
          <option value="academic">Academic</option>
          <option value="financial">Financial</option>
          <option value="hr">HR</option>
          <option value="it">IT</option>
          <option value="safeguarding">Safeguarding</option>
          <option value="other">Other</option>
        </select>
        <input value={documentUrl} onChange={(e) => setDocumentUrl(e.target.value)} placeholder="Document URL" className="input" />
        <button type="submit" className="btn-primary">Add policy document</button>
      </form>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
    </PortalSection>
  );
}

function InstitutionalRecords() {
  type Records = {
    policyDocuments: { id: string; title: string; category: string }[];
    meetingMinutes: { id: string; committee: string; title: string; scheduledAt: string }[];
    calendarEvents: { id: string; title: string; type: string; startDate: string }[];
  };
  const [records, setRecords] = useState<Records | null>(null);

  useEffect(() => {
    apiFetch<Records>("/compliance/institutional-records").then(setRecords).catch(() => undefined);
  }, []);

  return (
    <PortalSection title="Institutional records archive">
      {records && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink/50">Meeting minutes</p>
            <ul className="mt-1 space-y-1">
              {records.meetingMinutes.slice(0, 5).map((m) => (
                <li key={m.id} className="text-sm">{m.committee} — {m.title}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink/50">Calendar events</p>
            <ul className="mt-1 space-y-1">
              {records.calendarEvents.slice(0, 5).map((c) => (
                <li key={c.id} className="text-sm">{c.title} ({c.type.replace("_", " ")})</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </PortalSection>
  );
}

function QaAssistant() {
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
      const res = await apiFetch<{ reply: string }>("/ai/qa-assistant", { method: "POST", body: JSON.stringify({ message: userMessage.content }) });
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the assistant.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalSection title="AI QA assistant">
      <p className="text-xs text-ink/50">
        Grounded in real compliance-requirement and corrective-action data — it identifies risks from
        what's on record, but cannot certify actual regulatory compliance on the institution's behalf.
      </p>
      <div className="mt-3 space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === "user" ? "font-medium" : "text-ink/75"}`}>{m.content}</div>
        ))}
        {loading && <p className="text-sm text-ink/40">Thinking…</p>}
        {error && <p className="text-sm text-navy-dark">{error}</p>}
      </div>
      <form onSubmit={submit} className="mt-3 flex gap-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Which requirements have overdue reviews?" className="input flex-1" />
        <button type="submit" className="btn-primary" disabled={loading}>Ask</button>
      </form>
    </PortalSection>
  );
}
