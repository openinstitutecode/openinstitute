import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";

const links = [
  { to: "/student/dashboard", label: "Dashboard" },
  { to: "/student/profile", label: "My Profile" },
  { to: "/student/id-card", label: "Digital ID" },
  { to: "/student/roadmap", label: "Programme Roadmap" },
  { to: "/student/courses", label: "My Courses" },
  { to: "/student/assignments", label: "Assignment Centre" },
  { to: "/student/exams", label: "Assessment Centre" },
  { to: "/student/alerts", label: "Academic Alerts" },
  { to: "/student/notebook", label: "Knowledge Notebook" },
  { to: "/student/portfolio", label: "Digital Portfolio" },
  { to: "/student/advisor", label: "AI Study Advisor" },
  { to: "/student/letters", label: "Official Letters" },
  { to: "/student/receipts", label: "Payment Receipts" },
  { to: "/student/research", label: "Research Workspace" },
  { to: "/student/messages", label: "Messages & Office Hours" },
  { to: "/student/forums", label: "Discussion Forums" },
  { to: "/student/timetable", label: "Timetable" },
  { to: "/student/attendance", label: "Attendance" },
  { to: "/student/achievements", label: "Achievements" },
  { to: "/student/library", label: "Digital Library" },
  { to: "/student/tutor", label: "AI Tutor" },
  { to: "/student/career", label: "Career Services" },
  { to: "/student/job-matches", label: "Job Matches" },
  { to: "/student/simulation", label: "Business Simulation Lab" },
  { to: "/student/virtual-lab", label: "Virtual Business Lab" },
  { to: "/student/viva", label: "AI Viva Practice" },
  { to: "/student/passport", label: "Competency Passport" },
  { to: "/student/grades", label: "Grades & Transcript" },
  { to: "/student/appeals", label: "Appeals" },
  { to: "/student/fees", label: "Fees" },
  { to: "/student/attachment", label: "Industrial Attachment" },
  { to: "/student/graduation", label: "Graduation Status" },
  { to: "/student/wellbeing", label: "Counselling & Support" },
  { to: "/student/events", label: "Clubs & Events" },
  { to: "/student/support", label: "Support" },
  { to: "/student/accessibility", label: "Accessibility Settings" },
  { to: "/student/credit-transfer", label: "Credit Transfer" },
  { to: "/student/tutor-sessions", label: "Tutor Session History" },
];

type RoadmapUnit = { unitId: string; code: string; title: string; semester: number; status: string; grade: string | null };
type PathStep = { unitId: string; code: string; title: string; order: number; isOptional: boolean; status: string };
type LearningPath = { id: string; title: string; description: string | null; steps: PathStep[] };

const statusTone: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  completed: "ok",
  in_progress: "warn",
  failed: "danger",
  withdrawn: "neutral",
  not_started: "neutral",
};

export default function StudentRoadmap() {
  const userName = useCurrentUserName();
  const [roadmap, setRoadmap] = useState<RoadmapUnit[] | null>(null);
  const [paths, setPaths] = useState<LearningPath[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<RoadmapUnit[]>("/me/roadmap")
      .then(setRoadmap)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your roadmap."));
    apiFetch<LearningPath[]>("/learning-paths/mine").then(setPaths).catch(() => setPaths(null));
  }, []);

  const bySemester = roadmap?.reduce<Record<number, RoadmapUnit[]>>((acc, u) => {
    (acc[u.semester] ??= []).push(u);
    return acc;
  }, {});

  const completedCount = roadmap?.filter((u) => u.status === "completed").length ?? 0;
  const totalCount = roadmap?.length ?? 0;

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">Programme roadmap</h1>
        {roadmap && <p className="font-mono text-sm text-navy">{completedCount}/{totalCount} completed</p>}
      </div>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {/* LMS021 — a coordinator-recommended order through the programme,
          distinct from the hard prerequisite gate enforced at registration. */}
      {paths && paths.length > 0 && (
        <div className="mt-6 space-y-4">
          {paths.map((p) => {
            const done = p.steps.filter((s) => s.status === "completed").length;
            return (
              <PortalSection key={p.id} title={`Recommended path: ${p.title}`}>
                {p.description && <p className="mb-2 text-sm text-ink/60">{p.description}</p>}
                <p className="mb-2 text-xs text-ink/50">{done} of {p.steps.length} completed</p>
                <ol className="space-y-1">
                  {p.steps.map((s) => (
                    <li key={s.unitId} className="flex items-center justify-between py-1 text-sm">
                      <span><span className="font-mono text-xs text-ink/40">{s.order}.</span> {s.code} — {s.title}{s.isOptional ? " (optional)" : ""}</span>
                      <Badge tone={statusTone[s.status] ?? "neutral"}>{s.status.replace("_", " ")}</Badge>
                    </li>
                  ))}
                </ol>
              </PortalSection>
            );
          })}
        </div>
      )}

      <div className="mt-8 space-y-6">
        {bySemester &&
          Object.entries(bySemester)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([semester, units]) => (
              <PortalSection key={semester} title={`Semester ${semester}`}>
                <ul className="divide-y divide-line">
                  {units.map((u) => (
                    <li key={u.unitId} className="flex items-center justify-between py-3 text-sm">
                      <span>
                        <span className="font-mono text-xs text-ink/40">{u.code}</span> {u.title}
                      </span>
                      <div className="flex items-center gap-3">
                        {u.grade && <span className="text-xs text-ink/50">{u.grade}</span>}
                        <Badge tone={statusTone[u.status] ?? "neutral"}>{u.status.replace("_", " ")}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              </PortalSection>
            ))}
      </div>
    </PortalShell>
  );
}
