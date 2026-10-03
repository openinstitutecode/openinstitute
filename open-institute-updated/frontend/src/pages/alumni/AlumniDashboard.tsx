import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";

const links = [
  { to: "/alumni/dashboard", label: "Dashboard" },
  { to: "/alumni/network", label: "Alumni Network" },
  { to: "/alumni/opportunities", label: "Opportunities" },
];

export default function AlumniDashboard() {
  return (
    <PortalShell role="Alumni portal" links={links} userName="Grace Nyambura">
      <h1 className="font-display text-2xl">Welcome back</h1>
      <p className="mt-1 text-sm text-ink/60">
        Diploma in Business Management · Graduated July 2025
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Your credentials">
          <div className="flex items-center justify-between text-sm">
            <span>Diploma in Business Management</span>
            <Badge tone="ok">Certificate issued</Badge>
          </div>
          <button className="btn-secondary mt-4">Download certificate</button>
        </PortalSection>

        <PortalSection title="Stay involved">
          <ul className="space-y-3 text-sm text-ink/70">
            <li>Mentor a current student in your field.</li>
            <li>Share a job or internship opening with the college.</li>
            <li>Update your employment status for our tracer study.</li>
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
