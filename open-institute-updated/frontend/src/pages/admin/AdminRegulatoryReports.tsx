import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { LoadingState } from "../../components/portal/StateViews";

const links = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/registry", label: "Registry Actions" },
  { to: "/admin/statistics", label: "Academic Statistics" },
  { to: "/admin/qualifications", label: "Qualification Register" },
  { to: "/admin/kuccps", label: "KUCCPS Exchange" },
  { to: "/admin/regulatory-reports", label: "Regulatory Reports" },
  { to: "/admin/governance", label: "Governance" },
  { to: "/admin/compliance", label: "Compliance & QA" },
];

type Batch = {
  id: string;
  regulator: string;
  reportType: string;
  recordCount: number;
  createdAt: string;
  generatedBy: { email: string };
};

// RG036 — Government reporting beyond KUCCPS (which has its own dedicated
// exchange page at /admin/kuccps). Each button below downloads a CSV in
// the shape that regulator would expect, and logs the batch for audit.
function downloadReport(path: string, filename: string, onError: (msg: string) => void, onDone: () => void) {
  const token = localStorage.getItem("kvbdtc_token");
  fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } })
    .then(async (res) => {
      if (!res.ok) throw new Error((await res.json()).message ?? "Report generation failed.");
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      onDone();
    })
    .catch((err) => onError(err instanceof Error ? err.message : "Report generation failed."));
}

export default function AdminRegulatoryReports() {
  const userName = useCurrentUserName();
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    apiFetch<Batch[]>("/regulatory-reports/batches")
      .then(setBatches)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load report history."));
  }
  useEffect(load, []);

  function run(path: string, filename: string) {
    setBusy(path);
    setError(null);
    downloadReport(
      path,
      filename,
      (msg) => {
        setError(msg);
        setBusy(null);
      },
      () => {
        setBusy(null);
        load();
      }
    );
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Regulatory reports</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Data returns for regulators other than KUCCPS (which has its own exchange page).
        Every report here is built only from data this system actually collects — see{" "}
        <span className="italic">docs/regulatory-notes.md</span> for which requirements
        still need written confirmation from each regulator before any of this is presented
        as proof of compliance.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <PortalSection title="TVETA — trainer credentials return">
          <p className="text-sm text-ink/60">
            Every trainer's TVETA licence number, expiry, and qualifications — with any
            missing or expired licence flagged automatically.
          </p>
          <button
            onClick={() => run("/regulatory-reports/tveta/trainer-credentials", "tveta-trainer-credentials.csv")}
            disabled={busy === "/regulatory-reports/tveta/trainer-credentials"}
            className="btn-primary mt-3 disabled:opacity-50"
          >
            {busy === "/regulatory-reports/tveta/trainer-credentials" ? "Generating…" : "Download CSV"}
          </button>
        </PortalSection>

        <PortalSection title="TVETA — programme & enrolment return">
          <p className="text-sm text-ink/60">
            One row per accredited programme: qualification level, awarding body, delivery
            mode, and current headcount.
          </p>
          <button
            onClick={() => run("/regulatory-reports/tveta/programme-enrolment", "tveta-programme-enrolment.csv")}
            disabled={busy === "/regulatory-reports/tveta/programme-enrolment"}
            className="btn-primary mt-3 disabled:opacity-50"
          >
            {busy === "/regulatory-reports/tveta/programme-enrolment" ? "Generating…" : "Download CSV"}
          </button>
        </PortalSection>

        <PortalSection title="KNQA — qualification outcomes return">
          <p className="text-sm text-ink/60">
            One row per accredited programme: qualification level against real graduated
            and active counts — the national-framework question, not just headcount.
          </p>
          <button
            onClick={() => run("/regulatory-reports/knqa/qualification-outcomes", "knqa-qualification-outcomes.csv")}
            disabled={busy === "/regulatory-reports/knqa/qualification-outcomes"}
            className="btn-primary mt-3 disabled:opacity-50"
          >
            {busy === "/regulatory-reports/knqa/qualification-outcomes" ? "Generating…" : "Download CSV"}
          </button>
        </PortalSection>
      </div>

      <div className="mt-8">
        <PortalSection title="Report history">
          {!batches && !error && <LoadingState />}
          {batches && batches.length === 0 && <p className="text-sm text-ink/50">No reports generated yet.</p>}
          <ul className="divide-y divide-line">
            {batches?.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p>
                    <Badge tone="neutral">{b.regulator}</Badge>{" "}
                    <span className="ml-2">{b.reportType.replace(/_/g, " ")}</span>
                  </p>
                  <p className="mt-1 text-xs text-ink/45">
                    {b.recordCount} record(s) · by {b.generatedBy.email} ·{" "}
                    {new Date(b.createdAt).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
