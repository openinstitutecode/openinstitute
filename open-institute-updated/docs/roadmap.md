# Development roadmap

## Phase 1 — MVP (this repo, batches 1–5)
Public website, admissions form, student/trainer/admin/employer/alumni
portals with realistic UI, curriculum-grounded AI tutor scaffold, M-Pesa
STK push scaffold, credential signing + public verification, compliance
evidence vault, governance and academic-integrity workflows.

**Gate to exit this phase:** connect a real Postgres database, run
migrations, replace the mock data in portal pages with live API calls
end-to-end (several pages already call the API; others still show
illustrative static data — see `progress.md` for which).

## Phase 2 — Regulatory-ready platform
- Fill in `regulatory-notes.md` with actual written TVETA/KUCCPS/ODPC
  confirmations.
- Build the parts of the ODeL/QA framework those answers require (physical
  facility, if any; proctoring approach; trainer ratios).
- Complete RBAC coverage for every role listed in the schema's `Role` enum.
- Real file storage (S3-compatible bucket) behind the Document model.

## Phase 3 — Pilot
- Onboard one real cohort (suggest ≤100 students) on the certificate-level
  programmes only.
- Real trainers, real content beyond Module 1 stubs, real M-Pesa production
  credentials (not sandbox).
- Instrument the AI tutor's curriculum knowledge base properly — likely a
  real RAG pipeline over trainer-authored content rather than the static
  `curriculum.ts` array used here.

## Phase 4 — Accreditation
- Submit programme accreditation applications with the evidence vault as
  the primary submission artifact.
- Independent security review before handling real student PII at scale.

## Phase 5 — KUCCPS readiness
- Only after accreditation is confirmed: pursue KUCCPS listing, then
  clarify placement eligibility (listing ≠ placement — see README).

## Phase 6 — National scale
- Horizontal scaling of the API tier, managed Postgres with read replicas,
  CDN for LMS video content, dedicated low-bandwidth mode rollout.
- Expand programme catalogue per "Future expansion" in the original brief.
