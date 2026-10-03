import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { Badge, PortalSection } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { LabActivity, LabResult, launchVirtualLab, statusLabel, statusTone } from "../../lib/virtualLab";
import { LoadingState } from "../../components/portal/StateViews";
const links = [
  { to: "/student/dashboard", label: "Dashboard" },
  { to: "/student/profile", label: "My Profile" },
  { to: "/student/id-card", label: "Digital ID" },
  { to: "/student/roadmap", label: "Programme Roadmap" },
  { to: "/student/courses", label: "My Courses" },
  { to: "/student/assignments", label: "Assignment Centre" },
  { to: "/student/exams", label: "Assessment Centre" },
  { to: "/student/alerts", label: "Academic Alerts" },
  { to: "/student/notebook", label: "Knowledge Notebook" },
  { to: "/student/portfolio", label: "Digital Portfolio" },
  { to: "/student/advisor", label: "AI Study Advisor" },
  { to: "/student/letters", label: "Official Letters" },
  { to: "/student/receipts", label: "Payment Receipts" },
  { to: "/student/research", label: "Research Workspace" },
  { to: "/student/messages", label: "Messages & Office Hours" },
  { to: "/student/forums", label: "Discussion Forums" },
  { to: "/student/timetable", label: "Timetable" },
  { to: "/student/attendance", label: "Attendance" },
  { to: "/student/achievements", label: "Achievements" },
  { to: "/student/library", label: "Digital Library" },
  { to: "/student/tutor", label: "AI Tutor" },
  { to: "/student/viva", label: "AI Viva Practice" },
  { to: "/student/career", label: "Career Services" },
  { to: "/student/job-matches", label: "Job Matches" },
  { to: "/student/simulation", label: "Business Simulation Lab" },
  { to: "/student/virtual-lab", label: "Virtual Business Lab" },
  { to: "/student/passport", label: "Competency Passport" },
  { to: "/student/grades", label: "Grades & Transcript" },
  { to: "/student/appeals", label: "Appeals" },
  { to: "/student/fees", label: "Fees" },
  { to: "/student/attachment", label: "Industrial Attachment" },
  { to: "/student/graduation", label: "Graduation Status" },
  { to: "/student/wellbeing", label: "Counselling & Support" },
  { to: "/student/events", label: "Clubs & Events" },
  { to: "/student/support", label: "Support" },
  { to: "/student/accessibility", label: "Accessibility Settings" },
  { to: "/student/credit-transfer", label: "Credit Transfer" },
  { to: "/student/tutor-sessions", label: "Tutor Session History" },
];

export default function StudentVirtualLab() {
  const userName = useCurrentUserName();
  const [results, setResults] = useState<LabResult[] | null>(null);
  const [activity, setActivity] = useState<LabActivity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<LabActivity[]>("/integration/v1/me/lab-activity").then(setActivity).catch(() => setActivity([]));
    apiFetch<LabResult[]>("/integration/v1/me/lab-results")
      .then(setResults)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your Lab results."));
  }, []);

  async function open() {
    setError(await launchVirtualLab());
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Virtual Business Lab</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Practise in a simulated company. You sign in once, here — the Lab opens without another password. A trainer reviews each
        assessed result before it counts towards your official grade.
      </p>
      <button onClick={open} className="btn-primary mt-4">Open the Virtual Business Lab</button>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <PortalSection title="My Lab assessments">
        {results === null && !error && <LoadingState />}
        {results?.length === 0 && <p className="text-sm text-ink/50">No assessed Lab work yet.</p>}
        {results && results.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-ink/45">
              <tr><th className="py-2">Unit</th><th>Competency</th><th>Outcome</th><th>Status</th><th>Assessed</th></tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="py-2">{r.unit.code} — {r.unit.title}</td>
                  <td>{r.competencyCode ?? "—"}</td>
                  <td>{r.outcome === "COMPETENT" ? "Competent" : "Not yet competent"}{r.supersedesResultId ? " (resubmission)" : ""}</td>
                  <td>
                    <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
                    {r.status === "REVERSED" && r.reversalReason && <p className="mt-1 text-xs text-ink/50">{r.reversalReason}</p>}
                    {r.reviewNote && <p className="mt-1 text-xs text-ink/50">{r.reviewNote}</p>}
                    {r.criteria && r.criteria.length > 0 && (
                      <ul className="mt-1 text-xs text-ink/60">
                        {r.criteria.map((c) => <li key={c.code}>{c.met ? "✓" : "✗"} {c.name ?? c.code}{c.comment ? ` — ${c.comment}` : ""}</li>)}
                      </ul>
                    )}
                  </td>
                  <td>{new Date(r.decidedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PortalSection>

      <PortalSection title="My recent Lab activity">
        {activity === null && <LoadingState />}
        {activity?.length === 0 && <p className="text-sm text-ink/50">Nothing synchronized from the Lab yet.</p>}
        {activity?.slice(0, 20).map((a) => (
          <div key={a.id} className="flex flex-wrap items-baseline gap-3 border-t border-line py-2 text-sm first:border-t-0">
            <span className="font-medium">{a.summary ?? a.activityType}</span>
            <span className="text-xs text-ink/50">{a.unit ? `${a.unit.code} · ` : ""}{new Date(a.occurredAt).toLocaleString()}</span>
          </div>
        ))}
      </PortalSection>
    </PortalShell>
  );
}
