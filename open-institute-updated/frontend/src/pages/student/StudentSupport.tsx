import { FormEvent, useState } from "react";
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

const faqs = [
  { q: "How do I obtain an official transcript?", a: "Go to Grades & Transcript and select 'Request official transcript'. It's issued once fees are cleared." },
  { q: "How do I appeal a grade?", a: "Message your trainer first; if unresolved within 5 days, raise a ticket here tagged 'Academic appeal'." },
  { q: "When is registration for next semester?", a: "Check the announcement banner on your dashboard — dates are published there first." },
];

export default function StudentSupport() {
  const userName = useCurrentUserName();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/support/tickets", {
        method: "POST",
        body: JSON.stringify({ subject, body }),
      });
      setSent(true);
      setSubject("");
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your ticket.");
    }
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Support</h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Frequently asked">
          <div className="divide-y divide-line">
            {faqs.map((f) => (
              <details key={f.q} className="py-3">
                <summary className="cursor-pointer text-sm font-medium">{f.q}</summary>
                <p className="mt-2 text-sm text-ink/65">{f.a}</p>
              </details>
            ))}
          </div>
        </PortalSection>

        <PortalSection title="Raise a ticket">
          {sent ? (
            <p className="flex items-center gap-2 text-sm text-forest">
              <Badge tone="ok">Sent</Badge> We'll respond within one working day.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-ink/80">Subject</span>
                <input required value={subject} onChange={(e) => setSubject(e.target.value)} className="input mt-1.5" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink/80">Details</span>
                <textarea required rows={4} value={body} onChange={(e) => setBody(e.target.value)} className="input mt-1.5" />
              </label>
              {error && <p className="text-xs text-navy-dark">{error}</p>}
              <button type="submit" className="btn-primary w-full justify-center">
                Submit ticket
              </button>
            </form>
          )}
        </PortalSection>
      </div>
    </PortalShell>
  );
}
