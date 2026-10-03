import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";

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

type Match = {
  posting: { id: string; title: string; description: string; slots: number; employer: { name: string } };
  matchPercent: number | null;
};

type Application = {
  id: string;
  status: string;
  appliedAt: string;
  posting: { id: string; title: string; employer: { name: string } };
};

export default function StudentJobMatches() {
  const userName = useCurrentUserName();
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [coverNote, setCoverNote] = useState("");
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  function loadApplications() {
    apiFetch<Application[]>("/employers/applications/mine")
      .then(setApplications)
      .catch(() => setApplications([]));
  }

  useEffect(() => {
    apiFetch<Match[]>("/employers/postings/matches/mine")
      .then(setMatches)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load matches."));
    loadApplications();
  }, []);

  const appliedPostingIds = new Set(applications.map((a) => a.posting.id));

  async function submitApplication(e: FormEvent, postingId: string) {
    e.preventDefault();
    setApplyMsg(null);
    try {
      await apiFetch(`/employers/postings/${postingId}/apply`, {
        method: "POST",
        body: JSON.stringify({ coverNote: coverNote || undefined }),
      });
      setApplyMsg("Application submitted.");
      setApplyingId(null);
      setCoverNote("");
      loadApplications();
    } catch (err) {
      setApplyMsg(err instanceof Error ? err.message : "Could not submit application.");
    }
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Job &amp; internship matches</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Ranked by overlap between a posting's required skills and your own
        verified competencies — a simple, explainable match, not a black box.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8">
        <PortalSection title="Open postings">
          {matches && matches.length === 0 && <p className="text-sm text-ink/50">No open postings right now.</p>}
          {applyMsg && <p className="mb-2 text-sm text-ink/60">{applyMsg}</p>}
          <ul className="divide-y divide-line">
            {matches?.map((m) => {
              const already = appliedPostingIds.has(m.posting.id);
              return (
                <li key={m.posting.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{m.posting.title}</p>
                      <p className="text-xs text-ink/45">
                        {m.posting.employer.name} — {m.posting.slots} slot(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.matchPercent !== null ? (
                        <Badge tone={m.matchPercent >= 50 ? "ok" : "neutral"}>{m.matchPercent}% match</Badge>
                      ) : (
                        <Badge tone="neutral">No skills listed</Badge>
                      )}
                      {already ? (
                        <Badge tone="ok">Applied</Badge>
                      ) : (
                        <button
                          className="text-xs text-navy underline"
                          onClick={() => setApplyingId(applyingId === m.posting.id ? null : m.posting.id)}
                        >
                          {applyingId === m.posting.id ? "Cancel" : "Apply"}
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-ink/50">{m.posting.description}</p>
                  {applyingId === m.posting.id && (
                    <form onSubmit={(e) => submitApplication(e, m.posting.id)} className="mt-2 flex items-end gap-2">
                      <input
                        className="flex-1 rounded border border-line px-2 py-1 text-xs"
                        placeholder="Optional note to the employer"
                        value={coverNote}
                        onChange={(e) => setCoverNote(e.target.value)}
                      />
                      <button type="submit" className="rounded bg-navy px-3 py-1 text-xs text-white">
                        Submit application
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </PortalSection>
      </div>

      <div className="mt-8">
        <PortalSection title="My applications">
          {applications.length === 0 && <p className="text-sm text-ink/50">You haven't applied to any postings yet.</p>}
          <ul className="divide-y divide-line">
            {applications.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium">{a.posting.title}</p>
                  <p className="text-xs text-ink/45">
                    {a.posting.employer.name} — applied {new Date(a.appliedAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge
                  tone={
                    a.status === "accepted" ? "ok" : a.status === "rejected" ? "danger" : a.status === "shortlisted" ? "warn" : "neutral"
                  }
                >
                  {a.status}
                </Badge>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
