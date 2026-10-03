import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { StatCard, PortalSection, Table, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";

type Dashboard = {
  trainerName: string;
  licenceExpiry: string | null;
  courses: { courseId: string; title: string; studentCount: number; ungradedSubmissions: number }[];
  totalUngraded: number;
  totalStudents: number;
};

export default function TrainerDashboard() {
  const userName = useCurrentUserName();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Dashboard>("/trainer-self/dashboard")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your dashboard."));
  }, []);

  return (
    <PortalShell role="Trainer portal" links={links} userName={data?.trainerName ?? (userName || "…")}>
      {error && <p className="text-sm text-navy-dark">{error}</p>}

      {data && (
        <>
          <h1 className="font-display text-2xl">Your teaching load</h1>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Courses" value={data.courses.length} />
            <StatCard label="Students" value={data.totalStudents} />
            <StatCard label="Ungraded submissions" value={data.totalUngraded} />
            <StatCard
              label="Licence expiry"
              value={data.licenceExpiry ? new Date(data.licenceExpiry).toLocaleDateString() : "—"}
            />
          </div>

          <div className="mt-8">
            <PortalSection title="Your courses">
              {data.courses.length === 0 ? (
                <p className="text-sm text-ink/50">No courses assigned yet.</p>
              ) : (
                <Table
                  columns={["Course", "Students", "Pending grading"]}
                  rows={data.courses.map((c) => [
                    c.title,
                    c.studentCount,
                    c.ungradedSubmissions > 0 ? <Badge tone="warn">{c.ungradedSubmissions}</Badge> : <Badge tone="ok">0</Badge>,
                  ])}
                />
              )}
            </PortalSection>
          </div>
        </>
      )}
    </PortalShell>
  );
}
