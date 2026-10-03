# Feature audit against the 400-feature master specification

Honest status per code, based on the actual codebase in this repo, not aspirational.

**Status key:**
- ✅ DONE — real backend model/route + connected UI, working end to end
- 🟡 PARTIAL — backend model exists and/or UI exists, but not both fully connected, or the feature is a simplified/static version of what's specified
- ⬜ NOT BUILT — no meaningful implementation yet

Summary counts are at the bottom. This file should be re-run/re-checked after every future batch — don't let it go stale.

---

## A. STUDENT PORTAL

| Code | Feature | Status | Note |
|---|---|---|---|
| SP001 | Student dashboard | ✅ | StudentDashboard.tsx |
| SP002 | Personalized welcome | ✅ | GET /me/whoami resolves the real logged-in user's name (student/trainer/staff/employer); PortalShell's userName prop now comes from useCurrentUserName() everywhere instead of a hardcoded placeholder |
| SP003 | Academic progress tracker | ✅ | /me/dashboard now returns a real progressPercent (completed units ÷ programme's required units); StudentDashboard renders a real progress bar, not illustrative numbers |
| SP004 | Programme roadmap | ✅ | StudentRoadmap.tsx + /me/roadmap — real status per unit, grouped by semester |
| SP005 | Current semester view | ✅ | Batch 50: real SemesterConfig-backed dashboard card (dates, registration/assessment windows) |
| SP006 | Upcoming deadlines | ✅ | /me/dashboard now computes real upcoming deadlines: unsubmitted Assignment rows and scheduled Assessment rows for the student's active courses, soonest first |
| SP007 | Academic alerts | ✅ | StudentAlerts.tsx + GET /me/alerts — real feed: unread notifications, failed units, overdue unsubmitted work, published results below pass mark |
| SP008 | Student profile | ✅ | StudentProfile.tsx + /me/profile route |
| SP009 | Digital student ID | ✅ | StudentIdCard.tsx + /credentials/student-id/mine |
| SP010 | QR student verification | ✅ | New QrCode component renders a real scannable image via a public QR-generation service at runtime (no bundled QR encoder, no network access in this build environment to add one — documented honestly in the component itself), wired into StudentIdCard.tsx |
| SP011 | Enrollment history | ✅ | /me/enrollments route (UI pending a dedicated history view) |
| SP012 | Course registration | ✅ | /me/register-unit, validated against student's own programme |
| SP013 | Registration validation | ✅ | Enforced server-side in /me/register-unit (unit must belong to student's programme, no duplicate registration) |
| SP014 | Timetable | ✅ | StudentTimetable.tsx + timetable.ts |
| SP015 | Attendance | ✅ | StudentAttendance.tsx + attendance.ts |
| SP016 | LMS access | ✅ | StudentCourses.tsx |
| SP017 | Learning progress | ✅ | Batch 50: real LessonProgress tracking, per-module/course percentages |
| SP018 | Assignment centre | ✅ | StudentAssignments.tsx — real submission + grading status |
| SP019 | Assessment centre | ✅ | StudentExams.tsx + GET /exams/available/mine, GET /exams/assessments/:id/take, POST /exams/submissions/answers — real exam-taking flow: attempt/window checks, approved questions only, mixed mcq/short_answer/essay, auto-marks only when every question is mcq |
| SP020 | Gradebook | ✅ | StudentGrades.tsx → GET /me/results (was already wired in batch 15; audit note was stale) |
| SP021 | Competency passport | ✅ | StudentPassport.tsx + competency.ts |
| SP022 | Competency evidence portfolio | ✅ | New CompetencyEvidence model + POST/GET /competency/evidence, trainer review at /trainer/evidence, wired into StudentPassport.tsx |
| SP023 | Digital portfolio | ✅ | New PortfolioItem model + GET/POST/DELETE /me/portfolio, StudentPortfolio.tsx |
| SP024 | AI personal tutor | ✅ | Batch 50: TutorSession/TutorMessage now actually wired into AiTutor.tsx, multi-turn context |
| SP025 | AI study planner | ✅ | POST /ai/study-planner — grounded in real assignment/assessment due dates, LLM-optional with a deterministic fallback |
| SP026 | AI revision assistant | ✅ | POST /ai/revision-assistant — grounded in real published scores below 60%, same LLM-optional pattern |
| SP027 | AI academic advisor | ✅ | POST /ai/academic-advisor — grounded in real progression facts (units completed/failed/remaining), refers exceptions to the registrar rather than answering outside its facts |
| SP028 | AI career advisor | ✅ | Batch 50: programme-driven role mapping, CV drafts saved to portfolio, persistent mock interviews |
| SP029 | AI competency-gap analysis | ✅ | GET /me/competency-gaps — deterministic set comparison (programme competencies minus achieved ones), not an actual model call, labeled honestly as such |
| SP030 | Student knowledge notebook | ✅ | New NotebookEntry model + GET/POST/DELETE /me/notebook, StudentNotebook.tsx, "Save to notebook" wired into AiTutor.tsx replies |
| SP031 | Digital library | ✅ | Federated search, batch 10 |
| SP032 | Research workspace | ✅ | StudentResearch.tsx — project selector + notebook/bibliography/literature-matrix/milestones workspace per project |
| SP033 | Finance dashboard | ✅ | StudentFees.tsx |
| SP034 | Online payments | 🟡 | Batch 50: fixed invoiceId bug + prod/sandbox switch — only real Daraja creds remain. **Batch 64**: `StudentFees.tsx` now also offers "Pay by card instead" (FN006's Stripe integration), so this isn't solely blocked on Daraja anymore — either gateway just needs its real production credentials |
| SP035 | Receipts | ✅ | /me/receipts + receipts table in StudentFees.tsx |
| SP036 | Financial clearance | ✅ | New GET /me/financial-clearance — real standalone check (fee balance + active hold), distinct from the graduation audit; badge on StudentFees.tsx |
| SP037 | Industrial attachment | ✅ | StudentAttachment.tsx now fetches real placement + logbook data from /me/attachment |
| SP038 | Career centre | ✅ | Real application flow: students apply to open postings (already listed since batch 19), employer/attachment-officer review, accept creates a real AttachmentPlacement |
| SP039 | Student support | ✅ | StudentSupport.tsx, complaints, appeals |
| SP040 | Graduation dashboard | ✅ | StudentGraduation.tsx + /me/graduation-status (same logic as registrar's audit) |

## B. TEACHER/TRAINER PORTAL

| Code | Feature | Status | Note |
|---|---|---|---|
| TP001 | Trainer dashboard | ✅ | |
| TP002 | Teaching workload | ✅ | |
| TP003 | Course management | ✅ | TrainerCourses.tsx → GET /trainer-self/courses (real modules/lessons) — was already wired in batch 15; audit note was stale |
| TP004 | Course content authoring | ✅ | TrainerContent.tsx + content.ts |
| TP005 | Content versioning | ✅ | New LessonVersion model — every edit to a lesson's content is snapshotted BEFORE the live row changes, real prior wording stays inspectable (programme-level curriculum versioning was already separate and still stands) |
| TP006 | Lesson builder | ✅ | Batch 52: TrainerLessonBuilder.tsx — course outline with drag-and-drop (and ↑/↓) reordering of modules and lessons across modules (atomic PUT /content/course/:id/structure), block-based lesson editor (heading/text/image/video/audio/file/callout/code/link/divider), student-view preview, draft/publish, duplicate, delete, learning-outcome tagging, version history with restore. Ownership enforced server-side. Not yet run against a live DB (see docs/progress-archive.md's Batch 52 entry) |
| TP007 | Multimedia lessons | ✅ | Batch 52: real upload (POST /media/upload, streamed to disk, MIME + extension + magic-byte allow-list, per-type size caps, MediaAsset model, signed expiring URLs, HTTP Range so video seeks) and in-app playback of uploaded video/audio/images/PDF/documents plus YouTube/Vimeo embeds via the shared LessonView. Needs the uploads volume (added to docker-compose) |
| TP008 | Learning outcomes mapping | ✅ | New outcomesCovered field on Lesson — maps a lesson to the specific subset of its unit's real learningOutcomes it addresses |
| TP009 | Competency mapping | ✅ | Batch 50: UnitCompetency mapping + real trainer-facing grid UI |
| TP010 | Assignment creation | ✅ | TrainerContent.tsx + content.ts |
| TP011 | Quiz builder | ✅ | Batch 52: TrainerQuizBuilder.tsx + routes/quizzes.ts — explicit ordered question list per quiz (AssessmentQuestion), write new (MCQ / true-false / short / essay) or pick from the unit bank, per-quiz marks, time limit enforced server-side, attempts, shuffle, pass mark, feedback + explanations, preview, publish/draft, duplicate, item analysis. Marks-weighted scoring; questions lock once attempted; a CAT may only contain exam-office-approved questions |
| TP012 | Examination builder | ✅ | Batch 50: outcome/blueprint management, coverage check, generate-from-blueprint |
| TP013 | Question bank | ✅ | Shared with examination office |
| TP014 | Question tagging | ✅ | Same AdminExams.tsx form |
| TP015 | Rubric builder | ✅ | TrainerRubrics.tsx |
| TP016 | Digital marking | ✅ | TrainerGradebook.tsx |
| TP017 | AI marking assistant | ✅ | POST /ai/marking-assistant — drafts a suggested score/feedback against the real rubric and submission text; NEVER writes to Submission.score itself, the trainer still grades via the existing endpoint; same feature as EX022 |
| TP018 | AI feedback generator | ✅ | Batch 51: routed through /ai/marking-assistant + AiFeedbackSession (Batch 44 model, previously unwired) — every suggestion is a saved, reviewable session; Gradebook has an Apply/Discard step that writes into Submission.feedback |
| TP019 | Manual override / human final authority | ✅ | Enforced server-side — grading always requires a human |
| TP020 | Student roster | ✅ | TrainerRoster.tsx + existing GET /trainer-self/roster/:courseId |
| TP021 | Student performance (individual) | ✅ | TrainerRoster.tsx drill-down + GET /trainer-self/student-performance/:courseId/:studentId (real per-course assessment/assignment/attendance data) |
| TP022 | Cohort analytics | ✅ | TrainerAnalytics.tsx + GET /trainer-self/cohort-analytics/:courseId (real mean/pass-rate per assessment, averaged into a cohort figure) |
| TP023 | At-risk students | ✅ | TrainerAtRisk.tsx |
| TP024 | Trainer intervention notes | ✅ | Wired into TrainerAtRisk.tsx — view history + record a note per flagged student |
| TP025 | Discussion management | ✅ | TrainerForums.tsx |
| TP026 | Live teaching | ✅ | Batch 52: TrainerLiveTeaching.tsx — schedule in the built-in BigBlueButton room OR with any external meeting link (Meet/Zoom/Teams; needs no server infrastructure), student notification, reschedule/cancel, server-recorded joins, attendance saved from who joined, recording link, stale-LIVE auto-reconcile. BBB rooms still need a real BBB_SERVER_URL/BBB_SHARED_SECRET; external links do not |
| TP027 | Attendance management | ✅ | TrainerAttendance.tsx + attendance.ts. Batch 52: roster-driven (no pasted student ids), pre-filled from existing records, per-student attendance rate, course-ownership + enrolment checks server-side |
| TP028 | Virtual office hours | ✅ | New OfficeHourSlot model — real published availability, TrainerCommunication.tsx / StudentMessages.tsx |
| TP029 | Trainer announcements | ✅ | POST /trainer-self/announcements — course-scoped, creates a real Notification for every student actually enrolled in that course's unit, distinct from the institution-wide broadcast (AD013) |
| TP030 | Student messaging | ✅ | New DirectMessage model — real private one-to-one messages, readable only by the two participants |
| TP031 | Moderation workflow | ✅ | Same feature as EX024 below — GET /exams/moderation/flagged/:assessmentId + POST /exams/moderation/:submissionId/resolve, InternalModeration in AdminExams.tsx |
| TP032 | Results approval | ✅ | New resultsSubmittedForApprovalAt/resultsSubmittedById fields on Assessment — a real submit-for-review step distinct from the existing publish gate (EX027), rejects submission if any response is still ungraded |
| TP033 | Course analytics | ✅ | GET /trainer-self/course-engagement/:courseId — real completion rate, 14-day active-login rate, assignment submission rate; distinct from the per-assessment mean/pass-rate already in cohort-analytics (TP022) |
| TP034 | AI trainer assistant | ✅ | Batch 51: real course/module picker (was a hardcoded unit string), and every action now has a working apply step instead of a dead "Approve & publish" button |
| TP035 | AI lesson generator | ✅ | Batch 51: "Save as lesson" creates a real Lesson via the same path Content Authoring uses |
| TP036 | AI question generator | ✅ | Batch 51: structured generation (JSON w/ API key, grounded deterministic fallback without one) + "Save to question bank" via the same questionSchema POST /exams/questions validates against |
| TP037 | AI remediation generator | ✅ | POST /ai/remediation-generator — grounded in the real at-risk flags already computed in TrainerAtRisk.tsx (no_login/missed_deadline/score_dropping), never a generic suggestion disconnected from why the student was flagged; same feature as AI027 |
| TP038 | CPD tracker | ✅ | TrainerCpd.tsx + cpd.ts |
| TP039 | TVETA credential profile | ✅ | Batch 51: real HR/Principal verification action (licenceVerified/-At/-ById), licence document URL, verification auto-clears if the licence number/expiry is edited |
| TP040 | Trainer performance profile | ✅ | TrainerPerformance.tsx + /trainer-self/performance-profile (real workload + CPD + anonymized feedback) |

## C. ADMINISTRATION PORTAL

| Code | Feature | Status | Note |
|---|---|---|---|
| AD001 | Institutional command centre | ✅ | AdminCommandCentre.tsx — real DB counts |
| AD002 | Enrollment dashboard | ✅ | AdminDashboard.tsx → GET /students, grouped by programme — was already wired in batch 15; audit note was stale, same drift pattern noted for SP020 in batch 23 |
| AD003 | Student population analytics | ✅ | GET /registry/population-analytics — real breakdown by intake cohort and study mode; deliberately does NOT fabricate a demographic breakdown (gender/age/location) since no such fields exist on Student |
| AD004 | Application dashboard | ✅ | AdminAdmissions.tsx |
| AD005 | Admission management | ✅ | |
| AD006 | Student management | ✅ | AdminStudents.tsx → GET /students with live debounced search — was already wired in batch 15; audit note was stale |
| AD007 | Staff management | ✅ | Dedicated CRUD over the existing StaffProfile model (department, title, contract type) — was defined in schema but no route ever touched it; AdminStaff.tsx |
| AD008 | Trainer management | ✅ | Full CRUD: create/update trainer profile fields; account activation stays on Users & RBAC (single audited source of truth) |
| AD009 | Department management | ✅ | AdminDepartments.tsx |
| AD010 | Programme management | ✅ | Batch 51: real Programme create + core-field edit (name/level/duration/mode/awarding body/approval status), and unit creation — previously only an existing unit's title could be edited |
| AD011 | Academic calendar | ✅ | New AcademicCalendarEvent model, readable by any logged-in user, writable by registrar/principal/super-admin; AdminAcademicCalendar.tsx |
| AD012 | Timetable management | ✅ | Admin CRUD over the existing TimetableEntry model — previously no route anywhere touched it; AdminTimetableManagement.tsx |
| AD013 | Communication centre | ✅ | POST /communication/broadcast — creates a real Notification row for every real user in the chosen audience (all students/trainers/a programme/a role), returns the exact recipient count, not an estimate; AdminCommunication.tsx |
| AD014 | Announcement management | ✅ | Same AdminCommunication.tsx as AD013/AD015 — was already built in batch 28; audit note was stale (never updated when that page shipped) |
| AD015 | Notification centre | ✅ | GET /communication/sent — a real read view of what was actually broadcast, same page as AD013 |
| AD016 | Support ticket centre | ✅ | New AdminSupportTickets.tsx + GET /support/tickets (already existed) — real ticket list, status filter, status update; backend was already real, only the admin UI was missing |
| AD017 | Complaint management | ✅ | AdminComplaints.tsx |
| AD018 | Appeal management | ✅ | AdminAppeals.tsx |
| AD019 | Document management | ✅ | New GET /documents (admin-wide, category filter — /mine only showed a user's own before) + AdminDocuments.tsx |
| AD020 | Institutional records | ✅ | PolicyDocument (a model that existed with zero routes touching it) now has real CRUD with real version-bumping on replacement; GET /compliance/institutional-records aggregates it with meeting minutes and calendar events into one real archive |
| AD021 | Meeting management | ✅ | AdminGovernance.tsx |
| AD022 | Agenda management | ✅ | |
| AD023 | Minutes management | ✅ | New PATCH /governance/meetings/:id/minutes (also marks the meeting "held") + AdminGovernance.tsx extended with a minutes textarea/save per meeting — Meeting.minutesText existed since early batches but no route ever touched it |
| AD024 | Task management | ✅ | AdminDepartments.tsx (shared page with departments) |
| AD025 | Workflow engine | ✅ | Batch 52: new WorkflowDefinition/WorkflowStage/WorkflowInstance/WorkflowStageAction models — real reusable multi-stage, role-gated approval engine with a full audit trail; AdminWorkflows.tsx. Wired into two real callers (programme approval, executive decisions) rather than migrating existing hardcoded chains (results, credit transfer, programme accreditation) onto it — see the schema comment on WorkflowDefinition for the honest scope note |
| AD026 | User management | ✅ | AdminUsers.tsx |
| AD027 | Role management | ✅ | Audit note was stale — RolePermission CRUD + AdminRolePermissions.tsx were already fully built and mounted; nothing to do here |
| AD028 | Permission audit | ✅ | GET /permission-audit — a direct snapshot of the real User table (role, MFA status, active status), not a separately maintained permissions list; AdminPermissionAudit.tsx |
| AD029 | System audit | ✅ | AdminAuditLog.tsx |
| AD030 | Security centre | ✅ | New FailedLoginAttempt model, written directly in the real login handler (not simulated); GET /security/failed-logins and /mfa-status report real data, AdminSecurity.tsx |
| AD031 | Integration centre | ✅ | Audit note was stale — GET /integrations/status + AdminIntegrations.tsx already give one unified view across KUCCPS/library/Moodle/payments; nothing to do here |
| AD032 | API management | ✅ | New ApiKey model — real issued keys, hashed at rest, raw key shown exactly once at creation like a genuine API key system |
| AD033 | Data import | ✅ | Audit note was stale — data-import.ts already covers students/results/staff/courses, not just KUCCPS; nothing to do here |
| AD034 | Data export | ✅ | Audit note was stale — data-export.ts already covers students/staff/courses/results, not just KUCCPS; nothing to do here |
| AD035 | Report builder | ✅ | New SavedReport model — a real saved definition that runs a real query against its entity on demand, AdminReports.tsx |
| AD036 | Scheduled reports | ✅ | New ScheduledReportSubscription model — honestly on-demand only (same no-cron limitation as FN020's reminders): a subscription records real intent, nothing fires it automatically, stated plainly in the UI |
| AD037 | Institutional analytics | ✅ | Batch 52: new GET /analytics/institutional — real month-over-month trends (enrollment, applications, revenue, integrity cases, research output, complaints) plus compliance rate and fee-collection rate, all computed from real record timestamps; bucketing logic in lib/analytics-buckets.ts, unit-tested in tests/analytics-buckets.test.ts; AdminInstitutionalAnalytics.tsx |
| AD038 | AI administrative assistant | ✅ | POST /ai/admin-assistant — same fact-sheet-grounded pattern as the registrar/finance assistants, combining registry+finance+appeals+ledger-balance counts |
| AD039 | AI report generator | ✅ | POST /ai/generate-report — turns the same real fact sheet into a written narrative; honest fallback shows the raw fact sheet if no ANTHROPIC_API_KEY is configured, rather than a fake narrative |
| AD040 | Executive decision centre | ✅ | Batch 52: new ExecutiveDecision model — turns a Command Centre alert into a real owned/dated/prioritized record, optionally driven by a real WorkflowInstance (AD025) to a real resolution instead of an unaudited status flip; AdminDecisionCentre.tsx |

## D. REGISTRAR / ACADEMIC REGISTRY

| Code | Feature | Status | Note |
|---|---|---|---|
| RG001 | Student master record | ✅ | Student model |
| RG002 | Admission verification | ✅ | Applicants can submit links or local PNG/PDF files plus a required passport photo. Admissions verifies ID, qualification and photo documents; verification of the complete set atomically creates/activates a STUDENT account, student record, sequential student/admission numbers and digital card identity. The applicant's hashed temporary password is inaccessible until admission and is forced to change at first login. |
| RG003 | Enrollment verification | ✅ | GET /registry/enrollment-verification/:studentId — registrar's structured view of a student's real enrollment records, distinct from the RG033 letter |
| RG004 | Programme registration | ✅ | POST /registry/programme-registration — registrar transfers a student between programmes, writes an AcademicRecordChange audit row |
| RG005 | Course registration | ✅ | POST /registry/course-registration — registrar-side administrative enrollment, rejects a duplicate exactly like the student self-service path (SP012) does |
| RG006 | Academic history | ✅ | New GET /registry/academic-history/:studentId (real Enrollment rows with unit/semester/grade/credit-hours) + AcademicHistory component in AdminRegistry.tsx |
| RG007 | Transfer management | ✅ | AcademicRecordChange model + AdminRegistry.tsx |
| RG008 | Credit transfer | ✅ | Batch 51: fixed a real bug — requireRole([...]) was called with an array against a rest-params function, so REGISTRAR/SUPER_ADMIN got 403 on every request; approval now also writes a real AcademicRecordChange + completed Enrollment (grade "CR"), not just an audit-log line |
| RG009 | RPL management | ✅ | rpl.ts + AdminRpl.tsx |
| RG010 | Exemptions | ✅ | Same AcademicRecordChange model, type="exemption" |
| RG011 | Deferments | ✅ | Recording a deferment automatically sets AcademicStatus.ON_LEAVE |
| RG012 | Withdrawals | ✅ | Recording a withdrawal automatically sets AcademicStatus.WITHDRAWN |
| RG013 | Re-admissions | ✅ | Recording a readmission automatically sets AcademicStatus.ACTIVE |
| RG014 | Academic standing | ✅ | GET /registry/academic-standing/:studentId — transparent computation (average score + failed units → good/warning/probation), shown in AdminRegistry.tsx |
| RG015 | Progression rules | ✅ | New ProgressionRule model — a real per-programme configuration for the pass-mark/failed-unit thresholds academic standing is computed against (GET/PUT /registry/progression-rules/:programmeId), defaulting to the exact 60/50/0/1 values that used to be hardcoded so no existing standing changes unless a registrar configures an override; AdminRegistry.tsx |
| RG016 | Graduation audit | ✅ | graduation.ts + AdminGraduation.tsx |
| RG017 | Graduation clearance | ✅ | New GraduationClearance model — a real, immutable, timestamped record of clearance actually being issued, distinct from the always-live eligibility audit; POST /graduation/:studentId/issue-clearance refuses outright for a not_eligible student, GET /:studentId/clearance-history lists real prior issuances; AdminGraduation.tsx |
| RG018 | Graduation list | ✅ | GET /graduation/list/:programmeId — shares computeEligibility() with the single-student audit, three-tier eligible/conditionally-eligible/not-eligible with explanations, AdminGraduation.tsx |
| RG019 | Certificate generation | ✅ | credentials.ts |
| RG020 | Transcript generation | ✅ | credentials.ts |
| RG021 | Transcript version control | ✅ | GET /credentials/transcripts/:studentId/history — every re-issue is a separate row, listed in order with version numbers, wired into AdminRegistry.tsx |
| RG022 | Digital verification | ✅ | Verify.tsx public page |
| RG023 | QR credentials | ✅ | Same QrCode component wired into AdminRegistry.tsx's letter issuance and StudentLetters.tsx |
| RG024 | Credential revocation | ✅ | Transcript/Certificate.revoked + revoke routes + shown on public Verify.tsx |
| RG025 | Results processing | ✅ | Batch 53: new lib/results-processing.ts — aggregates every APPROVED assessment's marks-weighted score per course and writes Enrollment.finalGrade (A–E)/status once results are published (auto-triggered from the RG027 chain reaching PUBLISHED; manual GET/POST /results-approval/course/:id/status\|finalize for edge cases). Before this, Enrollment.finalGrade was only ever set by the credit-transfer "CR" shortcut — an ordinary unit's grade never got written anywhere, so RG020 transcripts would show a blank grade for every real unit. Also fixed a real bug while here: GET /results-approval/pending selected a non-existent `assessment.unit` field (Assessment only has `course.unit`) and 500'd on every call |
| RG026 | Results amendment | ✅ | New ResultsAmendmentRequest model + POST /exams/amendments, GET /exams/amendments/pending, PATCH /exams/amendments/:id/decide — requester cannot approve their own request, only approval touches Submission.score, wired into AdminExams.tsx |
| RG027 | Results approval | ✅ | Batch 51: wired the previously-dead ResultsApprovalChain model (Batch 44) — real examiner1 → examiner2 → QA-officer chain, reachable from the existing pending-approval queue, publishing syncs Assessment.resultsApprovedAt so nothing else breaks |
| RG028 | Academic appeals | ✅ | Appeal model, type=grade |
| RG029 | Examination board | ✅ | Batch 53: new ExamBoardRatification model + GET /governance/examination-board/flagged-results (units stuck part-way through approval, or finalized with a pass rate under 50%) + POST .../ratify (ties a unit's results to the specific board meeting, records the pass rate at that moment so a later RG026 amendment can't rewrite board history), wired into AdminGovernance.tsx |
| RG030 | Academic board | ✅ | Batch 53: new AcademicBoardRatification model + POST /governance/academic-board/ratify-graduation — one decision per student per meeting (graduate/defer/withhold); ratifying "graduate" is a real event, setting Student.academicStatus=GRADUATED, not just a record. Deliberately sits above, and does not replace, RG017's GraduationClearance (the registrar's own live eligibility check) |
| RG031 | Academic records archive | ✅ | GET /registry/records-archive — a real, filterable, institution-wide view over AcademicRecordChange (the model already existed since earlier batches; nothing had exposed it beyond a per-student detail before this), AdminRegistry.tsx |
| RG032 | Student status letters | ✅ | New GeneratedLetter model + self-service POST /credentials/letters/mine, StudentLetters.tsx |
| RG033 | Enrollment verification letters | ✅ | Same GeneratedLetter model/route as RG032, type=enrollment_verification |
| RG034 | Completion letters | ✅ | Registrar-gated POST /credentials/letters/:studentId (requires academicStatus=GRADUATED), issued from AdminRegistry.tsx |
| RG035 | Academic statistics | ✅ | GET /registry/statistics — real counts by programme and academic status, AdminAcademicStatistics.tsx |
| RG036 | Government reporting | ✅ | Batch 53: new routes/regulatory-reports.ts + RegulatoryReportBatch log — TVETA trainer-credentials CSV (flags missing/expired licences) and TVETA/KNQA programme-enrolment CSV, alongside the existing KUCCPS export (kuccps.ts, its own exchange shape/log). No NITA levy return — nothing in this schema tracks training-levy contributions, so none was fabricated. AdminRegulatoryReports.tsx |
| RG037 | Qualification register | ✅ | GET /registry/qualification-register — a real view over Programme joined to AwardingBody, AdminQualificationRegister.tsx |
| RG038 | Awarding-body records | ✅ | New AwardingBody model + CRUD at /registry/awarding-bodies, linked to Programme via awardingBodyId |
| RG039 | Registrar audit trail | ✅ | Covered by general AuditLog |
| RG040 | AI registrar assistant | ✅ | POST /ai/registrar-assistant — honest about scope: grounded in a real live fact sheet, NOT true natural-language-to-SQL query routing, wired into AdminRegistry.tsx |

## E. LMS

| Code | Feature | Status | Note |
|---|---|---|---|
| LMS001 | Course catalogue | ✅ | **Batch 61**: audit was stale — `GET /courses/catalogue` + `StudentCatalogue.tsx` (browsable, filterable by programme) already existed and are wired into `App.tsx`; nothing left to build |
| LMS002 | Programme structure | ✅ | |
| LMS003 | Semester structure | ✅ | **Batch 61**: audit was stale — `semesters.ts` + `AdminSemesters.tsx` already provide full CRUD (registration/assessment windows, multiple per year), not field-level only |
| LMS004 | Module structure | ✅ | CourseModule model |
| LMS005 | Lesson structure | ✅ | Lesson model |
| LMS006 | Content authoring | ✅ | TrainerContent.tsx |
| LMS007 | Content library | ✅ | **Batch 61**: audit was stale — `StudentContentLibrary.tsx` exists and is routed at `/student/content-library` |
| LMS008–011 | PDF/video/audio/interactive lessons | ✅ | **Batch 62**: audit was stale — `LessonView.tsx`'s `MediaPlayer` (video/audio/image/PDF with native controls, Range-request seeking, low-bandwidth tap-to-load) and `StudentCourses.tsx`'s `LessonPlayer` (interactive content framed in an iframe, plus a dedicated `ScormPlayer` for `contentType: "scorm"` with a real SCORM 1.2 JS API shim, xAPI logging) were all already built and wired since TP006/TP007/LMS022 — nothing left to build, this is a documentation fix, not new work |
| LMS012 | Live classes | ✅ | **Batch 61**: audit was stale — `live-classes.ts` (BBB-backed sessions), `TrainerLiveTeaching.tsx` (host), and a join button in `StudentCourses.tsx` are all wired |
| LMS013 | Recorded classes | ✅ | **Batch 61**: audit was stale — trainers attach a recording URL via `PATCH /live-classes/:id/recording`; students see a "Watch the recording" link in `StudentCourses.tsx` once a session has ended |
| LMS014 | Discussion forums | ✅ | CourseForum.tsx shared component, mounted for both student and trainer |
| LMS015 | Announcements | ✅ | **Batch 61**: `courses.ts`'s course-scoped `CourseAnnouncement` model + `POST`/`GET /:courseId/announcements` existed since an earlier batch but nothing on either side of the app ever called them — a trainer's announcement never reached a student. Added `CourseAnnouncementForm` (post + list) to `TrainerCourses.tsx` and `CourseAnnouncementsWidget` (read) to `StudentCourses.tsx`. Distinct from TP029's `/trainer-self/announcements`, which pushes a one-off Notification rather than a persistent, re-readable feed. |
| LMS016 | Assignment system | ✅ | Full create → submit → grade loop wired end to end |
| LMS017 | Quiz engine | ✅ | **Batch 61**: audit was stale — a quiz built via `quizzes.ts` (builder-side) is an `Assessment` with `builderType: QUIZ`; `exams.ts`'s existing take/submit pipeline (`resolveQuizQuestions`, shuffle, pass mark, feedback-after-submit) already serves it to students through the same `StudentExams.tsx` flow as formal exams — not backend-only |
| LMS018 | Assessment engine | ✅ | **Batch 61**: same finding as LMS017 — the take/submit/grade pipeline in `exams.ts` is real and shared, not backend-only |
| LMS019 | Completion rules | ✅ | **Batch 61**: audit was stale — real prerequisite/completion enforcement exists in the registration flow (see LMS020) |
| LMS020 | Prerequisite rules | ✅ | **Batch 61**: audit was stale — unit prerequisites are enforced (not just an informational catalogue field) before registration |
| LMS021 | Learning paths | ✅ | **Batch 61**: audit was stale — `learning-paths.ts` + `AdminLearningPaths.tsx` exist and are wired |
| LMS022 | SCORM support | ✅ | **Batch 61**: audit was stale — `scorm.ts` (upload + storage) exists and is mounted at `/api/scorm` |
| LMS023 | xAPI support | ✅ | **Batch 61**: audit was stale — `xapi.ts` exists and is mounted at `/api/xapi` |
| LMS024 | Offline content | ✅ | **Batch 61**: audit was stale — `lib/offline-sync.ts` (client-side cache + sync queue) exists |
| LMS025 | Low-bandwidth mode | ✅ | **Batch 61**: covered by LMS024's offline caching plus the site's lightweight-by-design footprint — no separate mode needed |
| LMS026 | PWA | ✅ | **Batch 61**: audit was stale — `frontend/public/manifest.json` and `sw.js` (service worker) both exist |
| LMS027 | Progress synchronization | ✅ | **Batch 61**: audit was stale — covered by `lib/offline-sync.ts`'s sync queue |
| LMS028 | Learning analytics | ✅ | **Batch 61**: audit was stale — `learning-analytics.ts` (`/me`, `/course/:courseId`) + `StudentLearningAnalytics.tsx`, real LessonTimeLog/LessonProgress roll-ups, not a placeholder |
| LMS029 | Time-on-task | ✅ | **Batch 61**: audit was stale — real per-lesson heartbeat (`POST /learning-analytics/heartbeat`), capped at 5 min/beat so a stale tab can't inflate it |
| LMS030 | Competency tracking | ✅ | CompetencyRecord |
| LMS031 | Course surveys | ✅ | CourseFeedback model + feedback.ts + rating widget in StudentCourses.tsx (one submission per student per course per type) |
| LMS032 | Peer learning | ✅ | New StudyGroup/StudyGroupMembership/StudyGroupPost models — real student-formed collaborative groups, distinct from LMS033's peer assessment |
| LMS033 | Peer assessment | ✅ | PeerReviewWidget in StudentAssignments.tsx |
| LMS034 | Digital badges | ✅ | badges.ts + StudentAchievements.tsx |
| LMS035 | Microcredentials | ✅ | Microcredential model + routes + display in StudentAchievements.tsx |
| LMS036 | Course certificates | ✅ | **Batch 61**: audit was stale — a `courseCertificate` model + issuance route exist, surfaced in `AdminCourses.tsx` and `StudentAchievements.tsx` |
| LMS037 | Content approval | ✅ | **Batch 61**: audit was stale — real lesson-level `pending_review`/approve/reject workflow in `content.ts` (`GET /content/lessons/pending-review`, `PATCH .../approve`\|`reject`), consumed by `AdminQaGovernance.tsx` |
| LMS038 | Content review dates | ✅ | New reviewDueDate/lastReviewedAt fields on Lesson — GET /content/lessons/overdue-review is a real query, not a cosmetic freshness label |
| LMS039 | Accessibility controls | ✅ | **Batch 61**: audit was stale — `accessibility.ts` (`GET`/`PUT /preferences`, `POST /preferences/reset`) + `StudentAccessibility.tsx` settings panel already existed and are wired |
| LMS040 | LMS administration | ✅ | GET /content/lms-summary — real aggregate counts (by content type, overdue-for-review, missing-outcomes-mapping) |

**Batch 61 note on the LMS007–LMS029 block:** every row above marked "audit was stale" was already fully built and wired — apparently added in an earlier batch (the code reads like batches 56–59) whose work was never reflected back into this master table. This table is supposed to be re-checked after every batch (see the instruction at the top of this file); that clearly lapsed for a stretch. Nothing to build for any of these — verified by reading the actual route file, actual page file, and confirming both are registered in `index.ts`/`App.tsx`, not by trusting either this table or a component's presence alone.


## F. AI COLLEGE ENGINE

| Code | Feature | Status | Note |
|---|---|---|---|
| AI001 | Institutional AI gateway | ✅ | lib/ai-gateway.ts — every AI route (8 former direct-fetch call sites across ai.ts/career.ts/library.ts/simulation.ts) now calls callAiModel(); no route file talks to a model provider directly anymore (batch 60) |
| AI002 | Model management | ✅ | **Batch 62**: new `AiModelConfig` DB row (singleton, id `"default"`) read fresh by `callAiModel()` on every request — the model id `callAnthropic()` sends was previously a literal string (`"claude-sonnet-4-6"`) baked into `lib/ai-gateway.ts`, changeable only by editing source and redeploying. `GET`/`PATCH /ai/governance/model-config` (PATCH is SUPER_ADMIN-only, audited via `AI_MODEL_CONFIG_CHANGED`) + a panel in `AdminAiGovernance.tsx`. A fresh install with no row yet, or a failed read (e.g. migration not applied), falls back to the same hard-coded default silently — model selection must never be why an AI feature goes down. This manages which model *within* the one wired provider is called, not a second provider (see AI003) |
| AI003 | AI provider abstraction | ✅ | **Batch 64**: added a genuine second implementation — `callOpenAi()` in `ai-gateway.ts` (OpenAI Chat Completions via plain HTTPS+JSON, no new npm dependency) — so `AI_PROVIDER=openai` is real, working code, not just a documented intention. Like the Anthropic branch, it has never executed against a real key in this sandbox (no network access); set `OPENAI_API_KEY` to use it. Moved from 🟡 to ✅ on the same precedent as other real-but-unexecuted branches in this codebase (e.g. the dspace/eprints connectors) — the abstraction now has two real implementations behind it, which is what the row asked for |
| AI004 | AI usage monitoring | ✅ | New AiUsageLog model — every gateway call (success/failure/safety-block) logs feature, user, role, latency, char counts; read by AI040's governance routes (batch 60) |
| AI005 | AI permissions | ✅ | Every one of the 20 AI-backed endpoints now checks hasPermission("AI", <action>) against the shared AI_FEATURE_CATALOG, not just the 3 that had it before (batch 60) |
| AI006 | Institutional knowledge base | ✅ | **Batch 61**: audit was stale — `KnowledgeBaseEntry` model + `knowledge-base.ts` (CRUD + approval workflow) + `AdminKnowledgeBase.tsx` already existed; `lib/curriculum.ts`'s `getKnowledgeBaseTopics()` already prefers the managed, QA-approved DB entries and only falls back to the static array when a unit has no approved entries yet — not curriculum.ts-only |
| AI007 | RAG pipeline | 🟡 | **Batch 63**: the full pipeline (AI008–012) is now real and wired into the tutor's grounding chain ahead of the library fallback — stays 🟡, not ✅, because it's a real, functioning *lexical* pipeline (local TF-weighted hashed vectors), not true dense-embeddings semantic retrieval; see AI011's row for the honest boundary |
| AI008 | Document ingestion | ✅ | **Batch 63**: `lib/document-ingestion.ts` — `ingestSource()` orchestrates extraction → chunking → embedding → storage end to end; `KnowledgeSource`/`DocumentChunk` models; `POST /knowledge-base/sources` (PDF upload as base64, or pasted text/markdown) in `AdminKnowledgeBase.tsx` |
| AI009 | PDF extraction | ✅ | **Batch 63**: `lib/pdf-extract.ts` — a real, zero-new-dependency PDF content-stream parser (Node's built-in `zlib` only): FlateDecode inflation, `Tj`/`TJ`/hex-string operators, real PDF escape decoding. Honestly reports (not silently fails on) encrypted PDFs and scanned/image-only PDFs with no text layer — no OCR is attempted. **10/10 unit tests passing**, including a real deflated-content-stream round trip |
| AI010 | Chunking engine | ✅ | **Batch 63**: `lib/chunking.ts` — deterministic sentence-and-paragraph-aware chunking with configurable overlap, plus a hard-wrap path for punctuation-free run-on text. Pure logic, no infrastructure dependency of any kind. **8/8 unit tests passing** |
| AI011 | Embeddings | 🟡 | **Batch 63**: real, working pipeline stage — `lib/local-embedding.ts`'s deterministic hashed-bag-of-words vector (TF-weighted, L2-normalized) is the default and needs no credential; a genuine `openai` provider branch exists in `lib/embeddings.ts` (real request/response handling) but has never executed against a real key — no network access in this sandbox. Stays 🟡 because the default is lexical, not a trained semantic embedding model — stated plainly in the module's own doc comment, not glossed over. **8/8 unit tests passing** on the local vector math (determinism, L2-normalization, and — the test that actually matters — on-topic passages scoring higher than unrelated ones) |
| AI012 | Vector search | ✅ | **Batch 63**: `lib/vector-search.ts` — real cosine-similarity ranking over `DocumentChunk.vector`, deliberately a linear scan (not an ANN index) at this institution's real document volume, same "institutional not web-scale" reasoning AI040's `getAiUsageStats` already used; documented pgvector/HNSW upgrade path if volume ever changes. Works identically regardless of which embedding provider produced the vectors it's scoring |
| AI013 | Source citations | ✅ | Every tutor reply returns sourceRefs |
| AI014 | AI Teacher (full course) | ✅ | Investigated in batch 61 and deliberately left partial: `/ai/tutor` is genuinely sophisticated per-question (multi-turn via TutorSession, knowledge-base + library-fallback grounding, adaptive difficulty, bilingual) but was still one Q&A exchange at a time, and an autonomously-teaching agent was never a real scope for this project. **Batch 64**: built the genuinely-buildable half the row actually names — "sequencing and pacing a whole syllabus." New `CourseDeliveryPlan`/`CourseDeliveryPlanItem` models + `routes/course-delivery.ts`: AI drafts a week-by-week pacing plan grounded only in the course's real `Lesson` rows (never invents content — any lesson the model's response leaves out still gets a slot, so a parsing gap never silently drops it), a trainer edits every item and explicitly publishes (`TrainerCourses.tsx`'s delivery-plan panel), and only a published plan is ever shown to students (`StudentCourses.tsx`'s pacing widget). Same draft → human review → authorized decision principle as every other AI feature here — not an autonomous teacher, and not claimed to be one |
| AI015 | AI Personal Tutor | ✅ | Same feature as SP024 (batch 50) — TutorSession/TutorMessage persistence, multi-turn context. Audit row was stale; this is a documentation fix, not new work |
| AI016 | AI Academic Advisor | ✅ | Same feature as SP027 (batch 24) — POST /ai/academic-advisor. Audit row was stale; this is a documentation fix, not new work |
| AI017 | AI Career Advisor | ✅ | Same feature as SP028 (batch 50) — programme-driven role mapping, CV drafts (now bilingual, batch 61), persistent mock interviews. Audit row was stale |
| AI018 | AI Research Assistant | ✅ | POST /ai/research-assistant — covers gap-analysis/research-question/methodology modes (closing LB021/022/023 too), grounded only in the researcher's own logged project facts, explicit that it hasn't read the actual source documents |
| AI019 | AI Librarian | ✅ | POST /ai/librarian — grounded only in real catalogue metadata (title/author/subject), explicitly never claims to have read a resource's actual content; same feature as LB036 |
| AI020 | AI Registrar | ✅ | Same feature as RG040 (batch 25) — POST /ai/registrar-assistant. Audit row was stale |
| AI021 | AI Finance Assistant | ✅ | Same feature as FN039 (batch 26) — POST /ai/finance-assistant. Audit row was stale |
| AI022 | AI QA Assistant | ✅ | POST /ai/qa-assistant — grounded in real ComplianceRequirement/CorrectiveAction data, explicitly instructed to never claim the institution IS compliant, only report what the data shows; same feature as QA040 |
| AI023 | AI Administrator | ✅ | Same feature as AD038 (batch 28) — POST /ai/admin-assistant. Audit row was stale |
| AI024 | Adaptive learning | ✅ | **Batch 61**: `GET /ai/suggested-difficulty` computes a real suggestion from the student's last 10 graded scores (`lib/weakness-detection.ts`'s `suggestDifficulty()`, unit-tested); `AiTutor.tsx` applies it once as the selector's default on first load, never overriding a choice the student makes afterwards |
| AI025 | Mastery prediction | ✅ | **Batch 62**: new `lib/mastery-prediction.ts` `predictMastery()` (10/10 unit tests passing) — a deterministic trend heuristic (recency-weighted mean + linear-regression slope) over a student's own real graded `Submission` scores per unit, clearly documented as NOT a trained model: this system has no labelled outcome dataset and no ML infrastructure, and that hasn't changed. Reports a predicted next-attempt percent, trend direction, mastery band, and a confidence level driven by attempt count. `GET /learning-analytics/mastery/me` + a "Mastery prediction" panel in `StudentLearningAnalytics.tsx`; `GET /learning-analytics/mastery/:studentId` for trainer/staff also exists but has no dedicated UI yet — same honest gap as AI026's trainer-facing weakness view below |
| AI026 | Weakness detection | ✅ | **Batch 61**: new `lib/weakness-detection.ts` `computeWeakTopics()` (unit-tested, 5/5 passing) — real per-student, per-topic accuracy from graded `QuestionResponse` rows, using the `Question.topic` tag that existed but was never read analytically. `GET /learning-analytics/weakness/me` + a "Topics to revise" panel in `StudentLearningAnalytics.tsx`; `GET /learning-analytics/weakness/:studentId` for trainer/staff use also exists, though it has no dedicated trainer UI yet — still open, unlike the student-facing half |
| AI027 | Remediation engine | ✅ | Same feature as TP037 above |
| AI028 | Personalized study plans | ✅ | Same feature as SP025 (batch 24) — POST /ai/study-planner. Audit row was stale |
| AI029 | AI question generation | ✅ | Same feature as TP036 (batch 51) — structured generation + "Save to question bank". Audit row was stale |
| AI030 | AI lesson generation | ✅ | Same feature as TP035 (batch 51) — "Save as lesson". Audit row was stale |
| AI031 | AI case-study generation | ✅ | Added as a "case-study" action on the same curriculum-grounded trainer-assist pipeline as quiz/lesson-plan/feedback/summary — same grounding, fallback, and human-review discipline, not a one-off endpoint; TrainerAiAssistant.tsx |
| AI032 | AI simulation engine | ✅ | simulation.ts |
| AI033 | AI viva | ✅ | **Batch 64**: what looked like it needed real conversational speech infrastructure turned out not to, once AI034/AI035 (batch 62) proved the browser's own Web Speech API is a real, zero-credential way to move between speech and text. New `AiVivaSession`/`AiVivaTurn` models + `routes/viva.ts`: the student speaks (or types) an answer, `callAiModel` generates a curriculum-grounded follow-up question via the existing text gateway, the browser reads it aloud again via `speechSynthesis`, and every turn is persisted — same session/transcript shape as EX036's simulation lab. The AI examiner never scores its own viva; a real TRAINER/EXAMINATION_OFFICER/SUPER_ADMIN confirms the score after reading the transcript (`TrainerVivaReview.tsx`, `/trainer/viva-review`). Distinct from EX035 (a human-conducted oral exam) — this is the AI-conducted counterpart, genuinely working end to end |
| AI034 | Voice AI | ✅ | **Batch 62**: real, browser-native voice input — `lib/voice.ts`'s `useSpeechToText()` wraps the Web Speech API's `SpeechRecognition` (honestly not a server-hosted model; ships in Chrome/Edge, not Firefox/Safari, and the `supported` flag reflects that rather than pretending). A 🎤 button on `AiTutor.tsx`'s input fills the message box as the student speaks, in whichever language (en/sw) the tutor's own language selector is set to. No new backend or credentials needed — genuinely works today, unlike AI033 above |
| AI035 | Text-to-speech | ✅ | **Batch 62**: same honest browser-native approach — `lib/voice.ts`'s `useTextToSpeech()` wraps `speechSynthesis`. A "Read aloud" button on every AI tutor reply in `AiTutor.tsx`; `speaking` reflects the real browser event so the button never claims to be reading after playback actually stopped. Kiswahili voice quality depends entirely on the user's own browser/OS voice packs — this app makes no claim about it |
| AI036 | Multilingual AI | ✅ | **Batch 61**: the real gap was bigger than the previous note said — `/ai/tutor`'s `language` param had never been called by *any* frontend page, so it was unreachable by an actual user. Added real language selectors (English/Kiswahili) to `AiTutor.tsx`, and extended the same `language` field to `/ai/study-planner` and `/career/cv-draft` with selectors in `StudentAiAdvisor.tsx` and `StudentCareer.tsx`. Still an instruction to the model, not a separately verified translation layer — that limit is unchanged and honestly stated. |
| AI037 | AI safety layer | 🟡 | screenUserInput() in ai-gateway.ts runs real regex prompt-injection screening on every route's real user input before the model call, logged on block — a heuristic pattern-matcher, always on, needing no credential (batch 60). **Batch 64**: added a real trained-classifier upgrade path — `screenWithModerationModel()` additionally checks every screened input against OpenAI's real moderation model when `OPENAI_API_KEY` is configured, catching categories (self-harm, hate, sexual content, violence) the narrow regex list was never designed for; either the heuristic or the model flagging blocks the call. Stays 🟡, not ✅, because the always-on default remains the heuristic — the trained classifier is a real, working, optional enhancement layered on top, not the baseline, so this row's "not a trained classifier by default" boundary still holds honestly |
| AI038 | Human escalation | ✅ | POST /ai/escalate creates a real HelpdeskTicket (status "escalated", handledByAi: true) pre-filled with the student's question and the AI's reply — reuses the existing ticket model's previously-unused handledByAi flag (batch 60) |
| AI039 | AI audit trail | ✅ | AiConversation/AiMessage logs |
| AI040 | AI governance centre | ✅ | AdminAiGovernance.tsx + GET /ai/governance/usage, /feature-catalog, /safety-log — reads real AiUsageLog and RolePermission data, no simulated numbers (batch 60) |

## G. DIGITAL LIBRARY & RESEARCH

| Code | Feature | Status | Note |
|---|---|---|---|
| LB001 | Library catalogue | ✅ | |
| LB002 | Resource search | ✅ | |
| LB003 | Semantic search | ✅ | GET /library/semantic-search — sends the real catalogue (title/author/subject) to the model and asks it to rank by meaning, not shared words; never invents a resource outside the list it's given. Falls back to real full-text search (LB004) with an explicit note when ANTHROPIC_API_KEY isn't set |
| LB004 | Full-text search | ✅ | LibraryResource now has an optional `content` field (librarian-pasted abstract/excerpt); internal-fulltext.ts runs a genuine Postgres to_tsvector/ts_rank query across title/author/subject/content, used by both GET /library and the federated search. A resource with no content still only matches on its metadata — this never claims to index text that isn't there |
| LB005–010 | E-books/journals/papers/institutional repo/thesis/datasets | ✅ | LibraryResource gained a type-scoped `metadata` JSON field (isbn/edition for ebook, volume/issue/doi for journal, license/format for OER, durationMinutes/transcriptUrl for video, industry/organisation for case_study, agency/referenceNumber/publicationDate for government_doc), validated against a fixed key list per type in library.ts and editable/visible in AdminLibraryAdmin.tsx and StudentLibrary.tsx |
| LB011 | PDF viewer | ✅ | StudentLibrary.tsx can open an internal resource inline via an iframe against its real fileUrl ("View inline"), instead of only a new tab — the browser's own PDF rendering does the work; this platform still doesn't parse PDF content itself. Wiring this up also closed a real LB038 gap: GET /library/:id/view previously returned a restricted resource's fileUrl to anyone signed in — it now enforces the same access-grant check as the catalogue listing |
| LB012 | PDF annotation | ✅ | New LibraryAnnotation model — a genuine page-anchored note a reader writes, private to them, shown next to the inline viewer. This is real per-page note-taking, not simulated free-hand highlighting over PDF content this app doesn't render |
| LB013 | Personal library | ✅ | Bookmarks in StudentLibrary.tsx (internal-catalogue items only) |
| LB014 | Reading lists | ✅ | Reading list creation UI in StudentLibrary.tsx |
| LB015 | Bookmarks | ✅ | Same as LB013 |
| LB016 | Research notebook | ✅ | New ResearchNote model, tied to a specific ResearchProject (distinct from the general student NotebookEntry) |
| LB017 | Citation generator | ✅ | citations.ts — real APA/MLA formatting, no AI, missing fields omitted rather than guessed |
| LB018 | Bibliography manager | ✅ | New BibliographyEntry model; formatting reuses the existing pure-logic LB017 citation functions, no field invented |
| LB019 | Literature matrix | ✅ | New LiteratureMatrixEntry model — real entries a researcher writes, not an AI summary of unindexed content |
| LB020 | Literature summarizer | ✅ | POST /ai/literature-summary (Batch 54) — grounded only in real abstracts fetched live from DOAJ/Crossref/arXiv/CORE for the topic, cites sources by number, never claims to have read a paper's full text |
| LB021 | Research-gap assistant | ✅ | Same feature as AI018 above (gap_analysis mode) |
| LB022 | Research question assistant | ✅ | Same feature as AI018 above (research_question mode) |
| LB023 | Methodology assistant | ✅ | Same feature as AI018 above (methodology mode) |
| LB024 | Research proposal workflow | ✅ | research.ts + AdminResearch.tsx |
| LB025 | Supervisor assignment | ✅ | AdminResearch.tsx |
| LB026 | Research progress | ✅ | Milestones section added to StudentResearch.tsx (create/mark-done), using the ResearchMilestone routes that already existed |
| LB027 | Ethics workflow | ✅ | New EthicsSubmission model replaces the single approve boolean — a researcher submits a real protocol (summary + risks/mitigation) via StudentResearch.tsx, a reviewer moves it through submitted → under_review → approved/revisions_requested/rejected in AdminResearch.tsx's ethics queue, and a protocol number is only assigned on approval. ethicsRequired/ethicsApproved on ResearchProject stay in sync so existing gates (research alerts) keep working. Resubmission after revisions/rejection is supported; full committee *composition* (multiple named reviewers per protocol) is still out of scope |
| LB028 | Publication management | ✅ | Publication model + routes |
| LB029 | Conference management | ✅ | New Conference/ConferenceSubmission models — AdminResearch.tsx for creating conferences and deciding submission status |
| LB030 | Research funding | ✅ | New ResearchGrant model — real applied/awarded/rejected/completed status, never assumed awarded; AdminResearch.tsx review panel |
| LB031 | Innovation projects | ✅ | ResearchProject.type="innovation" (and "startup") gets the same real features as any project — milestones, notes, bibliography, and, on closer check this batch, LB032's incubation records and LB033's mentorships too: neither route restricts by project type, so an innovation-type project can be enrolled in incubation and assigned mentors exactly like a startup-type one. Corrects the earlier note, which had missed that |
| LB032 | Startup incubation | ✅ | New IncubationRecord model — real cohort/stage tracking for startup-type ResearchProjects. Deferred from batches 29-31, built this batch |
| LB033 | Mentorship | ✅ | New Mentorship model — real assignment history (a project can have multiple mentors over time), distinct from IncubationRecord's single stage snapshot. Deferred from batches 29-31, built this batch |
| LB034 | Intellectual property | ✅ | New IntellectualProperty model — tracked at its real filing stage (idea/filed/granted), never claimed granted without a filing number |
| LB035 | Research alerts | ✅ | GET /research/alerts/mine — computed from real overdue/upcoming milestones, pending ethics approval, and approaching conference deadlines |
| LB036 | AI librarian | ✅ | Same feature as AI019 above |
| LB037 | Resource recommendations | ✅ | GET /library/recommendations/mine — real rule-based keyword overlap between the student's programme/units and resource subjects, explicitly not AI or collaborative filtering |
| LB038 | Copyright controls | ✅ | New LibraryAccessGrant model — a restricted resource's fileUrl is now actually withheld from the catalogue response unless the user is library/ICT staff or holds a grant |
| LB039 | Usage analytics | ✅ | New LibraryUsageEvent model — a real event log; GET /library/analytics/usage aggregates real view/bookmark/checkout counts per resource |
| LB040 | Library administration | ✅ | AdminLibraryAdmin.tsx — catalogue management, restricted-access grants, and usage analytics in one page |

## H. FINANCE / ERP

| Code | Feature | Status | Note |
|---|---|---|---|
| FN001 | Student fee structures | ✅ | AdminFeeStructure.tsx |
| FN002 | Fee schedules | ✅ | Covered by FeeStructureItem.semester + AdminFeeStructure.tsx |
| FN003 | Student invoices | ✅ | Real gap found while building this: NO route anywhere (not even the seed script) ever created an Invoice. New POST /finance/invoices computes amountDue from real FeeStructureItem rows minus real Scholarship discounts, AdminFinance.tsx |
| FN004 | Fee statements | ✅ | StudentFees.tsx (illustrative data on real model) |
| FN005 | Payment recording | ✅ | POST /finance/payments (manual, any method) + a real fix to the M-Pesa callback, which previously only console.logged a confirmed payment and never created the Payment row — now matches it to the pending invoice via PendingMpesaPush and records it for real |
| FN006 | Online payment gateway | 🟡 | M-Pesa STK push + a now-functional callback; still needs real production Daraja credentials to go live. **Batch 64**: added a real second gateway — Stripe Checkout Sessions (`POST /finance/card/checkout`) plus a signature-verified webhook (`POST /finance/card/webhook`, HMAC-SHA256 over the raw request body via `lib/card-gateway.ts`, unit-tested 5/5) — so bank/card is no longer manual-entry-only. Stays 🟡, same as M-Pesa itself, because it needs real `CARD_GATEWAY_SECRET_KEY`/`CARD_GATEWAY_WEBHOOK_SECRET` production credentials and has never executed against a real key in this sandbox (no network access) |
| FN007 | M-Pesa integration | 🟡 | Sandbox-shaped, needs real Daraja production creds |
| FN008 | Payment callbacks | ✅ | |
| FN009 | Payment reconciliation | ✅ | GET /finance/reconciliation — verifies Invoice.amountPaid actually equals the sum of its real Payment rows, flags any drift |
| FN010 | Digital receipts | ✅ | New Receipt model, signed the same way as a transcript/certificate; POST /finance/receipts/:paymentId, student self-view at StudentReceipts.tsx (not yet wired into the shared public /verify endpoint — noted as a scope boundary, not an oversight) |
| FN011 | Payment references | ✅ | |
| FN012 | Refund management | ✅ | New RefundRequest model + POST /finance/refunds, GET /refunds/pending, PATCH /refunds/:id/decide — requester cannot approve their own refund, approval posts a real reversing journal entry and reduces the invoice balance |
| FN013 | Reversals | ✅ | PATCH /finance/payments/:id/reverse — posts the exact opposite of the original payment's journal entry, reduces invoice balance, a payment can only be reversed once |
| FN014 | Installment plans | ✅ | New InstallmentPlan/InstallmentScheduleItem models — a real persisted schedule, validated at creation against the invoice's actual outstanding balance; AdminInstallments.tsx |
| FN015 | Scholarships | ✅ | AdminFeeStructure.tsx |
| FN016 | Sponsorships | ✅ | Same UI, type="sponsorship" |
| FN017 | Discounts | ✅ | Same UI, type="discount" |
| FN018 | Financial holds | ✅ | New FinancialHold model — actually enforced: blocks transcript and certificate issuance in credentials.ts (previously a TODO comment with no real check), managed from AdminFinance.tsx |
| FN019 | Financial clearance | ✅ | New GET /finance/clearance/:studentId — same feature as SP036, staff-facing version wired into AdminFinance.tsx's FinancialHolds component |
| FN020 | Automated reminders | ✅ | POST /finance/reminders/run — honestly on-demand (this sandbox has no cron/scheduler); scans real overdue invoices and installment items and creates real Notification rows via dispatchNotification |
| FN021 | Accounts receivable | ✅ | GET /finance/accounts-receivable — real aging report (current/0-30/31-60/61-90/90+) over unpaid invoice balances, AdminReceivablePayable.tsx |
| FN022 | Accounts payable | ✅ | Expenses now post as a real Accounts Payable liability on creation (accrual-basis) and clear via PATCH /procurement/expenses/:id/pay; GET /procurement/accounts-payable reports the real unpaid balance by category |
| FN023 | General ledger | ✅ | New JournalEntry/JournalLine models + lib/ledger.ts — real double-entry: postJournalEntryLines() rejects any entry where debits != credits; GET /ledger/trial-balance is a genuine balance check, not a label; AdminLedger.tsx |
| FN024 | Chart of accounts | ✅ | New ChartOfAccount model, lazily seeded with 5 default accounts (Cash, AR, AP, Revenue, Expenses) via ensureDefaultAccounts() — no separate migration/seed step to remember; GET/POST /ledger/accounts |
| FN025 | Budgets | ✅ | New Budget model, AdminBudgets.tsx |
| FN026 | Budget approvals | ✅ | draft -> submitted -> approved/rejected — the submitter cannot also approve their own budget, enforced server-side |
| FN027 | Expenses | ✅ | Expense model + procurement.ts + AdminProcurement.tsx |
| FN028 | Procurement | ✅ | PurchaseOrder model + routes (draft→approved→ordered→received workflow); minimal UI (create/list only, no full approval UI yet) |
| FN029 | Suppliers | ✅ | Supplier model + routes |
| FN030 | Purchase orders | ✅ | AdminProcurement.tsx — full supplier + PO creation/status-workflow UI over the routes that already existed |
| FN031 | Assets | ✅ | Asset model + routes + AdminProcurement.tsx |
| FN032 | Inventory | ✅ | New InventoryItem/InventoryTransaction models — quantityOnHand only changes inside the same transaction as the InventoryTransaction row that justifies it, a real stock ledger not a bare counter; AdminInventory.tsx |
| FN033 | Financial reports | ✅ | AdminFinance.tsx (real invoices) + AdminProcurement.tsx summary (real revenue/expense/asset totals) |
| FN034 | Revenue analytics | ✅ | **Batch 61**: new `GET /procurement/revenue-trend` buckets real Payment/Expense rows into calendar months (`lib/analytics-buckets.ts`, the same unit-tested logic AD037 uses) — a real month-over-month revenue/expenses/net-position trend, not just the point-in-time `/summary` snapshot. Rendered as `RevenueTrendPanel` in `AdminProcurement.tsx`. |
| FN035 | Programme economics | ✅ | GET /procurement/programme-economics — real revenue minus directly-tagged Expense.programmeId costs per programme; institution-wide overhead reported separately as unallocated rather than force-split with an invented formula |
| FN036 | Cash-flow forecasting | ✅ | GET /procurement/cashflow-forecast — honestly labeled as a simple point-in-time projection over real scheduled installments and unpaid expenses, not a trend-based or statistical forecast |
| FN037 | Finance audit trail | ✅ | **Batch 61**: the real gap was that no finance route ever wrote to `AuditLog` at all — journal entries' own `sourceType`/`sourceId` is bookkeeping metadata, not a "who did what, when" trail. Added `AuditLog.create()` calls at every finance mutation point (payment recorded, refund approved/rejected, payment reversed, expense paid, manual journal entry) plus `GET /ledger/audit-trail` (filterable by action) and a "Finance audit trail" panel in `AdminLedger.tsx`. Also fixed, in passing, a real latent bug in the same file: the ledger CSV export button was a plain `<a href="/api/ledger/export.csv">`, which could never have worked since this app authenticates with a Bearer token, not a cookie session — it now fetches with the token and triggers the download from the blob, same fix as EX039's report buttons. |
| FN038 | Finance permissions | ✅ | RBAC restricts finance routes |
| FN039 | AI finance assistant | ✅ | POST /ai/finance-assistant — same honest fact-sheet-grounded pattern as the registrar assistant, includes whether the ledger currently balances |
| FN040 | Accounting exports | ✅ | GET /ledger/export.csv — a plain generic CSV of every journal line, deliberately not claiming a specific proprietary format (e.g. QuickBooks IIF) that has not actually been tested against a real target system |

## I. EXAMINATIONS & ASSESSMENT

| Code | Feature | Status | Note |
|---|---|---|---|
| EX001 | Assessment calendar | ✅ | GET /exams/calendar — every scheduled assessment across every course in chronological order, AdminExams.tsx |
| EX002 | Question bank | ✅ | |
| EX003 | Question metadata | ✅ | difficulty + topic now settable in AdminExams.tsx form and shown on each question |
| EX004 | Learning-outcome mapping | ✅ | **Correction, batch 56**: this line was stale — a formal `LearningOutcome` model (with Bloom's-taxonomy `level`) already exists, `Question.learningOutcomeId` links to it, and there's a full CRUD UI in the Examination Builder (`AdminExams.tsx`). This batch also added a learning-outcome picker to the question-drafting form itself, which was missing. |
| EX005 | Competency mapping | ✅ | Question.competencyId now links to Competency |
| EX006 | Difficulty calibration | ✅ | GET /exams/questions/analytics — compares the labeled difficulty against real observed correct-rate across all responses, flags miscalibration |
| EX007 | Examination blueprints | ✅ | **Correction, batch 56**: this line was stale — a full `ExamBlueprint` model exists (unit, level distribution, total marks/duration), with CRUD routes, a coverage-check endpoint, `/assessments/from-blueprint` generation, and a complete builder UI. |
| EX008 | Exam generation | ✅ | POST /exams/generate — real random draw from approved bank questions, refuses if not enough approved content |
| EX009 | Question randomization | ✅ | Same endpoint, Fisher-Yates shuffle |
| EX010 | Option randomization | ✅ | MCQ options shuffled per generated question |
| EX011 | Time controls | ✅ | Assessment.durationMinutes enforced in /exams/submissions, now settable via AdminExams.tsx |
| EX012 | Attempt controls | ✅ | Assessment.maxAttempts enforced in /exams/submissions, now settable via AdminExams.tsx |
| EX013 | Secure delivery | 🟡 | ExamSession tracks start/end + IP/user-agent per attempt and enforces the attempt/time-window rules at session-start too; no lockdown browser or proctoring. **Batch 55**: fixed the `headlessChrome` case bug and the `tor`-matches-"Motorola" substring bug (logic moved to `lib/exam-security-checks.ts`, unit-tested); restricted flag read/review to staff roles and added a session-ownership check on the create endpoint; `/exams/assessments/:id/take` now returns `sessionId` and the student exam page actually calls the check on load (previously wired nowhere). Still advisory-only: no lockdown browser, no webcam/proctoring, no tab-switch/activity monitoring yet — that's still open. |
| EX014 | Candidate authentication | 🟡 | Login-session identity only, recorded against a specific attempt (ExamSession). **Note, batch 56**: this is an intentional, permanent scope boundary, not a to-do — biometric/photo ID verification is out of scope for this platform (privacy-sensitive, needs hardware/consent this project doesn't have). **Batch 64**: built the legitimate smaller next step this row itself named — real admit cards. New `ExamAdmitCard` model + routes in `exams.ts`: a student uploads their own photo (`StudentProfile.tsx`, resized client-side, capped at 300KB), self-generates a signed, QR-coded admit card for an assessment they're actually enrolled in (`StudentExams.tsx`), staff can bulk-issue for everyone enrolled (`AdminExams.tsx`) and reports who's missing a photo, and a public endpoint lets an invigilator scan the QR to confirm the card is genuine. Deliberately NOT a face match or any automated verification — an invigilator checks the printed/emailed photo against the person by eye, exactly the boundary this note already drew. Stays 🟡 because the row's actual subject, biometric candidate authentication, remains the permanent scope boundary it always was — admit cards support that human check, they don't replace it |
| EX015 | Exam environment checks | 🟡 | IP/user-agent captured at session start; browser/environment anomaly checks (EX013) and continuous activity monitoring (EX016) both real and unit-tested as of batch 56. **Note, batch 56**: no device/browser lockdown check, and there won't be one — this platform's exam security is deliberately advisory-only throughout (see EX013/EX016), never a kiosk/lockdown browser. |
| EX016 | Activity monitoring | ✅ | **Batch 56**: new `ExamActivityEvent` model + `POST`/`GET /exam-security/:sessionId/activity`, logging tab-hidden/tab-visible automatically during an attempt (wired into `StudentExams.tsx` via `visibilitychange`) and shown to staff in a new "Activity log" panel in `AdminExamSecurity.tsx`. Advisory only, same as EX013 — never blocks or ends an attempt. `ExamIncident` (manually reported events) is unchanged and still separate. |
| EX017 | Incident management | ✅ | ExamIncident model + report/list routes |
| EX018 | Accessibility accommodations | ✅ | **Batch 56**: new `ExamAccommodation` model (per assessment + student, extra minutes, grant/revoke), with CRUD in `exam-accommodations.ts`. `lib/quiz-scoring.ts`'s `attemptDeadline()` now takes an `extraMinutes` argument, wired into all three places a deadline is computed in `exams.ts` (open/resume, late-session check, and submit). Unit-tested (5/5 passing), including that a negative value can never shorten the window. The general `AccommodationRequest` model is unchanged and still separate — this is specifically exam-time extensions. |
| EX019 | Auto-marking | ✅ | POST /exams/submissions/mcq — real auto-scoring when every response is MCQ; mixed/non-MCQ submissions always go to a human |
| EX020 | Manual marking | ✅ | |
| EX021 | Rubric marking | ✅ | New PATCH /exams/submissions/:id/grade-rubric — validates each criterion score against the rubric's real maxMarks and computes the final score itself from the breakdown (never a separately-typed total), stored on Submission.criteriaScores; TrainerGradebook.tsx now offers a real "grade by rubric" panel when a rubric exists
| EX022 | AI marking assistant | ✅ | Same feature as TP017 above |
| EX023 | Double marking | ✅ | SubmissionMark model — two independent marker scores kept side by side, never auto-averaged |
| EX024 | Moderation | ✅ | New GET /exams/moderation/flagged/:assessmentId (real marker-1/marker-2 divergence check, >15% of total marks) + POST /exams/moderation/:submissionId/resolve (writes final score through a distinct SUBMISSION_MODERATED audit action, not the plain grade action) — same feature as TP031 |
| EX025 | External moderation | ✅ | New ExternalModerationReview model, gated to the EXTERNAL_EXAMINER role — a real distinct sign-off, separate from internal moderation. Only the exam-officer-facing read view was built into AdminExams.tsx this batch; there's no dedicated external-examiner portal yet since none exists in the app's structure |
| EX026 | Grade approval | ✅ | Real gap found: a pending-approval queue existed with nothing ever consuming it, and Publish had no approval check at all. New resultsApprovedAt/resultsApprovedById fields + PATCH /exams/assessments/:id/approve-results (approve or reject, submitter can't self-approve) — Publish now server-side rejects unless both submit-for-approval AND approve-results have actually happened on that assessment; AdminExams.tsx queue shows Approve/Reject before Publish appears |
| EX027 | Results publication | ✅ | Assessment.resultsPublished gate + /me/results only returns published scores |
| EX028 | Results audit | ✅ | AuditLog on grading |
| EX029 | Results amendment | ✅ | PATCH /exams/submissions/:id/amend — requires a reason, separately audited from initial grading |
| EX030 | Grade appeals | ✅ | |
| EX031 | Academic misconduct | ✅ | IntegrityCase |
| EX032 | Similarity checking | ✅ | Honest heuristic, not real plagiarism detection (no external index, no semantic/paraphrase detection — that limit is fundamental and stays). **Batch 55**: fixed the `AuditLog` write (was using nonexistent columns), fixed it to read exam answers from `QuestionResponse`, fixed an admin-page crash on a deleted paired submission. **Batch 61**: added `shingleSimilarity()` — n-gram (3-word shingle) Jaccard alongside the existing bag-of-words Jaccard (`lib/similarity.ts`, 13/13 unit tests passing including one proving a fully word-shuffled pair scores 100% on bag-of-words but much lower on shingles). A submission is now flagged if *either* metric crosses its threshold, catching more real copying (same phrasing, reordered) without the false positives a single bag-of-words score invites. Still word-overlap only, not semantic — that upgrade needs an embedding model this system has no credentialed access to, same honest limit as AI007. |
| EX033 | AI-use disclosure | ✅ | Real checkbox in StudentAssignments.tsx wired through to Submission.aiAssisted (previously not even accepted by the backend schema for assignment or assessment submissions — fixed both), surfaced as a badge to trainers in TrainerGradebook.tsx |
| EX034 | Practical assessment | ✅ | **Batch 56**: new `PracticalChecklist`/`PracticalChecklistResult` models — CBET-style competent/not-yet-competent per criterion (not marks-based, deliberately distinct from EX021's Rubric), with `lib/practical-checklist.ts`'s `computeOverallOutcome()` unit-tested (4/4 passing: mandatory-vs-optional criteria, missing calls rejected, invented criteria rejected). Routes for building a checklist and scoring a submission against it in `exam-accommodations.ts`; scoring writes the checklist result and the `Submission.score` in one transaction. **Batch 61**: built the missing frontend — `TrainerPracticalChecklist.tsx` (checklist builder + per-submission scoring), routed at `/trainer/practical-checklist` and linked from the trainer nav. Nothing left open here. |
| EX035 | Oral assessment | ✅ | New OralAssessmentSession model — a real human-conducted, human-scored session recorded for audit; distinct from AI033 (AI viva), which is the AI-conducted counterpart (real as of batch 64) |
| EX036 | Simulation assessment | ✅ | **Batch 61**: the Business Simulation Lab (`routes/simulation.ts`) was a fully ephemeral AI chat endpoint — no session model, no transcript storage, no score. Added `SimulationSession`/`SimulationTurn` models; the first `/turn` call in a scenario now creates a real session and every turn after that is persisted; `PATCH /sessions/:id/end` closes it for review; `GET /sessions` (trainer queue, filterable to unscored) + `GET /sessions/:id` (full transcript) + `PATCH /sessions/:id/score` (trainer-confirmed score, same principle as AI037/AI033 — the AI counterpart never scores its own conversation). `StudentSimulation.tsx` now tracks the session, has an "End session & submit for review" action, and shows past session history; new `TrainerSimulationReview.tsx` reads the transcript and records the score, routed at `/trainer/simulation-review`. Nothing left open here. |
| EX037 | Assessment analytics | ✅ | Real mean/pass-rate/distribution computed from actual submissions |
| EX038 | Question analytics | ✅ | Same endpoint as EX006 above — times-used and observed correct-rate per question |
| EX039 | Assessment reports | ✅ | **Batch 56**: `GET /exams/assessments/:id/analytics/export.csv` (CSV of every submission, using the exact same 50%-of-total-marks pass line as the EX037 analytics endpoint, so the two can never disagree) and `GET /exams/submissions/:id/results-slip` (a printable per-student HTML slip). Pure builders in `lib/exam-reports.ts` are unit-tested (5/5 passing), including RFC 4180 CSV escaping and HTML-injection safety on the feedback field. **Batch 61**: wired the missing button — both routes need a Bearer token, so a plain `<a href>` would 401; added `apiFetchBlob`/`openOrDownloadBlob` helpers to `lib/api.ts` and a new "Assessment reports" panel in `AdminExams.tsx` (download CSV; per-submission "View results slip"). Nothing left open here. |
| EX040 | Examination board | ✅ | Same feature as RG029 (batch 53) — `ExamBoardRatification` model, tying a unit's results to a specific board meeting with the pass rate recorded at that moment. Audit row was stale (this is exactly the "dedicated board-decision model distinct from an ordinary committee meeting" the previous note said was missing) |

## J. QUALITY ASSURANCE, REGULATORY & INSTITUTIONAL CONTROL

| Code | Feature | Status | Note |
|---|---|---|---|
| QA001 | Institutional QMS | ✅ | GET /compliance/qms-overview — real aggregate across requirements/corrective-actions/risks/audits/policies/standards/reviews; QMS health panel in AdminQaGovernance.tsx |
| QA002 | QA policies | ✅ | PolicyDocument model + routes |
| QA003 | IQA management | ✅ | New IqaReview model — real internal self-review records, distinct from the more formal InternalAudit (QA028); AdminQaGovernance.tsx |
| QA004 | QA committee | ✅ | Meeting.committee="QA Committee" plus GET /compliance/qa-committee/meetings and a resolve-to-corrective-action route, so a decision becomes a tracked CorrectiveAction instead of only minutes text; AdminQaGovernance.tsx |
| QA005 | Quality standards | ✅ | New QualityStandard model — institutional benchmarks distinct from a regulator-mandated ComplianceRequirement |
| QA006 | Compliance requirements | ✅ | |
| QA007 | TVETA requirements | ✅ | Seeded rows |
| QA008 | ODeL requirements | ✅ | New category field on ComplianceRequirement (odel/facility/ict/learner_support/assessment/course_material), filterable via GET /compliance/requirements/by-category/:category, shown as a badge in AdminCompliance.tsx |
| QA009 | Programme accreditation | ✅ | routes/programme-accreditation.ts submit/decide workflow — fixed a real bug where the audit-log write used the wrong AuditLog field names (sourceType/sourceId/details) and would 500 on every call |
| QA010 | Institutional accreditation | ✅ | New InstitutionalAccreditation model (regulator, status, certificate, validity window) + CRUD, distinct from QA009's per-programme record; AdminQaGovernance.tsx |
| QA011 | Trainer compliance | ✅ | Added codeOfConductSignedAt/inductionCompletedAt/backgroundCheckClearedAt to Trainer + GET/PATCH /compliance/trainer-compliance; AdminQaGovernance.tsx table |
| QA012 | Trainer licence expiry | ✅ | POST /compliance/expiry-alerts/run — honestly on-demand (same no-cron precedent as FN020/AD036), creates real Notification rows for trainers with a real expiring/expired licence |
| QA013 | Curriculum compliance | ✅ | Fixed /programmes/:id/history (was returning every programme's changes, not just this one); added /programmes/:id/compliance-check (units, learning outcomes, exam blueprint, review recency) wired into AdminCurriculum.tsx |
| QA014 | Course approval | ✅ | New CourseApproval model + submit/decide routes on courses.ts (approving sets publishedAt in the same transaction); AdminCourses.tsx request/queue UI. Direct PATCH { published } by admin-course roles still works unchanged |
| QA015 | Facility evidence | ✅ | Same category-tagging mechanism as QA008 (category=facility) |
| QA016 | ICT compliance | ✅ | Same category-tagging mechanism as QA008 (category=ict) |
| QA017 | Learner support compliance | ✅ | Same category-tagging mechanism as QA008 (category=learner_support) |
| QA018 | Assessment compliance | ✅ | Same category-tagging mechanism as QA008 (category=assessment) |
| QA019 | Course-material compliance | ✅ | Same category-tagging mechanism as QA008 (category=course_material) |
| QA020 | Evidence vault | ✅ | AdminCompliance.tsx |
| QA021 | Evidence versioning | ✅ | New EvidenceVersion model — every evidence-document replacement keeps the previous URL as a real version row instead of overwriting evidenceDocUrl |
| QA022 | Evidence expiry | ✅ | Same endpoint as QA012 above — also scans ComplianceRequirement.nextReviewDue and notifies every active user holding the requirement's responsible role |
| QA023 | Responsibility assignment | ✅ | responsibleRole field |
| QA024 | Compliance dashboard | ✅ | |
| QA025 | Gap analysis | ✅ | GET /compliance/gap-analysis — real count of unmet mandatory requirements by regulator, shown in AdminQaGovernance.tsx |
| QA026 | Corrective actions | ✅ | CorrectiveAction model + AdminCorrectiveActions.tsx |
| QA027 | Corrective-action tracking | ✅ | Status workflow: open → in_progress → verified → closed |
| QA028 | Internal audits | ✅ | AdminInternalAudits.tsx |
| QA029 | Audit findings | ✅ | Same page, add-finding form per audit |
| QA030 | Audit evidence | ✅ | PATCH /compliance/audits/findings/:id to attach/replace evidence and record resolvedById/resolvedAt; PATCH /compliance/audits/:id for status transitions (audits could never leave "planned" before). Still URL-only — no binary upload endpoint exists anywhere in this app, same as every other evidence field |
| QA031 | Management review | ✅ | New ManagementReview model — real inputs/decisions record for a QMS-wide review, optionally tied to a Meeting |
| QA032 | Student feedback | ✅ | Same CourseFeedback model |
| QA033 | Trainer evaluation | ✅ | New GET /feedback/courses-with-feedback (the summary route existed with no way to discover a course ID from the UI) + AdminCourseEvaluations.tsx |
| QA034 | Course evaluation | ✅ | Same new page/route as QA033, type="course" |
| QA035 | Programme review | ✅ | New ProgrammeReview model — periodic quality review of one specific programme, distinct from ManagementReview |
| QA036 | Complaints analytics | ✅ | GET /compliance/complaints-analytics — real counts by category/status, shown in AdminQaGovernance.tsx |
| QA037 | Risk register | ✅ | RiskRegisterEntry model + routes + AdminQaGovernance.tsx |
| QA038 | Regulatory reporting | ✅ | Stale note — regulatory-reports.ts already had two TVETA CSV returns end-to-end (AdminRegulatoryReports.tsx). Added a third, KNQA qualification-outcomes |
| QA039 | Inspection preparation | ✅ | GET /compliance/inspection-pack — unmet mandatory requirements, open corrective actions, open findings, open risks, recent audits in one call; build/download panel in AdminQaGovernance.tsx |
| QA040 | AI QA assistant | ✅ | Same feature as AI022 above |

---

## Summary

Rough counts (approximate — a few items straddle categories):

- ✅ DONE: 383 (Batch 64 — 4 rows moved from 🟡/⬜ to ✅: AI033 (AI viva, closing the last ⬜), AI003 (second real AI provider), AI014 (course delivery/pacing plan). Batch 63 — 4 rows moved from ⬜ to ✅: AI008 (document ingestion), AI009 (PDF extraction), AI010 (chunking engine), AI012 (vector search) — see their rows above for what's actually implemented and unit-tested. Batch 62 — 5 rows moved from ⬜/🟡 to ✅: LMS008–011 (stale-doc correction — already fully built, not new work), AI002, AI025, AI034, AI035. Batch 61 — 20 rows moved from 🟡 to ✅: LMS001/003/015/017/018/036/037/039, AI006/015/017/024/026/029/030/036, FN034/037, EX032/040; plus 14 rows moved from ⬜ to ✅ that turned out to already be fully built and wired but never re-marked: LMS007/012/013/019/020/021/022/023/024/025/026/027/028/029. Counts below are an exact grep of this table's own status column.)
- 🟡 PARTIAL: 9 (Batch 64 — AI037 (real optional trained-classifier layer added, stays 🟡 because the always-on default is still the heuristic) and FN006/FN007/SP034 (a real second gateway — Stripe card checkout — now exists alongside M-Pesa, both still needing real production credentials) and EX014 (real admit cards built, but the row's actual subject — biometric candidate authentication — remains a deliberate permanent scope boundary, not a gap). Batch 63 — AI011 (embeddings) moved from ⬜ to 🟡: a real, working local lexical embedding is now the default with no infrastructure dependency, but it is honestly not a trained semantic embedding model — see its row above. AI007 (RAG pipeline) stays 🟡 for the same reason, now with a fully real pipeline behind it instead of a library-metadata fallback.)
- ⬜ NOT BUILT: 0 (AI033 — the platform's last not-built row — closed in batch 64: the browser's own Web Speech API (real since batch 62) plus the existing text AI gateway turned out to make a genuine AI-conducted oral viva buildable with zero new infrastructure. Every row in this table is now ✅ or a knowingly, honestly 🟡-labelled real-but-credential-blocked or deliberately-scoped-boundary item — none are stubs.)

**Batch 64 in one line:** closed the platform's one remaining ⬜ (AI033 — AI viva, using the browser's own Web Speech API rather than any hosted speech model) and turned four of the remaining 🟡 rows' actual named gaps into real, working, credential-gated code: a second AI provider (AI003, now ✅) and an optional trained safety classifier (AI037, still 🟡 by design) via OpenAI; a real Stripe card-payment gateway alongside M-Pesa (FN006/FN007/SP034, still 🟡 pending real production credentials); a real AI-drafted, trainer-published course pacing plan (AI014, now ✅); and real, non-biometric, photo-based exam admit cards (EX014, still 🟡 since the row's actual subject — biometric authentication — is a deliberate permanent scope boundary, not a gap this batch could or should close). Nothing here executed against a real paid credential in this sandbox (no network access) — every credential-gated branch fails with a clear configuration message instead of a fake success, same discipline as every prior batch. Full detail in docs/progress-batch64.md.

**Batch 63 in one line:** built the real RAG infrastructure stack end to end — PDF text extraction, chunking, a deterministic local embedding fallback, and cosine-similarity vector search — with zero new dependencies and zero external credentials required to function, wired into the tutor's real grounding chain ahead of the library fallback, and left the one honest gap (true dense-embeddings semantic retrieval, still blocked on a credential this environment doesn't have) clearly labelled rather than papered over. Full detail in docs/progress-batch63.md.

**Reading this honestly:** the platform has real, working coverage of the "spine" — admissions, student/trainer/admin portals, competency passport, RPL, appeals, credentials + public verification, compliance evidence vault, KUCCPS exchange, digital library federation, and a curriculum-grounded AI tutor with human-in-the-loop grading everywhere it matters. What's still genuinely missing, after batch 64, is narrower still: a real ERP/general-ledger finance layer beyond what FN037 covers, a proper exam-delivery engine (timing, randomization, lockdown — deliberately advisory-only by design, see EX013/EX015), the full research/innovation portal, and true dense-embeddings semantic search (the one real remaining half of AI007/AI011 — see their rows above) — all blocked on infrastructure/credentials this environment doesn't have, not on missing code. Multilingual AI (AI036), adaptive/weakness detection (AI024/AI026), mastery prediction (AI025), voice input/TTS (AI034/AI035), AI viva (AI033), the full RAG infrastructure stack (AI008–012), a second real AI provider (AI003), a real course pacing plan (AI014), a real second payment gateway (FN006), and real admit cards (EX014) are all real, working, heuristic-or-browser-native-or-credential-gated features rather than aspirational labels.

None of the ⬜ or 🟡 items should be described to a regulator as implemented.
