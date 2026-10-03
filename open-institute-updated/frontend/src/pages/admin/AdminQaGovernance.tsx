import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge, StatCard } from "../../components/portal/Primitives";
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

type Risk = { id: string; title: string; category: string; likelihood: string; impact: string; status: string };
type GapAnalysis = { totalGaps: number; byRegulator: Record<string, number> };
type ComplaintsAnalytics = { total: number; byCategory: Record<string, number>; byStatus: Record<string, number> };
type QmsOverview = {
  requirementsTotal: number;
  requirementsMet: number;
  requirementsMetPct: number | null;
  openCorrectiveActions: number;
  openRisks: number;
  auditsInProgressOrPlanned: number;
  policyDocumentCount: number;
  qualityStandardCount: number;
  lastManagementReviewDate: string | null;
  managementReviewStale: boolean;
  lastIqaReviewDate: string | null;
};

export default function AdminQaGovernance() {
  const userName = useCurrentUserName();
  const [risks, setRisks] = useState<Risk[] | null>(null);
  const [gaps, setGaps] = useState<GapAnalysis | null>(null);
  const [complaintsStats, setComplaintsStats] = useState<ComplaintsAnalytics | null>(null);
  const [qms, setQms] = useState<QmsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [riskTitle, setRiskTitle] = useState("");
  const [riskDescription, setRiskDescription] = useState("");
  const [riskCategory, setRiskCategory] = useState("regulatory");
  const [likelihood, setLikelihood] = useState("medium");
  const [impact, setImpact] = useState("medium");
  const [ownerId, setOwnerId] = useState("");

  function load() {
    apiFetch<Risk[]>("/compliance/risks").then(setRisks).catch(() => setRisks([]));
    apiFetch<GapAnalysis>("/compliance/gap-analysis").then(setGaps).catch(() => setGaps(null));
    apiFetch<ComplaintsAnalytics>("/compliance/complaints-analytics").then(setComplaintsStats).catch(() => setComplaintsStats(null));
    apiFetch<QmsOverview>("/compliance/qms-overview").then(setQms).catch(() => setQms(null));
  }
  useEffect(load, []);

  async function addRisk(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/compliance/risks", {
        method: "POST",
        body: JSON.stringify({ title: riskTitle, description: riskDescription, category: riskCategory, likelihood, impact, ownerId }),
      });
      setRiskTitle("");
      setRiskDescription("");
      setOwnerId("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save risk.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">QA governance</h1>
      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {/* QA001 — institutional QMS overview: the single dashboard tying
          together everything below rather than ten separate screens. */}
      {qms && (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard label="Requirements met" value={qms.requirementsMetPct === null ? "—" : `${qms.requirementsMetPct}%`} />
          <StatCard label="Open corrective actions" value={qms.openCorrectiveActions} />
          <StatCard label="Open risks" value={qms.openRisks} />
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <StatCard label="Mandatory gaps not met" value={gaps?.totalGaps ?? "—"} />
        <StatCard label="Total complaints" value={complaintsStats?.total ?? "—"} />
      </div>

      {qms && (
        <div className="mt-6">
          <PortalSection title="QMS health">
            <ul className="divide-y divide-line text-sm">
              <li className="flex items-center justify-between py-2">
                <span>Audits in progress or planned</span>
                <span>{qms.auditsInProgressOrPlanned}</span>
              </li>
              <li className="flex items-center justify-between py-2">
                <span>Policy documents on file</span>
                <span>{qms.policyDocumentCount}</span>
              </li>
              <li className="flex items-center justify-between py-2">
                <span>Quality standards defined</span>
                <span>{qms.qualityStandardCount}</span>
              </li>
              <li className="flex items-center justify-between py-2">
                <span>Last management review</span>
                <span className="flex items-center gap-2">
                  {qms.lastManagementReviewDate ? new Date(qms.lastManagementReviewDate).toLocaleDateString() : "Never"}
                  {qms.managementReviewStale && <Badge tone="warn">Overdue</Badge>}
                </span>
              </li>
              <li className="flex items-center justify-between py-2">
                <span>Last IQA review</span>
                <span>{qms.lastIqaReviewDate ? new Date(qms.lastIqaReviewDate).toLocaleDateString() : "Never"}</span>
              </li>
            </ul>
          </PortalSection>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {gaps && (
          <PortalSection title="Gap analysis by regulator">
            <ul className="divide-y divide-line">
              {Object.entries(gaps.byRegulator).map(([reg, count]) => (
                <li key={reg} className="flex items-center justify-between py-2 text-sm">
                  <span>{reg}</span>
                  <Badge tone={count > 0 ? "warn" : "ok"}>{count}</Badge>
                </li>
              ))}
              {Object.keys(gaps.byRegulator).length === 0 && <p className="text-sm text-ink/50">No gaps — all mandatory requirements met.</p>}
            </ul>
          </PortalSection>
        )}

        {complaintsStats && (
          <PortalSection title="Complaints by category">
            <ul className="divide-y divide-line">
              {Object.entries(complaintsStats.byCategory).map(([cat, count]) => (
                <li key={cat} className="flex items-center justify-between py-2 text-sm">
                  <span>{cat}</span>
                  <span className="font-mono text-xs">{count}</span>
                </li>
              ))}
              {Object.keys(complaintsStats.byCategory).length === 0 && <p className="text-sm text-ink/50">No complaints on file.</p>}
            </ul>
          </PortalSection>
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <PortalSection title="Risk register">
          {risks && risks.length === 0 && <p className="text-sm text-ink/50">No risks logged yet.</p>}
          <ul className="divide-y divide-line">
            {risks?.map((r) => (
              <li key={r.id} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>{r.title}</span>
                  <Badge tone={r.status === "closed" ? "ok" : r.status === "mitigated" ? "warn" : "danger"}>{r.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink/45">{r.category} · likelihood: {r.likelihood} · impact: {r.impact}</p>
              </li>
            ))}
          </ul>
        </PortalSection>

        <PortalSection title="Log a risk">
          <form onSubmit={addRisk} className="space-y-3">
            <input required value={riskTitle} onChange={(e) => setRiskTitle(e.target.value)} placeholder="Risk title" className="input" />
            <textarea required rows={2} value={riskDescription} onChange={(e) => setRiskDescription(e.target.value)} placeholder="Description" className="input" />
            <select value={riskCategory} onChange={(e) => setRiskCategory(e.target.value)} className="input">
              <option value="regulatory">Regulatory</option>
              <option value="financial">Financial</option>
              <option value="academic">Academic</option>
              <option value="operational">Operational</option>
              <option value="reputational">Reputational</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select value={likelihood} onChange={(e) => setLikelihood(e.target.value)} className="input">
                <option value="low">Likelihood: Low</option>
                <option value="medium">Likelihood: Medium</option>
                <option value="high">Likelihood: High</option>
              </select>
              <select value={impact} onChange={(e) => setImpact(e.target.value)} className="input">
                <option value="low">Impact: Low</option>
                <option value="medium">Impact: Medium</option>
                <option value="high">Impact: High</option>
              </select>
            </div>
            <input required value={ownerId} onChange={(e) => setOwnerId(e.target.value)} placeholder="Owner (user ID)" className="input" />
            <button type="submit" className="btn-primary w-full justify-center">Log risk</button>
          </form>
        </PortalSection>
      </div>

      {/* QA003/005/021/031/035 — IQA reviews, quality standards, evidence
          versioning, management review, programme review. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <IqaReviews />
        <QualityStandards />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ManagementReviews />
        <ProgrammeReviews />
      </div>
      <div className="mt-6">
        <EvidenceVersioning />
      </div>

      {/* QA010/QA011/QA004/QA039 */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <InstitutionalAccreditation />
        <QaCommittee />
      </div>
      <div className="mt-6">
        <TrainerCompliance />
      </div>
      <div className="mt-6">
        <InspectionPack />
      </div>

      <div className="mt-6">
        <ExpiryAlerts />
      </div>

      <div className="mt-6">
        <PendingLessonReviews />
      </div>

      <div className="mt-6">
        <XapiSummaryPanel />
      </div>
    </PortalShell>
  );
}

// QA012/QA022 — on-demand expiry alerts, honestly labeled: no real
// scheduler exists in this sandbox, so this is a button, not a cron job.
function ExpiryAlerts() {
  type Preview = {
    trainers: { fullName: string; tvetaLicenceNumber: string | null; licenceExpiry: string }[];
    requirements: { regulator: string; requirement: string; nextReviewDue: string }[];
  };
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<{ notificationsCreated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Preview>("/compliance/expiry-alerts/preview").then(setPreview).catch(() => undefined);
  }
  useEffect(load, []);

  async function run() {
    setError(null);
    try {
      setResult(await apiFetch("/compliance/expiry-alerts/run", { method: "POST" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run alerts.");
    }
  }

  return (
    <PortalSection title="Licence & compliance-review expiry alerts">
      <p className="text-xs text-ink/50">
        On-demand only — this sandbox has no cron/scheduler, so a real deployment would run this
        automatically on a timer instead of a button.
      </p>
      {preview && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink/50">Trainer licences expiring within 30 days</p>
            <ul className="mt-1 space-y-1">
              {preview.trainers.map((t, i) => (
                <li key={i} className="text-sm">{t.fullName} — {new Date(t.licenceExpiry).toLocaleDateString()}</li>
              ))}
              {preview.trainers.length === 0 && <li className="text-sm text-ink/45">None.</li>}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink/50">Compliance reviews due within 30 days</p>
            <ul className="mt-1 space-y-1">
              {preview.requirements.map((r, i) => (
                <li key={i} className="text-sm">{r.regulator}: {r.requirement} — {new Date(r.nextReviewDue).toLocaleDateString()}</li>
              ))}
              {preview.requirements.length === 0 && <li className="text-sm text-ink/45">None.</li>}
            </ul>
          </div>
        </div>
      )}
      <button onClick={run} className="btn-primary mt-4">Send alerts now</button>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {result && <p className="mt-2 text-xs text-forest">{result.notificationsCreated} notification(s) created.</p>}
    </PortalSection>
  );
}

function IqaReviews() {
  type Review = { id: string; scope: string; findings: string; actionsRequired: string | null; reviewDate: string };
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [scope, setScope] = useState("");
  const [findings, setFindings] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Review[]>("/compliance/iqa-reviews").then(setReviews).catch(() => setReviews([]));
  }
  useEffect(load, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/compliance/iqa-reviews", { method: "POST", body: JSON.stringify({ scope, findings }) });
      setScope(""); setFindings("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log review.");
    }
  }

  return (
    <PortalSection title="Internal quality assurance (IQA) reviews">
      <ul className="divide-y divide-line">
        {reviews?.map((r) => (
          <li key={r.id} className="py-2 text-sm">
            <p className="font-medium">{r.scope}</p>
            <p className="text-ink/65">{r.findings}</p>
            <p className="text-xs text-ink/45">{new Date(r.reviewDate).toLocaleDateString()}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-3 space-y-2 border-t border-line pt-3">
        <input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Scope (e.g. a unit, programme, department)" className="input" />
        <textarea rows={2} value={findings} onChange={(e) => setFindings(e.target.value)} placeholder="Findings" className="input" />
        <button type="submit" className="btn-primary">Log IQA review</button>
      </form>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
    </PortalSection>
  );
}

function QualityStandards() {
  type Standard = { id: string; name: string; description: string; category: string | null };
  const [standards, setStandards] = useState<Standard[] | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Standard[]>("/compliance/quality-standards").then(setStandards).catch(() => setStandards([]));
  }
  useEffect(load, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/compliance/quality-standards", { method: "POST", body: JSON.stringify({ name, description }) });
      setName(""); setDescription("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add standard.");
    }
  }

  return (
    <PortalSection title="Quality standards">
      <ul className="divide-y divide-line">
        {standards?.map((s) => (
          <li key={s.id} className="py-2 text-sm">
            <p className="font-medium">{s.name}</p>
            <p className="text-ink/65">{s.description}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-3 space-y-2 border-t border-line pt-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard name" className="input" />
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="input" />
        <button type="submit" className="btn-primary">Add standard</button>
      </form>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
    </PortalSection>
  );
}

function ManagementReviews() {
  type Review = { id: string; inputsSummary: string; decisionsSummary: string; reviewDate: string };
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [inputsSummary, setInputsSummary] = useState("");
  const [decisionsSummary, setDecisionsSummary] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Review[]>("/compliance/management-reviews").then(setReviews).catch(() => setReviews([]));
  }
  useEffect(load, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/compliance/management-reviews", { method: "POST", body: JSON.stringify({ inputsSummary, decisionsSummary }) });
      setInputsSummary(""); setDecisionsSummary("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log review.");
    }
  }

  return (
    <PortalSection title="Management review (QMS-wide)">
      <ul className="divide-y divide-line">
        {reviews?.map((r) => (
          <li key={r.id} className="py-2 text-sm">
            <p className="text-ink/65"><span className="font-medium">Inputs:</span> {r.inputsSummary}</p>
            <p className="text-ink/65"><span className="font-medium">Decisions:</span> {r.decisionsSummary}</p>
            <p className="text-xs text-ink/45">{new Date(r.reviewDate).toLocaleDateString()}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-3 space-y-2 border-t border-line pt-3">
        <textarea rows={2} value={inputsSummary} onChange={(e) => setInputsSummary(e.target.value)} placeholder="What was reviewed (inputs)" className="input" />
        <textarea rows={2} value={decisionsSummary} onChange={(e) => setDecisionsSummary(e.target.value)} placeholder="Decisions made" className="input" />
        <button type="submit" className="btn-primary">Log management review</button>
      </form>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
    </PortalSection>
  );
}

function ProgrammeReviews() {
  type Review = { id: string; findings: string; recommendedActions: string | null; reviewDate: string };
  const [programmeId, setProgrammeId] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [findings, setFindings] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!programmeId) return;
    try {
      setReviews(await apiFetch<Review[]>(`/compliance/programme-reviews/${programmeId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load reviews.");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/compliance/programme-reviews", { method: "POST", body: JSON.stringify({ programmeId, findings }) });
      setFindings("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log review.");
    }
  }

  return (
    <PortalSection title="Programme review">
      <div className="flex gap-2">
        <input value={programmeId} onChange={(e) => setProgrammeId(e.target.value)} placeholder="Programme ID" className="input flex-1" />
        <button onClick={load} className="btn-secondary shrink-0">Load</button>
      </div>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      <ul className="mt-3 divide-y divide-line">
        {reviews.map((r) => (
          <li key={r.id} className="py-2 text-sm">
            <p className="text-ink/65">{r.findings}</p>
            <p className="text-xs text-ink/45">{new Date(r.reviewDate).toLocaleDateString()}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-3 space-y-2 border-t border-line pt-3">
        <textarea rows={2} value={findings} onChange={(e) => setFindings(e.target.value)} placeholder="Findings" className="input" />
        <button type="submit" className="btn-primary">Log programme review</button>
      </form>
    </PortalSection>
  );
}

function EvidenceVersioning() {
  type Version = { id: string; url: string; uploadedAt: string; version: number };
  const [requirementId, setRequirementId] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!requirementId) return;
    try {
      setVersions(await apiFetch<Version[]>(`/compliance/requirements/${requirementId}/evidence-history`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load history.");
    }
  }

  async function upload(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch(`/compliance/requirements/${requirementId}/evidence`, { method: "POST", body: JSON.stringify({ url: newUrl }) });
      setNewUrl("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload evidence.");
    }
  }

  return (
    <PortalSection title="Evidence versioning">
      <p className="text-xs text-ink/50">Every replacement is kept as a real version — nothing is silently overwritten.</p>
      <div className="mt-3 flex gap-2">
        <input value={requirementId} onChange={(e) => setRequirementId(e.target.value)} placeholder="Requirement ID" className="input flex-1" />
        <button onClick={load} className="btn-secondary shrink-0">Load history</button>
      </div>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      <ul className="mt-3 divide-y divide-line">
        {versions.map((v) => (
          <li key={v.id} className="flex items-center justify-between py-2 text-sm">
            <span>v{v.version} — {v.url}</span>
            <span className="text-xs text-ink/45">{new Date(v.uploadedAt).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
      <form onSubmit={upload} className="mt-3 flex gap-2 border-t border-line pt-3">
        <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="New evidence URL" className="input flex-1" />
        <button type="submit" className="btn-primary shrink-0">Upload new version</button>
      </form>
    </PortalSection>
  );
}

// QA010 — institutional accreditation: institution-wide status with a
// regulator, distinct from the per-programme accreditation screen.
function InstitutionalAccreditation() {
  type Record_ = {
    id: string;
    regulator: string;
    status: string;
    certificateUrl: string | null;
    validFrom: string | null;
    validUntil: string | null;
  };
  const [records, setRecords] = useState<Record_[] | null>(null);
  const [regulator, setRegulator] = useState("TVETA");
  const [certificateUrl, setCertificateUrl] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Record_[]>("/compliance/institutional-accreditation").then(setRecords).catch(() => setRecords([]));
  }
  useEffect(load, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/compliance/institutional-accreditation", {
        method: "POST",
        body: JSON.stringify({
          regulator,
          ...(certificateUrl ? { certificateUrl } : {}),
          ...(validUntil ? { validUntil: new Date(validUntil).toISOString() } : {}),
        }),
      });
      setCertificateUrl("");
      setValidUntil("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save record.");
    }
  }

  async function setStatus(id: string, status: string) {
    setError(null);
    try {
      await apiFetch(`/compliance/institutional-accreditation/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    }
  }

  const statusTone: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
    accredited: "ok",
    conditional: "warn",
    pending: "neutral",
    withdrawn: "danger",
    expired: "danger",
  };

  return (
    <PortalSection title="Institutional accreditation">
      <p className="text-xs text-ink/50">Institution-wide status with a regulator — distinct from per-programme accreditation.</p>
      <ul className="mt-3 divide-y divide-line">
        {records?.map((r) => (
          <li key={r.id} className="py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{r.regulator}</span>
              <Badge tone={statusTone[r.status] ?? "neutral"}>{r.status}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink/50">
              {r.validUntil && <span>Valid until {new Date(r.validUntil).toLocaleDateString()}</span>}
              {r.certificateUrl && <a href={r.certificateUrl} target="_blank" rel="noreferrer" className="text-navy hover:underline">Certificate</a>}
              {r.status !== "accredited" && <button onClick={() => setStatus(r.id, "accredited")} className="btn-secondary px-2 py-0.5">Mark accredited</button>}
              {r.status !== "withdrawn" && <button onClick={() => setStatus(r.id, "withdrawn")} className="btn-secondary px-2 py-0.5">Mark withdrawn</button>}
            </div>
          </li>
        ))}
        {records && records.length === 0 && <p className="text-sm text-ink/50">No institutional accreditation records yet.</p>}
      </ul>
      <form onSubmit={submit} className="mt-3 space-y-2 border-t border-line pt-3">
        <select value={regulator} onChange={(e) => setRegulator(e.target.value)} className="input">
          <option value="TVETA">TVETA</option>
          <option value="CUE">CUE</option>
          <option value="KNQA">KNQA</option>
          <option value="CDACC">CDACC</option>
        </select>
        <input value={certificateUrl} onChange={(e) => setCertificateUrl(e.target.value)} placeholder="Certificate URL (optional)" className="input" />
        <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="input" />
        <button type="submit" className="btn-primary">Record accreditation</button>
      </form>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
    </PortalSection>
  );
}

// QA004 — QA committee: real meetings for the "QA Committee" committee,
// with a way to turn resolving an agenda item into a tracked corrective
// action instead of just free-text minutes.
function QaCommittee() {
  type AgendaItem = { id: string; title: string; status: string; resolution: string | null };
  type Meeting = { id: string; title: string; scheduledAt: string; status: string; agendaItems: AgendaItem[] };
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { description: string; assignedToId: string }>>({});
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Meeting[]>("/compliance/qa-committee/meetings").then(setMeetings).catch(() => setMeetings([]));
  }
  useEffect(load, []);

  async function createAction(itemId: string) {
    const draft = drafts[itemId];
    if (!draft?.description || !draft?.assignedToId) return;
    setError(null);
    try {
      await apiFetch(`/compliance/qa-committee/agenda-items/${itemId}/create-corrective-action`, {
        method: "POST",
        body: JSON.stringify(draft),
      });
      setDrafts((d) => ({ ...d, [itemId]: { description: "", assignedToId: "" } }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create corrective action.");
    }
  }

  return (
    <PortalSection title="QA committee">
      <p className="text-xs text-ink/50">Meetings under the "QA Committee" committee — resolving an item here creates a real, tracked corrective action.</p>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      <div className="mt-3 space-y-4">
        {meetings?.map((m) => (
          <div key={m.id} className="border-t border-line pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{m.title}</span>
              <span className="text-xs text-ink/45">{new Date(m.scheduledAt).toLocaleDateString()}</span>
            </div>
            <ul className="mt-2 space-y-2">
              {m.agendaItems.map((item) => (
                <li key={item.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span>{item.title}</span>
                    <Badge tone={item.status === "resolved" ? "ok" : item.status === "deferred" ? "warn" : "neutral"}>{item.status}</Badge>
                  </div>
                  {item.status === "open" && (
                    <div className="mt-1 flex gap-2">
                      <input
                        value={drafts[item.id]?.description ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: { description: e.target.value, assignedToId: d[item.id]?.assignedToId ?? "" } }))}
                        placeholder="Corrective action description"
                        className="input h-7 flex-1 py-0 text-xs"
                      />
                      <input
                        value={drafts[item.id]?.assignedToId ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: { description: d[item.id]?.description ?? "", assignedToId: e.target.value } }))}
                        placeholder="Assignee (user ID)"
                        className="input h-7 w-40 py-0 text-xs"
                      />
                      <button onClick={() => createAction(item.id)} className="btn-secondary shrink-0 px-2 py-1 text-xs">Resolve → action</button>
                    </div>
                  )}
                </li>
              ))}
              {m.agendaItems.length === 0 && <p className="text-xs text-ink/45">No agenda items.</p>}
            </ul>
          </div>
        ))}
        {meetings && meetings.length === 0 && <p className="text-sm text-ink/50">No QA committee meetings scheduled yet.</p>}
      </div>
    </PortalSection>
  );
}

// QA011 — trainer compliance beyond the licence: code of conduct,
// induction, background check.
function TrainerCompliance() {
  type Row = {
    trainerId: string;
    fullName: string;
    email: string;
    licenceOk: boolean;
    codeOfConductSigned: boolean;
    inductionCompleted: boolean;
    backgroundCheckCleared: boolean;
    fullyCompliant: boolean;
  };
  const [data, setData] = useState<{ total: number; fullyCompliantCount: number; trainers: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<{ total: number; fullyCompliantCount: number; trainers: Row[] }>("/compliance/trainer-compliance")
      .then(setData)
      .catch(() => setData(null));
  }
  useEffect(load, []);

  async function toggle(trainerId: string, field: "codeOfConductSigned" | "inductionCompleted" | "backgroundCheckCleared", value: boolean) {
    setError(null);
    try {
      await apiFetch(`/compliance/trainer-compliance/${trainerId}`, { method: "PATCH", body: JSON.stringify({ [field]: value }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update trainer compliance.");
    }
  }

  return (
    <PortalSection title="Trainer compliance">
      <p className="text-xs text-ink/50">Licence status plus the other three things an inspection checks per trainer.</p>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {data && <p className="mt-2 text-xs text-ink/50">{data.fullyCompliantCount} of {data.total} trainers fully compliant.</p>}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-ink/45">
              <th className="py-1 pr-3">Trainer</th>
              <th className="py-1 pr-3">Licence</th>
              <th className="py-1 pr-3">Code of conduct</th>
              <th className="py-1 pr-3">Induction</th>
              <th className="py-1 pr-3">Background check</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data?.trainers.map((t) => (
              <tr key={t.trainerId}>
                <td className="py-2 pr-3">{t.fullName}</td>
                <td className="py-2 pr-3"><Badge tone={t.licenceOk ? "ok" : "danger"}>{t.licenceOk ? "OK" : "Issue"}</Badge></td>
                <td className="py-2 pr-3">
                  <button onClick={() => toggle(t.trainerId, "codeOfConductSigned", !t.codeOfConductSigned)} className={t.codeOfConductSigned ? "btn-secondary px-2 py-0.5 text-xs" : "btn-primary px-2 py-0.5 text-xs"}>
                    {t.codeOfConductSigned ? "Signed" : "Mark signed"}
                  </button>
                </td>
                <td className="py-2 pr-3">
                  <button onClick={() => toggle(t.trainerId, "inductionCompleted", !t.inductionCompleted)} className={t.inductionCompleted ? "btn-secondary px-2 py-0.5 text-xs" : "btn-primary px-2 py-0.5 text-xs"}>
                    {t.inductionCompleted ? "Completed" : "Mark completed"}
                  </button>
                </td>
                <td className="py-2 pr-3">
                  <button onClick={() => toggle(t.trainerId, "backgroundCheckCleared", !t.backgroundCheckCleared)} className={t.backgroundCheckCleared ? "btn-secondary px-2 py-0.5 text-xs" : "btn-primary px-2 py-0.5 text-xs"}>
                    {t.backgroundCheckCleared ? "Cleared" : "Mark cleared"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.trainers.length === 0 && <p className="py-2 text-sm text-ink/50">No trainers on file.</p>}
      </div>
    </PortalSection>
  );
}

// QA039 — inspection preparation pack: everything a regulator inspection
// asks for first, assembled from live data in one call.
function InspectionPack() {
  type Pack = {
    generatedAt: string;
    readinessSummary: { unmetMandatoryCount: number; openCorrectiveActionCount: number; openFindingCount: number; openRiskCount: number };
  };
  const [pack, setPack] = useState<Pack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setPack(await apiFetch<Pack>("/compliance/inspection-pack"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the inspection pack.");
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!pack) return;
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inspection-pack-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PortalSection title="Inspection preparation pack">
      <p className="text-xs text-ink/50">
        Unmet mandatory requirements, open corrective actions, open audit findings, and open risks — everything
        a regulator visit asks for first, in one file.
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={run} disabled={busy} className="btn-primary">{busy ? "Building…" : "Build pack"}</button>
        {pack && <button onClick={download} className="btn-secondary">Download JSON</button>}
      </div>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {pack && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Unmet mandatory" value={pack.readinessSummary.unmetMandatoryCount} />
          <StatCard label="Open corrective actions" value={pack.readinessSummary.openCorrectiveActionCount} />
          <StatCard label="Open findings" value={pack.readinessSummary.openFindingCount} />
          <StatCard label="Open risks" value={pack.readinessSummary.openRiskCount} />
        </div>
      )}
    </PortalSection>
  );
}

// LMS037 — the reviewer side of content approval. The backend queue and
// approve/reject actions already existed (see routes/content.ts); no page
// consumed them, so a lesson could sit in pending_review indefinitely with
// nobody able to see it needed a decision.
function PendingLessonReviews() {
  type Pending = { id: string; title: string; courseTitle: string; contentType: string; previousVersion: { editedAt: string } | null };
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    apiFetch<Pending[]>("/content/lessons/pending-review").then(setPending).catch(() => setPending(null));
  }
  useEffect(load, []);

  async function decide(id: string, decision: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      await apiFetch(`/content/lessons/${id}/${decision}`, { method: "PATCH" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record that decision.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PortalSection title="Content approval queue (LMS037)">
      {error && <p className="text-sm text-navy-dark">{error}</p>}
      {pending === null && !error && <LoadingState />}
      {pending && pending.length === 0 && <p className="text-sm text-ink/50">Nothing awaiting review.</p>}
      <ul className="divide-y divide-line">
        {pending?.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
            <div>
              <p className="font-medium">{p.title}</p>
              <p className="text-xs text-ink/50">
                {p.courseTitle} · {p.contentType} · {p.previousVersion ? "has a previously approved version" : "never approved before — rejecting will hide it"}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button disabled={busyId === p.id} onClick={() => decide(p.id, "approve")} className="btn-primary px-2 py-1 text-xs disabled:opacity-50">Approve</button>
              <button disabled={busyId === p.id} onClick={() => decide(p.id, "reject")} className="btn-secondary px-2 py-1 text-xs disabled:opacity-50">Reject</button>
            </div>
          </li>
        ))}
      </ul>
    </PortalSection>
  );
}

// LMS023 — a coarse view into the xAPI statement store (routes/xapi.ts):
// statement counts by verb over the last 30 days. Not a full LRS query UI
// (see the honest scope note on the backend route) — just enough to show
// the learning-record stream is real and flowing.
function XapiSummaryPanel() {
  type Summary = { since: string; totalStatements: number; byVerb: Record<string, number> };
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    apiFetch<Summary>("/xapi/summary").then(setSummary).catch(() => setSummary(null));
  }, []);

  if (!summary) return null;

  return (
    <PortalSection title="Learning records (xAPI, last 30 days)">
      <p className="text-sm text-ink/60">{summary.totalStatements} statement(s) recorded.</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {Object.entries(summary.byVerb).map(([verb, count]) => (
          <li key={verb} className="rounded-full bg-navy/10 px-2.5 py-1 text-xs font-medium text-navy">{verb}: {count}</li>
        ))}
      </ul>
    </PortalSection>
  );
}
