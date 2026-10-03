import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { Badge, PortalSection } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";
import { LabResult, launchVirtualLab, statusLabel, statusTone } from "../../lib/virtualLab";
import { LoadingState } from "../../components/portal/StateViews";

type Filter = LabResult["status"];
type Gradebook = { posted: boolean; reason?: string };

export default function TrainerVirtualLab() {
  const userName = useCurrentUserName();
  const [filter, setFilter] = useState<Filter>("PENDING_APPROVAL");
  const [rows, setRows] = useState<LabResult[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(null);
    apiFetch<LabResult[]>(`/integration/v1/lab-results?status=${filter}`)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load Lab results."));
  }, [filter]);
  useEffect(load, [load]);

  async function act(id: string, action: "approve" | "reject" | "reverse") {
    setError(null);
    setMessage(null);
    const text = notes[id]?.trim();
    if (action === "reverse" && !text) return setError("Enter a reason before reversing an approved result.");
    try {
      const body = action === "reverse" ? { reason: text } : { note: text };
      const out = await apiFetch<{ gradebook?: Gradebook }>(`/integration/v1/lab-results/${id}/${action}`, { method: "POST", body: JSON.stringify(body) });
      if (action === "approve") setMessage(out.gradebook?.posted ? "Approved and posted to the gradebook." : `Approved. Not posted to the gradebook: ${out.gradebook?.reason ?? "no mapping yet"}`);
      if (action === "reject") setMessage("Rejected.");
      if (action === "reverse") setMessage("Reversed. The posted grade was set to zero and annotated.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action failed.");
    }
  }

  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Virtual Business Lab — review</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Results assessed in the Lab for the units you teach wait here. Nothing reaches the official gradebook until you approve it.
        Reversing an approval needs an administrator and a written reason.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={async () => setError(await launchVirtualLab())} className="btn-primary">Open the Virtual Business Lab</button>
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="input">
          {(["PENDING_APPROVAL", "APPROVED", "REJECTED", "REVERSED"] as Filter[]).map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
      </div>
      {message && <p className="mt-3 text-sm text-forest">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <PortalSection title={statusLabel(filter)}>
        {rows === null && !error && <LoadingState />}
        {rows?.length === 0 && <p className="text-sm text-ink/50">Nothing here.</p>}
        {rows?.map((r) => (
          <div key={r.id} className="border-t border-line py-4 first:border-t-0">
            <div className="flex flex-wrap items-center gap-3">
              <strong>{r.student?.fullName}</strong>
              <span className="text-xs text-ink/50">{r.student?.studentNumber}</span>
              <span className="text-sm">{r.unit.code} · {r.competencyCode ?? "no competency code"}</span>
              <Badge tone={r.outcome === "COMPETENT" ? "ok" : "warn"}>{r.outcome === "COMPETENT" ? "Competent" : "Not yet competent"}</Badge>
              <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
              {r.supersedesResultId && <span className="text-xs text-ink/50">resubmission</span>}
            </div>
            {r.feedback && <p className="mt-2 text-sm text-ink/70">Assessor: {r.feedback}</p>}
            {r.criteria && r.criteria.length > 0 && (
              <ul className="mt-1 text-xs text-ink/60">
                {r.criteria.map((c) => <li key={c.code}>{c.met ? "✓" : "✗"} {c.name ?? c.code}{c.comment ? ` — ${c.comment}` : ""}</li>)}
              </ul>
            )}
            {r.evidenceContentHash && <p className="mt-1 font-mono text-xs text-ink/40">evidence {r.evidenceContentHash.slice(0, 16)}…</p>}
            {(r.status === "PENDING_APPROVAL" || r.status === "APPROVED") && (
              <div className="mt-3 flex flex-wrap gap-2">
                <input className="input flex-1" placeholder={r.status === "APPROVED" ? "Reason (required to reverse)" : "Note (optional)"}
                  value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                {r.status === "PENDING_APPROVAL" && <>
                  <button className="btn-primary" onClick={() => act(r.id, "approve")}>Approve</button>
                  <button className="btn-secondary" onClick={() => act(r.id, "reject")}>Reject</button>
                </>}
                {r.status === "APPROVED" && <button className="btn-secondary" onClick={() => act(r.id, "reverse")}>Reverse (admin)</button>}
              </div>
            )}
          </div>
        ))}
      </PortalSection>
    </PortalShell>
  );
}
