import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { LoadingState } from "../../components/portal/StateViews";

const links = [
  { to: "/employer/dashboard", label: "Dashboard" },
  { to: "/employer/postings", label: "Internship Postings" },
  { to: "/employer/placements", label: "Students on Placement" },
];

type Posting = {
  id: string;
  title: string;
  description: string;
  slots: number;
  status: string;
  skillsRequired: string[];
};

type Applicant = {
  id: string;
  status: string;
  coverNote: string | null;
  appliedAt: string;
  student: { fullName: string; studentNumber: string };
};

export default function EmployerPostings() {
  const userName = useCurrentUserName();
  const [postings, setPostings] = useState<Posting[] | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [slots, setSlots] = useState(1);
  const [skillsInput, setSkillsInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [openApplicantsFor, setOpenApplicantsFor] = useState<string | null>(null);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [decideMsg, setDecideMsg] = useState<string | null>(null);
  const [acceptFormFor, setAcceptFormFor] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [supervisorName, setSupervisorName] = useState("");

  function load() {
    apiFetch<Posting[]>("/employers/postings")
      .then(setPostings)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load postings."));
  }

  useEffect(load, []);

  function loadApplicants(postingId: string) {
    apiFetch<Applicant[]>(`/employers/postings/${postingId}/applications`)
      .then(setApplicants)
      .catch(() => setApplicants([]));
  }

  function toggleApplicants(postingId: string) {
    if (openApplicantsFor === postingId) {
      setOpenApplicantsFor(null);
      return;
    }
    setOpenApplicantsFor(postingId);
    setDecideMsg(null);
    loadApplicants(postingId);
  }

  async function decide(applicationId: string, status: "shortlisted" | "rejected") {
    setDecideMsg(null);
    try {
      await apiFetch(`/employers/applications/${applicationId}/decide`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setDecideMsg(`Marked as ${status}.`);
      if (openApplicantsFor) loadApplicants(openApplicantsFor);
    } catch (err) {
      setDecideMsg(err instanceof Error ? err.message : "Could not update application.");
    }
  }

  async function accept(applicationId: string) {
    setDecideMsg(null);
    if (!startDate || !endDate) {
      setDecideMsg("Provide a start and end date to accept — this creates the placement.");
      return;
    }
    try {
      await apiFetch(`/employers/applications/${applicationId}/decide`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "accepted",
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          supervisorName: supervisorName || undefined,
        }),
      });
      setDecideMsg("Accepted — placement created. See Students on Placement.");
      setAcceptFormFor(null);
      setStartDate("");
      setEndDate("");
      setSupervisorName("");
      if (openApplicantsFor) loadApplicants(openApplicantsFor);
    } catch (err) {
      setDecideMsg(err instanceof Error ? err.message : "Could not accept application.");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/employers/postings", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          slots,
          skillsRequired: skillsInput.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      setTitle("");
      setDescription("");
      setSlots(1);
      setSkillsInput("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create posting.");
    }
  }

  return (
    <PortalShell role="Employer portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Internship postings</h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <PortalSection title="Your postings">
          {error && <p className="text-sm text-navy-dark">{error}</p>}
          {!postings && !error && <LoadingState />}
          {postings && postings.length === 0 && <p className="text-sm text-ink/50">No postings yet.</p>}
          {postings && postings.length > 0 && (
            <ul className="divide-y divide-line">
              {postings.map((p) => (
                <li key={p.id} className="py-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{p.title}</p>
                    <Badge tone={p.status === "open" ? "ok" : "neutral"}>{p.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink/60">{p.description}</p>
                  <p className="mt-1 text-xs text-ink/40">{p.slots} slot(s)</p>
                  <button className="mt-2 text-xs text-navy underline" onClick={() => toggleApplicants(p.id)}>
                    {openApplicantsFor === p.id ? "Hide applicants" : "View applicants"}
                  </button>
                  {openApplicantsFor === p.id && (
                    <div className="mt-3 rounded border border-line bg-cream/40 p-3">
                      {decideMsg && <p className="mb-2 text-xs text-ink/60">{decideMsg}</p>}
                      {applicants.length === 0 && <p className="text-xs text-ink/50">No applications yet.</p>}
                      <ul className="space-y-3">
                        {applicants.map((a) => (
                          <li key={a.id} className="text-xs">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-ink/80">
                                  {a.student.fullName} <span className="text-ink/40">({a.student.studentNumber})</span>
                                </p>
                                {a.coverNote && <p className="mt-0.5 text-ink/50">{a.coverNote}</p>}
                                <p className="mt-0.5 text-ink/40">Applied {new Date(a.appliedAt).toLocaleDateString()}</p>
                              </div>
                              <Badge
                                tone={
                                  a.status === "accepted" ? "ok" : a.status === "rejected" ? "danger" : a.status === "shortlisted" ? "warn" : "neutral"
                                }
                              >
                                {a.status}
                              </Badge>
                            </div>
                            {a.status === "applied" || a.status === "shortlisted" ? (
                              <div className="mt-2 flex flex-wrap items-end gap-2">
                                {a.status === "applied" && (
                                  <button
                                    className="rounded border border-line px-2 py-1"
                                    onClick={() => decide(a.id, "shortlisted")}
                                  >
                                    Shortlist
                                  </button>
                                )}
                                <button
                                  className="rounded border border-line px-2 py-1"
                                  onClick={() => decide(a.id, "rejected")}
                                >
                                  Reject
                                </button>
                                <button
                                  className="rounded bg-navy px-2 py-1 text-white"
                                  onClick={() => setAcceptFormFor(acceptFormFor === a.id ? null : a.id)}
                                >
                                  {acceptFormFor === a.id ? "Cancel" : "Accept & place"}
                                </button>
                              </div>
                            ) : null}
                            {acceptFormFor === a.id && (
                              <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-line pt-2">
                                <label className="flex flex-col">
                                  <span className="text-ink/50">Start date</span>
                                  <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="rounded border border-line px-2 py-1"
                                  />
                                </label>
                                <label className="flex flex-col">
                                  <span className="text-ink/50">End date</span>
                                  <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="rounded border border-line px-2 py-1"
                                  />
                                </label>
                                <label className="flex flex-col">
                                  <span className="text-ink/50">Supervisor (optional)</span>
                                  <input
                                    value={supervisorName}
                                    onChange={(e) => setSupervisorName(e.target.value)}
                                    className="rounded border border-line px-2 py-1"
                                  />
                                </label>
                                <button
                                  className="rounded bg-navy px-3 py-1 text-white"
                                  onClick={() => accept(a.id)}
                                >
                                  Confirm placement
                                </button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </PortalSection>

        <PortalSection title="Post a new internship">
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Title</span>
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className="input mt-1.5" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Description</span>
              <textarea required rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="input mt-1.5" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Number of slots</span>
              <input
                required
                type="number"
                min={1}
                value={slots}
                onChange={(e) => setSlots(Number(e.target.value))}
                className="input mt-1.5"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Required skills (comma-separated)</span>
              <input
                value={skillsInput}
                onChange={(e) => setSkillsInput(e.target.value)}
                placeholder="e.g. bookkeeping, customer service"
                className="input mt-1.5"
              />
            </label>
            <button type="submit" className="btn-primary w-full justify-center">
              Post internship
            </button>
          </form>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
