import { FormEvent, useRef, useState } from "react";
import { newIdempotencyKey } from "../lib/api";
import { programmes } from "../lib/programmes";

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  programmeSlug: string;
  studyMode: string;
  kcseIndex: string;
  kcseGrade: string;
};

const initialState: FormState = {
  fullName: "",
  email: "",
  phone: "",
  programmeSlug: programmes[0].slug,
  studyMode: "online",
  kcseIndex: "",
  kcseGrade: "",
};

export default function Admissions() {
  const [form, setForm] = useState<FormState>(initialState);
  const submitKey = useRef(newIdempotencyKey()); // renewed whenever the form changes, so only an unchanged retry replays
  const [submitted, setSubmitted] = useState<null | { refNumber: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    submitKey.current = newIdempotencyKey();
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": submitKey.current }, // Batch 71 — retry-safe submit
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Could not submit application.");
      }
      const data = await res.json();
      setSubmitted({ refNumber: data.refNumber });
    } catch (err) {
      // The backend may not be running in this environment — degrade gracefully.
      setError(
        err instanceof Error
          ? `${err.message} (Is the backend running at /api?)`
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="container-page flex min-h-[60vh] flex-col items-start justify-center py-20">
        <p className="eyebrow">Application received</p>
        <h1 className="mt-4 font-display text-4xl font-medium">
          Thank you — you're in the queue.
        </h1>
        <p className="mt-4 max-w-prose text-ink/70">
          Your reference number is{" "}
          <span className="font-mono text-navy">{submitted.refNumber}</span>.
          We'll email you once admissions has reviewed your documents.
        </p>
        <DocumentUpload refNumber={submitted.refNumber} email={form.email} />
      </div>
    );
  }

  return (
    <div className="container-page py-20">
      <p className="eyebrow">Admissions</p>
      <h1 className="mt-4 max-w-[22ch] font-display text-4xl font-medium sm:text-5xl">
        Apply in about fifteen minutes
      </h1>
      <p className="mt-4 max-w-prose text-ink/70">
        You'll need your KCSE index number (or prior certificate details) and
        a scanned copy of your ID. Fees can be paid after you receive an
        admission letter.
      </p>

      <form onSubmit={handleSubmit} className="mt-14 max-w-2xl space-y-10 border-t border-line pt-14">
        <fieldset className="space-y-5">
          <legend className="font-display text-xl">Your details</legend>

          <Field label="Full name" required>
            <input
              required
              value={form.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              className="input"
              placeholder="As on your national ID"
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Email" required>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className="input"
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Phone (M-Pesa number)" required>
              <input
                required
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                className="input"
                placeholder="07XX XXX XXX"
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-5">
          <legend className="font-display text-xl">Programme choice</legend>

          <Field label="Programme" required>
            <select
              value={form.programmeSlug}
              onChange={(e) => update("programmeSlug", e.target.value)}
              className="input"
            >
              {programmes.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Study mode">
            <select
              value={form.studyMode}
              onChange={(e) => update("studyMode", e.target.value)}
              className="input"
            >
              <option value="online">Fully online (self-paced + live sessions)</option>
              <option value="online-scheduled">Fully online (fixed schedule)</option>
            </select>
          </Field>
        </fieldset>

        <fieldset className="space-y-5">
          <legend className="font-display text-xl">Prior qualification</legend>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="KCSE index number">
              <input
                value={form.kcseIndex}
                onChange={(e) => update("kcseIndex", e.target.value)}
                className="input"
                placeholder="e.g. 12345678001"
              />
            </Field>
            <Field label="KCSE mean grade">
              <input
                value={form.kcseGrade}
                onChange={(e) => update("kcseGrade", e.target.value)}
                className="input"
                placeholder="e.g. C+"
              />
            </Field>
          </div>
          <p className="text-xs text-ink/50">
            No KCSE certificate? You can apply under recognition of prior
            learning — select this after creating your account.
          </p>
        </fieldset>

        {error && (
          <p role="alert" className="border border-gold-dark bg-gold/10 p-4 text-sm text-navy-dark">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary disabled:opacity-60">
          {loading ? "Submitting…" : "Submit application"}
        </button>
      </form>
    </div>
  );
}

// RG002 — the applicant has no account yet (one is only created on
// admission), so document upload happens right here against the
// reference number + the email they applied with, which admissions staff
// then verify. Actual file storage is out of scope for this build; this
// records a reference the same way the authenticated document routes do.
function DocumentUpload({ refNumber, email }: { refNumber: string; email: string }) {
  const [category, setCategory] = useState<"id_document" | "certificate">("id_document");
  const [fileUrl, setFileUrl] = useState("");
  const [uploaded, setUploaded] = useState<{ category: string }[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    setUploadError(null);
    setUploading(true);
    try {
      const res = await fetch(`/api/applications/${refNumber}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, category, fileUrl }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Could not submit that document.");
      }
      const data = await res.json();
      setUploaded((docs) => [...docs, { category: data.category }]);
      setFileUrl("");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleUpload} className="mt-10 max-w-xl space-y-4 border-t border-line pt-8">
      <p className="font-display text-lg">Submit your documents</p>
      <p className="text-sm text-ink/60">
        A link to your ID and your KCSE certificate (or equivalent), so
        admissions can verify them.
      </p>
      <Field label="Document type" required>
        <select value={category} onChange={(e) => setCategory(e.target.value as "id_document" | "certificate")} className="input">
          <option value="id_document">National ID</option>
          <option value="certificate">KCSE certificate / prior qualification</option>
        </select>
      </Field>
      <Field label="Link to the scanned document" required>
        <input
          required
          type="url"
          value={fileUrl}
          onChange={(e) => setFileUrl(e.target.value)}
          className="input"
          placeholder="https://drive.google.com/..."
        />
      </Field>
      {uploadError && <p className="text-sm text-navy-dark">{uploadError}</p>}
      <button type="submit" disabled={uploading} className="btn-primary disabled:opacity-60">
        {uploading ? "Submitting…" : "Submit document"}
      </button>
      {uploaded.length > 0 && (
        <ul className="text-xs text-ink/55">
          {uploaded.map((d, i) => (
            <li key={i}>Submitted: {d.category}</li>
          ))}
        </ul>
      )}
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink/80">
        {label} {required && <span className="text-navy">*</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
