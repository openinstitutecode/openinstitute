import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName, ApiError } from "../../lib/api";
import LessonView from "../../components/LessonView";
import ScormPlayer from "../../components/ScormPlayer";
import StudentLessonTools from "../../components/lesson/StudentLessonTools";
import { LessonBlock, MediaInfo } from "../../lib/lessonTypes";
import { useLessonEngagement, emitLessonCompleted } from "../../lib/lesson-engagement";
import { downloadCourseForOffline, queueProgressAction, syncQueuedProgress, pendingSyncCount } from "../../lib/offline-sync";
import { LowBandwidthProvider } from "../../lib/lowBandwidth";
import { LoadingState } from "../../components/portal/StateViews";

const links = [
  { to: "/student/dashboard", label: "Dashboard" },
  { to: "/student/profile", label: "My Profile" },
  { to: "/student/id-card", label: "Digital ID" },
  { to: "/student/roadmap", label: "Programme Roadmap" },
  { to: "/student/courses", label: "My Courses" },
  { to: "/student/content-library", label: "Content Library" },
  { to: "/student/catalogue", label: "Course Catalogue" },
  { to: "/student/learning-analytics", label: "My Learning Analytics" },
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

type CourseListItem = { courseId: string; title: string; unitTitle: string; trainerName: string };
type Lesson = {
  id: string;
  title: string;
  order: number;
  contentType: string;
  contentUrl: string | null;
  contentBody: string | null;
  durationMins: number | null;
  completed?: boolean;
  blocks?: LessonBlock[] | null;
  media?: MediaInfo | null;
  mediaMap?: Record<string, MediaInfo>;
};
type Module = { id: string; title: string; order: number; lessons: Lesson[]; completedCount?: number; totalCount?: number };
type MoodleLiveClass = { id: number; name: string; url?: string };
type LiveClassSession = {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  status: "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";
  description?: string | null;
  recordingUrl?: string | null;
};
type CourseProgress = { totalLessons: number; completedLessons: number; percent: number };
type CourseDetail = {
  id: string;
  title: string;
  description: string | null;
  modules: Module[];
  trainer: { fullName: string } | null;
  lmsEngine?: "CUSTOM" | "MOODLE";
  moodle?: { liveClasses: MoodleLiveClass[]; error?: string };
  progress?: CourseProgress | null;
  liveClasses?: LiveClassSession[];
};

export default function StudentCourses() {
  const userName = useCurrentUserName();
  const [courses, setCourses] = useState<CourseListItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [openModule, setOpenModule] = useState(0);
  const [offlineStatus, setOfflineStatus] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState(0);
  const [completion, setCompletion] = useState<{ completed: boolean; lessonPercent: number; minLessonPercent: number } | null>(null);

  useEffect(() => {
    pendingSyncCount().then(setPendingSync).catch(() => undefined);
  }, [detail]);

  useEffect(() => {
    if (!selectedId) { setCompletion(null); return; }
    apiFetch<{ completed: boolean; lessonPercent: number; minLessonPercent: number }>(`/content/courses/${selectedId}/completion`)
      .then(setCompletion)
      .catch(() => setCompletion(null));
  }, [selectedId, detail]);

  async function handleDownloadOffline() {
    if (!selectedId) return;
    setOfflineStatus("Downloading…");
    try {
      const count = await downloadCourseForOffline(selectedId);
      setOfflineStatus(count > 0 ? `${count} lesson(s) saved for offline reading.` : "The trainer hasn't marked any lessons as available offline yet.");
    } catch {
      setOfflineStatus("Couldn't download this course for offline use.");
    }
  }
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  async function launchMoodle() {
    if (!selectedId) return;
    setLaunching(true);
    setError(null);
    try {
      const { launchUrl } = await apiFetch<{ launchUrl: string }>(`/courses/${selectedId}/moodle-launch`, {
        method: "POST",
      });
      window.open(launchUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start your Moodle session.");
    } finally {
      setLaunching(false);
    }
  }

  useEffect(() => {
    apiFetch<CourseListItem[]>("/me/courses")
      .then((list) => {
        setCourses(list);
        if (list.length > 0) setSelectedId(list[0].courseId);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your courses."));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    apiFetch<CourseDetail>(`/courses/${selectedId}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load course content."));
  }, [selectedId]);

  // SP017 — mark a lesson complete/incomplete, then refresh the course so
  // module/course percentages recompute from the real backend data rather
  // than being faked locally.
  async function toggleLessonComplete(lesson: Lesson) {
    if (!selectedId) return;
    const action: "complete" | "incomplete" = lesson.completed ? "incomplete" : "complete";
    try {
      if (lesson.completed) {
        await apiFetch(`/content/lessons/${lesson.id}/complete`, { method: "DELETE" });
      } else {
        await apiFetch(`/content/lessons/${lesson.id}/complete`, { method: "POST" });
        emitLessonCompleted(lesson.id);
      }
      const refreshed = await apiFetch<CourseDetail>(`/courses/${selectedId}`);
      setDetail(refreshed);
    } catch (err) {
      // LMS024/027 — offline: a network failure (not a real 4xx/5xx from the
      // server) queues the action locally instead of just showing an error,
      // so a student without connectivity can keep marking lessons complete.
      if (!(err instanceof ApiError)) {
        await queueProgressAction(lesson.id, action).catch(() => undefined);
        setError("You're offline — this will sync once you're back online.");
        return;
      }
      setError(err.message);
    }
  }

  // LMS027 — replay anything queued while offline as soon as we're back.
  useEffect(() => {
    syncQueuedProgress().catch(() => undefined);
    const onOnline = () => { syncQueuedProgress().catch(() => undefined); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  if (courses && courses.length === 0) {
    return (
      <PortalShell role="Student portal" links={links} userName={userName}>
        <h1 className="font-display text-2xl">My courses</h1>
        <p className="mt-4 text-sm text-ink/60">
          You're not registered for any units yet. Course registration self-service will appear here once wired to a picker UI — for now, ask the registrar.
        </p>
      </PortalShell>
    );
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">{detail?.title ?? "My courses"}</h1>
        {courses && courses.length > 1 && (
          <select value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value)} className="input w-64">
            {courses.map((c) => (
              <option key={c.courseId} value={c.courseId}>{c.title}</option>
            ))}
          </select>
        )}
      </div>
      {detail?.trainer && <p className="mt-1 text-sm text-ink/60">Trainer: {detail.trainer.fullName}</p>}
      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {selectedId && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          {completion && (
            <span className={`rounded-full px-2.5 py-1 font-medium ${completion.completed ? "bg-forest/15 text-forest" : "bg-navy/10 text-navy"}`}>
              {completion.completed ? "Course completed" : `Completion: ${completion.lessonPercent}% of ${completion.minLessonPercent}% required`}
            </span>
          )}
          <button type="button" onClick={handleDownloadOffline} className="rounded-full border border-line px-2.5 py-1 font-medium text-ink/70 hover:border-navy hover:text-navy">
            Download for offline
          </button>
          {offlineStatus && <span className="text-ink/50">{offlineStatus}</span>}
          {pendingSync > 0 && <span className="rounded-full bg-gold/20 px-2.5 py-1 font-medium text-gold-dark">{pendingSync} update(s) waiting to sync</span>}
        </div>
      )}

      {detail?.progress && detail.progress.totalLessons > 0 && (
        <div className="mt-6 flex items-center gap-4">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-navy/10">
            <div className="h-full rounded-full bg-gold" style={{ width: `${detail.progress.percent}%` }} />
          </div>
          <span className="shrink-0 text-sm font-medium text-ink/70">
            {detail.progress.completedLessons} / {detail.progress.totalLessons} lessons · {detail.progress.percent}%
          </span>
        </div>
      )}

      {detail?.liveClasses && detail.liveClasses.length > 0 && (
        <div className="mt-6">
          <PortalSection title="Live classes">
            <ul className="divide-y divide-line">
              {detail.liveClasses.map((lc) => (
                <li key={lc.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p>{lc.title}</p>
                    <p className="text-xs text-ink/45">
                      {new Date(lc.scheduledAt).toLocaleString()} · {lc.durationMinutes} min
                    </p>
                    {lc.description && <p className="text-xs text-ink/55">{lc.description}</p>}
                    {lc.status === "ENDED" && lc.recordingUrl && (
                      <a href={lc.recordingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-navy underline">Watch the recording</a>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={lc.status === "LIVE" ? "ok" : lc.status === "SCHEDULED" ? "warn" : "neutral"}>
                      {lc.status === "LIVE" ? "Live now" : lc.status === "SCHEDULED" ? "Scheduled" : lc.status}
                    </Badge>
                    {lc.status !== "ENDED" && lc.status !== "CANCELLED" && (
                      <JoinLiveClassButton sessionId={lc.id} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </PortalSection>
        </div>
      )}

      {detail?.lmsEngine === "MOODLE" && (
        <div className="mt-8">
          <PortalSection title="Delivered via Moodle">
            <p className="text-sm text-ink/60">
              This course's content, assignments and grading happen in Moodle. Click
              below to launch — you'll be signed in automatically, no separate password.
            </p>
            <button onClick={launchMoodle} disabled={launching} className="btn-primary mt-4 disabled:opacity-50">
              {launching ? "Opening…" : "Launch course in Moodle ↗"}
            </button>

            {detail.moodle?.error && (
              <p className="mt-3 text-xs text-ink/45">
                Live class list is temporarily unavailable — you can still launch the course above.
              </p>
            )}
            {detail.moodle && detail.moodle.liveClasses.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-xs uppercase tracking-wide text-ink/45">Live classes</p>
                <ul className="divide-y divide-line">
                  {detail.moodle.liveClasses.map((lc) => (
                    <li key={lc.id} className="flex items-center justify-between py-2 text-sm">
                      <span>{lc.name}</span>
                      <button onClick={launchMoodle} className="text-xs font-medium text-navy hover:underline">
                        Join ↗
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </PortalSection>
        </div>
      )}

      <div className="mt-8">
        {detail?.lmsEngine === "MOODLE" ? null : <PortalSection title="Course content">
          {detail && detail.modules.length === 0 && (
            <p className="text-sm text-ink/50">Your trainer hasn't published content for this course yet.</p>
          )}
          {!detail && !error && <LoadingState />}
          <div className="divide-y divide-line">
            {detail?.modules.map((m, i) => (
              <div key={m.id} className="py-4 first:pt-0 last:pb-0">
                <button
                  onClick={() => setOpenModule(openModule === i ? -1 : i)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="font-medium">{m.title}</span>
                  <span className="flex items-center gap-3 text-ink/40">
                    {m.totalCount !== undefined && m.totalCount > 0 && (
                      <span className="text-xs font-normal text-ink/45">
                        {m.completedCount}/{m.totalCount} complete
                      </span>
                    )}
                    {openModule === i ? "–" : "+"}
                  </span>
                </button>
                {openModule === i && (
                  <ul className="mt-3 space-y-2">
                    {m.lessons.length === 0 && <li className="text-sm text-ink/40">No lessons in this module yet.</li>}
                    {m.lessons.map((l) => (
                      <li key={l.id} className="rounded-sm bg-navy/[0.03] px-4 py-3 text-sm">
                        <button
                          type="button"
                          onClick={() => setOpenLesson(openLesson === l.id ? null : l.id)}
                          className="flex w-full items-center justify-between text-left"
                        >
                          <span className="flex items-center gap-2">
                            {l.completed && <span className="text-forest" title="Completed">✓</span>}
                            {l.title}
                          </span>
                          <span className="flex items-center gap-2 text-xs text-ink/45">
                            {l.durationMins ? `${l.durationMins} min · ` : ""}
                            <span className="font-mono">{l.contentType}</span>
                          </span>
                        </button>
                        {openLesson === l.id && (
                          <>
                            <LessonPlayer lesson={l} />
                            <button
                              type="button"
                              onClick={() => toggleLessonComplete(l)}
                              className={`mt-3 text-xs font-medium underline decoration-dotted ${
                                l.completed ? "text-ink/50" : "text-navy"
                              }`}
                            >
                              {l.completed ? "Mark as not complete" : "Mark as complete"}
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </PortalSection>}
      </div>

      {selectedId && <CourseAnnouncementsWidget courseId={selectedId} />}
      {selectedId && <DeliveryPlanWidget courseId={selectedId} />}
      {selectedId && <CourseFeedbackWidget courseId={selectedId} />}
    </PortalShell>
  );
}

// LMS015 — Course-scoped announcements. courses.ts already had real
// POST/GET /:courseId/announcements routes and a CourseAnnouncement model —
// nothing in the app ever called either one, so a trainer's course
// announcement never reached a student. This is that missing feed (see the
// matching post form added to TrainerCourses.tsx).
type CourseAnnouncement = {
  id: string;
  title: string;
  content: string;
  importance: string;
  createdAt: string;
  trainer: { fullName: string } | null;
};
function CourseAnnouncementsWidget({ courseId }: { courseId: string }) {
  const [items, setItems] = useState<CourseAnnouncement[] | null>(null);

  useEffect(() => {
    apiFetch<CourseAnnouncement[]>(`/courses/${courseId}/announcements`)
      .then(setItems)
      .catch(() => setItems(null));
  }, [courseId]);

  if (!items || items.length === 0) return null;

  return (
    <PortalSection title="Course announcements">
      <ul className="space-y-3">
        {items.map((a) => (
          <li key={a.id} className="border-b border-line pb-3 last:border-0">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{a.title}</p>
              {a.importance === "high" && <Badge tone="warn">Important</Badge>}
            </div>
            <p className="mt-1 text-sm text-ink/70">{a.content}</p>
            <p className="mt-1 text-xs text-ink/45">
              {a.trainer?.fullName ?? "Trainer"} · {new Date(a.createdAt).toLocaleDateString()}
            </p>
          </li>
        ))}
      </ul>
    </PortalSection>
  );
}

// TP007 — in-app playback: uploaded video/audio/images/PDFs, embedded
// YouTube/Vimeo, and block-based lessons, all rendered by the shared
// LessonView (the same component the trainer's preview uses). Interactive /
// SCORM lessons that point at an external page still open in a frame.
function LessonPlayer({ lesson }: { lesson: Lesson }) {
  useLessonEngagement(lesson.id);
  const framed = lesson.contentType === "interactive" && !!lesson.contentUrl;
  if (lesson.contentType === "scorm") {
    return (
      <div className="mt-3 border-t border-line pt-3">
        <ScormPlayer lessonId={lesson.id} />
        <StudentLessonTools lessonId={lesson.id} />
      </div>
    );
  }
  return (
    <div className="mt-3 border-t border-line pt-3">
      {framed && lesson.contentUrl && (
        <div className="mb-4">
          <iframe src={lesson.contentUrl} title={lesson.title} className="h-96 w-full rounded-sm border border-line" />
          <a href={lesson.contentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-navy hover:underline">
            Open in a new tab ↗
          </a>
        </div>
      )}
      <LowBandwidthProvider>
        <LessonView lesson={{ ...lesson, contentUrl: framed ? null : lesson.contentUrl }} />
      </LowBandwidthProvider>
      <StudentLessonTools lessonId={lesson.id} />
    </div>
  );
}

// TP026 — resolves a real, signed BigBlueButton join URL for this viewer
// (moderator if trainer, attendee if student) and opens it. Surfaces the
// backend's "not configured yet" message honestly rather than pretending.
function JoinLiveClassButton({ sessionId }: { sessionId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const { joinUrl } = await apiFetch<{ joinUrl: string }>(`/live-classes/${sessionId}/join`, { method: "POST" });
      window.open(joinUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join this session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <button type="button" onClick={join} disabled={busy} className="text-xs font-medium text-navy hover:underline disabled:opacity-50">
        {busy ? "Joining…" : "Join ↗"}
      </button>
      {error && <p className="mt-1 max-w-[20ch] text-[10px] text-navy-dark">{error}</p>}
    </div>
  );
}

function CourseFeedbackWidget({ courseId }: { courseId: string }) {
  const [courseRating, setCourseRating] = useState(0);
  const [trainerRating, setTrainerRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState<Set<"course" | "trainer">>(new Set());
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  async function submit(type: "course" | "trainer", rating: number) {
    if (rating === 0) return;
    try {
      await apiFetch("/feedback", { method: "POST", body: JSON.stringify({ courseId, type, rating, comment: comment || undefined }) });
      setSubmitted((s) => new Set(s).add(type));
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : "Could not submit feedback.");
    }
  }

  return (
    <div className="mt-6">
      <PortalSection title="Rate this course">
        {feedbackError && <p className="text-sm text-navy-dark">{feedbackError}</p>}
        <div className="space-y-4">
          <RatingRow
            label="Course quality"
            value={courseRating}
            onChange={setCourseRating}
            submitted={submitted.has("course")}
            onSubmit={() => submit("course", courseRating)}
          />
          <RatingRow
            label="Trainer effectiveness"
            value={trainerRating}
            onChange={setTrainerRating}
            submitted={submitted.has("trainer")}
            onSubmit={() => submit("trainer", trainerRating)}
          />
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional comment (shared anonymously with QA)…"
            rows={2}
            className="input"
          />
        </div>
      </PortalSection>
    </div>
  );
}

function RatingRow({
  label,
  value,
  onChange,
  submitted,
  onSubmit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  submitted: boolean;
  onSubmit: () => void;
}) {
  if (submitted) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-forest">Thanks — submitted.</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)} className={value >= n ? "text-gold" : "text-ink/20"}>
            ★
          </button>
        ))}
        <button type="button" onClick={onSubmit} className="ml-2 text-xs font-medium text-navy hover:underline">
          Submit
        </button>
      </div>
    </div>
  );
}

// AI014 — course delivery/pacing plan, batch 64 (student side). Only ever
// shows a plan the trainer has explicitly published — a draft stays
// trainer-side, same as this codebase's other AI-drafted, human-published
// features. 404 (no published plan) is treated as "nothing to show", not
// an error.
type PlanItem = { id: string; weekNumber: number; title: string; objective: string };
type DeliveryPlan = { totalWeeks: number; items: PlanItem[] };
function DeliveryPlanWidget({ courseId }: { courseId: string }) {
  const [plan, setPlan] = useState<DeliveryPlan | null>(null);

  useEffect(() => {
    apiFetch<DeliveryPlan>(`/course-delivery/${courseId}`)
      .then(setPlan)
      .catch(() => setPlan(null));
  }, [courseId]);

  if (!plan) return null;

  const byWeek = new Map<number, PlanItem[]>();
  for (const item of plan.items) {
    byWeek.set(item.weekNumber, [...(byWeek.get(item.weekNumber) ?? []), item]);
  }

  return (
    <div className="mt-6">
      <PortalSection title={`Course pacing plan (${plan.totalWeeks} weeks)`}>
        <ul className="divide-y divide-line">
          {[...byWeek.entries()].map(([week, items]) => (
            <li key={week} className="py-2 text-sm">
              <span className="font-medium">Week {week}:</span>{" "}
              {items.map((it) => it.title).join(", ")}
              <p className="text-xs text-ink/50">{items[0]?.objective}</p>
            </li>
          ))}
        </ul>
      </PortalSection>
    </div>
  );
}
