import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, apiFetchBlob, ApiError, useCurrentUserName } from "../../lib/api";
import { LoadingState } from "../../components/portal/StateViews";

const links = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/command-centre", label: "Command Centre" },
  { to: "/admin/admissions", label: "Admissions" },
  { to: "/admin/students", label: "Students" },
  { to: "/admin/staff", label: "Staff Management" },
  { to: "/admin/academic-calendar", label: "Academic Calendar" },
  { to: "/admin/timetable-admin", label: "Timetable Management" },
  { to: "/admin/communication", label: "Communication Centre" },
  { to: "/admin/permission-audit", label: "Permission Audit" },
  { to: "/admin/security", label: "Security Centre" },
  { to: "/admin/reports", label: "Report Builder" },
  { to: "/admin/admin-assistant", label: "AI Admin Assistant" },
  { to: "/admin/ai-governance", label: "AI Governance Centre" },
  { to: "/admin/registry", label: "Registry Actions" },
  { to: "/admin/statistics", label: "Academic Statistics" },
  { to: "/admin/qualifications", label: "Qualification Register" },
  { to: "/admin/exams", label: "Examinations" },
  { to: "/admin/results-approval", label: "Results Approval" },
  { to: "/admin/curriculum", label: "Curriculum" },
  { to: "/admin/library", label: "Digital Library" },
  { to: "/admin/library-admin", label: "Library Administration" },
  { to: "/admin/finance", label: "Finance" },
  { to: "/admin/ledger", label: "General Ledger" },
  { to: "/admin/receivable-payable", label: "AR / AP" },
  { to: "/admin/installments", label: "Installment Plans" },
  { to: "/admin/budgets", label: "Budgets" },
  { to: "/admin/inventory", label: "Inventory" },
  { to: "/admin/financial-planning", label: "Financial Planning" },
  { to: "/admin/fee-structure", label: "Fee Structure" },
  { to: "/admin/procurement", label: "Procurement & Assets" },
  { to: "/admin/compliance", label: "Compliance & QA" },
  { to: "/admin/qa-governance", label: "QA Governance" },
  { to: "/admin/course-evaluations", label: "Course & Trainer Evaluations" },
  { to: "/admin/internal-audits", label: "Internal Audits" },
  { to: "/admin/corrective-actions", label: "Corrective Actions" },
  { to: "/admin/complaints", label: "Complaints" },
  { to: "/admin/governance", label: "Governance" },
  { to: "/admin/integrity", label: "Academic Integrity" },
  { to: "/admin/appeals", label: "Appeals" },
  { to: "/admin/rpl", label: "RPL Applications" },
  { to: "/admin/graduation", label: "Graduation Audit" },
  { to: "/admin/kuccps", label: "KUCCPS Exchange" },
  { to: "/admin/users", label: "Users & RBAC" },
  { to: "/admin/audit-log", label: "Audit Log" },
  { to: "/admin/operations", label: "Operations & Data Governance" },
  { to: "/admin/departments", label: "Departments & Tasks" },
  { to: "/admin/research", label: "Research & Innovation" },
  { to: "/admin/trainers", label: "Trainers & HR" },
  { to: "/admin/support-tickets", label: "Support Tickets" },
  { to: "/admin/documents", label: "Document Management" },
  { to: "/admin/data-export", label: "Data Export" },
  { to: "/admin/data-import", label: "Data Import" },
  { to: "/admin/integrations", label: "Integration Centre" },
  { to: "/admin/role-permissions", label: "Role Permissions" },
  { to: "/admin/semesters", label: "Semester Management" },
  { to: "/admin/programme-accreditation", label: "Programme Accreditation" },
  { to: "/admin/credit-transfer", label: "Credit Transfer" },
  { to: "/admin/exam-security", label: "Exam Security" },
  { to: "/admin/similarity-checking", label: "Similarity Checking" },
  { to: "/admin/knowledge-base", label: "Knowledge Base" },
  { to: "/admin/notifications", label: "Notifications" },
  { to: "/admin/workflows", label: "Workflow Engine" },
  { to: "/admin/institutional-analytics", label: "Institutional Analytics" },
  { to: "/admin/decision-centre", label: "Executive Decision Centre" },
];

type ApplicationDocument = {
  id: string;
  category: string;
  fileUrl: string;
  mimeType: string | null;
  originalName: string | null;
  verified: boolean;
  verifiedAt: string | null;
  uploadedAt: string;
  admittedStudentNumber?: string;
};

type Application = {
  id: string;
  refNumber: string;
  fullName: string;
  email: string;
  programme: { name: string };
  status: string;
  createdAt: string;
  documents: ApplicationDocument[];
};

export default function AdminAdmissions() {
  const userName = useCurrentUserName();
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; mimeType: string; title: string; isObjectUrl: boolean } | null>(null);

  useEffect(() => () => {
    if (preview?.isObjectUrl) URL.revokeObjectURL(preview.url);
  }, [preview]);

  useEffect(() => {
    apiFetch<Application[]>("/applications")
      .then(setApplications)
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load applications — is the backend running and are you signed in as staff?"
        )
      );
  }, []);

  async function decide(id: string, status: "ADMITTED" | "REJECTED" | "WAITLISTED") {
    try {
      await apiFetch(`/applications/${id}/decision`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setApplications((apps) =>
        apps ? apps.map((a) => (a.id === id ? { ...a, status } : a)) : apps
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save decision.");
    }
  }

  // RG002 — an admissions officer actually checking a submitted document
  // against the application, not just trusting whatever was uploaded.
  async function verifyDocument(applicationId: string, docId: string, verified: boolean) {
    try {
      const updated = await apiFetch<ApplicationDocument>(
        `/applications/${applicationId}/documents/${docId}/verify`,
        { method: "PATCH", body: JSON.stringify({ verified }) }
      );
      setApplications((apps) =>
        apps
          ? apps.map((a) =>
              a.id === applicationId
                ? {
                    ...a,
                    status: updated.admittedStudentNumber ? "ADMITTED" : a.status,
                    documents: a.documents.map((d) => (d.id === docId ? updated : d)),
                  }
                : a
            )
          : apps
      );
      if (updated.admittedStudentNumber) {
        setError(`All required documents are verified. Student ${updated.admittedStudentNumber} has been admitted and activated.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update document verification.");
    }

  }

  async function openDocument(document: ApplicationDocument) {
    try {
      if (document.fileUrl.startsWith("/api/")) {
        const result = await apiFetchBlob(document.fileUrl.replace(/^\/api/, ""));
        setPreview({
          url: URL.createObjectURL(result.blob),
          mimeType: result.blob.type || document.mimeType || "",
          title: result.filename ?? document.originalName ?? documentCategoryName(document.category),
          isObjectUrl: true,
        });
      } else {
        window.open(document.fileUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the document.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Admissions review</h1>

      <div className="mt-8">
        <PortalSection title="Pending applications">
          {error && <p className="mb-4 text-sm text-navy-dark">{error}</p>}
          {!applications && !error && <LoadingState />}
          {applications && applications.length === 0 && (
            <p className="text-sm text-ink/50">No applications yet.</p>
          )}
          {applications && applications.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink/50">
                    <th className="pb-3 pr-4 font-medium">Ref</th>
                    <th className="pb-3 pr-4 font-medium">Applicant</th>
                    <th className="pb-3 pr-4 font-medium">Programme</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 font-medium">Documents to review</th>
                    <th className="pb-3 font-medium">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {applications.map((a) => {
                    const unverifiedCount = a.documents.filter((d) => !d.verified).length;
                    return (
                    <tr key={a.id}>
                      <td className="py-3 pr-4 font-mono text-xs align-top">{a.refNumber}</td>
                      <td className="py-3 pr-4 align-top">
                        {a.fullName}
                        <br />
                        <span className="text-xs text-ink/45">{a.email}</span>
                      </td>
                      <td className="py-3 pr-4 align-top">{a.programme.name}</td>
                      <td className="py-3 pr-4 align-top">
                        <Badge tone={a.status === "ADMITTED" ? "ok" : a.status === "REJECTED" ? "danger" : "neutral"}>
                          {a.status}
                        </Badge>
                      </td>
                      <td className="min-w-64 py-3 pr-4 align-top">
                        {a.documents.length > 0 ? (
                          <div className="space-y-2">
                            {a.documents.map((d) => (
                              <div key={d.id} className="border border-line p-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">{documentCategoryName(d.category)}</span>
                                  <Badge tone={d.verified ? "ok" : "warn"}>{d.verified ? "Verified" : "Needs review"}</Badge>
                                </div>
                                <p className="mt-1 truncate text-xs text-ink/50" title={d.originalName ?? undefined}>
                                  {d.originalName ?? (d.fileUrl.startsWith("/api/") ? "Uploaded file" : "External document link")}
                                </p>
                                <div className="mt-2 flex gap-3 text-xs">
                                  <button onClick={() => openDocument(d)} className="font-medium text-navy underline">
                                    {d.fileUrl.startsWith("/api/") ? "Preview document" : "Open link"}
                                  </button>
                                  <button
                                    onClick={() => verifyDocument(a.id, d.id, !d.verified)}
                                    className="font-medium text-navy hover:underline"
                                  >
                                    {d.verified ? "Mark unverified" : "Verify document"}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-ink/40">No documents submitted yet.</p>
                        )}
                      </td>
                      <td className="py-3 align-top">
                        {a.status === "SUBMITTED" || a.status === "UNDER_REVIEW" ? (
                          <div className="flex flex-col items-start gap-2">
                            <div className="flex gap-2">
                              <button
                                onClick={() => decide(a.id, "ADMITTED")}
                                title={unverifiedCount > 0 ? "Some submitted documents are still unverified" : undefined}
                                className="text-xs font-medium text-forest hover:underline"
                              >
                                Admit
                              </button>
                              <button onClick={() => decide(a.id, "WAITLISTED")} className="text-xs font-medium text-gold-dark hover:underline">
                                Waitlist
                              </button>
                              <button onClick={() => decide(a.id, "REJECTED")} className="text-xs font-medium text-red-700 hover:underline">
                                Reject
                              </button>
                            </div>
                            {unverifiedCount > 0 && (
                              <span className="text-[11px] text-gold-dark">
                                {unverifiedCount} document(s) unverified — admitting will be rejected until verified
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-ink/40">Decided</span>
                        )}
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          )}
        </PortalSection>
      </div>
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Document preview: ${preview.title}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) setPreview(null);
          }}
        >
          <section className="flex max-h-[92vh] w-full max-w-5xl flex-col bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 className="truncate font-medium">{preview.title}</h2>
              <button onClick={() => setPreview(null)} className="btn-secondary shrink-0">Close preview</button>
            </div>
            {preview.mimeType.startsWith("image/") ? (
              <img src={preview.url} alt={preview.title} className="max-h-[78vh] w-full object-contain" />
            ) : preview.mimeType === "application/pdf" ? (
              <iframe src={preview.url} title={preview.title} className="h-[78vh] w-full border border-line" />
            ) : (
              <a href={preview.url} download={preview.title} className="text-navy underline">Download document</a>
            )}
          </section>
        </div>
      )}
    </PortalShell>
  );
}

function documentCategoryName(category: string) {
  if (category === "id_document") return "National ID";
  if (category === "certificate") return "KCSE certificate";
  if (category === "portrait_photo") return "Passport photo";
  return category.replace(/_/g, " ");
}
