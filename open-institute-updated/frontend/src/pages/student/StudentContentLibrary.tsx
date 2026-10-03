import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";

const links = [
  { to: "/student/dashboard", label: "Dashboard" },
  { to: "/student/courses", label: "My Courses" },
  { to: "/student/content-library", label: "Content Library" },
  { to: "/student/catalogue", label: "Course Catalogue" },
];

type LibraryLesson = {
  id: string;
  title: string;
  contentType: string;
  durationMins: number | null;
  tags: string[];
  offlineAvailable: boolean;
  courseId: string;
  courseTitle: string;
};

// LMS007 — a searchable index across every lesson the student's own
// enrolments give them access to (GET /content/library), distinct from the
// external federated digital library at /student/library (LMS031).
export default function StudentContentLibrary() {
  const userName = useCurrentUserName();
  const [lessons, setLessons] = useState<LibraryLesson[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const handle = setTimeout(() => {
      apiFetch<LibraryLesson[]>(`/content/library${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`)
        .then(setLessons)
        .catch((err) => setError(err instanceof Error ? err.message : "Could not load the content library."))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [q]);

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Content library</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Every published lesson across the courses you're enrolled in, searchable by topic — not just the ones open in your current module.
      </p>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, tag or outcome…" className="input mt-4 max-w-md" />
      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}
      {loading && <p className="mt-4 text-xs text-ink/40">Searching…</p>}
      {lessons && lessons.length === 0 && <p className="mt-6 text-sm text-ink/50">No lessons match that search.</p>}

      <div className="mt-6 space-y-2">
        {lessons?.map((l) => (
          <PortalSection key={l.id} title={l.title}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink/60">
              <span>{l.courseTitle}</span>
              <span className="font-mono">{l.contentType}</span>
              {l.durationMins && <span>{l.durationMins} min</span>}
              {l.offlineAvailable && <Badge tone="ok">Offline-ready</Badge>}
            </div>
            {l.tags.length > 0 && <p className="mt-2 text-xs text-ink/45">{l.tags.join(" · ")}</p>}
            <a href="/student/courses" className="mt-2 inline-block text-xs text-navy underline decoration-dotted">Open in My Courses ↗</a>
          </PortalSection>
        ))}
      </div>
    </PortalShell>
  );
}
