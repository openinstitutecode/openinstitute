import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { QrCode } from "../components/portal/QrCode";
import { COLLEGE_NAME, LOGO_SRC } from "../components/Logo";

// Printable official transcript. Shows exactly what the registrar issued and signed (not today's live grades),
// re-checks the signature on every load, and prints/saves-as-PDF cleanly on A4 with the college letterhead.
// Standalone page (no portal sidebar) so the same screen works for a student and for registry staff.

type TranscriptDoc = {
  documentId: string;
  issuedAt: string;
  revoked: boolean;
  revokedReason?: string | null;
  verificationUrl: string;
  signatureValid: boolean;
  qualificationLevel: string;
  payload: {
    studentNumber: string;
    fullName: string;
    programme: string;
    units: { code: string; title: string; grade: string | null; semester: string }[];
  };
};

export default function TranscriptView() {
  const { documentId = "" } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<TranscriptDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<TranscriptDoc>(`/credentials/transcripts/doc/${encodeURIComponent(documentId)}`)
      .then(setDoc)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load this transcript."));
  }, [documentId]);

  // The browser uses the page title as the default file name when saving as PDF.
  useEffect(() => {
    if (!doc) return;
    const previous = document.title;
    document.title = `Transcript ${doc.payload.studentNumber} - ${COLLEGE_NAME}`;
    return () => { document.title = previous; };
  }, [doc]);

  const bySemester = useMemo(() => {
    const groups = new Map<string, TranscriptDoc["payload"]["units"]>();
    for (const u of doc?.payload.units ?? []) groups.set(u.semester, [...(groups.get(u.semester) ?? []), u]);
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [doc]);

  const graded = doc?.payload.units.filter((u) => u.grade).length ?? 0;
  const total = doc?.payload.units.length ?? 0;

  return (
    <div className="transcript-page">
      <div className="transcript-toolbar print:hidden">
        <button className="btn-secondary" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}>← Back</button>
        {doc && <button className="btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>}
      </div>

      {error && (
        <div className="transcript-notice print:hidden">
          <p>{error}</p>
          <Link to="/" className="underline">Return to the portal</Link>
        </div>
      )}
      {!doc && !error && <p className="transcript-notice print:hidden">Loading transcript…</p>}

      {doc && (
        <article className="transcript-sheet">
          {doc.revoked && (
            <p className="transcript-alert">
              REVOKED — this transcript is no longer valid{doc.revokedReason ? `: ${doc.revokedReason}` : "."}
            </p>
          )}
          {!doc.signatureValid && (
            <p className="transcript-alert">
              Signature check failed — this copy does not match the registrar's signed record. Do not rely on it.
            </p>
          )}

          <header className="transcript-head">
            <img src={LOGO_SRC} alt={`${COLLEGE_NAME} logo`} />
            <div>
              <h1>{COLLEGE_NAME}</h1>
              <p>Official Academic Transcript</p>
            </div>
          </header>

          <section className="transcript-meta">
            <div><span>Student name</span><strong>{doc.payload.fullName}</strong></div>
            <div><span>Student number</span><strong>{doc.payload.studentNumber}</strong></div>
            <div><span>Programme</span><strong>{doc.payload.programme}</strong></div>
            <div><span>Qualification level</span><strong>{doc.qualificationLevel}</strong></div>
            <div><span>Date issued</span><strong>{new Date(doc.issuedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</strong></div>
            <div><span>Document ID</span><strong className="mono">{doc.documentId}</strong></div>
          </section>

          {total === 0 && <p className="transcript-empty">No units were recorded when this transcript was issued.</p>}

          {bySemester.map(([semester, units]) => (
            <section key={semester} className="transcript-block">
              <h2>{semester}</h2>
              <table>
                <thead>
                  <tr><th>Code</th><th>Unit title</th><th className="right">Grade</th></tr>
                </thead>
                <tbody>
                  {units.map((u) => (
                    <tr key={`${semester}-${u.code}`}>
                      <td className="mono">{u.code}</td>
                      <td>{u.title}</td>
                      <td className="right">{u.grade ?? <span className="muted">In progress</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}

          {total > 0 && <p className="transcript-summary">{graded} of {total} unit{total === 1 ? "" : "s"} graded at the date of issue.</p>}
          <p className="transcript-key muted">
            Grading key: A 70–100 · B 60–69 · C 50–59 · D 40–49 · E below 40 (pass mark 40%).
          </p>

          <footer className="transcript-foot">
            <QrCode data={doc.verificationUrl} size={96} alt="Scan to verify this transcript" />
            <p>
              Digitally signed and issued by the {COLLEGE_NAME} Registry. Anyone can confirm this document is genuine and
              still valid by scanning the code or visiting <span className="mono">{doc.verificationUrl}</span>. A copy that
              the online record does not show as valid is not an official transcript.
            </p>
          </footer>
        </article>
      )}
    </div>
  );
}
