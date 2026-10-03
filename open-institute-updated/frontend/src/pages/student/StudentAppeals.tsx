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

type Appeal = { id: string; type: string; reason: string; status: string; decision: string | null };

const types = [
  { value: "grade", label: "Grade appeal" },
  { value: "examination", label: "Examination appeal" },
  { value: "fee", label: "Fee dispute" },
  { value: "admission", label: "Admission appeal" },
  { value: "credit_transfer", label: "Credit transfer appeal" },
  { value: "disciplinary", label: "Disciplinary appeal" },
];

export default function StudentAppeals() {
  const userName = useCurrentUserName();
  const [appeals, setAppeals] = useState<Appeal[] | null>(null);
  const [type, setType] = useState(types[0].value);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Appeal[]>("/appeals/mine")
      .then(setAppeals)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your appeals."));
  }
  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/appeals", {
        method: "POST",
        body: JSON.stringify({ type, reason }),
      });
      setReason("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your appeal.");
    }
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Appeals</h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <PortalSection title="Your appeals">
          {appeals && appeals.length === 0 && <p className="text-sm text-ink/50">No appeals filed yet.</p>}
          <ul className="divide-y divide-line">
            {appeals?.map((a) => (
              <li key={a.id} className="py-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-navy">{a.type.replace("_", " ")}</p>
                  <Badge tone={a.status === "decided" ? "ok" : "warn"}>{a.status}</Badge>
                </div>
                <p className="mt-2 text-sm text-ink/70">{a.reason}</p>
                {a.decision && <p className="mt-2 text-xs text-ink/50">Decision: {a.decision}</p>}
              </li>
            ))}
          </ul>
        </PortalSection>

        <PortalSection title="File a new appeal">
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Type</span>
              <select value={type} onChange={(e) => setType(e.target.value)} className="input mt-1.5">
                {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Reason &amp; supporting details</span>
              <textarea required rows={4} value={reason} onChange={(e) => setReason(e.target.value)} className="input mt-1.5" />
            </label>
            {error && <p className="text-xs text-navy-dark">{error}</p>}
            <button type="submit" className="btn-primary w-full justify-center">
              Submit appeal
            </button>
          </form>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
