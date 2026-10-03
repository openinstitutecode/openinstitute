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

type AdmissionDocumentCategory = "id_document" | "certificate" | "portrait_photo";

const admissionDocuments: Array<{
  category: AdmissionDocumentCategory;
  title: string;
  description: string;
  accept: string;
  sizeLimit: string;
  buttonLabel: string;
}> = [
  {
    category: "id_document",
    title: "National ID",
    description: "Upload the front of your national ID as a PNG or PDF.",
    accept: "image/png,application/pdf",
    sizeLimit: "10 MB",
    buttonLabel: "Upload National ID",
  },
  {
    category: "certificate",
    title: "KCSE certificate",
    description: "Upload your KCSE certificate or equivalent qualification as a PNG or PDF.",
    accept: "image/png,application/pdf",
    sizeLimit: "10 MB",
    buttonLabel: "Upload KCSE certificate",
  },
  {
    category: "portrait_photo",
    title: "Passport photo",
    description: "Upload a clear PNG or JPEG portrait. It will appear on your digital student ID.",
    accept: "image/png,image/jpeg",
    sizeLimit: "5 MB",
    buttonLabel: "Upload passport photo",
  },
];

function DocumentUpload({ refNumber, email }: { refNumber: string; email: string }) {
  const [uploaded, setUploaded] = useState<Partial<Record<AdmissionDocumentCategory, string>>>({});

  return (
    <section className="mt-10 w-full max-w-3xl border-t border-line pt-8">
      <h2 className="font-display text-xl">Submit your documents</h2>
      <p className="mt-2 text-sm text-ink/60">
        Each item has its own upload button. Files are sent to private storage and linked to your application.
        You may also submit an existing document link instead.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {admissionDocuments.map((document) => (
          <AdmissionDocumentUpload
            key={document.category}
            document={document}
            refNumber={refNumber}
            email={email}
            uploadedName={uploaded[document.category]}
            onUploaded={(name) => setUploaded((current) => ({ ...current, [document.category]: name }))}
          />
        ))}
      </div>
    </section>
  );
}

function AdmissionDocumentUpload({
  document,
  refNumber,
  email,
  uploadedName,
  onUploaded,
}: {
  document: (typeof admissionDocuments)[number];
  refNumber: string;
  email: string;
  uploadedName?: string;
  onUploaded: (name: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    setUploadError(null);
    setUploading(true);
    try {
      const response = file
        ? await fetch(`/api/applications/${refNumber}/files?email=${encodeURIComponent(email)}&category=${document.category}`, {
            method: "POST",
            headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) },
            body: file,
          })
        : await fetch(`/api/applications/${refNumber}/documents`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, category: document.category, fileUrl }),
          });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? `Could not submit the ${document.title.toLowerCase()}.`);
      }
      const result = await response.json();
      onUploaded(file?.name ?? result.fileUrl);
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
    <form onSubmit={handleUpload} className="flex flex-col gap-3 border border-line p-4">
      <div>
        <h3 className="font-medium text-navy">{document.title}</h3>
        <p className="mt-1 text-xs text-ink/60">{document.description}</p>
      </div>
      <Field label="Choose a file">
        <input
          ref={fileInput}
          type="file"
          required={!fileUrl}
          accept={document.accept}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="input text-xs"
        />
        <span className="mt-1 block text-xs text-ink/50">Maximum {document.sizeLimit}.</span>
      </Field>
      <Field label="Or paste an existing link">
        <input
          type="url"
          value={fileUrl}
          onChange={(e) => setFileUrl(e.target.value)}
          required={!file}
          className="input text-sm"
          placeholder="https://..."
        />
      </Field>
      {uploadError && <p role="alert" className="text-xs text-red-700">{uploadError}</p>}
      {uploadedName && (
        <p className="text-xs text-forest">
          Submitted: {uploadedName.startsWith("https://") || uploadedName.startsWith("http://") ? "document link" : uploadedName}
          {" · "}awaiting verification
        </p>
      )}
      <button type="submit" disabled={uploading} className="btn-primary mt-auto disabled:opacity-60">
        {uploading ? "Uploading…" : document.buttonLabel}
      </button>
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
