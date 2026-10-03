import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge, Table } from "../../components/portal/Primitives";
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

type Preview = {
  totalRows: number;
  headers: string[];
  preview: Record<string, string>[];
  expectedFields: string[];
};

type ImportResult = {
  sessionId: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  errors: { row?: number; message?: string }[];
};

type Session = {
  id: string;
  importType: string;
  fileName: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  status: string;
  createdAt: string;
  importedByUser?: { email: string; name?: string | null };
};

const importTypes = ["students", "results", "staff", "courses"] as const;

export default function AdminDataImport() {
  const userName = useCurrentUserName();
  const [importType, setImportType] = useState<(typeof importTypes)[number]>("students");
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadSessions() {
    apiFetch<Session[]>("/data-import/sessions")
      .then(setSessions)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load import sessions."));
  }
  useEffect(loadSessions, []);

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function doPreview(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPreview(null);
    setResult(null);
    if (!csvText.trim()) {
      setError("Choose or paste a CSV first.");
      return;
    }
    setBusy("preview");
    try {
      const p = await apiFetch<Preview>("/data-import/preview", {
        method: "POST",
        body: JSON.stringify({ importType, csvText }),
      });
      setPreview(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not preview CSV.");
    } finally {
      setBusy(null);
    }
  }

  async function doImport() {
    setError(null);
    setBusy("import");
    try {
      const r = await apiFetch<ImportResult>("/data-import", {
        method: "POST",
        body: JSON.stringify({ importType, csvText, fileName: fileName || `${importType}.csv` }),
      });
      setResult(r);
      loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Data import</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Bulk-load students, results, staff or courses from a CSV. Preview
        the first rows before committing — nothing is written until you
        click "Run import". Admin-only.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="1. Choose file and preview">
          <form onSubmit={doPreview} className="space-y-3">
            <select value={importType} onChange={(e) => setImportType(e.target.value as typeof importType)} className="input">
              {importTypes.map((t) => (
                <option key={t} value={t}>
                  {t[0].toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
            <input type="file" accept=".csv,text/csv" onChange={handleFile} className="input" />
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={6}
              placeholder="…or paste CSV text directly, header row first"
              className="input font-mono text-xs"
            />
            <button type="submit" disabled={busy === "preview"} className="btn-primary disabled:opacity-50">
              {busy === "preview" ? "Reading…" : "Preview"}
            </button>
          </form>

          {preview && (
            <div className="mt-6 border-t border-line pt-4">
              <p className="text-sm text-ink/70">
                {preview.totalRows} data row{preview.totalRows === 1 ? "" : "s"} detected. Expected columns for{" "}
                <strong>{importType}</strong>: {preview.expectedFields.join(", ")}
              </p>
              <div className="mt-3">
                <Table
                  columns={preview.headers}
                  rows={preview.preview.map((row) => preview.headers.map((h) => row[h] ?? ""))}
                />
              </div>
              <button onClick={doImport} disabled={busy === "import"} className="btn-primary mt-4 disabled:opacity-50">
                {busy === "import" ? "Importing…" : `Run import (${preview.totalRows} rows)`}
              </button>
            </div>
          )}

          {result && (
            <div className="mt-6 border-t border-line pt-4 text-sm">
              <p>
                <Badge tone={result.errorRows === 0 ? "ok" : "warn"}>
                  {result.successRows} succeeded / {result.errorRows} failed
                </Badge>
              </p>
              {result.errors.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-ink/60">
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      {e.row !== undefined ? `Row ${e.row}: ` : ""}
                      {e.message ?? "Unknown error"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </PortalSection>

        <PortalSection title="Recent import sessions">
          {sessions && sessions.length === 0 && <p className="text-sm text-ink/50">No imports yet.</p>}
          <ul className="divide-y divide-line">
            {sessions?.map((s) => (
              <li key={s.id} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {s.importType} — {s.fileName}
                  </span>
                  <Badge tone={s.status === "completed" ? (s.errorRows > 0 ? "warn" : "ok") : "neutral"}>{s.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink/45">
                  {new Date(s.createdAt).toLocaleString()} · {s.successRows}/{s.totalRows} succeeded
                  {s.importedByUser ? ` · by ${s.importedByUser.name ?? s.importedByUser.email}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
