import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";

type Pending = {
  id: string;
  description: string;
  evidenceUrl: string | null;
  submittedAt: string;
  competency: { name: string };
  student: { fullName: string; studentNumber: string };
};

export default function TrainerEvidenceReview() {
  const userName = useCurrentUserName();
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  function load() {
    apiFetch<Pending[]>("/competency/evidence/pending")
      .then(setPending)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load pending evidence."));
  }
  useEffect(load, []);

  async function review(id: string, decision: "accepted" | "rejected") {
    try {
      await apiFetch(`/competency/evidence/${id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ decision, reviewNote: notes[id] || undefined }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record that review.");
    }
  }

  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Competency evidence review</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Evidence students have submitted themselves for a competency gap.
        Accepting one creates or upgrades their official CompetencyRecord —
        nothing becomes verified without this step.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 space-y-4">
        {pending && pending.length === 0 && <p className="text-sm text-ink/50">Nothing pending review.</p>}
        {pending?.map((p) => (
          <PortalSection key={p.id} title={`${p.student.fullName} (${p.student.studentNumber}) — ${p.competency.name}`}>
            <Badge tone="neutral">{new Date(p.submittedAt).toLocaleDateString()}</Badge>
            <p className="mt-3 text-sm">{p.description}</p>
            {p.evidenceUrl && (
              <a href={p.evidenceUrl} target="_blank" rel="noreferrer" className="mt-2 block text-xs text-navy underline">
                {p.evidenceUrl}
              </a>
            )}
            <textarea
              rows={2}
              placeholder="Review note (optional)"
              value={notes[p.id] ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))}
              className="input mt-3"
            />
            <div className="mt-3 flex gap-3">
              <button className="btn-primary" onClick={() => review(p.id, "accepted")}>Accept</button>
              <button className="btn-secondary" onClick={() => review(p.id, "rejected")}>Reject</button>
            </div>
          </PortalSection>
        ))}
      </div>
    </PortalShell>
  );
}
