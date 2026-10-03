import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { QrCode } from "../../components/portal/QrCode";
import { DocLetterhead } from "../../components/Logo";
import { useConfirm } from "../../components/portal/useConfirm";

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
  { to: "/admin/regulatory-reports", label: "Regulatory Reports" },
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

type Standing = {
  averageScore: number | null;
  failedUnitsCount: number;
  standing: string;
  ruleApplied?: {
    goodStandingMinAverage: number;
    warningMinAverage: number;
    maxFailedUnitsForGood: number;
    maxFailedUnitsForWarning: number;
    isDefault: boolean;
  };
};

type ProgressionRule = {
  goodStandingMinAverage: number;
  warningMinAverage: number;
  maxFailedUnitsForGood: number;
  maxFailedUnitsForWarning: number;
  isDefault: boolean;
};

const standingTone: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  good: "ok",
  warning: "warn",
  probation: "danger",
  insufficient_data: "neutral",
};

export default function AdminRegistry() {
  const userName = useCurrentUserName();
  const [studentId, setStudentId] = useState("");
  const [type, setType] = useState<"transfer" | "exemption" | "deferment" | "withdrawal" | "readmission">("deferment");
  const [detail, setDetail] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);

  async function submitChange(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/registry/record-changes", {
        method: "POST",
        body: JSON.stringify({
          studentId,
          type,
          detail,
          effectiveDate: new Date(effectiveDate).toISOString(),
        }),
      });
      setDetail("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this change.");
    }
  }

  async function checkStanding() {
    if (!studentId) return;
    setError(null);
    try {
      const s = await apiFetch<Standing>(`/registry/academic-standing/${studentId}`);
      setStanding(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not compute standing.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Registry actions</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Transfers, exemptions, deferments, withdrawals, and readmissions —
        each recorded action updates the student's academic status
        automatically, so the two can never drift apart.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <PortalSection title="Record a change">
          <form onSubmit={submitChange} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Student ID</span>
              <input required value={studentId} onChange={(e) => setStudentId(e.target.value)} className="input mt-1.5" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Type</span>
              <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="input mt-1.5">
                <option value="transfer">Transfer</option>
                <option value="exemption">Exemption</option>
                <option value="deferment">Deferment (sets status: on leave)</option>
                <option value="withdrawal">Withdrawal (sets status: withdrawn)</option>
                <option value="readmission">Readmission (sets status: active)</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Detail</span>
              <textarea required rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} className="input mt-1.5" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Effective date</span>
              <input required type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="input mt-1.5" />
            </label>
            <button type="submit" className="btn-primary w-full justify-center">Record change</button>
            {saved && <p className="text-xs text-forest">Recorded.</p>}
          </form>
        </PortalSection>

        <PortalSection title="Academic standing">
          <button onClick={checkStanding} className="btn-secondary w-full justify-center">
            Check standing for this student
          </button>
          {standing && (
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span>Average score</span>
                <span>{standing.averageScore !== null ? `${standing.averageScore.toFixed(1)}%` : "No graded work yet"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Failed units</span>
                <span>{standing.failedUnitsCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Standing</span>
                <Badge tone={standingTone[standing.standing]}>{standing.standing.replace("_", " ")}</Badge>
              </div>
              {standing.ruleApplied && (
                <p className="text-xs text-ink/45">
                  Thresholds: ≥{standing.ruleApplied.goodStandingMinAverage}% & ≤{standing.ruleApplied.maxFailedUnitsForGood} failed = good,
                  {" "}≥{standing.ruleApplied.warningMinAverage}% or ≤{standing.ruleApplied.maxFailedUnitsForWarning} failed = warning
                  {standing.ruleApplied.isDefault ? " (institution default — no rule configured for this programme)" : " (configured for this programme)"}
                </p>
              )}
            </div>
          )}
        </PortalSection>
      </div>

      {/* RG015 — configurable pass-mark / progression-rule engine, per
          programme, instead of a single hardcoded threshold. */}
      <div className="mt-6">
        <ProgressionRuleEditor />
      </div>

      {/* RG006 — academic history: every real Enrollment row for whichever
          student ID is entered above, in one browsable view. */}
      <div className="mt-6">
        <AcademicHistory studentId={studentId} />
      </div>

      {/* RG021 — transcript version control + RG032-034 registrar-issued
          letters, both scoped to whichever student ID is entered above. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <TranscriptHistory studentId={studentId} />
        <IssueLetter studentId={studentId} />
      </div>

      {/* RG003/004/005 — registrar-side registration actions */}
      <RegistrarRegistrationActions />

      {/* RG040 — AI registrar assistant, grounded in a real live fact sheet. */}
      <div className="mt-6">
        <RegistrarAssistant />
      </div>

      {/* RG031 — academic records archive: a real browsable view over
          every AcademicRecordChange on record. */}
      <div className="mt-6">
        <RecordsArchive />
      </div>
    </PortalShell>
  );
}

// RG015 — a real per-programme progression rule, editable here. Reads the
// programme's actual configured rule (or the institution default if none
// exists yet) and PUTs a validated replacement.
function ProgressionRuleEditor() {
  const [programmeId, setProgrammeId] = useState("");
  const [rule, setRule] = useState<ProgressionRule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!programmeId) return;
    setError(null);
    setSaved(false);
    setLoading(true);
    try {
      const r = await apiFetch<ProgressionRule>(`/registry/progression-rules/${programmeId}`);
      setRule(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the progression rule.");
      setRule(null);
    } finally {
      setLoading(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!rule) return;
    setError(null);
    setSaved(false);
    try {
      const updated = await apiFetch<ProgressionRule>(`/registry/progression-rules/${programmeId}`, {
        method: "PUT",
        body: JSON.stringify({
          goodStandingMinAverage: rule.goodStandingMinAverage,
          warningMinAverage: rule.warningMinAverage,
          maxFailedUnitsForGood: rule.maxFailedUnitsForGood,
          maxFailedUnitsForWarning: rule.maxFailedUnitsForWarning,
        }),
      });
      setRule({ ...updated, isDefault: false });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the progression rule.");
    }
  }

  return (
    <PortalSection title="Progression rules (per programme)">
      <p className="text-xs text-ink/55">
        Configure the pass-mark and failed-unit thresholds academic standing
        is computed against for a specific programme, instead of the single
        institution-wide default.
      </p>
      <div className="mt-4 flex gap-3">
        <input value={programmeId} onChange={(e) => setProgrammeId(e.target.value)} placeholder="Programme ID" className="input" />
        <button onClick={load} disabled={loading} className="btn-secondary shrink-0">
          {loading ? "Loading…" : "Load"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-navy-dark">{error}</p>}
      {rule && (
        <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-ink/70">Good standing: min average %</span>
            <input
              type="number"
              value={rule.goodStandingMinAverage}
              onChange={(e) => setRule({ ...rule, goodStandingMinAverage: Number(e.target.value) })}
              className="input mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink/70">Warning: min average %</span>
            <input
              type="number"
              value={rule.warningMinAverage}
              onChange={(e) => setRule({ ...rule, warningMinAverage: Number(e.target.value) })}
              className="input mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink/70">Good standing: max failed units</span>
            <input
              type="number"
              value={rule.maxFailedUnitsForGood}
              onChange={(e) => setRule({ ...rule, maxFailedUnitsForGood: Number(e.target.value) })}
              className="input mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink/70">Warning: max failed units</span>
            <input
              type="number"
              value={rule.maxFailedUnitsForWarning}
              onChange={(e) => setRule({ ...rule, maxFailedUnitsForWarning: Number(e.target.value) })}
              className="input mt-1"
            />
          </label>
          <p className="text-xs text-ink/45 sm:col-span-2">
            {rule.isDefault ? "Currently using the institution default." : "This programme has its own configured rule."}
          </p>
          <button type="submit" className="btn-primary sm:col-span-2">Save rule</button>
          {saved && <p className="text-xs text-forest sm:col-span-2">Saved.</p>}
        </form>
      )}
    </PortalSection>
  );
}

function AcademicHistory({ studentId }: { studentId: string }) {
  type HistoryRow = {
    id: string;
    unitCode: string;
    unitTitle: string;
    semester: string;
    status: string;
    finalGrade: string | null;
    creditHours: number;
  };
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!studentId) return;
    setError(null);
    try {
      setRows(await apiFetch<HistoryRow[]>(`/registry/academic-history/${studentId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load academic history.");
    }
  }

  return (
    <PortalSection title="Academic history">
      <button onClick={load} className="btn-secondary w-full justify-center">
        Load history for this student
      </button>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {rows && rows.length === 0 && <p className="mt-3 text-sm text-ink/50">No enrollment history on record.</p>}
      {rows && rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-ink/50">
                <th className="pb-2 pr-4 font-medium">Unit</th>
                <th className="pb-2 pr-4 font-medium">Semester</th>
                <th className="pb-2 pr-4 font-medium">Credits</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-4">{r.unitCode} — {r.unitTitle}</td>
                  <td className="py-2 pr-4">{r.semester}</td>
                  <td className="py-2 pr-4">{r.creditHours}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={r.status === "completed" ? "ok" : r.status === "failed" ? "danger" : "neutral"}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="py-2">{r.finalGrade ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalSection>
  );
}

function RecordsArchive() {
  type Change = { id: string; type: string; detail: string; effectiveDate: string; student: { fullName: string; studentNumber: string } };
  const [type, setType] = useState("");
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setChanges(await apiFetch<Change[]>(`/registry/records-archive${type ? `?type=${type}` : ""}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load archive.");
    }
  }
  useEffect(() => { load(); }, []);

  return (
    <PortalSection title="Academic records archive">
      <div className="flex gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className="input flex-1">
          <option value="">All types</option>
          <option value="transfer">Transfer</option>
          <option value="exemption">Exemption</option>
          <option value="deferment">Deferment</option>
          <option value="withdrawal">Withdrawal</option>
          <option value="readmission">Readmission</option>
        </select>
        <button onClick={load} className="btn-secondary shrink-0">Filter</button>
      </div>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      <ul className="mt-3 divide-y divide-line max-h-96 overflow-y-auto">
        {changes?.map((c) => (
          <li key={c.id} className="py-2 text-sm">
            <p>{c.student.fullName} ({c.student.studentNumber}) — <span className="uppercase text-xs text-ink/50">{c.type}</span></p>
            <p className="text-xs text-ink/60">{c.detail}</p>
            <p className="text-xs text-ink/40">{new Date(c.effectiveDate).toLocaleDateString()}</p>
          </li>
        ))}
      </ul>
    </PortalSection>
  );
}

function TranscriptHistory({ studentId }: { studentId: string }) {
  const [confirm, confirmDialog] = useConfirm();
  type Version = { id: string; documentId: string; issuedAt: string; revoked: boolean; version: number; current: boolean };
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!studentId) return;
    setError(null);
    try {
      const v = await apiFetch<Version[]>(`/credentials/transcripts/${studentId}/history`);
      setVersions(v);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load transcript history.");
    }
  }

  // Uses the existing registrar-only issuing endpoint (blocked by an active financial hold, which comes back as the error message).
  async function issue() {
    if (!studentId) return;
    if (!(await confirm({ title: "Issue an official transcript?", body: "It locks in this student's current grades.", confirmLabel: "Issue" }))) return;
    setError(null);
    try {
      await apiFetch(`/credentials/transcripts/${studentId}`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not issue the transcript.");
    }
  }

  return (
    <PortalSection title="Transcript version history">
      {confirmDialog}
      <div className="flex gap-2">
        <button onClick={load} className="btn-secondary flex-1 justify-center">Load history for this student</button>
        <button onClick={issue} disabled={!studentId} className="btn-primary shrink-0 disabled:opacity-50">Issue transcript</button>
      </div>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {versions && versions.length === 0 && <p className="mt-2 text-sm text-ink/50">No transcripts issued yet.</p>}
      <ul className="mt-3 divide-y divide-line">
        {versions?.map((v) => (
          <li key={v.id} className="flex items-center justify-between py-2 text-sm">
            <span>v{v.version} — {v.documentId}</span>
            <div className="flex items-center gap-2">
              {v.current && <Badge tone="ok">Current</Badge>}
              {v.revoked && <Badge tone="danger">Revoked</Badge>}
              <Link to={`/transcript/${v.documentId}`} className="text-xs text-navy underline">View / print</Link>
              <span className="text-xs text-ink/45">{new Date(v.issuedAt).toLocaleDateString()}</span>
            </div>
          </li>
        ))}
      </ul>
    </PortalSection>
  );
}

function IssueLetter({ studentId }: { studentId: string }) {
  const [type, setType] = useState<"status" | "enrollment_verification" | "completion">("status");
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ documentId: string; content: string; verificationUrl: string } | null>(null);

  async function issue() {
    if (!studentId) return;
    setError(null);
    setIssued(null);
    try {
      const letter = await apiFetch<{ documentId: string; content: string; verificationUrl: string }>(`/credentials/letters/${studentId}`, {
        method: "POST",
        body: JSON.stringify({ type }),
      });
      setIssued(letter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not issue that letter.");
    }
  }

  return (
    <PortalSection title="Issue a letter">
      <div className="flex gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="input flex-1">
          <option value="status">Status letter</option>
          <option value="enrollment_verification">Enrollment verification</option>
          <option value="completion">Completion letter</option>
        </select>
        <button onClick={issue} className="btn-primary shrink-0">Issue</button>
      </div>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {issued && (
        <div className="mt-3 border-t border-line pt-3 text-sm">
          <DocLetterhead title="Official letter" />
          <p className="text-xs text-ink/45">{issued.documentId}</p>
          <p className="mt-1 text-ink/70">{issued.content}</p>
          <div className="mt-3">
            <QrCode data={issued.verificationUrl} size={120} alt="Scan to verify this letter" />
          </div>
        </div>
      )}
    </PortalSection>
  );
}

function RegistrarAssistant() {
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
      const res = await apiFetch<{ reply: string }>("/ai/registrar-assistant", {
        method: "POST",
        body: JSON.stringify({ message: userMessage.content }),
      });
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the assistant.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalSection title="AI registrar assistant">
      <p className="text-xs text-ink/50">
        Grounded in a live fact sheet of real institutional counts — not a
        full natural-language database query engine. It will say so if a
        question falls outside that fact sheet.
      </p>
      <div className="mt-3 space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === "user" ? "font-medium" : "text-ink/75"}`}>{m.content}</div>
        ))}
        {loading && <p className="text-sm text-ink/40">Thinking…</p>}
        {error && <p className="text-sm text-navy-dark">{error}</p>}
      </div>
      <form onSubmit={submit} className="mt-3 flex gap-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. How many students are enrolled?" className="input flex-1" />
        <button type="submit" className="btn-primary" disabled={loading}>Ask</button>
      </form>
    </PortalSection>
  );
}

// ---------------------------------------------------------------------------
// RG003/004/005 — registrar-side registration actions: administrative
// enrollment verification, programme registration/transfer, and course
// (unit) registration. Distinct from student self-service — these are
// actions a registrar takes on a student's behalf, each audited.
// ---------------------------------------------------------------------------

export function RegistrarRegistrationActions() {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-3">
      <EnrollmentVerification />
      <ProgrammeRegistration />
      <CourseRegistration />
    </div>
  );
}

function EnrollmentVerification() {
  const [studentId, setStudentId] = useState("");
  const [result, setResult] = useState<{ fullName: string; programme: string; academicStatus: string; enrollments: { unit: string; code: string; semester: string; status: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setError(null);
    try {
      setResult(await apiFetch(`/registry/enrollment-verification/${studentId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify.");
    }
  }

  return (
    <PortalSection title="Enrollment verification">
      <input value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="Student ID" className="input" />
      <button onClick={verify} className="btn-secondary mt-2 w-full justify-center">Verify</button>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {result && (
        <div className="mt-3 text-sm">
          <p className="font-medium">{result.fullName} — {result.programme}</p>
          <p className="text-xs text-ink/50">Status: {result.academicStatus}</p>
          <ul className="mt-2 space-y-1">
            {result.enrollments.map((e, i) => (
              <li key={i} className="text-xs text-ink/60">{e.code} {e.unit} ({e.semester}): {e.status}</li>
            ))}
          </ul>
        </div>
      )}
    </PortalSection>
  );
}

function ProgrammeRegistration() {
  const [studentId, setStudentId] = useState("");
  const [programmeId, setProgrammeId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    try {
      await apiFetch("/registry/programme-registration", { method: "POST", body: JSON.stringify({ studentId, programmeId, reason }) });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register.");
    }
  }

  return (
    <PortalSection title="Programme registration">
      <form onSubmit={submit} className="space-y-2">
        <input value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="Student ID" className="input" />
        <input value={programmeId} onChange={(e) => setProgrammeId(e.target.value)} placeholder="Programme ID" className="input" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="input" />
        <button type="submit" className="btn-primary w-full justify-center">Register</button>
      </form>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {done && <p className="mt-2 text-xs text-forest">Registered.</p>}
    </PortalSection>
  );
}

function CourseRegistration() {
  const [studentId, setStudentId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [semester, setSemester] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    try {
      await apiFetch("/registry/course-registration", { method: "POST", body: JSON.stringify({ studentId, unitId, semester }) });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register — check for a duplicate enrollment.");
    }
  }

  return (
    <PortalSection title="Course registration (administrative)">
      <form onSubmit={submit} className="space-y-2">
        <input value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="Student ID" className="input" />
        <input value={unitId} onChange={(e) => setUnitId(e.target.value)} placeholder="Unit ID" className="input" />
        <input value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="Semester (e.g. 2026-S1)" className="input" />
        <button type="submit" className="btn-primary w-full justify-center">Enroll</button>
      </form>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {done && <p className="mt-2 text-xs text-forest">Enrolled.</p>}
    </PortalSection>
  );
}
