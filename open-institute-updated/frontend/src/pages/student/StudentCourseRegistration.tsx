import { FormEvent, useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";

const links = [
  { to: "/student/dashboard", label: "Dashboard" },
  { to: "/student/courses", label: "My Courses" },
  { to: "/student/content-library", label: "Content Library" },
  { to: "/student/course-registration", label: "Course / Unit Registration" },
  { to: "/student/roadmap", label: "Programme Roadmap" },
];

type CatalogueEntry = {
  id: string;
  courseId: string;
  isVisible: boolean;
  shortCode: string | null;
  credits: number | null;
  level: string | null;
  prerequisites: string[];
  keywords: string[];
  course: {
    id: string;
    title: string;
    unit: { id: string; code: string; title: string };
    trainer: { fullName: string } | null;
  };
};

type TermRegistration = {
  term: {
    id: string;
    label: string;
    programmeName: string;
    startDate: string;
    endDate: string;
    registrationClose: string;
    termWeeks: number;
    minimumCredits: number;
    maxCredits: number;
    creditRate: number;
    adminFee: number;
    industrialFee: number;
  } | null;
  courses: Array<{
    courseId: string;
    unitId: string;
    credits: number;
    alreadyRegistered: boolean;
  }>;
  standaloneUnits: Array<{
    unitId: string;
    title: string;
    code: string;
    credits: number;
    prerequisiteUnitIds: string[];
    alreadyRegistered: boolean;
  }>;
  enrolled: Array<{ unitId: string; courseId: string | null; title: string; code: string; credits: number }>;
  currentCredits: number;
  canRegister: boolean;
  blockReason: string | null;
  invoice: { id: string; semester: string; amountDue: string; amountPaid: string; status: string } | null;
};

export default function StudentCatalogue() {
  const userName = useCurrentUserName();
  const [entries, setEntries] = useState<CatalogueEntry[] | null>(null);
  const [registration, setRegistration] = useState<TermRegistration | null>(null);
  const [q, setQ] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadRegistration() {
    const result = await apiFetch<TermRegistration>("/me/term-registration");
    setRegistration(result);
  }

  useEffect(() => {
    apiFetch<CatalogueEntry[]>("/courses/catalogue/browse")
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the catalogue."));
    loadRegistration().catch((err) => setError(err instanceof Error ? err.message : "Could not load term registration."));
  }, []);

  const titleByCourseId = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of entries ?? []) map.set(entry.courseId, entry.course.title);
    return map;
  }, [entries]);

  const filtered = entries?.filter((entry) => {
    if (!entry.isVisible) return false;
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return (
      entry.course.title.toLowerCase().includes(needle) ||
      entry.course.unit.code.toLowerCase().includes(needle) ||
      entry.course.unit.title.toLowerCase().includes(needle) ||
      entry.keywords.some((keyword) => keyword.toLowerCase().includes(needle))
    );
  });
  const registrationCourseById = new Map((registration?.courses ?? []).map((course) => [course.courseId, course]));
  const selectedCourses = (registration?.courses ?? []).filter((course) => selectedKeys.includes(`course:${course.courseId}`));
  const selectedUnits = (registration?.standaloneUnits ?? []).filter((unit) => selectedKeys.includes(`unit:${unit.unitId}`));
  const selectedCredits = selectedCourses.reduce((sum, course) => sum + course.credits, 0) +
    selectedUnits.reduce((sum, unit) => sum + unit.credits, 0);
  const projectedCredits = (registration?.currentCredits ?? 0) + selectedCredits;
  const projectedFee = registration?.term && projectedCredits > 0
    ? projectedCredits * registration.term.creditRate + registration.term.adminFee + registration.term.industrialFee
    : 0;

  function toggleSelection(key: string) {
    setSelectedKeys((current) => current.includes(key)
      ? current.filter((id) => id !== key)
      : [...current, key]);
  }

  async function submitRegistration(event: FormEvent) {
    event.preventDefault();
    if (!registration?.term || selectedKeys.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const selections = [
        ...selectedCourses.map((course) => ({ unitId: course.unitId, courseId: course.courseId })),
        ...selectedUnits.map((unit) => ({ unitId: unit.unitId })),
      ];
      const result = await apiFetch<{
        invoice: { id: string; semester: string; amountDue: string };
        feeBreakdown: { credits: number; tuition: number; adminFee: number; industrialFee: number; total: number };
      }>("/me/register-units", {
        method: "POST",
        body: JSON.stringify({ termConfigId: registration.term.id, selections }),
      });
      setNotice(`Registered for ${result.feeBreakdown.credits} credits. Invoice ${result.invoice.semester}: KES ${Number(result.invoice.amountDue).toLocaleString()}.`);
      setSelectedKeys([]);
      await loadRegistration();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete registration.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Course and unit registration</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Select courses or standalone units from your programme and register for a complete term workload. Term registration requires at least 8 credits and automatically invoices tuition, the KES 1,000 term fee, and any separate industrial fee.
      </p>

      {registration?.term && (
        <PortalSection title={`${registration.term.label} · ${registration.term.programmeName}`}>
          <p className="text-sm text-ink/65">
            8-week term: {new Date(registration.term.startDate).toLocaleDateString()} – {new Date(registration.term.endDate).toLocaleDateString()} · {registration.currentCredits} credits registered · maximum {registration.term.maxCredits}
          </p>
          <p className="mt-1 text-sm text-ink/65">
            KES {registration.term.creditRate} per credit · KES {registration.term.adminFee.toLocaleString()} term fee · KES {registration.term.industrialFee.toLocaleString()} industrial fee
          </p>
          {registration.blockReason && <p className="mt-3 text-sm text-navy-dark">{registration.blockReason}</p>}
          {registration.invoice && (
            <p className="mt-2 text-sm">
              Current term invoice: KES {Number(registration.invoice.amountDue).toLocaleString()} due, KES {Number(registration.invoice.amountPaid).toLocaleString()} paid ·{" "}
              <a className="font-medium text-forest underline" href="/student/fees">View fees and pay</a>
            </p>
          )}
          {registration.enrolled.length > 0 && (
            <p className="mt-2 text-xs text-ink/55">Registered: {registration.enrolled.map((unit) => `${unit.code} (${unit.credits} credits)`).join(", ")}</p>
          )}
        </PortalSection>
      )}
      {registration && !registration.term && <p className="mt-4 text-sm text-ink/55">Your programme does not have an active term. Contact the registrar.</p>}

      {error && <p role="alert" className="mt-4 text-sm text-navy-dark">{error}</p>}
      {notice && <p role="status" className="mt-4 text-sm text-forest">{notice} <a className="underline" href="/student/fees">View invoice</a></p>}
      <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search by course, unit code, title or keyword…" className="input mt-4 max-w-md" />
      {!entries && !error && <p className="mt-6 text-sm text-ink/50">Loading the catalogue…</p>}
      {entries && filtered && filtered.length === 0 && <p className="mt-6 text-sm text-ink/50">{q ? `Nothing matches "${q}".` : "No courses are listed in the catalogue yet."}</p>}

      <form onSubmit={submitRegistration}>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {filtered?.map((entry) => {
            const termCourse = registrationCourseById.get(entry.courseId);
            const alreadyRegistered = termCourse?.alreadyRegistered ?? false;
            const credits = termCourse?.credits ?? entry.credits ?? 0;
            return (
              <PortalSection key={entry.id} title={entry.course.title}>
                <p className="text-xs text-ink/50">{entry.shortCode ?? entry.course.unit.code} · {entry.course.unit.title}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {entry.level && <Badge tone="neutral">{entry.level}</Badge>}
                  <Badge tone="neutral">{credits} credits</Badge>
                  {alreadyRegistered && <Badge tone="ok">Registered</Badge>}
                </div>
                {entry.course.trainer && <p className="mt-2 text-xs text-ink/50">Trainer: {entry.course.trainer.fullName}</p>}
                {entry.keywords.length > 0 && <p className="mt-2 text-xs text-ink/45">{entry.keywords.join(" · ")}</p>}
                {entry.prerequisites.length > 0 && (
                  <p className="mt-2 text-xs text-ink/50">
                    Recommended before: {entry.prerequisites.map((id) => titleByCourseId.get(id) ?? id).join(", ")}
                  </p>
                )}
                {termCourse && !alreadyRegistered && (
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedKeys.includes(`course:${termCourse.courseId}`)}
                      disabled={!registration?.canRegister || selectedCourses.some((course) => course.unitId === termCourse.unitId && course.courseId !== termCourse.courseId)}
                      onChange={() => toggleSelection(`course:${termCourse.courseId}`)}
                    />
                    Add to term registration
                  </label>
                )}
              </PortalSection>
            );
          })}
        </div>

        {(registration?.standaloneUnits.length ?? 0) > 0 && (
          <PortalSection title="Standalone programme units">
            <ul className="divide-y divide-line">
              {registration?.standaloneUnits.map((unit) => (
                <li key={unit.unitId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="text-sm"><strong>{unit.code}</strong> · {unit.title} · {unit.credits} credits</span>
                  {unit.alreadyRegistered
                    ? <Badge tone="ok">Registered</Badge>
                    : <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={selectedKeys.includes(`unit:${unit.unitId}`)} disabled={!registration?.canRegister} onChange={() => toggleSelection(`unit:${unit.unitId}`)} />
                        Add to term registration
                      </label>}
                </li>
              ))}
            </ul>
          </PortalSection>
        )}

        {registration?.term && (
          <PortalSection title="Registration fee estimate">
            <p className="text-sm">Credits after registration: {projectedCredits} / {registration.term.maxCredits} (minimum {registration.term.minimumCredits})</p>
            <p className="mt-1 text-sm">Estimated term invoice: <strong>KES {projectedFee.toLocaleString()}</strong></p>
            <p className="mt-1 text-xs text-ink/50">
              Includes KES {(projectedCredits * registration.term.creditRate).toLocaleString()} tuition, KES {registration.term.adminFee.toLocaleString()} term administration, and KES {registration.term.industrialFee.toLocaleString()} industrial fees.
            </p>
            <button type="submit" disabled={busy || !registration.canRegister || selectedKeys.length === 0} className="btn-primary mt-4 disabled:opacity-50">
              {busy ? "Registering…" : "Register selected courses and create invoice"}
            </button>
          </PortalSection>
        )}
      </form>
    </PortalShell>
  );
}
