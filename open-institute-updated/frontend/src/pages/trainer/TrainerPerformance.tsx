import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { StatCard, PortalSection } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";

type Profile = {
  trainerName: string;
  coursesTaught: number;
  licenceExpiry: string | null;
  totalCpdHours: number;
  studentFeedbackCount: number;
  averageStudentRating: number | null;
};

export default function TrainerPerformance() {
  const userName = useCurrentUserName();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Profile>("/trainer-self/performance-profile")
      .then(setProfile)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your profile."));
  }, []);

  return (
    <PortalShell role="Trainer portal" links={links} userName={profile?.trainerName ?? (userName || "…")}>
      <h1 className="font-display text-2xl">Performance profile</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Combines teaching workload, CPD, and anonymized student feedback —
        all computed from real records.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {profile && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Courses taught" value={profile.coursesTaught} />
          <StatCard label="CPD hours logged" value={profile.totalCpdHours} />
          <StatCard label="Student feedback received" value={profile.studentFeedbackCount} />
          <StatCard
            label="Average student rating"
            value={profile.averageStudentRating !== null ? `${profile.averageStudentRating.toFixed(1)} / 5` : "No ratings yet"}
          />
        </div>
      )}

      {profile && (
        <div className="mt-8">
          <PortalSection title="Licence status">
            <p className="text-sm text-ink/70">
              {profile.licenceExpiry
                ? `Valid until ${new Date(profile.licenceExpiry).toLocaleDateString()}`
                : "No licence expiry on file."}
            </p>
          </PortalSection>
        </div>
      )}
    </PortalShell>
  );
}
