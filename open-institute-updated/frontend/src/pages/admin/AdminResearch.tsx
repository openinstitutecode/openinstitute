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

type Project = {
  id: string;
  title: string;
  type: string;
  status: string;
  ethicsRequired: boolean;
  ethicsApproved: boolean;
  supervisor: { fullName: string } | null;
};

export default function AdminResearch() {
  const userName = useCurrentUserName();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [supervisorInputs, setSupervisorInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Project[]>("/research/projects")
      .then(setProjects)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load research projects."));
  }
  useEffect(load, []);

  async function assignSupervisor(id: string) {
    const supervisorId = supervisorInputs[id];
    if (!supervisorId) return;
    try {
      await apiFetch(`/research/projects/${id}/supervisor`, {
        method: "PATCH",
        body: JSON.stringify({ supervisorId }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign supervisor.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Research &amp; innovation</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Student research, trainer research, and innovation/startup projects
        — proposal through supervisor assignment and ethics sign-off.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8">
        <PortalSection title="Projects">
          {projects && projects.length === 0 && <p className="text-sm text-ink/50">No projects submitted yet.</p>}
          <ul className="divide-y divide-line">
            {projects?.map((p) => (
              <li key={p.id} className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{p.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-navy">{p.type.replace("_", " ")}</p>
                  </div>
                  <Badge tone={p.status === "completed" ? "ok" : "warn"}>{p.status}</Badge>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-ink/50">
                  <span>Supervisor: {p.supervisor?.fullName ?? "Unassigned"}</span>
                  {p.ethicsRequired && (
                    <Badge tone={p.ethicsApproved ? "ok" : "danger"}>
                      {p.ethicsApproved ? "Ethics approved" : "Ethics pending"}
                    </Badge>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    placeholder="Trainer ID"
                    value={supervisorInputs[p.id] ?? ""}
                    onChange={(e) => setSupervisorInputs((s) => ({ ...s, [p.id]: e.target.value }))}
                    className="input w-40 text-xs"
                  />
                  <button onClick={() => assignSupervisor(p.id)} className="btn-secondary text-xs">
                    Assign supervisor
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>

      {/* LB027 — ethics workflow: a real committee review queue, not a
          single approve button. */}
      <div className="mt-6">
        <EthicsQueue onDecided={load} />
      </div>

      {/* LB029 — conference management + LB030 — research funding review */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Conferences />
        <GrantReview />
      </div>

      {/* LB032 — startup incubation + LB033 — mentorship */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Incubation />
        <Mentorships />
      </div>
    </PortalShell>
  );
}

// LB027 — ethics review queue: real submitted/under_review protocols, with
// an actual decision history per project (approve with a protocol number,
// request revisions, or reject) instead of a single boolean toggle.
type EthicsSubmissionRow = {
  id: string;
  projectId: string;
  summary: string;
  risksAndMitigation: string | null;
  status: string;
  protocolNumber: string | null;
  submittedAt: string;
  project: { id: string; title: string; type: string };
};

function EthicsQueue({ onDecided }: { onDecided: () => void }) {
  const [pending, setPending] = useState<EthicsSubmissionRow[] | null>(null);
  const [protocolInputs, setProtocolInputs] = useState<Record<string, string>>({});
  const [notesInputs, setNotesInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<EthicsSubmissionRow[]>("/research/ethics-submissions/pending")
      .then(setPending)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load ethics submissions."));
  }
  useEffect(load, []);

  async function decide(id: string, status: "under_review" | "revisions_requested" | "approved" | "rejected") {
    try {
      await apiFetch(`/research/ethics-submissions/${id}/decision`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          protocolNumber: status === "approved" ? protocolInputs[id] : undefined,
          decisionNotes: notesInputs[id] || undefined,
        }),
      });
      load();
      onDecided();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the decision.");
    }
  }

  return (
    <PortalSection title="Ethics review queue">
      {error && <p className="text-sm text-navy-dark">{error}</p>}
      {pending && pending.length === 0 && <p className="text-sm text-ink/50">No protocols awaiting review.</p>}
      <ul className="divide-y divide-line">
        {pending?.map((s) => (
          <li key={s.id} className="py-4 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-medium">{s.project.title}</p>
              <Badge tone={s.status === "under_review" ? "warn" : "neutral"}>{s.status.replace("_", " ")}</Badge>
            </div>
            <p className="mt-1 text-ink/70">{s.summary}</p>
            {s.risksAndMitigation && (
              <p className="mt-1 text-xs text-ink/50">Risks &amp; mitigation: {s.risksAndMitigation}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                placeholder="Protocol number (on approval)"
                value={protocolInputs[s.id] ?? ""}
                onChange={(e) => setProtocolInputs((p) => ({ ...p, [s.id]: e.target.value }))}
                className="input w-52 text-xs"
              />
              <input
                placeholder="Decision notes (optional)"
                value={notesInputs[s.id] ?? ""}
                onChange={(e) => setNotesInputs((p) => ({ ...p, [s.id]: e.target.value }))}
                className="input w-52 text-xs"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {s.status === "submitted" && (
                <button onClick={() => decide(s.id, "under_review")} className="font-medium text-navy hover:underline">
                  Start review
                </button>
              )}
              <button onClick={() => decide(s.id, "approved")} className="font-medium text-forest hover:underline">
                Approve
              </button>
              <button onClick={() => decide(s.id, "revisions_requested")} className="font-medium text-ink/60 hover:underline">
                Request revisions
              </button>
              <button onClick={() => decide(s.id, "rejected")} className="font-medium text-navy-dark hover:underline">
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </PortalSection>
  );
}

function Incubation() {
  type Record_ = { id: string; cohort: string | null; stage: string; project: { title: string } };
  const [records, setRecords] = useState<Record_[] | null>(null);
  const [projectId, setProjectId] = useState("");
  const [cohort, setCohort] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Record_[]>("/research/incubation").then(setRecords).catch(() => setRecords([]));
  }
  useEffect(load, []);

  async function enroll(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/research/incubation", { method: "POST", body: JSON.stringify({ projectId, cohort: cohort || undefined }) });
      setProjectId(""); setCohort("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enroll project.");
    }
  }

  async function advanceStage(id: string, stage: "idea" | "mvp" | "growth") {
    await apiFetch(`/research/incubation/${id}/stage`, { method: "PATCH", body: JSON.stringify({ stage }) }).catch(() => undefined);
    load();
  }

  return (
    <PortalSection title="Startup incubation">
      <ul className="divide-y divide-line">
        {records?.map((r) => (
          <li key={r.id} className="py-2 text-sm">
            <div className="flex items-center justify-between">
              <span>{r.project.title} {r.cohort ? `(${r.cohort})` : ""}</span>
              <Badge tone={r.stage === "growth" ? "ok" : r.stage === "mvp" ? "warn" : "neutral"}>{r.stage}</Badge>
            </div>
            <div className="mt-1 flex gap-2">
              {(["idea", "mvp", "growth"] as const).map((s) => (
                <button key={s} onClick={() => advanceStage(r.id, s)} className="text-xs text-navy underline decoration-dotted">{s}</button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={enroll} className="mt-3 space-y-2 border-t border-line pt-3">
        <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Project ID" className="input" />
        <input value={cohort} onChange={(e) => setCohort(e.target.value)} placeholder="Cohort (optional)" className="input" />
        <button type="submit" className="btn-primary">Enroll in incubation</button>
      </form>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
    </PortalSection>
  );
}

function Mentorships() {
  const [projectId, setProjectId] = useState("");
  const [mentorships, setMentorships] = useState<{ id: string; mentorUserId: string; focusArea: string | null; status: string }[]>([]);
  const [mentorUserId, setMentorUserId] = useState("");
  const [focusArea, setFocusArea] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!projectId) return;
    try {
      setMentorships(await apiFetch(`/research/mentorships/project/${projectId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load mentorships.");
    }
  }

  async function assign(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/research/mentorships", { method: "POST", body: JSON.stringify({ projectId, mentorUserId, focusArea: focusArea || undefined }) });
      setMentorUserId(""); setFocusArea("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign mentor.");
    }
  }

  return (
    <PortalSection title="Mentorship">
      <div className="flex gap-2">
        <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Project ID" className="input flex-1" />
        <button onClick={load} className="btn-secondary shrink-0">Load</button>
      </div>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      <ul className="mt-3 divide-y divide-line">
        {mentorships.map((m) => (
          <li key={m.id} className="flex items-center justify-between py-2 text-sm">
            <span>{m.mentorUserId} {m.focusArea ? `— ${m.focusArea}` : ""}</span>
            <Badge tone={m.status === "active" ? "ok" : "neutral"}>{m.status}</Badge>
          </li>
        ))}
      </ul>
      <form onSubmit={assign} className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
        <input value={mentorUserId} onChange={(e) => setMentorUserId(e.target.value)} placeholder="Mentor user ID" className="input" />
        <input value={focusArea} onChange={(e) => setFocusArea(e.target.value)} placeholder="Focus area (optional)" className="input flex-1" />
        <button type="submit" className="btn-primary">Assign mentor</button>
      </form>
    </PortalSection>
  );
}

function Conferences() {
  type Conference = { id: string; name: string; startDate: string; submissionDeadline: string | null; location: string | null };
  const [conferences, setConferences] = useState<Conference[] | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submissionDeadline, setSubmissionDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Conference[]>("/research/conferences").then(setConferences).catch(() => undefined);
  }
  useEffect(load, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/research/conferences", {
        method: "POST",
        body: JSON.stringify({
          name, location: location || undefined,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate || startDate).toISOString(),
          submissionDeadline: submissionDeadline ? new Date(submissionDeadline).toISOString() : undefined,
        }),
      });
      setName(""); setLocation(""); setStartDate(""); setEndDate(""); setSubmissionDeadline("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add conference.");
    }
  }

  return (
    <PortalSection title="Conferences">
      <ul className="divide-y divide-line">
        {conferences?.map((c) => (
          <li key={c.id} className="py-2 text-sm">
            <p>{c.name} {c.location ? `— ${c.location}` : ""}</p>
            <p className="text-xs text-ink/45">
              {new Date(c.startDate).toLocaleDateString()}
              {c.submissionDeadline ? ` · submissions due ${new Date(c.submissionDeadline).toLocaleDateString()}` : ""}
            </p>
          </li>
        ))}
      </ul>
      <form onSubmit={create} className="mt-4 space-y-2 border-t border-line pt-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Conference name" className="input" />
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" className="input" />
        <div className="flex gap-2">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input" />
        </div>
        <input type="date" value={submissionDeadline} onChange={(e) => setSubmissionDeadline(e.target.value)} placeholder="Submission deadline" className="input" />
        <button type="submit" className="btn-primary">Add conference</button>
      </form>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
    </PortalSection>
  );
}

function GrantReview() {
  type Grant = { id: string; funder: string; amount: string; status: string; project: { title: string } };
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Grant[]>("/research/grants").then(setGrants).catch(() => undefined);
  }
  useEffect(load, []);

  async function decide(id: string, status: "awarded" | "rejected") {
    try {
      await apiFetch(`/research/grants/${id}/decide`, { method: "PATCH", body: JSON.stringify({ status }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not decide.");
    }
  }

  return (
    <PortalSection title="Grant applications">
      {error && <p className="text-xs text-navy-dark">{error}</p>}
      <ul className="divide-y divide-line">
        {grants?.map((g) => (
          <li key={g.id} className="py-2 text-sm">
            <div className="flex items-center justify-between">
              <span>{g.project.title} — {g.funder}</span>
              <Badge tone={g.status === "awarded" ? "ok" : g.status === "rejected" ? "danger" : "neutral"}>{g.status}</Badge>
            </div>
            <p className="text-xs text-ink/45">KES {Number(g.amount).toLocaleString()}</p>
            {g.status === "applied" && (
              <div className="mt-1 flex gap-2">
                <button onClick={() => decide(g.id, "awarded")} className="text-xs text-forest underline decoration-dotted">Mark awarded</button>
                <button onClick={() => decide(g.id, "rejected")} className="text-xs text-navy-dark underline decoration-dotted">Mark rejected</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </PortalSection>
  );
}
