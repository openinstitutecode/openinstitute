import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";

type Activity = { id: string; title: string; provider: string | null; hours: number; completedAt: string };

export default function TrainerCpd() {
  const userName = useCurrentUserName();
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState("");
  const [hours, setHours] = useState(1);
  const [completedAt, setCompletedAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Activity[]>("/cpd/mine")
      .then(setActivities)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load CPD history."));
  }
  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/cpd/mine", {
        method: "POST",
        body: JSON.stringify({
          title,
          provider: provider || undefined,
          hours,
          completedAt: new Date(completedAt).toISOString(),
        }),
      });
      setTitle("");
      setProvider("");
      setHours(1);
      setCompletedAt("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  const totalHours = activities?.reduce((s, a) => s + a.hours, 0) ?? 0;

  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">CPD tracker</h1>
        <p className="font-mono text-sm text-navy">{totalHours} hours logged</p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <PortalSection title="Your CPD history">
          {activities && activities.length === 0 && <p className="text-sm text-ink/50">Nothing logged yet.</p>}
          <ul className="divide-y divide-line">
            {activities?.map((a) => (
              <li key={a.id} className="py-3 text-sm">
                <p className="font-medium">{a.title}</p>
                <p className="text-xs text-ink/45">
                  {a.provider ?? "Self-directed"} · {a.hours}h · {new Date(a.completedAt).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        </PortalSection>

        <PortalSection title="Log an activity">
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Title</span>
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className="input mt-1.5" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Provider (optional)</span>
              <input value={provider} onChange={(e) => setProvider(e.target.value)} className="input mt-1.5" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Hours</span>
              <input required type="number" min={1} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="input mt-1.5" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Date completed</span>
              <input required type="date" value={completedAt} onChange={(e) => setCompletedAt(e.target.value)} className="input mt-1.5" />
            </label>
            {error && <p className="text-xs text-navy-dark">{error}</p>}
            <button type="submit" className="btn-primary w-full justify-center">Log activity</button>
          </form>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
