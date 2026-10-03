import { useEffect, useState } from "react";
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

type AgendaItem = {
  id: string;
  title: string;
  status: string;
  resolution: string | null;
};

type Meeting = {
  id: string;
  committee: string;
  title: string;
  scheduledAt: string;
  status: string;
  minutesText: string | null;
  agendaItems: AgendaItem[];
};

// RG029 — Examination Board
type FlaggedResult = {
  courseId: string;
  unitCode: string;
  unitTitle: string;
  totalAssessments: number;
  approvedAssessments: number;
  readyToFinalize: boolean;
  studentsCovered: number;
  passRate: number | null;
  reason: "pending_finalization" | "low_pass_rate";
};

// RG030 — Academic Board
type AcademicBoardDecision = "graduate" | "defer" | "withhold";

export default function AdminGovernance() {
  const userName = useCurrentUserName();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // RG029
  const [flagged, setFlagged] = useState<FlaggedResult[] | null>(null);
  const [examBoardMeetingId, setExamBoardMeetingId] = useState("");
  const [examBoardBusy, setExamBoardBusy] = useState<string | null>(null);

  // RG030
  const [academicBoardMeetingId, setAcademicBoardMeetingId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [decision, setDecision] = useState<AcademicBoardDecision>("graduate");
  const [ratifyNotes, setRatifyNotes] = useState("");
  const [academicBoardBusy, setAcademicBoardBusy] = useState(false);

  const examBoardMeetings = meetings?.filter((m) => m.committee === "Examination Board") ?? [];
  const academicBoardMeetings = meetings?.filter((m) => m.committee === "Academic Board") ?? [];

  function load() {
    apiFetch<Meeting[]>("/governance/meetings")
      .then(setMeetings)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load meetings."));
    apiFetch<FlaggedResult[]>("/governance/examination-board/flagged-results")
      .then(setFlagged)
      .catch(() => setFlagged([]));
  }

  useEffect(load, []);

  async function finalizeCourse(courseId: string) {
    setExamBoardBusy(courseId);
    setError(null);
    setInfo(null);
    try {
      const result = await apiFetch<{ finalized: number }>(`/results-approval/course/${courseId}/finalize`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setInfo(`Recomputed — ${result.finalized} student(s) now have a final grade.`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finalize results.");
    } finally {
      setExamBoardBusy(null);
    }
  }

  async function ratifyCourse(courseId: string) {
    if (!examBoardMeetingId) {
      setError("Choose an Examination Board meeting first.");
      return;
    }
    setExamBoardBusy(courseId);
    setError(null);
    setInfo(null);
    try {
      await apiFetch("/governance/examination-board/ratify", {
        method: "POST",
        body: JSON.stringify({ meetingId: examBoardMeetingId, courseId }),
      });
      setInfo("Results ratified by the Examination Board.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not ratify these results.");
    } finally {
      setExamBoardBusy(null);
    }
  }

  async function ratifyGraduation() {
    if (!academicBoardMeetingId || !studentId) {
      setError("Choose an Academic Board meeting and provide a student ID.");
      return;
    }
    setAcademicBoardBusy(true);
    setError(null);
    setInfo(null);
    try {
      await apiFetch("/governance/academic-board/ratify-graduation", {
        method: "POST",
        body: JSON.stringify({ meetingId: academicBoardMeetingId, studentId, decision, notes: ratifyNotes || undefined }),
      });
      setInfo(
        decision === "graduate"
          ? "Ratified — the student's academic status is now GRADUATED."
          : `Recorded — decision: ${decision}.`
      );
      setStudentId("");
      setRatifyNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the board's decision.");
    } finally {
      setAcademicBoardBusy(false);
    }
  }

  async function saveMinutes(id: string) {
    const minutesText = drafts[id];
    if (!minutesText) return;
    try {
      await apiFetch(`/governance/meetings/${id}/minutes`, {
        method: "PATCH",
        body: JSON.stringify({ minutesText }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the minutes.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Governance</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Board, Academic Board, QA Committee, and Examination Board meetings,
        with agenda items and their resolutions tracked in one place.
      </p>

      {error && <p className="mt-6 text-sm text-navy-dark">{error}</p>}
      {info && <p className="mt-6 text-sm text-ink/70">{info}</p>}
      {!meetings && !error && <LoadingState />}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Examination Board — units needing attention">
          <p className="text-xs text-ink/50">
            Units whose results are stuck part-way through approval, or that finalized with a pass rate under{" "}
            {50}%. Ratifying records the pass rate at this moment against the board meeting you pick below.
          </p>
          <select
            className="input mt-3 w-full text-sm"
            value={examBoardMeetingId}
            onChange={(e) => setExamBoardMeetingId(e.target.value)}
          >
            <option value="">Select an Examination Board meeting…</option>
            {examBoardMeetings.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} — {new Date(m.scheduledAt).toLocaleDateString()}
              </option>
            ))}
          </select>

          <div className="mt-4 space-y-3">
            {flagged && flagged.length === 0 && (
              <p className="text-sm text-ink/50">Nothing flagged for board review right now.</p>
            )}
            {flagged?.map((f) => (
              <div key={f.courseId} className="border border-line bg-white p-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {f.unitCode} — {f.unitTitle}
                  </p>
                  <Badge tone={f.reason === "low_pass_rate" ? "warn" : "neutral"}>
                    {f.reason === "low_pass_rate" ? "Low pass rate" : "Pending finalization"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-ink/50">
                  {f.approvedAssessments}/{f.totalAssessments} assessments approved
                  {f.passRate !== null && ` · pass rate ${f.passRate.toFixed(1)}% (${f.studentsCovered} students)`}
                </p>
                <div className="mt-2 flex gap-3">
                  {f.readyToFinalize && (
                    <button
                      onClick={() => finalizeCourse(f.courseId)}
                      disabled={examBoardBusy === f.courseId}
                      className="text-xs font-medium text-navy-dark hover:underline disabled:opacity-50"
                    >
                      {examBoardBusy === f.courseId ? "Working…" : "Recompute final grades"}
                    </button>
                  )}
                  {f.studentsCovered > 0 && (
                    <button
                      onClick={() => ratifyCourse(f.courseId)}
                      disabled={examBoardBusy === f.courseId || !examBoardMeetingId}
                      className="btn-primary text-xs disabled:opacity-50"
                    >
                      Ratify
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </PortalSection>

        <PortalSection title="Academic Board — ratify a graduation decision">
          <p className="text-xs text-ink/50">
            One decision per student, tied to a specific Academic Board meeting. Ratifying
            "graduate" sets the student's academic status to GRADUATED immediately.
          </p>
          <div className="mt-3 space-y-3">
            <select
              className="input w-full text-sm"
              value={academicBoardMeetingId}
              onChange={(e) => setAcademicBoardMeetingId(e.target.value)}
            >
              <option value="">Select an Academic Board meeting…</option>
              {academicBoardMeetings.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} — {new Date(m.scheduledAt).toLocaleDateString()}
                </option>
              ))}
            </select>
            <input
              className="input w-full text-sm"
              placeholder="Student ID (see Graduation Audit for the list)"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            />
            <select
              className="input w-full text-sm"
              value={decision}
              onChange={(e) => setDecision(e.target.value as AcademicBoardDecision)}
            >
              <option value="graduate">Graduate</option>
              <option value="defer">Defer</option>
              <option value="withhold">Withhold</option>
            </select>
            <textarea
              className="input w-full text-sm"
              rows={2}
              placeholder="Notes (optional)"
              value={ratifyNotes}
              onChange={(e) => setRatifyNotes(e.target.value)}
            />
            <button onClick={ratifyGraduation} disabled={academicBoardBusy} className="btn-primary disabled:opacity-50">
              {academicBoardBusy ? "Saving…" : "Record board decision"}
            </button>
          </div>
        </PortalSection>
      </div>

      <div className="mt-8 space-y-6">
        {meetings?.map((m) => (
          <PortalSection key={m.id} title={`${m.committee} — ${m.title}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs text-ink/45">{new Date(m.scheduledAt).toLocaleString()}</p>
              <Badge tone={m.status === "held" ? "ok" : m.status === "cancelled" ? "warn" : "neutral"}>
                {m.status}
              </Badge>
            </div>
            <ul className="mt-4 divide-y divide-line">
              {m.agendaItems.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p>{a.title}</p>
                    {a.resolution && <p className="mt-1 text-xs text-ink/50">Resolution: {a.resolution}</p>}
                  </div>
                  <Badge tone={a.status === "resolved" ? "ok" : a.status === "deferred" ? "warn" : "neutral"}>
                    {a.status}
                  </Badge>
                </li>
              ))}
            </ul>

            <div className="mt-4 border-t border-line pt-4">
              <label className="text-xs font-medium uppercase tracking-wide text-ink/50">Minutes</label>
              {m.minutesText ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink/70">{m.minutesText}</p>
              ) : (
                <p className="mt-1 text-sm text-ink/40">No minutes recorded yet.</p>
              )}
              <textarea
                className="input mt-2 w-full"
                rows={3}
                placeholder="Record minutes for this meeting…"
                value={drafts[m.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
              />
              <button
                onClick={() => saveMinutes(m.id)}
                className="mt-2 rounded-sm bg-navy px-4 py-1.5 text-xs font-medium text-paper"
              >
                Save minutes
              </button>
            </div>
          </PortalSection>
        ))}
        {meetings && meetings.length === 0 && (
          <p className="text-sm text-ink/50">No meetings recorded yet.</p>
        )}
      </div>
    </PortalShell>
  );
}
