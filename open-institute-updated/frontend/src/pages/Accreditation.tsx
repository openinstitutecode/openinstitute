const rows = [
  { req: "TVETA institutional registration", status: "Pending" },
  { req: "TVETA ODeL delivery approval", status: "Pending" },
  { req: "Programme accreditation (per programme)", status: "Pending" },
  { req: "KUCCPS listing", status: "Pending" },
  { req: "KUCCPS placement eligibility", status: "Not applicable yet" },
  { req: "Data Protection (ODPC) registration", status: "Pending" },
];

export default function Accreditation() {
  return (
    <div className="container-page py-20">
      <p className="eyebrow">Accreditation &amp; compliance</p>
      <h1 className="mt-4 max-w-[24ch] font-display text-4xl font-medium sm:text-5xl">
        Our accreditation status, as it actually stands
      </h1>
      <p className="mt-6 max-w-prose text-ink/70">
        We publish this table honestly rather than implying accreditation
        before it exists. Each row will link to the underlying regulator
        document the moment it's issued.
      </p>

      <div className="mt-14 overflow-hidden border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy text-paper">
            <tr>
              <th className="px-5 py-3 font-medium">Requirement</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.req}>
                <td className="px-5 py-4">{r.req}</td>
                <td className="px-5 py-4">
                  <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-gold-dark">
                    <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-8 max-w-prose text-xs text-ink/50">
        Questions about our regulatory status can be sent to
        compliance@kvbdtc.ac.ke. We will never describe a programme as
        accredited before TVETA has confirmed it in writing.
      </p>
    </div>
  );
}
