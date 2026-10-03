# Master-prompt checklist (batch 75)

Legend: `[x]` DONE this batch · `[~]` PARTIAL (something real shipped, gap stated) · `[e]` EXISTS (already in the codebase, found by inspection, not changed and not re-verified) · `[ ]` TODO

**Nothing here is marked VERIFIED.** The sandbox had no npm access, no Postgres and no node_modules: only the pure-logic tests ran (17/17 pass). Everything touching Express, Prisma or the browser is written and syntax-checked but not executed. Titles are shortened from the master prompt; numbering follows it (KFX-049…055 are new defects found this batch).

**Totals (429 codes, after batch 75):** DONE 71 · PARTIAL 123 · EXISTS 51 · TODO 184

## KFX — Bug fixes (55)

- [ ] **KFX-001** Auth failures
- [ ] **KFX-002** Session expiry/renewal
- [ ] **KFX-003** Logout invalidation
- [~] **KFX-004** Password reset/recovery — forgot/reset/change-password + hashed single-use tokens + UI (auth.ts, ForgotPassword.tsx). Existing sessions are NOT revoked on reset
- [ ] **KFX-005** Registration/activation/verify
- [ ] **KFX-006** Role assignment
- [ ] **KFX-007** Auth state front/back
- [ ] **KFX-008** Protected routes
- [x] **KFX-009** Lockout/failed-login tracking — DB-backed account+IP lockout (lib/login-throttle.ts, auth.ts); lockout math unit-tested
- [ ] **KFX-010** Concurrent auth races
- [ ] **KFX-011** Notifications not generated
- [~] **KFX-012** Notifications not delivered — unsent notifications are now visible per channel (Monitoring); actual email/SMS delivery is still not implemented
- [ ] **KFX-013** Wrong recipients
- [x] **KFX-014** Unread counts — unread count endpoint + bell badge in every portal header (polls every 60 s while visible), mark-all-read
- [ ] **KFX-015** Duplicate notifications
- [ ] **KFX-016** Delivery retry
- [~] **KFX-017** Preferences/channels — see KFEAT-082
- [ ] **KFX-018** Cross-device sync
- [ ] **KFX-019** Broken relationships
- [ ] **KFX-020** Inconsistent FKs
- [~] **KFX-021** Duplicate records on repeat — opt-in Idempotency-Key middleware (replay, mismatch 422, in-flight 409, stale reclaim) on ticket create, manual payment, application submit, data requests; keys kept 2 days
- [ ] **KFX-022** Partial-write transactions
- [ ] **KFX-023** Pagination/sort/filter
- [ ] **KFX-024** Grade calc/sync
- [ ] **KFX-025** Enrollment/registration
- [~] **KFX-026** Finance/invoice/payment sync — POST /insights/reconcile-invoices recomputes paid amount and status from non-reversed payments: preview by default, ?apply=true fixes in one transaction and audit-logs; leaves "overdue" alone while an invoice is still unpaid and past due, so it does not fight the overdue sweep
- [ ] **KFX-027** Migration compatibility
- [ ] **KFX-028** Timestamps/timezones
- [~] **KFX-029** Inconsistent API shapes — all thrown/validation errors now share one JSON shape; legacy ad-hoc res.json errors unchanged (still {message})
- [ ] **KFX-030** Missing request validation
- [~] **KFX-031** HTTP status codes — JSON 404 for /api, Prisma P2002/P2025/P2003 → 409/404/409, bad JSON → 400, too large → 413
- [ ] **KFX-032** API timeout/retry
- [ ] **KFX-033** Duplicate webhooks
- [ ] **KFX-034** Moodle errors
- [ ] **KFX-035** VBL errors
- [ ] **KFX-036** AI gateway errors
- [ ] **KFX-037** Payment integration
- [ ] **KFX-038** CORS/upload/cross-module
- [ ] **KFX-039** Broken navigation
- [ ] **KFX-040** Forms not saving
- [~] **KFX-041** Loading/empty/error states — loading state consistent across 34 pages; empty/error states not yet
- [ ] **KFX-042** Stale dashboards
- [ ] **KFX-043** Table/filter/search
- [ ] **KFX-044** Responsive layout
- [ ] **KFX-045** Role page exposure
- [ ] **KFX-046** File up/download/preview
- [ ] **KFX-047** State sync after update
- [~] **KFX-048** Duplicate submissions — Idempotency-Key now sent by the student ticket and data-request forms, the finance record-payment form and the public application form (key renewed when the form changes); other forms still can double-submit
- [x] **KFX-049** Async rejection crashed API — NEW: async route rejections crashed the process (Express 4) — Layer patch forwards to error handler
- [x] **KFX-050** Notification read IDOR — NEW: PATCH /notifications/:id/read had no ownership check (IDOR) and 500'd on missing id
- [x] **KFX-051** Unread-count endpoint — NEW: no unread-count / mark-all-read source of truth
- [x] **KFX-052** HTML 404 on /api — NEW: unknown /api routes returned HTML — now JSON 404 with requestId
- [x] **KFX-053** AI calls without timeout — NEW: AI provider fetches had no timeout (AI_TIMEOUT_MS, default 60 s)
- [x] **KFX-054** verifyDocument throws on bad sig — NEW: verifyDocument threw (500) on a wrong-length signature — public verify endpoint
- [x] **KFX-055** Login misleading error hint — NEW: Login appended 'Is the backend running?' to every error incl. lockouts/wrong password

## KSEC — Security (30)

- [x] **KSEC-001** No fallback secrets — credential signing key had a public fallback → derived from JWT_SECRET in prod; JWT fallback already fixed in b66
- [x] **KSEC-002** Env validation — lib/env.ts + boot-check: production refuses weak JWT_SECRET, missing FRONTEND_ORIGIN, bad numeric vars
- [x] **KSEC-003** Password hashing/policy — policy (10+ chars, 3 classes, common/name/email) on user creation, reset, change; bcrypt cost 12 (env). Import route still writes empty hash
- [ ] **KSEC-004** Session mgmt/rotation
- [x] **KSEC-005** Login rate limit — see KFX-009; 429 + Retry-After; unknown emails throttled identically (no enumeration)
- [e] **KSEC-006** Server-side RBAC — requireRole + role-permissions route — not re-audited this batch
- [~] **KSEC-007** Object-level authorization — audit-routes.mjs --ownership now reports 0 auth-only :id routes that ignore the caller. Batch 70 gated 5 course-scoped reads by enrolment/teaching (assignments, study groups, forums, announcements, Moodle launch) and reviewed 9 catalogue reads by hand (allowlisted with a reason). The audit only sees handlers that mention the caller; it cannot judge whether a check is sufficient
- [~] **KSEC-008** IDOR prevention — fixed for notifications only; other endpoints not yet audited
- [~] **KSEC-009** Audit all endpoints authn/z — audit-routes.mjs inventories 695 routes by guard; CI fails on a new unguarded route. Checks that a guard exists, not that it is the right one
- [~] **KSEC-010** SQL injection — audit: every raw query in the backend is a tagged-template $queryRaw (parameterised); static test fails if $queryRawUnsafe / $executeRawUnsafe / Prisma.raw appear; not a penetration test
- [~] **KSEC-011** XSS — audit: no dangerouslySetInnerHTML / innerHTML / eval in the frontend; static test guards it; server-side output encoding and CSP not reviewed here
- [~] **KSEC-012** CSRF — auth is an Authorization-header bearer token (no session cookie), so cross-site form CSRF does not apply to the API; the Moodle SSO cookie path was not reviewed
- [x] **KSEC-013** CORS policy — FRONTEND_ORIGIN multi-origin exact match, no wildcard (lib/cors-origins.ts)
- [x] **KSEC-014** Security headers/CSP — nginx CSP/nosniff/referrer/frame/permissions headers + helmet on API
- [~] **KSEC-015** Upload validation — media-policy.ts already checks extension + magic bytes + size for media/documents; no change this batch, other upload routes not re-audited
- [ ] **KSEC-016** Malicious upload/access
- [~] **KSEC-017** SSRF — guard now wired into the DSpace / Islandora / OAI-PMH fetches (lib/safe-fetch.ts: no redirects, 10 s timeout) and link-check; fixed public sources (arXiv, Crossref…), Moodle and VBL calls are not guarded
- [x] **KSEC-018** Output encoding/validation — sanitize-input middleware: control chars, proto-pollution keys, depth limit on every JSON body
- [e] **KSEC-019** Webhook signature/replay — VBL/Moodle/card webhook signing exists (integration/signing.ts, moodle/webhooks.ts)
- [ ] **KSEC-020** Encryption transit/rest
- [x] **KSEC-021** No secrets in logs — logger redacts secrets; access log strips ?token=… ; morgan('dev') removed
- [e] **KSEC-022** Admin audit trails — AuditLog model written by login/user/reset/VBL review flows — coverage not audited
- [x] **KSEC-023** Recovery/activation tokens — reset tokens: 256-bit, SHA-256 at rest, 30 min, single-use via conditional UPDATE, sibling tokens killed
- [ ] **KSEC-024** Protect student/finance records
- [x] **KSEC-025** Dependency scanning — CI job: npm audit --omit=dev --audit-level=high (config only — not run here)
- [x] **KSEC-026** Security tests in CI — GitHub Actions ci.yml runs prisma validate, tsc, tests, db tests, audit (config only — not run here)
- [~] **KSEC-027** Security event alerting — securityEvent() emits greppable lockout/reset events; no alert routing
- [~] **KSEC-028** Session timeout/controls — SESSION_TTL_MINUTES configurable; no idle timeout / revocation
- [ ] **KSEC-029** Privilege-escalation payloads
- [ ] **KSEC-030** Privileged-function audit

## KPERF — Performance (20)

- [ ] **KPERF-001** Slow endpoints
- [ ] **KPERF-002** N+1 queries
- [~] **KPERF-003** DB indexes — indexes on FailedLoginAttempt(email,attemptedAt / ipAddress,attemptedAt); no wider query-pattern review
- [~] **KPERF-004** Pagination — opt-in ?page/?pageSize + X-Total-Count on users, students and audit-log lists (default behaviour unchanged); other lists untouched
- [~] **KPERF-005** Caching — lib/ttl-cache.ts now serves GET /insights/finance-report (60 s); other endpoints not cached
- [ ] **KPERF-006** Redis/shared cache
- [e] **KPERF-007** Shared rate-limit store — integration rate limiter is Postgres-backed (b66); login lockout is DB-backed too
- [e] **KPERF-008** Background jobs — integration scheduler/outbox (b66); no general job queue
- [ ] **KPERF-009** Non-blocking email/notify
- [x] **KPERF-010** Bundle/lazy loading — 144 pages lazy-loaded via React.lazy + Suspense; vendor chunk in vite.config (never built here)
- [ ] **KPERF-011** Large tables/dashboards
- [x] **KPERF-012** Connection pooling — DB_POOL_SIZE / DB_POOL_TIMEOUT_S applied to DATABASE_URL (lib/prisma-url.ts, tested)
- [ ] **KPERF-013** Memory leaks
- [x] **KPERF-014** AI concurrency control — AI calls go through a bounded ConcurrencyLimiter (AI_MAX_CONCURRENCY)
- [~] **KPERF-015** Retry/timeout/circuit breaker — timeouts on AI calls and library-repository fetches; lib/resilience.ts retry+CircuitBreaker still not wired to Moodle/VBL
- [ ] **KPERF-016** Horizontal scaling
- [x] **KPERF-017** CDN/static delivery — nginx gzip, 1-year cache on /assets, no-cache index.html
- [~] **KPERF-018** Quotas/backpressure — AI queue is bounded → fails fast with 'overloaded'; other high-volume paths untouched
- [ ] **KPERF-019** Bulk ops optimisation
- [ ] **KPERF-020** Load testing

## KARC — Architecture (13)

- [x] **KARC-001** Architecture map — docs/architecture.md generated by backend/scripts/gen-arch-docs.mjs from source: 88 route modules, 215 models
- [ ] **KARC-002** Resolve weaknesses
- [ ] **KARC-003** Dedupe business logic
- [ ] **KARC-004** Service/repo/validation patterns
- [x] **KARC-005** Consistent error handling — middleware/error-handler.ts: HttpError, mapError, JSON 404, async forwarding, process handlers
- [ ] **KARC-006** Layer boundaries
- [ ] **KARC-007** Remove unused code
- [ ] **KARC-008** Document changes
- [~] **KARC-009** System architecture docs — generated architecture doc: route modules, mounts and handler counts; no diagrams
- [~] **KARC-010** Module dependency docs — generated table of which route modules use each lib; lib-to-lib dependencies not mapped
- [~] **KARC-011** DB structure docs — generated model list with field and relation counts; no column-level dictionary
- [~] **KARC-012** Changelog — changelog = docs/progress-batchNN.md files; no consolidated CHANGELOG
- [ ] **KARC-013** Code-level implementation report

## KDB — Database (10)

- [ ] **KDB-001** Schema audit
- [ ] **KDB-002** Indexes/constraints/transactions
- [ ] **KDB-003** Version-controlled migrations
- [ ] **KDB-004** Migration rollback
- [~] **KDB-005** Health checks/monitoring — /ops/health/deps reports DB latency; /api/ready exists; no pool monitoring
- [ ] **KDB-006** Backup scheduling
- [ ] **KDB-007** Restore testing
- [~] **KDB-008** Retention/archival — see KDATA-003 (operational tables only; no archival of academic data)
- [ ] **KDB-009** Reporting query optimisation
- [~] **KDB-010** Idempotent operations — see KFX-021; other write endpoints are not idempotent

## KDATA — Data governance (10)

- [x] **KDATA-001** Data classification — /ops/data-classification derives classes from Prisma.dmmf + UI tab; heuristic, needs DPO review
- [ ] **KDATA-002** Data minimisation
- [~] **KDATA-003** Retention/deletion workflows — retention-purge job deletes old failed logins, expired/used reset tokens, and read notifications >1 y (windows via RETENTION_* env); preview first; nothing touches academic, finance or audit records
- [ ] **KDATA-004** Student record handling
- [x] **KDATA-005** Privacy notices/controls — privacy notice banner + acknowledge button on My Record, acknowledgement stored per version; not forced at login
- [~] **KDATA-006** Data-access audit logs — staff reads of registry student records (academic-history, standing, record-changes, enrolment-verification) and the student list are audit-logged (STUDENT_RECORD_VIEWED); GET /insights/record-access summarises 30 days; other student-data endpoints not logged
- [x] **KDATA-007** DSAR handling — students raise access/correction/erasure/restriction/objection requests (one open per type, idempotent), get an in-app answer when closed; staff work them in Insights → Privacy with deadlines, overdue flags, mandatory outcome note and audit log. Nothing is deleted automatically, and the response period (DATA_REQUEST_RESPONSE_DAYS, default 14) is configuration to confirm with counsel
- [ ] **KDATA-008** Kenyan DP law review
- [~] **KDATA-009** Export controls — self export and pseudonymised export are audit-logged; other existing exports were not reviewed
- [x] **KDATA-010** Pseudonymised analytics — pseudonymised-results now needs its own ANALYTICS_PSEUDONYM_SECRET in production (503 with a clear message otherwise); dev derives a separate key, never the raw JWT secret

## KAPI — API (3)

- [~] **KAPI-001** OpenAPI docs — docs/openapi.json generated by scripts/gen-openapi.mjs (paths, methods, path params, auth requirement exact; request/response bodies are generic objects)
- [x] **KAPI-002** Auth/error format docs — bearer auth and the shared ErrorBody {message, code, requestId, details} are defined in docs/openapi.json
- [ ] **KAPI-003** Integration contract docs

## KUX — UI/UX (15)

- [ ] **KUX-001** Design system
- [ ] **KUX-002** Typography/colour tokens
- [ ] **KUX-003** Student dashboards
- [ ] **KUX-004** Trainer dashboards
- [ ] **KUX-005** Admin dashboards
- [x] **KUX-006** Navigation/breadcrumbs — Breadcrumbs derived from URL, shown in PortalShell
- [~] **KUX-007** Inline form validation — FormField component (label, required marker, hint, inline error announced to screen readers) used on the student ticket / data-request forms and the service-notice form; other forms not converted
- [~] **KUX-008** Loading/empty/error states — LoadingState now used by 34 pages (41 spots); empty/error states still mostly ad hoc
- [x] **KUX-009** Notification centre — bell dropdown plus a full-page notification centre (/notifications): paged, unread and channel filters, mark read / mark all read
- [ ] **KUX-010** Responsive behaviour
- [ ] **KUX-011** Large tables/search
- [~] **KUX-012** Dark mode — light/dark toggle in every portal header, colour tokens as CSS variables; pages with hard-coded Tailwind colours (reds, golds) and the public site were not audited for contrast
- [ ] **KUX-013** Dashboard widgets
- [~] **KUX-014** Global search — header search across programmes, library, own units (students), own courses (trainers) and students (registry/finance/leadership roles); substring match, results open list pages
- [~] **KUX-015** Critical-action confirmations — ConfirmDialog via new useConfirm hook on quiz/module/lesson delete, class cancel, transcript issue; unsaved-changes, VBL revoke/remove and version-restore still use window.confirm

## KACC — Accessibility (10)

- [ ] **KACC-001** WCAG 2.2 AA audit
- [x] **KACC-002** Keyboard navigation — skip-to-content links in PortalShell and PublicLayout; <main id=main-content>
- [ ] **KACC-003** Contrast
- [~] **KACC-004** Labels/form validation — see KUX-007: aria-invalid + aria-describedby wiring exists in FormField; only those forms use it so far
- [~] **KACC-005** Screen-reader semantics — adds role=status loading announcements across 34 pages; no site-wide audit
- [~] **KACC-006** Accessible charts/tables/dialogs — confirm dialogs on five destructive actions are accessible; tables/charts not audited
- [e] **KACC-007** Reduced motion — prefers-reduced-motion rule already in index.css
- [e] **KACC-008** Low-bandwidth support — lib/lowBandwidth.tsx exists
- [e] **KACC-009** Focus visibility — :focus-visible outline already in index.css
- [ ] **KACC-010** Automated a11y scans

## KFEAT — Features (125)

- [~] **KFEAT-001** Unified student profile — GET /self/profile now has a page: student My Record (/student/record); no editing of profile fields
- [x] **KFEAT-002** Progression tracking — GET /api/self/progression — units completed, credits, per-semester, units to repeat
- [~] **KFEAT-003** Student documents centre — documents list shown on My Record with verify links; no upload/preview here
- [x] **KFEAT-004** Self-service centre — My Record has needs-attention counts and quick links to the self-service pages
- [~] **KFEAT-005** Status lifecycle — allowed-transition rules (lib/batch72.ts) + GET /insights/status-lifecycle counts; changes are not yet enforced by the registry workflow
- [~] **KFEAT-006** Support-case tracking — GET /support/tickets/mine with status/priority/resolved time + raise/rate on the student Account page; no reply thread
- [~] **KFEAT-007** Engagement analytics — GET /self/engagement: 8-week study minutes and lessons completed, active days, streak — the student's own view only
- [~] **KFEAT-008** Transcripts + verification — computed transcript by semester shown on My Record (unofficial GPA); issued transcripts are on the registry side
- [x] **KFEAT-009** Personal academic calendar — GET /api/self/calendar.ics — weekly timetable + academic calendar events (Africa/Nairobi)
- [~] **KFEAT-010** Progression alerts — alerts shown on My Record; still pulled on page load, no push or scheduled alerts
- [ ] **KFEAT-011** Course workspace
- [ ] **KFEAT-012** Competency mapping
- [e] **KFEAT-013** Learning paths — routes/learning-paths.ts + AdminLearningPaths
- [ ] **KFEAT-014** Course dashboard
- [ ] **KFEAT-015** Resource versioning/approval
- [ ] **KFEAT-016** Offline-tolerant learning
- [e] **KFEAT-017** Discussion moderation — forums.ts + CourseForum.tsx (moderation/reporting not verified)
- [ ] **KFEAT-018** Submission version history
- [ ] **KFEAT-019** Learning analytics
- [~] **KFEAT-020** Cross-course workload — GET /self/workload: assignments (not yet submitted) and scheduled assessments due in 21 days, grouped by week; no effort estimates
- [ ] **KFEAT-021** Assessment approval workflow
- [ ] **KFEAT-022** Exam scheduling/allocation
- [ ] **KFEAT-023** Secure assessment delivery
- [e] **KFEAT-024** Accommodations — exam-accommodations.ts
- [e] **KFEAT-025** Rubric/evidence assessment — rubrics.ts
- [e] **KFEAT-026** Second marking/approval — results-approval.ts + AdminResultsApproval
- [~] **KFEAT-027** Exam incident reporting — GET /insights/exam-incidents — counts by status + recent list; no reporting form or workflow added
- [e] **KFEAT-028** Auto-grading + review — quiz-scoring.ts auto-marking of mcq
- [ ] **KFEAT-029** Grade release scheduling
- [x] **KFEAT-030** Assessment analytics — Insights → Assessments: pick an assessment, see mean/median/quartiles/std dev/pass rate and a score histogram; trainers limited to their courses; whole-assessment statistics only (no per-question analysis)
- [e] **KFEAT-031** Competency framework — competency.ts
- [ ] **KFEAT-032** Competency mapping to courses/assessments
- [e] **KFEAT-033** Evidence portfolios — CompetencyEvidence + StudentPassport (SP022)
- [ ] **KFEAT-034** Trainer competency verification
- [ ] **KFEAT-035** Practical assessment records
- [~] **KFEAT-036** Competency dashboards — GET /insights/competency — levels per competency with achieved %; no page
- [ ] **KFEAT-037** Reassessment/remediation
- [ ] **KFEAT-038** Attachment evidence tracking
- [ ] **KFEAT-039** Supervisor feedback
- [~] **KFEAT-040** Competency reports/exports — GET /insights/competency.csv (formula-injection safe, first 5000 rows); competency report only
- [x] **KFEAT-041** Fee-account dashboard — GET /api/self/fee-account (outstanding, next due, holds, per-invoice bucket) + StudentAccount page
- [e] **KFEAT-042** Fee structures — finance-support.ts feeStructureRouter + AdminFeeStructure
- [x] **KFEAT-043** Invoices/statements — GET /api/self/statement (JSON or ?format=csv) with running balance; reversed payments excluded
- [~] **KFEAT-044** Payment reconciliation — invoice↔payment reconciliation only; no bank or M-Pesa statement matching
- [~] **KFEAT-045** Financial approvals — refund approval now has an amount limit (see KFEAT-052); other finance approvals unchanged
- [ ] **KFEAT-046** Payment allocation/adjustments
- [e] **KFEAT-047** Scholarships/bursaries — scholarshipsRouter
- [ ] **KFEAT-048** Refunds/credit notes
- [~] **KFEAT-049** Finance audit/reports — GET /insights/finance-report — ageing buckets, collections by method/month (6 months), refunds by status; ?format=csv gives ageing only; cached 60 s
- [~] **KFEAT-050** Payment reminders — POST /insights/reminders/fees plus a daily scheduler (REMINDER_SCHEDULER_ENABLED=true, REMINDER_HOUR_UTC). In-app only, honours notification preferences, de-duplicated 7 days, job runs recorded; no email/SMS delivery
- [x] **KFEAT-051** Finance dashboards — GET /api/insights/finance-dashboard + Admin → Insights & Reminders
- [~] **KFEAT-052** Duty segregation/limits — refund approvals above setting finance.limits.refundApprovalLimitKes need Principal or Super Admin (0 = no limit, the default); requester already could not approve own refund; no limits on other actions
- [x] **KFEAT-053** Financial exception alerts — GET /ops/financial-exceptions (duplicate payments, overpaid, drift, overdue) + admin UI tab; detection only
- [~] **KFEAT-054** Idempotent payment integration — Idempotency-Key support on manual payment recording; gateway callbacks were already de-duplicated by unique payment reference. Not applied to the STK-push/card checkout starters
- [e] **KFEAT-055** Budgets/expenditure — budget.ts + AdminBudgets
- [~] **KFEAT-056** Operations dashboard — Insights → Operations: ten plain status counts (applications, refunds, amendments, credit transfers, counselling, tickets, overdue tasks, data requests, overdue invoices, holds); no drill-through lists or SLAs
- [e] **KFEAT-057** Role/permission mgmt — role-permissions.ts + AdminRolePermissions
- [~] **KFEAT-058** Advanced reporting — GET /insights/student-register.csv (first 5000 students) joins the finance, competency and issuance exports; no report builder or scheduling
- [~] **KFEAT-059** Configurable KPIs — Insights → KPIs: collection rate, retention, pass rate, open tickets vs targets edited in System Settings (kpi.targets); the KPI list itself is fixed
- [x] **KFEAT-060** Retention/progression reports — GET /api/insights/retention by programme+intake (graduates excluded from base)
- [~] **KFEAT-061** Course performance analytics — GET /api/insights/course-performance — average and pass rate from graded submissions
- [~] **KFEAT-062** Task assignment/escalation — daily task-escalation job: assignee notified when overdue, assigner after a week; in-app only, every 3 days at most; no reassignment or manager chain
- [ ] **KFEAT-063** Approval automation
- [e] **KFEAT-064** Academic calendars — AdminAcademicCalendar + calendarRouter
- [ ] **KFEAT-065** Targeted announcements
- [x] **KFEAT-066** System configuration/flags — flag store + editor + public API + useFlag; ui.global-search and ui.theme-toggle are switched by flags today (unset = on)
- [~] **KFEAT-067** Admin/security audit dashboards — Insights → Security: failed sign-ins per day/reason (accounts masked), most active IPs, audit-log actions; 14-day window, counts only, no alerting
- [~] **KFEAT-068** Bulk import/export — data-import.ts / data-export.ts exist; preview/error-report not verified
- [x] **KFEAT-069** Data-quality/duplicate detection — GET /ops/duplicates/students + admin UI tab (review only, never auto-merges)
- [~] **KFEAT-070** Branding/templates — branding applied in the portal shell: initials, footer text and primary colour (light mode only, ignored if too light for text contrast); not applied to the public site, emails or generated documents
- [ ] **KFEAT-071** Multi-department/campus
- [ ] **KFEAT-072** Delegated approvals
- [~] **KFEAT-073** Academic rules config — academic.rules setting (pass mark, late penalty, default attempts); only the pass mark is used, by reports/KPIs — grading and submissions still use the code constants
- [~] **KFEAT-074** Scheduled reports — scheduled-reports job sends subscribers an in-app 'ready' notice with the current row count (daily/weekly/monthly); the data is not attached or emailed, and recipients who lost report access are skipped
- [x] **KFEAT-075** Service-status overview — GET /ops/health/deps + Service status tab (configured ≠ reachable is stated in the UI)
- [ ] **KFEAT-076** Help/support portal
- [~] **KFEAT-077** Ticket routing/escalation — priority (low..urgent) and staff assignment (validated assignee roles) on PATCH /support/tickets/:id; no automatic escalation rules
- [e] **KFEAT-078** Knowledge base/FAQ — knowledge-base.ts + AdminKnowledgeBase
- [~] **KFEAT-079** Course communication — course announcements shown on My Record (8 latest); read-only, no replies
- [ ] **KFEAT-080** Secure messaging
- [ ] **KFEAT-081** Announcement management
- [~] **KFEAT-082** Notification preferences — GET/PUT /notifications/preferences (in-app/email/SMS + muted categories) on the student Account page; honoured by reminder jobs and staff broadcast; email/SMS delivery itself is still the notify.ts stub
- [e] **KFEAT-083** Live session scheduling — live-classes.ts
- [e] **KFEAT-084** Live attendance — attendance.ts
- [ ] **KFEAT-085** Meeting links/recordings
- [~] **KFEAT-086** Communication history — GET /notifications/history (paged, channel/unread filters); notifications only, no message threads
- [e] **KFEAT-087** Feedback/evaluation forms — feedback.ts + AdminCourseEvaluations
- [x] **KFEAT-088** Satisfaction reporting — tickets now store a 1–5 rating (POST /support/tickets/:id/rating, owner only, once, resolved only); Insights → Support shows avg rating and % satisfied
- [x] **KFEAT-089** Support analytics/alerts — resolvedAt is set/cleared by status changes; Insights → Support shows average and median resolution hours, open-by-priority, and a configurable open-ticket alert. Resolution time only exists for tickets resolved since batch 69
- [ ] **KFEAT-090** Group announcements
- [e] **KFEAT-091** Digital library UI — library.ts + StudentLibrary/AdminLibrary
- [~] **KFEAT-092** Library search/filter — GET /library accepts type, licence and subject filters on top of full-text search; no UI controls added yet
- [~] **KFEAT-093** Course reading lists — personal reading lists (create, add/remove items, owner-only); not linked to courses or trainer-curated
- [ ] **KFEAT-094** Resource access mgmt
- [ ] **KFEAT-095** Resource metadata/licensing
- [~] **KFEAT-096** Reading progress/bookmarks — GET /self/bookmarks lists saved resources (create/delete already existed); no reading-progress tracking
- [ ] **KFEAT-097** Trainer reading lists
- [x] **KFEAT-098** Broken-link monitoring — POST /insights/library/check-links checks the 40 stalest external links (SSRF-guarded, HEAD→GET fallback, 5 at a time) and stores the result on the resource; broken links listed in Insights → Library
- [ ] **KFEAT-099** Secure document preview
- [x] **KFEAT-100** Library usage analytics — Insights → Library: events by action (90 d), top resources, resources by type, link health
- [e] **KFEAT-101** Placement management — AttachmentPlacement + StudentAttachment
- [e] **KFEAT-102** Employer/supervisor registration — employers.ts
- [ ] **KFEAT-103** Attachment applications
- [ ] **KFEAT-104** Digital logbooks
- [ ] **KFEAT-105** Workplace evidence
- [ ] **KFEAT-106** Supervisor evaluation
- [ ] **KFEAT-107** Trainer review of attachments
- [~] **KFEAT-108** Attachment dashboards — GET /api/insights/attachments — status counts, sign-off rate, ending soon, stale logbooks
- [ ] **KFEAT-109** Attachment issues
- [~] **KFEAT-110** Completion/competency reports — GET /insights/attachment-completion: placements by status, logbook weeks logged / signed %, active placements past end date; no per-student competency link
- [e] **KFEAT-111** CV/career builder — AI CV builder (SP028) saves drafts to portfolio
- [ ] **KFEAT-112** Career resources
- [ ] **KFEAT-113** Employer feedback/outcomes
- [ ] **KFEAT-114** Placement documents
- [~] **KFEAT-115** Attachment reminders/escalation — logbook reminders: manual button + daily scheduler, in-app only, honours preferences; no escalation chain
- [ ] **KFEAT-116** Certificate templates
- [ ] **KFEAT-117** Controlled certificate generation
- [ ] **KFEAT-118** Transcript generation
- [e] **KFEAT-119** Public credential verification/QR — Verify.tsx public verification + credentials.ts
- [~] **KFEAT-120** Issuance register/audit — GET /insights/issuance-register (+?format=csv, ?since=): certificates, transcripts and letters with revoked status, last 12 months by default, max 2000 per kind; Awards-area roles; read-only register, no sequential numbering
- [ ] **KFEAT-121** Correction/revocation/replacement
- [e] **KFEAT-122** Graduation eligibility — graduation.ts audit
- [e] **KFEAT-123** Graduation clearance — AdminGraduation clearance
- [x] **KFEAT-124** Award/completion reports — GET /api/insights/awards — issued/revoked by qualification and month
- [~] **KFEAT-125** Credential export/verification history — every public document lookup is logged (found, revoked, keyed IP hash) and summarised in Insights → Awards; no per-document history screen

## KAI — AI (25)

- [e] **KAI-001** Unified gateway — lib/ai-gateway.ts (anthropic + openai)
- [ ] **KAI-002** Provider fallback
- [ ] **KAI-003** Model by use case
- [x] **KAI-004** Usage quotas/budgets — per-user rolling-24h quota from AiUsageLog (AI_DAILY_LIMIT_<ROLE>); per-user only — no institution budget
- [x] **KAI-005** Request queue/concurrency — bounded concurrency + queue (see KPERF-014)
- [e] **KAI-006** Usage dashboards — AdminAiGovernance + new AI usage tab
- [e] **KAI-007** Grounded tutoring — AiTutor.tsx / tutor-sessions.ts
- [ ] **KAI-008** Course-aware assistance
- [e] **KAI-009** AI practice questions — generate-quiz-questions (trainer review not verified)
- [ ] **KAI-010** Explanations/recommendations
- [ ] **KAI-011** AI resource search
- [ ] **KAI-012** Assignment feedback
- [e] **KAI-013** Lesson planning — trainer-assist lesson planning
- [ ] **KAI-014** Course summaries/notes
- [ ] **KAI-015** Competency scenarios
- [ ] **KAI-016** Admin document processing
- [~] **KAI-017** Provider health monitoring — see KOBS-007 — health is observed from usage logs, not probed
- [~] **KAI-018** Prompt-injection safeguards — screenUserInput on user text, plus retrieved document passages now have instruction-like lines removed before they reach the AI (document-ingestion.ts); heuristic pattern list only
- [ ] **KAI-019** AI privacy controls
- [x] **KAI-020** Response-quality feedback — rating control on AI tutor answers (helpful / not helpful / wrong / unsafe) -> /self/ai-feedback, staff summary at /insights/ai-feedback; other AI pages (advisor, etc.) do not have the control yet
- [x] **KAI-021** Cost estimation — estimateAiCost + /ops/ai/status; needs AI_COST_PER_1K_* env, otherwise reports null
- [ ] **KAI-022** Exam model restrictions
- [ ] **KAI-023** Institution knowledge bases
- [~] **KAI-024** Interaction logging/retention — AiUsageLog stores sizes/latency only, no content
- [ ] **KAI-025** AI accessibility support

## KINT — Integrations (28)

- [e] **KINT-001** VBL API integration — integration/ VBL API (b65/b66)
- [ ] **KINT-002** VBL identity mapping
- [ ] **KINT-003** Enrollment sync
- [ ] **KINT-004** Practical/competency sync
- [e] **KINT-005** Grade sync — VBL grade sync into gradebook
- [e] **KINT-006** Grade verification/approval — trainer approve/reject with atomic review
- [e] **KINT-007** Idempotent events — idempotent on eventId
- [e] **KINT-008** Event queues/retry — outbox with backoff + dead letter
- [e] **KINT-009** Integration health dashboards — AdminVirtualLab health tab
- [ ] **KINT-010** Failure alerts/reconciliation
- [e] **KINT-011** Grade-change audit — audit rows on review/sync
- [ ] **KINT-012** Conflict resolution
- [e] **KINT-013** VBL webhook verification — HMAC signed webhook verification
- [e] **KINT-014** Integration versioning — integration/versioning.ts
- [e] **KINT-015** Sync logs/controlled retry — admin events log + requeue
- [~] **KINT-016** Moodle auth/identity — moodle/sso.ts
- [~] **KINT-017** Moodle users/enrolments sync — moodle userSync/enrolment/courseSync
- [ ] **KINT-018** Moodle grades sync
- [ ] **KINT-019** Moodle completion sync
- [~] **KINT-020** Moodle health monitoring — GET /insights/moodle-health — live 5 s probe of core_webservice_get_site_info (ok, latency, release); on demand only, no history or alerting
- [ ] **KINT-021** Moodle retry/reconciliation
- [ ] **KINT-022** Moodle setup docs
- [ ] **KINT-023** Moodle API compatibility
- [ ] **KINT-024** Moodle sync audit
- [e] **KINT-025** Library connectors — lib/repositories/* library connectors
- [ ] **KINT-026** Library credentials/policies
- [ ] **KINT-027** Library metadata sync
- [e] **KINT-028** Licence-type distinction — library resources already carry an enforced open / licensed / restricted licence (restricted needs a grant); found by inspection, not changed

## KOPS — DevOps (27)

- [ ] **KOPS-001** Reproducible build
- [~] **KOPS-002** Environment configs — docker-compose + .env.compose.example + backend .env.example additions; no separate staging config
- [x] **KOPS-003** Env validation/management — env validation at boot (lib/env.ts)
- [x] **KOPS-004** Containerisation — docker-compose.yml (db+api+web), non-root API user, container HEALTHCHECK
- [~] **KOPS-005** Deployment process — runbook §6 deploy steps; no CI/CD pipeline
- [x] **KOPS-006** CI/CD — see KSEC-026
- [~] **KOPS-007** Migration procedures — runbook §6 — db push additive-only procedure; no versioned migrations
- [e] **KOPS-008** Health/readiness — /api/health + /api/ready (b66)
- [~] **KOPS-009** Rollback procedures — runbook §6 rollback steps; untested
- [~] **KOPS-010** HTTPS/reverse proxy — security headers + forwarded headers in nginx; TLS termination must be supplied in front
- [ ] **KOPS-011** Env-specific logging
- [ ] **KOPS-012** Horizontal scaling config
- [ ] **KOPS-013** Persistent storage
- [ ] **KOPS-014** Scheduled backups
- [ ] **KOPS-015** Secret management
- [ ] **KOPS-016** Infra documentation
- [e] **KOPS-017** Graceful shutdown — SIGTERM handler (b66) + b67 process handlers
- [~] **KOPS-018** Independent workers — INTEGRATION_SCHEDULER_ENABLED lets a dedicated instance run the scheduler
- [x] **KOPS-019** Smoke tests — scripts/smoke.sh (read-only post-deploy checks)
- [~] **KOPS-020** Production deployment guide (see KOPS-024) — runbook §6 deploy steps + production checklist; no CI/CD
- [x] **KOPS-021** First-time install guide — docs/operations-runbook.md §1 — first install steps (not run end-to-end here)
- [x] **KOPS-022** Dev setup guide — docs/operations-runbook.md §1 — dev setup without Docker
- [~] **KOPS-023** Staging deploy guide — runbook staging notes + checklist (separate compose project and database); no staging environment exists in the repo
- [~] **KOPS-024** Production deploy guide — runbook production checklist; HTTPS and backups are listed as gaps
- [x] **KOPS-025** Troubleshooting guide — docs/operations-runbook.md §5 — symptom → check table
- [~] **KOPS-026** Backup/recovery manual — runbook §3 has backup/restore commands; backups are not automated and no restore has been tested
- [~] **KOPS-027** Env variable docs — runbook §2 lists the variables; the full list stays in the .env examples

## KQA — QA (26)

- [x] **KQA-001** Test inventory — test inventory (files and test counts) generated into docs/architecture.md
- [~] **KQA-002** Unit tests — tests/batch67-libs.test.ts — 17 tests, all passing in sandbox; DB/HTTP paths untested
- [ ] **KQA-003** Backend integration tests
- [ ] **KQA-004** Frontend tests
- [ ] **KQA-005** E2E student journeys
- [~] **KQA-006** RBAC tests — static RBAC tests read the route source: every insights route role-guarded, settings/notices writes guarded (only the two public reads open), self-service never anonymous, learner roles absent from insight defaults. They check guards exist, not runtime 403 behaviour
- [ ] **KQA-007** DB integrity tests
- [ ] **KQA-008** Migration tests
- [ ] **KQA-009** Moodle tests
- [ ] **KQA-010** VBL tests
- [ ] **KQA-011** Finance tests
- [ ] **KQA-012** AI failure tests
- [ ] **KQA-013** Notification tests
- [ ] **KQA-014** Upload tests
- [ ] **KQA-015** KFX regression tests
- [ ] **KQA-016** Automated a11y tests
- [x] **KQA-017** Dependency/security scanning — npm audit job in CI (not run here)
- [ ] **KQA-018** Load/stress tests
- [ ] **KQA-019** Backup/restore tests
- [x] **KQA-020** Deployment smoke tests — see KOPS-019
- [~] **KQA-021** Concurrency/idempotency tests — idempotency decision logic is unit-tested (replay/mismatch/busy/stale); no concurrent-request test against a real database
- [ ] **KQA-022** Browser/mobile tests
- [~] **KQA-023** Coverage reporting — npm run test:coverage added (node coverage); not run in this sandbox
- [ ] **KQA-024** Release verification report
- [~] **KQA-025** Test execution docs — how to run tests listed in docs/architecture.md; nothing beyond that
- [~] **KQA-026** Production-readiness checklist — production-readiness checklist in runbook §6 (manual tick-list; items marked as known gaps)

## KOBS — Observability (20)

- [x] **KOBS-001** Structured logging — lib/logger.ts JSON lines in prod, LOG_LEVEL, requestId on every line
- [~] **KOBS-002** APM — Prometheus text at /api/ops/metrics.prom (per instance); no APM
- [x] **KOBS-003** Latency/error monitoring — per-route count, avg, max, p95 bucket bound, 4xx/5xx (lib/metrics.ts)
- [ ] **KOBS-004** DB performance monitoring
- [~] **KOBS-005** Worker/queue monitoring — every scheduled/manual job run is recorded (ScheduledJobRun) and listed in Insights → Jobs; the VBL outbox has its own scheduler and is not in this table
- [~] **KOBS-006** Integration health monitoring — Monitoring shows Virtual Business Lab event backlog, dead letters, last success, recent failures; Moodle sync has no record to monitor
- [~] **KOBS-007** AI provider monitoring — Monitoring: AI requests, error rate, p50/p95 latency, safety blocks, error reasons and per-feature breakdown (24 h / 7 d) from AiUsageLog; no alerting
- [~] **KOBS-008** Notification delivery monitoring — Insights → Monitoring: notifications created vs marked sent per channel (7 d) and unsent > 1 h; 'sent' is the app's own flag — email/SMS gateways are stubs and give no bounce/read feedback
- [~] **KOBS-009** Critical-failure alerting — a failed background job sends an in-app alert to Super/ICT admins (one per job per day); no email or pager
- [x] **KOBS-010** Operational dashboards — Admin → Operations & Data Governance page
- [x] **KOBS-011** Correlation IDs — X-Request-Id accepted (sanitised) or generated, echoed, in every log line; nginx sets it
- [ ] **KOBS-012** Distributed tracing
- [~] **KOBS-013** Availability/incident tracking — availability % over 30 days from incidents staff mark 'major' (overlaps merged, ongoing run to now); a manual record, not synthetic uptime monitoring
- [x] **KOBS-014** Capacity monitoring — RSS/heap/CPU/event-loop delay in /ops/metrics
- [~] **KOBS-015** Error aggregation + redaction — redaction in logs; no error-aggregation service
- [ ] **KOBS-016** SLOs/alert thresholds
- [~] **KOBS-017** Incident records — incident records with timeline updates, resolve/cancel, audit-logged (Insights → Service); no post-incident review fields
- [~] **KOBS-018** Maintenance notifications — planned maintenance and incidents show as a banner in every portal page (maintenance from 24 h before); not sent by email/SMS and not on the public site
- [x] **KOBS-019** Dependency health checks — see KFEAT-075
- [~] **KOBS-020** Runbooks — runbook §5 troubleshooting table; no per-alert runbooks

## KDR — Disaster recovery (12)

- [~] **KDR-001** RTO/RPO definition — runbook §4 suggests RPO 24 h / RTO 8 h; institution has not adopted them, nothing enforces them
- [ ] **KDR-002** Automated backups
- [ ] **KDR-003** Backup integrity verification
- [~] **KDR-004** DB DR docs — runbook §3 database backup/restore commands; untested
- [~] **KDR-005** File/media recovery docs — runbook §3 uploads volume backup/restore; untested
- [ ] **KDR-006** Failed-deploy recovery
- [~] **KDR-007** Restoration checklists — runbook §3 restore steps + integrity check; no formal checklist sign-off
- [ ] **KDR-008** Post-recovery reconciliation
- [ ] **KDR-009** Failure-recovery testing
- [~] **KDR-010** Business continuity docs — runbook §7 short continuity plan; decision-maker left blank to fill
- [~] **KDR-011** Responsible personnel — runbook §4 owner fields left blank to fill
- [~] **KDR-012** Recovery test records — runbook §8 log template; no tests recorded yet
