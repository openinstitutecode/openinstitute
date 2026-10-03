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
  password: string;
};

const initialState: FormState = {
  fullName: "",
  email: "",
  phone: "",
  programmeSlug: programmes[0].slug,
  studyMode: "online",
  kcseIndex: "",
  kcseGrade: "",
  password: "",
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
      setForm((current) => ({ ...current, password: "" }));
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
          Keep this number for your records. Admissions will review your uploaded documents before your account is activated.
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
          <Field label="Temporary password" required>
            <input required type="password" minLength={10} autoComplete="new-password" value={form.password} onChange={(e) => update("password", e.target.value)} className="input" />
            <span className="mt-1 block text-xs text-ink/50">This is stored securely and will not work until admissions approves your application. You must change it at first sign-in.</span>
          </Field>
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

function DocumentUpload({ refNumber, email }: { refNumber: string; email: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<"id_document" | "certificate" | "portrait_photo">("id_document");
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [uploaded, setUploaded] = useState<{ category: string }[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    setUploadError(null);
    setUploading(true);
    try {
      const res = file
        ? await fetch(`/api/applications/${refNumber}/files?email=${encodeURIComponent(email)}&category=${category}`, {
            method: "POST",
            headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) },
            body: file,
          })
        : await fetch(`/api/applications/${refNumber}/documents`, {
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
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
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
        Upload a national ID, your KCSE certificate (or equivalent), and a passport photo for your digital student ID. PNG and PDF documents are accepted; portrait photos must be PNG or JPEG.
      </p>
      <Field label="Document type" required>
        <select value={category} onChange={(e) => { setCategory(e.target.value as "id_document" | "certificate" | "portrait_photo"); setFile(null); }} className="input">
          <option value="id_document">National ID</option>
          <option value="certificate">KCSE certificate / prior qualification</option>
          <option value="portrait_photo">Passport photo (required for digital ID)</option>
        </select>
      </Field>
      <Field label={category === "portrait_photo" ? "Choose a passport photo" : "Choose a PNG or PDF document"}>
        <input
          ref={fileInput}
          type="file"
          required={!file && !fileUrl}
          accept={category === "portrait_photo" ? "image/png,image/jpeg" : "image/png,application/pdf"}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="input"
        />
        <span className="mt-1 block text-xs text-ink/50">Maximum file size: {category === "portrait_photo" ? "5 MB" : "10 MB"}.</span>
      </Field>
      <p className="text-xs text-ink/50">Or, if your document is already hosted, provide a document link instead:</p>
      <Field label="Existing document link">
        <input
          type="url"
          value={fileUrl}
          onChange={(e) => setFileUrl(e.target.value)}
          required={!file}
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
