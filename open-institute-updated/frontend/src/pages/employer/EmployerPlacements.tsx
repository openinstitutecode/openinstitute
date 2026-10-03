import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { LoadingState } from "../../components/portal/StateViews";

const links = [
  { to: "/employer/dashboard", label: "Dashboard" },
  { to: "/employer/postings", label: "Internship Postings" },
  { to: "/employer/placements", label: "Students on Placement" },
];

type Placement = {
  id: string;
  student: { fullName: string; studentNumber: string };
  startDate: string;
  endDate: string;
  status: string;
  logbookEntries: { weekNumber: number; supervisorSignOff: boolean }[];
};

export default function EmployerPlacements() {
  const userName = useCurrentUserName();
  const [placements, setPlacements] = useState<Placement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Placement[]>("/employers/placements")
      .then(setPlacements)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load placements."));
  }, []);

  return (
    <PortalShell role="Employer portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Students on placement</h1>

      <div className="mt-8">
        <PortalSection title="Current & past placements">
          {error && <p className="text-sm text-navy-dark">{error}</p>}
          {!placements && !error && <LoadingState />}
          {placements && placements.length === 0 && (
            <p className="text-sm text-ink/50">No students placed with you yet.</p>
          )}
          {placements && placements.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink/50">
                    <th className="pb-3 pr-4 font-medium">Student</th>
                    <th className="pb-3 pr-4 font-medium">Duration</th>
                    <th className="pb-3 pr-4 font-medium">Logbook</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {placements.map((p) => (
                    <tr key={p.id}>
                      <td className="py-3 pr-4">
                        {p.student.fullName}
                        <br />
                        <span className="text-xs text-ink/45">{p.student.studentNumber}</span>
                      </td>
                      <td className="py-3 pr-4 text-ink/60">
                        {new Date(p.startDate).toLocaleDateString()} – {new Date(p.endDate).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-4">
                        {p.logbookEntries.filter((l) => l.supervisorSignOff).length} / {p.logbookEntries.length} signed off
                      </td>
                      <td className="py-3">
                        <Badge tone={p.status === "active" ? "ok" : "neutral"}>{p.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PortalSection>
      </div>
    </PortalShell>
  );
}
