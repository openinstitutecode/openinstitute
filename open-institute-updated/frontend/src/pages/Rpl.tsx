import { FormEvent, useState } from "react";
import { programmes } from "../lib/programmes";

export default function Rpl() {
  const [applicantName, setApplicantName] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");
  const [programmeSlug, setProgrammeSlug] = useState(programmes[0].slug);
  const [experienceSummary, setExperienceSummary] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/rpl/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicantName, applicantEmail, programmeSlug, experienceSummary }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Could not submit.");
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (submitted) {
    return (
      <div className="container-page flex min-h-[50vh] flex-col items-start justify-center py-20">
        <h1 className="font-display text-3xl">Thank you.</h1>
        <p className="mt-4 max-w-prose text-ink/70">
          We'll be in touch to request a portfolio of evidence for your
          experience. RPL credit is always decided by a named assessor —
          never automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="container-page py-20">
      <p className="eyebrow">Recognition of Prior Learning</p>
      <h1 className="mt-4 max-w-[22ch] font-display text-4xl font-medium sm:text-5xl">
        Already have the experience? Get it recognized.
      </h1>
      <p className="mt-4 max-w-prose text-ink/70">
        If you've been working in a field for years, you may not need to
        start a programme from scratch. Tell us about your experience and
        we'll guide you through building a portfolio of evidence.
      </p>

      <form onSubmit={handleSubmit} className="mt-12 max-w-xl space-y-5 border-t border-line pt-12">
        <label className="block">
          <span className="text-sm font-medium text-ink/80">Full name</span>
          <input required value={applicantName} onChange={(e) => setApplicantName(e.target.value)} className="input mt-1.5" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink/80">Email</span>
          <input required type="email" value={applicantEmail} onChange={(e) => setApplicantEmail(e.target.value)} className="input mt-1.5" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink/80">Programme you're seeking credit toward</span>
          <select value={programmeSlug} onChange={(e) => setProgrammeSlug(e.target.value)} className="input mt-1.5">
            {programmes.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink/80">Describe your relevant experience</span>
          <textarea required rows={5} value={experienceSummary} onChange={(e) => setExperienceSummary(e.target.value)} className="input mt-1.5" />
        </label>
        {error && <p className="text-sm text-navy-dark">{error}</p>}
        <button type="submit" className="btn-primary">Submit RPL application</button>
      </form>
    </div>
  );
}
