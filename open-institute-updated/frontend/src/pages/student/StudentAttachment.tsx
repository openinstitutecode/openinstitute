import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
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
  { to: "/student/career", label: "Career Services" },
  { to: "/student/job-matches", label: "Job Matches" },
  { to: "/student/simulation", label: "Business Simulation Lab" },
  { to: "/student/virtual-lab", label: "Virtual Business Lab" },
  { to: "/student/viva", label: "AI Viva Practice" },
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

type LogbookEntry = { id: string; weekNumber: number; summary: string; supervisorSignOff: boolean };
type Placement = {
  id: string;
  supervisorName: string | null;
  startDate: string;
  endDate: string;
  status: string;
  employer: { name: string; location: string | null };
  logbookEntries: LogbookEntry[];
};

export default function StudentAttachment() {
  const userName = useCurrentUserName();
  const [placement, setPlacement] = useState<Placement | null | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Placement | null>("/me/attachment")
      .then(setPlacement)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your attachment."));
  }
  useEffect(load, []);

  async function addEntry(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !placement) return;
    try {
      await apiFetch("/me/attachment/logbook", {
        method: "POST",
        body: JSON.stringify({ placementId: placement.id, summary: draft }),
      });
      setDraft("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save entry.");
    }
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Industrial attachment</h1>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {placement === undefined && !error && <LoadingState />}

      {placement === null && (
        <p className="mt-8 text-sm text-ink/60">
          You don't have an active placement yet. Contact the attachment office to apply.
        </p>
      )}

      {placement && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <PortalSection title="Placement">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-line pb-3">
                <dt className="text-ink/50">Employer</dt>
                <dd className="font-medium">{placement.employer.name}{placement.employer.location ? `, ${placement.employer.location}` : ""}</dd>
              </div>
              <div className="flex justify-between border-b border-line pb-3">
                <dt className="text-ink/50">Supervisor</dt>
                <dd className="font-medium">{placement.supervisorName ?? "Not yet assigned"}</dd>
              </div>
              <div className="flex justify-between border-b border-line pb-3">
                <dt className="text-ink/50">Duration</dt>
                <dd className="font-medium">
                  {new Date(placement.startDate).toLocaleDateString()} – {new Date(placement.endDate).toLocaleDateString()}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/50">Status</dt>
                <dd><Badge tone={placement.status === "active" ? "ok" : "neutral"}>{placement.status}</Badge></dd>
              </div>
            </dl>
          </PortalSection>

          <PortalSection title="Weekly logbook">
            <ul className="space-y-4">
              {placement.logbookEntries.length === 0 && <p className="text-sm text-ink/50">No entries yet.</p>}
              {placement.logbookEntries.map((e) => (
                <li key={e.id} className="border-b border-line pb-4 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-navy">Week {e.weekNumber}</span>
                    {e.supervisorSignOff ? (
                      <Badge tone="ok">Supervisor signed off</Badge>
                    ) : (
                      <Badge tone="neutral">Awaiting sign-off</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-ink/70">{e.summary}</p>
                </li>
              ))}
            </ul>

            <form onSubmit={addEntry} className="mt-6 space-y-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Summarise week ${placement.logbookEntries.length + 1}'s tasks…`}
                rows={3}
                className="input"
              />
              <button type="submit" className="btn-secondary w-full justify-center">
                Submit week {placement.logbookEntries.length + 1} entry
              </button>
            </form>
          </PortalSection>
        </div>
      )}
    </PortalShell>
  );
}
