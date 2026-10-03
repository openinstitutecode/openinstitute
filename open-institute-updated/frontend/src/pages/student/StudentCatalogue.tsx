import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";

const links = [
  { to: "/student/dashboard", label: "Dashboard" },
  { to: "/student/courses", label: "My Courses" },
  { to: "/student/content-library", label: "Content Library" },
  { to: "/student/catalogue", label: "Course Catalogue" },
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
    unit: { code: string; title: string };
    trainer: { fullName: string } | null;
  };
};

// LMS001 — a real browsable catalogue, reading the CourseCatalogueEntry
// metadata a trainer sets (see the panel added to TrainerLessonBuilder /
// AdminCourses). The backend route (GET /courses/catalogue/browse) already
// existed with no frontend consuming it — this page was the actual gap.
export default function StudentCatalogue() {
  const userName = useCurrentUserName();
  const [entries, setEntries] = useState<CatalogueEntry[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<CatalogueEntry[]>("/courses/catalogue/browse")
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the catalogue."));
  }, []);

  const titleByCourseId = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entries ?? []) map.set(e.courseId, e.course.title);
    return map;
  }, [entries]);

  const filtered = entries?.filter((e) => {
    if (!e.isVisible) return false;
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return (
      e.course.title.toLowerCase().includes(needle) ||
      e.course.unit.code.toLowerCase().includes(needle) ||
      e.course.unit.title.toLowerCase().includes(needle) ||
      e.keywords.some((k) => k.toLowerCase().includes(needle))
    );
  });

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Course catalogue</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Every course a trainer has listed for browsing — not just the ones you're already registered for.
      </p>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by course, unit code, title or keyword…" className="input mt-4 max-w-md" />
      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}
      {!entries && !error && <p className="mt-6 text-sm text-ink/50">Loading the catalogue…</p>}
      {entries && filtered && filtered.length === 0 && <p className="mt-6 text-sm text-ink/50">{q ? `Nothing matches "${q}".` : "No courses are listed in the catalogue yet."}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {filtered?.map((e) => (
          <PortalSection key={e.id} title={e.course.title}>
            <p className="text-xs text-ink/50">{e.shortCode ?? e.course.unit.code} · {e.course.unit.title}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {e.level && <Badge tone="neutral">{e.level}</Badge>}
              {e.credits != null && <Badge tone="neutral">{e.credits} credits</Badge>}
            </div>
            {e.course.trainer && <p className="mt-2 text-xs text-ink/50">Trainer: {e.course.trainer.fullName}</p>}
            {e.keywords.length > 0 && <p className="mt-2 text-xs text-ink/45">{e.keywords.join(" · ")}</p>}
            {e.prerequisites.length > 0 && (
              <p className="mt-2 text-xs text-ink/50">
                Recommended before: {e.prerequisites.map((id) => titleByCourseId.get(id) ?? id).join(", ")}
              </p>
            )}
          </PortalSection>
        ))}
      </div>
    </PortalShell>
  );
}
