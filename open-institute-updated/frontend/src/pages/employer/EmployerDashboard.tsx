import PortalShell from "../../components/portal/PortalShell";
import { StatCard, PortalSection, Table, Badge } from "../../components/portal/Primitives";
import { useCurrentUserName } from "../../lib/api";

const links = [
  { to: "/employer/dashboard", label: "Dashboard" },
  { to: "/employer/postings", label: "Internship Postings" },
  { to: "/employer/placements", label: "Students on Placement" },
];

export default function EmployerDashboard() {
  const userName = useCurrentUserName();
  return (
    <PortalShell role="Employer portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Overview</h1>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Open postings" value={2} />
        <StatCard label="Students on placement" value={3} />
        <StatCard label="Evaluations due" value={1} />
      </div>

      <div className="mt-8">
        <PortalSection title="Students currently placed with you">
          <Table
            columns={["Student", "Programme", "Started", "Ends", "Status"]}
            rows={[
              ["Faith Chebet", "Diploma in Accounting & Finance", "1 Aug 2026", "30 Sep 2026", <Badge tone="ok">Active</Badge>],
              ["Brian Kimutai", "Diploma in Business Management", "1 Aug 2026", "30 Sep 2026", <Badge tone="ok">Active</Badge>],
            ]}
          />
        </PortalSection>
      </div>
    </PortalShell>
  );
}
