import { FormEvent, useState } from "react";
import { useParams } from "react-router-dom";
import { Logo } from "../components/Logo";

type VerifyResult = {
  valid: boolean;
  revoked?: boolean;
  revokedReason?: string;
  documentId?: string;
  type?: string;
  studentName?: string;
  programme?: string;
  issuedAt?: string;
  message?: string;
};

export default function Verify() {
  const { documentId: routeId } = useParams();
  const [documentId, setDocumentId] = useState(routeId ?? "");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function check(id: string) {
    if (!id.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/credentials/verify/${encodeURIComponent(id)}`);
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ valid: false, message: "Could not reach the verification service." });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    check(documentId);
  }

  return (
    <div className="container-page flex min-h-[70vh] flex-col items-center justify-center py-20">
      <div className="w-full max-w-lg">
        <div className="mb-5 flex justify-center"><Logo className="h-20 w-auto" /></div>
        <p className="eyebrow text-center">Credential verification</p>
        <h1 className="mt-3 text-center font-display text-3xl font-medium">
          Verify a transcript or certificate
        </h1>

        <form onSubmit={handleSubmit} className="mt-8 flex gap-3">
          <input
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            placeholder="e.g. TRX-4F9A21"
            className="input"
          />
          <button type="submit" disabled={loading} className="btn-primary shrink-0">
            {loading ? "Checking…" : "Verify"}
          </button>
        </form>

        {result && (
          <div className="mt-8 border border-line p-6">
            {result.valid ? (
              <>
                <p className={`font-mono text-xs uppercase tracking-wide ${result.revoked ? "text-navy-dark" : "text-forest"}`}>
                  {result.revoked ? "Revoked document" : "Valid document"}
                </p>
                {result.revoked && result.revokedReason && (
                  <p className="mt-2 text-sm text-navy-dark">Reason: {result.revokedReason}</p>
                )}
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-ink/50">Document ID</dt>
                    <dd>{result.documentId}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink/50">Type</dt>
                    <dd className="capitalize">{result.type}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink/50">Name</dt>
                    <dd>{result.studentName}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink/50">Programme</dt>
                    <dd>{result.programme}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink/50">Issued</dt>
                    <dd>{result.issuedAt && new Date(result.issuedAt).toLocaleDateString()}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="text-sm text-navy-dark">
                {result.message ?? "No document found with that ID."}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
