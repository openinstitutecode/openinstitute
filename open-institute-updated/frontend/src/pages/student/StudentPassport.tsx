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

type Record_ = {
  id: string;
  level: string;
  evidenceSummary: string | null;
  assessmentScore: number | null;
  trainerVerifiedById: string | null;
  industryVerifiedByEmployerId: string | null;
  competency: { name: string };
};

type Gap = { competencyId: string; name: string; description: string | null; status: string };
type GapResponse = { totalCompetencies: number; achievedCount: number; gaps: Gap[] };
type Evidence = {
  id: string;
  description: string;
  evidenceUrl: string | null;
  status: string;
  reviewNote: string | null;
  competency: { name: string };
};

export default function StudentPassport() {
  const userName = useCurrentUserName();
  const [records, setRecords] = useState<Record_[] | null>(null);
  const [gapData, setGapData] = useState<GapResponse | null>(null);
  const [evidenceList, setEvidenceList] = useState<Evidence[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadEvidence() {
    apiFetch<Evidence[]>("/competency/evidence/mine").then(setEvidenceList).catch(() => setEvidenceList([]));
  }

  useEffect(() => {
    apiFetch<Record_[]>("/competency/passport/mine")
      .then(setRecords)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your passport."));
    apiFetch<GapResponse>("/me/competency-gaps").then(setGapData).catch(() => setGapData(null));
    loadEvidence();
  }, []);

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Competency passport</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Evidence-backed record of what you can actually do, not just the
        grade you scored — verified by your trainer and, where relevant, an
        employer from your attachment.
      </p>

      {error && <p className="mt-6 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 space-y-6">
        <PortalSection title="Your competencies">
          {records && records.length === 0 && <p className="text-sm text-ink/50">Nothing recorded yet.</p>}
          <ul className="divide-y divide-line">
            {records?.map((r) => (
              <li key={r.id} className="py-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{r.competency.name}</p>
                  <Badge tone={r.level === "advanced" ? "ok" : r.level === "competent" ? "warn" : "neutral"}>
                    {r.level}
                  </Badge>
                </div>
                {r.evidenceSummary && <p className="mt-2 text-sm text-ink/65">{r.evidenceSummary}</p>}
                <div className="mt-2 flex gap-4 text-xs text-ink/45">
                  {r.assessmentScore !== null && <span>Score: {r.assessmentScore}%</span>}
                  <span>{r.trainerVerifiedById ? "Trainer verified" : "Awaiting trainer verification"}</span>
                  {r.industryVerifiedByEmployerId && <span>Industry verified</span>}
                </div>
              </li>
            ))}
          </ul>
        </PortalSection>

        {/* SP029 — competency-gap analysis: a real, deterministic comparison
            of the programme's competencies against what this student has
            already achieved. Not an AI judgment call. */}
        {gapData && (
          <PortalSection title={`Competency gaps (${gapData.achievedCount}/${gapData.totalCompetencies} achieved)`}>
            {gapData.gaps.length === 0 ? (
              <p className="text-sm text-forest">Every programme competency is achieved.</p>
            ) : (
              <ul className="divide-y divide-line">
                {gapData.gaps.map((g) => (
                  <li key={g.competencyId} className="flex items-center justify-between py-2 text-sm">
                    <span>{g.name}</span>
                    <Badge tone={g.status === "developing" ? "warn" : "neutral"}>{g.status.replace("_", " ")}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </PortalSection>
        )}

        {/* SP022 — competency evidence portfolio: submit your own evidence
            for a gap; a trainer reviews and decides whether it counts. */}
        {gapData && gapData.gaps.length > 0 && (
          <EvidenceForm gaps={gapData.gaps} onSubmitted={loadEvidence} />
        )}

        <PortalSection title="Your evidence submissions">
          {evidenceList && evidenceList.length === 0 && <p className="text-sm text-ink/50">No evidence submitted yet.</p>}
          <ul className="divide-y divide-line">
            {evidenceList?.map((e) => (
              <li key={e.id} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>{e.competency.name}</span>
                  <Badge tone={e.status === "accepted" ? "ok" : e.status === "rejected" ? "danger" : "neutral"}>
                    {e.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-ink/55">{e.description}</p>
                {e.reviewNote && <p className="mt-1 text-xs text-ink/45">Reviewer note: {e.reviewNote}</p>}
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}

function EvidenceForm({ gaps, onSubmitted }: { gaps: Gap[]; onSubmitted: () => void }) {
  const [competencyId, setCompetencyId] = useState(gaps[0]?.competencyId ?? "");
  const [description, setDescription] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/competency/evidence", {
        method: "POST",
        body: JSON.stringify({ competencyId, description, evidenceUrl: evidenceUrl || undefined }),
      });
      setDescription("");
      setEvidenceUrl("");
      setSaved(true);
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit evidence.");
    }
  }

  return (
    <PortalSection title="Submit evidence for a gap">
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-ink/80">Competency</span>
          <select value={competencyId} onChange={(e) => setCompetencyId(e.target.value)} className="input mt-1.5">
            {gaps.map((g) => (
              <option key={g.competencyId} value={g.competencyId}>{g.name}</option>
            ))}
          </select>
        </label>
        <textarea
          required
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what you did and why it demonstrates this competency…"
          className="input"
        />
        <input
          value={evidenceUrl}
          onChange={(e) => setEvidenceUrl(e.target.value)}
          placeholder="Link to evidence (optional — e.g. a document or photo URL)"
          className="input"
        />
        <button type="submit" className="btn-primary">Submit for review</button>
      </form>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {saved && <p className="mt-2 text-xs text-forest">Submitted — awaiting trainer review.</p>}
    </PortalSection>
  );
}
