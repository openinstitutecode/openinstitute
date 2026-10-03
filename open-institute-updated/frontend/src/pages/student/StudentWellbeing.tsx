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

export default function StudentWellbeing() {
  const userName = useCurrentUserName();
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState("video_call");
  const [need, setNeed] = useState("");
  const [counsellingSent, setCounsellingSent] = useState(false);
  const [accommodationSent, setAccommodationSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCounselling(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/wellbeing/counselling", {
        method: "POST",
        body: JSON.stringify({ reason, preferredMode: mode }),
      });
      setCounsellingSent(true);
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send request.");
    }
  }

  async function requestAccommodation(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/wellbeing/accommodations", {
        method: "POST",
        body: JSON.stringify({ needDescription: need }),
      });
      setAccommodationSent(true);
      setNeed("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send request.");
    }
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Counselling &amp; support</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Anything you share here goes only to the counselling office, not your
        trainer or the wider admin team.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Request a counselling session">
          {counsellingSent ? (
            <p className="text-sm text-forest"><Badge tone="ok">Sent</Badge> A counsellor will reach out shortly.</p>
          ) : (
            <form onSubmit={requestCounselling} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-ink/80">What's this about? (as much or as little as you're comfortable sharing)</span>
                <textarea required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="input mt-1.5" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink/80">Preferred contact method</span>
                <select value={mode} onChange={(e) => setMode(e.target.value)} className="input mt-1.5">
                  <option value="video_call">Video call</option>
                  <option value="phone">Phone call</option>
                  <option value="in_app_chat">In-app chat</option>
                </select>
              </label>
              <button type="submit" className="btn-primary w-full justify-center">
                Send request
              </button>
            </form>
          )}
        </PortalSection>

        <PortalSection title="Request a disability accommodation">
          {accommodationSent ? (
            <p className="text-sm text-forest"><Badge tone="ok">Sent</Badge> The registrar's office will follow up.</p>
          ) : (
            <form onSubmit={requestAccommodation} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-ink/80">What accommodation would help?</span>
                <textarea
                  required
                  rows={3}
                  value={need}
                  onChange={(e) => setNeed(e.target.value)}
                  placeholder="e.g. extended time on assessments, screen-reader-compatible materials"
                  className="input mt-1.5"
                />
              </label>
              <button type="submit" className="btn-primary w-full justify-center">
                Send request
              </button>
            </form>
          )}
        </PortalSection>
      </div>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}
    </PortalShell>
  );
}
