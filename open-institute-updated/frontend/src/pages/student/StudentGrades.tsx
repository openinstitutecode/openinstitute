import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Table, Badge } from "../../components/portal/Primitives";
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

type Result = {
  id: string;
  score: number | null;
  feedback: string | null;
  submittedAt: string;
  assessment: { title: string; type: string; totalMarks: number };
};

type IssuedTranscript = { id: string; documentId: string; issuedAt: string; revoked: boolean; printable: boolean; version: number; current: boolean };

export default function StudentGrades() {
  const userName = useCurrentUserName();
  const [transcripts, setTranscripts] = useState<IssuedTranscript[] | null>(null);
  const [requested, setRequested] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<IssuedTranscript[]>("/credentials/transcripts/mine").then(setTranscripts).catch(() => setTranscripts([]));
  }, []);

  // Official transcripts are issued by the registrar (and blocked by a financial hold), so "request" raises a
  // support ticket the registry already works from — the student cannot issue one to themselves.
  async function requestTranscript() {
    setRequestError(null);
    try {
      await apiFetch("/support/tickets", {
        method: "POST",
        body: JSON.stringify({ subject: "Official transcript request", body: "Please issue my official transcript." }),
      });
      setRequested(true);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "Could not send your request.");
    }
  }
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Result[]>("/me/results")
      .then(setResults)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your results."));
  }, []);

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">Grades &amp; transcript</h1>
        <button className="btn-secondary disabled:opacity-50" onClick={requestTranscript} disabled={requested}>
          {requested ? "Request sent" : "Request official transcript"}
        </button>
      </div>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Only published results appear here — a score can exist behind the
        scenes before the examination office releases it.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}
      {requestError && <p className="mt-4 text-sm text-navy-dark">{requestError}</p>}
      {requested && <p className="mt-4 text-sm text-forest">Request sent to the registry. Your transcript will appear below once it is issued.</p>}

      <div className="mt-8">
        <PortalSection title="Official transcripts">
          {transcripts && transcripts.length === 0 && (
            <p className="text-sm text-ink/50">No official transcript has been issued yet. Use “Request official transcript” above.</p>
          )}
          <ul className="divide-y divide-line">
            {transcripts?.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>
                  Version {t.version} — <span className="font-mono text-xs">{t.documentId}</span>
                  <span className="ml-2 text-xs text-ink/45">{new Date(t.issuedAt).toLocaleDateString()}</span>
                </span>
                <span className="flex items-center gap-2">
                  {t.current && !t.revoked && <Badge tone="ok">Current</Badge>}
                  {t.revoked && <Badge tone="danger">Revoked</Badge>}
                  {t.printable ? (
                    <Link to={`/transcript/${t.documentId}`} className="text-navy underline">View / print</Link>
                  ) : (
                    <span className="text-xs text-ink/45">Issued before printable copies — ask the registry to re-issue</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>

      <div className="mt-8">
        <PortalSection title="Published results">
          {results && results.length === 0 && (
            <p className="text-sm text-ink/50">No published results yet.</p>
          )}
          {!results && !error && <LoadingState />}
          {results && results.length > 0 && (
            <Table
              columns={["Assessment", "Type", "Score", "Feedback"]}
              rows={results.map((r) => [
                r.assessment.title,
                r.assessment.type.replace("_", " "),
                <Badge tone="ok">{r.score}/{r.assessment.totalMarks}</Badge>,
                r.feedback ?? "—",
              ])}
            />
          )}
        </PortalSection>
      </div>
    </PortalShell>
  );
}
