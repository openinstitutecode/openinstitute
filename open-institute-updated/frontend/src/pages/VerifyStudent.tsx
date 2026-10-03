import { FormEvent, useState } from "react";
import { Logo } from "../components/Logo";

type Result = { valid: boolean; studentNumber?: string; programme?: string; academicStatus?: string; message?: string };

export default function VerifyStudent() {
  const [studentNumber, setStudentNumber] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/credentials/verify-student/${encodeURIComponent(studentNumber)}`);
      setResult(await res.json());
    } catch {
      setResult({ valid: false, message: "Could not reach the verification service." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container-page flex min-h-[70vh] flex-col items-center justify-center py-20">
      <div className="w-full max-w-lg">
        <div className="mb-5 flex justify-center"><Logo className="h-20 w-auto" /></div>
        <p className="eyebrow text-center">Student status verification</p>
        <h1 className="mt-3 text-center font-display text-3xl font-medium">
          Verify a current or past student
        </h1>
        <p className="mt-3 text-center text-sm text-ink/60">
          Returns enrollment status and programme only — no contact details or grades.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex gap-3">
          <input
            value={studentNumber}
            onChange={(e) => setStudentNumber(e.target.value)}
            placeholder="Student number, e.g. KVB/2025/0142"
            className="input"
          />
          <button type="submit" disabled={loading} className="btn-primary shrink-0">
            {loading ? "Checking…" : "Verify"}
          </button>
        </form>

        {result && (
          <div className="mt-8 border border-line p-6">
            {result.valid ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-ink/50">Student number</dt><dd>{result.studentNumber}</dd></div>
                <div className="flex justify-between"><dt className="text-ink/50">Programme</dt><dd>{result.programme}</dd></div>
                <div className="flex justify-between"><dt className="text-ink/50">Status</dt><dd>{result.academicStatus}</dd></div>
              </dl>
            ) : (
              <p className="text-sm text-navy-dark">{result.message ?? "No student found."}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
