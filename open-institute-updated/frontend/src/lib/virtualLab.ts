import { apiFetch } from "./api";

// Opens the Virtual Business Lab in a new tab, signed in via a short-lived portal-issued
// assertion (no second password). Returns an error message, or null on success.
export async function launchVirtualLab(): Promise<string | null> {
  try {
    const { assertion, labUrl } = await apiFetch<{ assertion: string; labUrl: string | null }>("/integration/v1/sso/assertion", { method: "POST" });
    if (!labUrl) return "The Virtual Business Lab address is not configured yet. Ask an administrator.";
    window.open(`${labUrl.replace(/\/$/, "")}/lab?assertion=${encodeURIComponent(assertion)}`, "_blank", "noopener");
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Could not open the Virtual Business Lab.";
  }
}

export type LabResult = {
  id: string;
  outcome: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "REVERSED";
  competencyCode: string | null;
  feedback: string | null;
  decidedAt: string;
  reviewNote: string | null;
  reversalReason: string | null;
  supersedesResultId: string | null;
  postedAt: string | null;
  evidenceContentHash: string | null;
  criteria?: { code: string; name?: string; met: boolean; comment?: string }[] | null; // Batch 66 — VBI027
  unit: { code: string; title: string };
  student?: { fullName: string; studentNumber: string };
};

export const statusTone = (s: LabResult["status"]): "ok" | "warn" | "danger" | "neutral" =>
  s === "APPROVED" ? "ok" : s === "PENDING_APPROVAL" ? "warn" : s === "REJECTED" || s === "REVERSED" ? "danger" : "neutral";
export const statusLabel = (s: LabResult["status"]) => ({ PENDING_APPROVAL: "Awaiting trainer", APPROVED: "Approved", REJECTED: "Rejected", REVERSED: "Reversed" })[s];

// Batch 66 — VBI036: one row of the synchronized Lab activity feed.
export type LabActivity = {
  id: string;
  activityType: string;
  summary: string | null;
  occurredAt: string;
  unit: { code: string; title: string } | null;
};
