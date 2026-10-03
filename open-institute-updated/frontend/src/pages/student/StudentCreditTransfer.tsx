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

type MyRequest = {
  id: string;
  fromUnitName: string;
  status: string;
  requestedAt: string;
  adminFeedback: string | null;
  toUnit: { title: string; code: string; programme: { name: string } };
  reviewedBy?: { email: string } | null;
};

const statusTone: Record<string, "ok" | "warn" | "danger"> = {
  approved: "ok",
  pending: "warn",
  rejected: "danger",
};

export default function StudentCreditTransfer() {
  const userName = useCurrentUserName();
  const [mine, setMine] = useState<MyRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fromUnitName, setFromUnitName] = useState("");
  const [fromUnitId, setFromUnitId] = useState("");
  const [toUnitId, setToUnitId] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<MyRequest[]>("/credit-transfer/mine")
      .then(setMine)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your requests."));
  }
  useEffect(load, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await apiFetch("/credit-transfer", {
        method: "POST",
        body: JSON.stringify({ fromUnitId, fromUnitName, toUnitId }),
      });
      setNotice("Request submitted — the registrar will review it.");
      setFromUnitName("");
      setFromUnitId("");
      setToUnitId("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Credit transfer</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Request credit for a unit you've already completed elsewhere
        towards a unit in your current programme. Your registrar reviews
        every request — nothing here is auto-approved.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}
      {notice && <p className="mt-4 text-sm text-forest">{notice}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="New request">
          <form onSubmit={submit} className="space-y-3">
            <input value={fromUnitId} onChange={(e) => setFromUnitId(e.target.value)} placeholder="ID / reference of your prior unit" className="input" required />
            <input value={fromUnitName} onChange={(e) => setFromUnitName(e.target.value)} placeholder="Prior unit name" className="input" required />
            <input
              value={toUnitId}
              onChange={(e) => setToUnitId(e.target.value)}
              placeholder="Target unit ID in your current programme"
              className="input"
              required
            />
            <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
              {busy ? "Submitting…" : "Submit request"}
            </button>
          </form>
        </PortalSection>

        <PortalSection title="Your requests">
          {mine && mine.length === 0 && <p className="text-sm text-ink/50">No requests yet.</p>}
          <ul className="divide-y divide-line">
            {mine?.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {r.fromUnitName} → {r.toUnit.code} {r.toUnit.title}
                    </p>
                    <p className="mt-1 text-xs text-ink/45">Requested {new Date(r.requestedAt).toLocaleDateString()}</p>
                    {r.adminFeedback && <p className="mt-1 text-xs text-ink/55">Feedback: {r.adminFeedback}</p>}
                  </div>
                  <Badge tone={statusTone[r.status] ?? "neutral"}>{r.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
