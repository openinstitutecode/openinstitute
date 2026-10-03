import { FormEvent, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";
import { AssessmentPicker } from "../../components/portal/TrainerPickers";

type Criterion = { name: string; description: string; maxMarks: number };

export default function TrainerRubrics() {
  const userName = useCurrentUserName();
  const [assessmentId, setAssessmentId] = useState("");
  const [criteria, setCriteria] = useState<Criterion[]>([{ name: "", description: "", maxMarks: 0 }]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = criteria.reduce((s, c) => s + (c.maxMarks || 0), 0);

  function updateCriterion(i: number, patch: Partial<Criterion>) {
    setCriteria((c) => c.map((cr, idx) => (idx === i ? { ...cr, ...patch } : cr)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/rubrics", {
        method: "POST",
        body: JSON.stringify({ assessmentId, criteria }),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save rubric.");
    }
  }

  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Rubric builder</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Criteria marks must sum to exactly the assessment's total marks —
        the backend rejects a mismatch rather than silently accepting it.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 max-w-2xl space-y-6">
        <AssessmentPicker required value={assessmentId} onChange={setAssessmentId} />

        <PortalSection title={`Criteria (total: ${total} marks)`}>
          <div className="space-y-4">
            {criteria.map((c, i) => (
              <div key={i} className="grid gap-2 border-b border-line pb-4 last:border-0 sm:grid-cols-[1fr_2fr_100px]">
                <input placeholder="Criterion name" value={c.name} onChange={(e) => updateCriterion(i, { name: e.target.value })} className="input" />
                <input placeholder="Description" value={c.description} onChange={(e) => updateCriterion(i, { description: e.target.value })} className="input" />
                <input type="number" min={0} placeholder="Marks" value={c.maxMarks || ""} onChange={(e) => updateCriterion(i, { maxMarks: Number(e.target.value) })} className="input" />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCriteria((c) => [...c, { name: "", description: "", maxMarks: 0 }])}
            className="btn-secondary mt-4"
          >
            + Add criterion
          </button>
        </PortalSection>

        {error && <p className="text-sm text-navy-dark">{error}</p>}
        {saved && <p className="text-sm text-forest">Rubric saved.</p>}
        <button type="submit" className="btn-primary">Save rubric</button>
      </form>
    </PortalShell>
  );
}
