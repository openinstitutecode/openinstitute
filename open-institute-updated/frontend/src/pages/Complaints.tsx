import { FormEvent, useState } from "react";

export default function Complaints() {
  const [category, setCategory] = useState("academic");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, description, email }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Could not submit.");
      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error ? `${err.message} (Is the backend running at /api?)` : "Something went wrong."
      );
    }
  }

  if (submitted) {
    return (
      <div className="container-page flex min-h-[50vh] flex-col items-start justify-center py-20">
        <h1 className="font-display text-3xl">Thank you.</h1>
        <p className="mt-4 max-w-prose text-ink/70">
          Your complaint has been logged and routed to the right office. If
          you gave an email, we'll follow up there.
        </p>
      </div>
    );
  }

  return (
    <div className="container-page py-20">
      <p className="eyebrow">Complaints &amp; appeals</p>
      <h1 className="mt-4 max-w-[22ch] font-display text-4xl font-medium sm:text-5xl">
        Something not right? Tell us.
      </h1>
      <p className="mt-4 max-w-prose text-ink/70">
        This goes straight to the relevant office — academic issues to the
        Registrar, financial to Finance, conduct concerns to Student Affairs.
        You don't need to be logged in to use this form.
      </p>

      <form onSubmit={handleSubmit} className="mt-12 max-w-xl space-y-5 border-t border-line pt-12">
        <label className="block">
          <span className="text-sm font-medium text-ink/80">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input mt-1.5">
            <option value="academic">Academic (grades, trainer conduct, course content)</option>
            <option value="financial">Financial (fees, payments, refunds)</option>
            <option value="conduct">Student conduct / welfare</option>
            <option value="platform">Platform / technical issue</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink/80">Describe what happened</span>
          <textarea
            required
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input mt-1.5"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink/80">Your email (optional, for follow-up)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input mt-1.5" />
        </label>

        {error && <p className="text-sm text-navy-dark">{error}</p>}

        <button type="submit" className="btn-primary">
          Submit complaint
        </button>
      </form>
    </div>
  );
}
