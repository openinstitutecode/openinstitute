import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { LoadingState } from "../../components/portal/StateViews";

const links = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/curriculum", label: "Curriculum" },
  { to: "/admin/learning-paths", label: "Learning Paths" },
  { to: "/admin/courses", label: "Courses & Trainers" },
  { to: "/admin/trainers", label: "Trainers & HR" },
  { to: "/admin/students", label: "Students" },
  { to: "/admin/support-tickets", label: "Support Tickets" },
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

type Unit = { id: string; code: string; title: string; programme: { name: string } };
type Trainer = { id: string; fullName: string };
type FormOptions = { units: Unit[]; trainers: Trainer[]; moodleConfigured: boolean };

type CourseRow = {
  id: string;
  title: string;
  description: string | null;
  publishedAt: string | null;
  lmsEngine: "CUSTOM" | "MOODLE";
  moodleCourseId: number | null;
  moodleSyncedAt: string | null;
  unit: { id: string; code: string; title: string; programme: { name: string } };
  trainer: { id: string; fullName: string } | null;
};

type DraftCourse = {
  unitId: string;
  trainerId: string;
  title: string;
  description: string;
  lmsEngine: "CUSTOM" | "MOODLE";
  published: boolean;
};

type PendingApproval = {
  id: string;
  notes: string | null;
  createdAt: string;
  course: { id: string; title: string; unit: { code: string; title: string } };
};

const emptyDraft: DraftCourse = {
  unitId: "",
  trainerId: "",
  title: "",
  description: "",
  lmsEngine: "CUSTOM",
  published: false,
};

export default function AdminCourses() {
  const userName = useCurrentUserName();
  const [courses, setCourses] = useState<CourseRow[] | null>(null);
  const [options, setOptions] = useState<FormOptions | null>(null);
  const [trainerAssignments, setTrainerAssignments] = useState<Record<string, string>>({});
  const [savingTrainerFor, setSavingTrainerFor] = useState<string | null>(null);
  const [canManageCourses, setCanManageCourses] = useState(false);
  const [draft, setDraft] = useState<DraftCourse>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingApproval[] | null>(null);
  const [catalogueCourseId, setCatalogueCourseId] = useState<string | null>(null);

  function load() {
    apiFetch<CourseRow[]>("/courses")
      .then((rows) => {
        setCourses(rows);
        setTrainerAssignments(Object.fromEntries(rows.map((course) => [course.id, course.trainer?.id ?? ""])));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load courses."));
    apiFetch<FormOptions>("/courses/admin/form-options")
      .then(setOptions)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load form options."));
  }

  async function assignTrainer(courseId: string) {
    setSavingTrainerFor(courseId);
    setError(null);
    setNotice(null);
    try {
      const trainerId = trainerAssignments[courseId] || null;
      await apiFetch(`/courses/${courseId}/trainer`, {
        method: "PATCH",
        body: JSON.stringify({ trainerId }),
      });
      setNotice(trainerId ? "Trainer assigned to course." : "Trainer removed from course.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign this trainer.");
    } finally {
      setSavingTrainerFor(null);
    }
  }

  async function deleteCourse(course: CourseRow) {
    if (!window.confirm(`Delete "${course.title}"? Courses with content, assessments, or student records cannot be deleted.`)) return;
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/courses/${course.id}`, { method: "DELETE" });
      setNotice(`Course "${course.title}" deleted.`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this course.");
    }
  }

  useEffect(load, []);
  useEffect(() => {
    apiFetch<{ role: string }>("/me/whoami")
      .then(({ role }) => setCanManageCourses(["SUPER_ADMIN", "ICT_ADMIN", "PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD"].includes(role)))
      .catch(() => setCanManageCourses(false));
  }, []);

  function startEdit(c: CourseRow) {
    setEditingId(c.id);
    setDraft({
      unitId: c.unit.id,
      trainerId: c.trainer?.id ?? "",
      title: c.title,
      description: c.description ?? "",
      lmsEngine: c.lmsEngine,
      published: Boolean(c.publishedAt),
    });
    setNotice(null);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  async function save() {
    if (!draft.unitId || !draft.title.trim()) {
      setError("A unit and a title are required.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const body = {
      unitId: draft.unitId,
      trainerId: draft.trainerId || null,
      title: draft.title,
      description: draft.description || undefined,
      lmsEngine: draft.lmsEngine,
      published: draft.published,
    };
    try {
      const result = editingId
        ? await apiFetch<{ moodleStatus: string }>(`/courses/${editingId}`, { method: "PATCH", body: JSON.stringify(body) })
        : await apiFetch<{ moodleStatus: string }>("/courses", { method: "POST", body: JSON.stringify(body) });

      if (draft.lmsEngine === "MOODLE") {
        if (result.moodleStatus === "synced") {
          setNotice("Saved — Moodle course created/updated and existing students enrolled.");
        } else if (result.moodleStatus === "pending") {
          setNotice(
            "Saved, but Moodle sync is pending — check MOODLE_BASE_URL/MOODLE_WS_TOKEN are set on this deployment, then use \"Retry Moodle sync\" below."
          );
        }
      } else {
        setNotice("Saved.");
      }
      cancelEdit();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this course.");
    } finally {
      setBusy(false);
    }
  }

  async function retrySync(courseId: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/courses/${courseId}/moodle-sync`, { method: "POST" });
      setNotice("Moodle sync succeeded.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Moodle sync failed again — see server logs for detail.");
    } finally {
      setBusy(false);
    }
  }

  // QA014 — course approval: route an unpublished course through a real
  // QA sign-off instead of just flipping "published" directly.
  async function requestApproval(courseId: string) {
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/courses/${courseId}/request-approval`, { method: "POST", body: JSON.stringify({}) });
      setNotice("Sent for QA approval.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request approval.");
    }
  }

  async function decideApproval(approvalId: string, decision: "approved" | "rejected") {
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/courses/approvals/${approvalId}/decision`, { method: "POST", body: JSON.stringify({ decision }) });
      setNotice(decision === "approved" ? "Course approved and published." : "Course approval rejected.");
      loadPending();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record decision.");
    }
  }

  function loadPending() {
    apiFetch<PendingApproval[]>("/courses/approvals/pending").then(setPending).catch(() => setPending(null));
  }
  useEffect(loadPending, []);

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Courses &amp; Moodle</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Assign trainers to courses here. Authorized course administrators can also create courses and choose
        how each is delivered. CUSTOM courses use this app's own module/lesson pages; MOODLE courses are
        created and kept in sync with Moodle.
      </p>

      {options && !options.moodleConfigured && (
        <p className="mt-4 border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold-dark">
          Moodle is not configured on this deployment (MOODLE_BASE_URL / MOODLE_WS_TOKEN
          are not set). You can still create MOODLE-mode courses — they'll show as
          "pending" until those environment variables are set and synced.
        </p>
      )}
      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}
      {notice && <p className="mt-4 text-sm text-forest">{notice}</p>}

      <div className="mt-8 grid gap-8 lg:grid-cols-[380px_1fr]">
        {canManageCourses ? <PortalSection title={editingId ? "Edit course" : "New course"}>
          <div className="space-y-3 text-sm">
            <label className="block">
              <span className="mb-1 block text-xs text-ink/50">Unit</span>
              <select
                value={draft.unitId}
                onChange={(e) => setDraft({ ...draft, unitId: e.target.value })}
                className="input w-full"
              >
                <option value="">Select a unit…</option>
                {options?.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} — {u.title} ({u.programme.name})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-ink/50">Course title</span>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="input w-full"
                placeholder="e.g. Introduction to Digital Business"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-ink/50">Description (optional)</span>
              <textarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={3}
                className="input w-full"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-ink/50">Assign trainer (optional)</span>
              <select
                value={draft.trainerId}
                onChange={(e) => setDraft({ ...draft, trainerId: e.target.value })}
                className="input w-full"
              >
                <option value="">Unassigned</option>
                {options?.trainers.map((t) => (
                  <option key={t.id} value={t.id}>{t.fullName}</option>
                ))}
              </select>
            </label>

            <fieldset className="rounded-sm border border-line p-3">
              <legend className="px-1 text-xs text-ink/50">Delivery engine</legend>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={draft.lmsEngine === "CUSTOM"}
                    onChange={() => setDraft({ ...draft, lmsEngine: "CUSTOM" })}
                  />
                  <span>CUSTOM — this app's own modules &amp; lessons</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={draft.lmsEngine === "MOODLE"}
                    onChange={() => setDraft({ ...draft, lmsEngine: "MOODLE" })}
                  />
                  <span>MOODLE — delivered &amp; graded in Moodle</span>
                </label>
              </div>
            </fieldset>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
              />
              <span>Published (visible to enrolled students)</span>
            </label>

            <div className="flex gap-2 pt-2">
              <button onClick={save} disabled={busy} className="btn-primary flex-1 disabled:opacity-50">
                {editingId ? "Save changes" : "Create course"}
              </button>
              {editingId && (
                <button onClick={cancelEdit} className="text-xs text-ink/50 hover:underline">
                  Cancel
                </button>
              )}
            </div>
          </div>
        </PortalSection> : (
          <div className="border border-line bg-white p-5 text-sm text-ink/60">
            As Registrar, you can assign or unassign trainers below. Course creation and course settings are restricted
            to course administrators.
          </div>
        )}

        <PortalSection title="All courses">
          {!courses && !error && <LoadingState />}
          {courses && courses.length === 0 && (
            <p className="text-sm text-ink/50">No courses yet — create the first one on the left.</p>
          )}
          <ul className="divide-y divide-line">
            {courses?.map((c) => (
              <li key={c.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{c.title}</p>
                    <p className="text-xs text-ink/50">{c.unit.code} · {c.unit.programme.name}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <Badge tone={c.lmsEngine === "MOODLE" ? "neutral" : "ok"}>{c.lmsEngine}</Badge>
                      {c.lmsEngine === "MOODLE" && (
                        <Badge tone={c.moodleCourseId ? "ok" : "warn"}>
                          {c.moodleCourseId ? `Moodle #${c.moodleCourseId}` : "pending"}
                        </Badge>
                      )}
                      <Badge tone={c.publishedAt ? "ok" : "neutral"}>{c.publishedAt ? "published" : "draft"}</Badge>
                    </div>
                    <div className="flex gap-3">
                      {canManageCourses && c.lmsEngine === "MOODLE" && !c.moodleCourseId && (
                        <button
                          onClick={() => retrySync(c.id)}
                          disabled={busy}
                          className="text-xs font-medium text-navy hover:underline disabled:opacity-50"
                        >
                          Retry Moodle sync
                        </button>
                      )}
                      {canManageCourses && !c.publishedAt && (
                        <button onClick={() => requestApproval(c.id)} className="text-xs font-medium text-navy hover:underline">
                          Request QA approval
                        </button>
                      )}
                      {canManageCourses && <button onClick={() => startEdit(c)} className="text-xs font-medium text-navy hover:underline">
                        Edit
                      </button>}
                      {canManageCourses && <button onClick={() => void deleteCourse(c)} className="text-xs font-medium text-red-700 hover:underline">
                        Delete
                      </button>}
                      {canManageCourses && <button onClick={() => setCatalogueCourseId(catalogueCourseId === c.id ? null : c.id)} className="text-xs font-medium text-navy hover:underline">
                        {catalogueCourseId === c.id ? "Close catalogue" : "Catalogue"}
                      </button>}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex max-w-xl items-end gap-2">
                  <label className="min-w-0 flex-1 text-xs text-ink/60">
                    Assign trainer
                    <select
                      aria-label={`Assign trainer to ${c.title}`}
                      value={trainerAssignments[c.id] ?? ""}
                      onChange={(event) => setTrainerAssignments((current) => ({ ...current, [c.id]: event.target.value }))}
                      className="input mt-1 w-full"
                    >
                      <option value="">Unassigned</option>
                      {options?.trainers.map((trainer) => (
                        <option key={trainer.id} value={trainer.id}>{trainer.fullName}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={savingTrainerFor === c.id || trainerAssignments[c.id] === (c.trainer?.id ?? "")}
                    onClick={() => void assignTrainer(c.id)}
                    className="btn-secondary whitespace-nowrap disabled:opacity-50"
                  >
                    {savingTrainerFor === c.id ? "Saving…" : "Save trainer"}
                  </button>
                </div>
                {canManageCourses && catalogueCourseId === c.id && <CatalogueEditor courseId={c.id} allCourses={courses ?? []} />}
              </li>
            ))}
          </ul>
        </PortalSection>

        {/* QA014 — course approval queue. Empty for anyone without QA
            visibility into pending approvals (the request 403s silently). */}
        {pending && pending.length > 0 && (
          <div className="lg:col-span-2">
            <PortalSection title="Pending course approvals">
              <ul className="divide-y divide-line">
                {pending.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <p className="font-medium">{p.course.title}</p>
                      <p className="text-xs text-ink/50">{p.course.unit.code} · requested {new Date(p.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => decideApproval(p.id, "approved")} className="btn-primary px-2 py-1 text-xs">Approve & publish</button>
                      <button onClick={() => decideApproval(p.id, "rejected")} className="btn-secondary px-2 py-1 text-xs">Reject</button>
                    </div>
                  </li>
                ))}
              </ul>
            </PortalSection>
          </div>
        )}

        <div className="lg:col-span-2">
          <CertificatesPanel />
        </div>
      </div>
    </PortalShell>
  );
}

// LMS001 — catalogue editor: the fields CourseCatalogueEntry already had
// (shortCode/credits/level/keywords/prerequisites/isVisible) with no admin
// UI to set them, so /student/catalogue always came up empty.
function CatalogueEditor({ courseId, allCourses }: { courseId: string; allCourses: CourseRow[] }) {
  type Entry = { isVisible: boolean; shortCode: string | null; credits: number | null; level: string | null; prerequisites: string[]; keywords: string[] };
  const [entry, setEntry] = useState<Entry>({ isVisible: true, shortCode: "", credits: null, level: "", prerequisites: [], keywords: [] });
  const [keywordsText, setKeywordsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Array<{ courseId: string; isVisible: boolean; shortCode: string | null; credits: number | null; level: string | null; prerequisites: string[]; keywords: string[] }>>(
      "/courses/catalogue/browse"
    )
      .then((all) => {
        const existing = all.find((e) => e.courseId === courseId);
        if (existing) {
          setEntry(existing);
          setKeywordsText(existing.keywords.join(", "));
        }
      })
      .catch(() => undefined);
  }, [courseId]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch(`/courses/${courseId}/catalogue`, {
        method: "POST",
        body: JSON.stringify({ ...entry, keywords: keywordsText.split(",").map((k) => k.trim()).filter(Boolean) }),
      });
      setMsg("Saved.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  function togglePrereq(id: string) {
    setEntry((e) => ({
      ...e,
      prerequisites: e.prerequisites.includes(id) ? e.prerequisites.filter((p) => p !== id) : [...e.prerequisites, id],
    }));
  }

  return (
    <div className="mt-3 space-y-3 border border-line bg-paper p-3 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={entry.isVisible} onChange={(e) => setEntry({ ...entry, isVisible: e.target.checked })} />
        Visible in the student catalogue
      </label>
      <div className="grid grid-cols-3 gap-2">
        <input value={entry.shortCode ?? ""} onChange={(e) => setEntry({ ...entry, shortCode: e.target.value })} placeholder="Short code" className="input" />
        <input type="number" value={entry.credits ?? ""} onChange={(e) => setEntry({ ...entry, credits: e.target.value ? Number(e.target.value) : null })} placeholder="Credits" className="input" />
        <select value={entry.level ?? ""} onChange={(e) => setEntry({ ...entry, level: e.target.value })} className="input">
          <option value="">Level…</option>
          <option value="foundation">Foundation</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>
      <input value={keywordsText} onChange={(e) => setKeywordsText(e.target.value)} placeholder="Keywords, comma-separated" className="input w-full" />
      <fieldset>
        <legend className="mb-1 text-xs text-ink/50">Recommended prerequisites (shown to students, not enforced here — see the unit's prerequisite units for actual registration blocking)</legend>
        <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
          {allCourses.filter((c) => c.id !== courseId).map((c) => (
            <label key={c.id} className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={entry.prerequisites.includes(c.id)} onChange={() => togglePrereq(c.id)} />
              {c.title}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving} className="btn-secondary px-3 py-1.5 text-xs">{saving ? "Saving…" : "Save catalogue entry"}</button>
        {msg && <span className="text-xs text-ink/50">{msg}</span>}
      </div>
    </div>
  );
}

// LMS036 — every issued certificate, institution-wide, with revoke.
// Issuance itself happens on the trainer side (roster access is needed to
// pick the right student) — see the panel added to TrainerLessonBuilder.
function CertificatesPanel() {
  type Cert = { id: string; certificateCode: string; grade: string; issuedAt: string; revoked: boolean; course: { title: string }; student: { fullName: string; studentNumber: string | null } };
  const [certs, setCerts] = useState<Cert[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Cert[]>("/courses/certificates/all")
      .then(setCerts)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load certificates."));
  }
  useEffect(load, []);

  async function revoke(id: string) {
    try {
      await apiFetch(`/courses/certificates/${id}/revoke`, { method: "PATCH" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke that certificate.");
    }
  }

  return (
    <PortalSection title="Course certificates (LMS036)">
      {error && <p className="text-sm text-navy-dark">{error}</p>}
      {!certs && !error && <LoadingState />}
      {certs && certs.length === 0 && <p className="text-sm text-ink/50">No certificates issued yet.</p>}
      <ul className="divide-y divide-line">
        {certs?.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2 text-sm">
            <div>
              <p className="font-medium">{c.student.fullName}{c.student.studentNumber ? ` (${c.student.studentNumber})` : ""} — {c.course.title}</p>
              <p className="text-xs text-ink/50">{c.certificateCode} · {c.grade} · issued {new Date(c.issuedAt).toLocaleDateString()}</p>
            </div>
            {c.revoked ? <Badge tone="danger">Revoked</Badge> : (
              <button onClick={() => revoke(c.id)} className="text-xs font-medium text-navy-dark hover:underline">Revoke</button>
            )}
          </li>
        ))}
      </ul>
    </PortalSection>
  );
}
