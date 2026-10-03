import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { QrCode } from "../../components/portal/QrCode";
import { DocLetterhead } from "../../components/Logo";

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

type Letter = { id: string; type: string; documentId: string; content: string; verificationUrl: string; issuedAt: string; revoked: boolean };

const typeLabel: Record<string, string> = {
  status: "Status letter",
  enrollment_verification: "Enrollment verification",
  completion: "Completion letter",
};

export default function StudentLetters() {
  const userName = useCurrentUserName();
  const [letters, setLetters] = useState<Letter[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Letter[]>("/credentials/letters/mine").then(setLetters).catch(() => setLetters([]));
  }
  useEffect(load, []);

  async function issue(type: "status" | "enrollment_verification") {
    setError(null);
    try {
      await apiFetch("/credentials/letters/mine", { method: "POST", body: JSON.stringify({ type }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not issue that letter.");
    }
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Official letters</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Self-issue a status or enrollment verification letter any time — it
        reflects your real current record and is verifiable by anyone with
        the document ID. Completion letters must be issued by the registrar.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-6 flex gap-3">
        <button className="btn-primary" onClick={() => issue("status")}>Issue status letter</button>
        <button className="btn-secondary" onClick={() => issue("enrollment_verification")}>Issue enrollment verification</button>
      </div>

      <div className="mt-8">
        <PortalSection title="Your issued letters">
          {letters && letters.length === 0 && <p className="text-sm text-ink/50">None issued yet.</p>}
          <ul className="divide-y divide-line">
            {letters?.map((l) => (
              <li key={l.id} className="py-3">
                <DocLetterhead title={typeLabel[l.type] ?? l.type} />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{typeLabel[l.type] ?? l.type}</span>
                  <Badge tone={l.revoked ? "danger" : "ok"}>{l.revoked ? "Revoked" : "Valid"}</Badge>
                </div>
                <p className="mt-1 text-sm text-ink/65">{l.content}</p>
                <p className="mt-1 text-xs text-ink/40">{l.documentId} · {new Date(l.issuedAt).toLocaleDateString()}</p>
                {!l.revoked && (
                  <div className="mt-2">
                    <QrCode data={l.verificationUrl} size={100} alt={`Scan to verify ${typeLabel[l.type] ?? l.type}`} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
