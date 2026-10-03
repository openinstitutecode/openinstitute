import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { LoadingState } from "../../components/portal/StateViews";

const links = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/exams", label: "Examinations" },
  { to: "/admin/results-approval", label: "Results Approval" },
  { to: "/admin/registry", label: "Registry Actions" },
  { to: "/admin/curriculum", label: "Curriculum" },
  { to: "/admin/workflows", label: "Workflow Engine" },
  { to: "/admin/institutional-analytics", label: "Institutional Analytics" },
  { to: "/admin/decision-centre", label: "Executive Decision Centre" },
];

type Chain = {
  id: string;
  currentStage: string;
  submittedAt: string;
  examiner1Comment: string | null;
  examiner2Comment: string | null;
  rejectionReason: string | null;
  assessment: {
    id: string;
    title: string;
    type: string;
    totalMarks: number;
    courseId: string;
    unit: { code: string; title: string };
  };
};

type ResultsProcessing = {
  finalized: number;
  skippedNoEnrollment: number;
  skippedAlreadyFinal: number;
} | null;

const stageLabel: Record<string, string> = {
  SUBMITTED: "Awaiting Examiner 1",
  EXAMINER_1: "Awaiting Examiner 2",
  EXAMINER_2: "Awaiting QA officer",
  PUBLISHED: "Published",
};

export default function AdminResultsApproval() {
  const userName = useCurrentUserName();
  const [chains, setChains] = useState<Chain[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function load() {
    apiFetch<Chain[]>("/results-approval/pending")
      .then(setChains)
      .catch((err) =>
        setError(
          err instanceof Error
            ? `${err.message} — you need EXAMINATION_OFFICER, QA_OFFICER, REGISTRAR, or SUPER_ADMIN.`
            : "Could not load pending approvals."
        )
      );
  }
  useEffect(load, []);

  async function decide(id: string, decision: "approve" | "reject") {
    const text = comment[id];
    if (!text || text.trim().length < 3) {
      setError("Add at least a short comment before approving or rejecting.");
      return;
    }
    setBusy(id);
    setError(null);
    setInfo(null);
    try {
      const updated = await apiFetch<{ currentStage: string; resultsProcessing?: ResultsProcessing }>(
        `/results-approval/${id}/advance`,
        { method: "PATCH", body: JSON.stringify({ decision, comment: text }) }
      );
      if (updated.currentStage === "PUBLISHED" && updated.resultsProcessing) {
        const { finalized, skippedAlreadyFinal, skippedNoEnrollment } = updated.resultsProcessing;
        setInfo(
          `Results published. Final grades recorded for ${finalized} student(s)` +
            (skippedAlreadyFinal ? `, ${skippedAlreadyFinal} already had a final grade` : "") +
            (skippedNoEnrollment ? `, ${skippedNoEnrollment} had no matching active enrollment` : "") +
            "."
        );
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record that decision.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Results approval chain</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Every assessment's results pass through examiner 1, examiner 2, then
        a QA officer before they're marked published — each stage records
        who signed off, when, and their comment. Rejecting at any stage
        sends it back to the start for the trainer to review and resubmit.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}
      {info && <p className="mt-4 text-sm text-ink/70">{info}</p>}

      <div className="mt-8">
        <PortalSection title="Awaiting your sign-off">
          {!chains && !error && <LoadingState />}
          {chains && chains.length === 0 && <p className="text-sm text-ink/50">Nothing waiting on you right now.</p>}
          <div className="space-y-4">
            {chains?.map((c) => (
              <div key={c.id} className="border border-line bg-white p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="font-medium">
                    {c.assessment.unit.code} — {c.assessment.title}
                  </p>
                  <Badge tone="warn">{stageLabel[c.currentStage] ?? c.currentStage}</Badge>
                  <span className="text-xs text-ink/40">Submitted {new Date(c.submittedAt).toLocaleDateString()}</span>
                </div>
                {c.rejectionReason && <p className="mt-2 text-xs text-navy-dark">Last rejection: {c.rejectionReason}</p>}
                {c.examiner1Comment && <p className="mt-1 text-xs text-ink/50">Examiner 1: {c.examiner1Comment}</p>}
                {c.examiner2Comment && <p className="mt-1 text-xs text-ink/50">Examiner 2: {c.examiner2Comment}</p>}
                <textarea
                  value={comment[c.id] ?? ""}
                  onChange={(e) => setComment((m) => ({ ...m, [c.id]: e.target.value }))}
                  placeholder="Comment (required for either decision)"
                  className="input mt-3 w-full text-sm"
                  rows={2}
                />
                <div className="mt-2 flex gap-3">
                  <button
                    onClick={() => decide(c.id, "approve")}
                    disabled={busy === c.id}
                    className="btn-primary disabled:opacity-50"
                  >
                    {busy === c.id ? "Saving…" : "Approve & advance"}
                  </button>
                  <button
                    onClick={() => decide(c.id, "reject")}
                    disabled={busy === c.id}
                    className="text-sm font-medium text-navy-dark hover:underline disabled:opacity-50"
                  >
                    Reject — send back
                  </button>
                </div>
              </div>
            ))}
          </div>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
