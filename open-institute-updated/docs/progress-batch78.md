# Batch 78 — LMS reports, notices, and submission feedback

This batch continues from the supplied Batch 77 snapshot. Existing files and routes remain in place.

## Completed

- `LMS-GRD-035`: added a printable, accessible academic progress report alongside the existing progress CSV and dashboard.
- `LMS-GRD-036`: added a labeled score distribution chart to trainer class analysis.
- `LMS-GRD-039`: added printable per-student result reports, with server-side course access checks and audit events.
- `LMS-COM-021`: course announcements can now be scheduled for a future time. Due notices are released by a background job, are hidden from learners before sending, respect in-app notification preferences, and can be retried safely.
- `LMS-ASG-026`: expanded submission feedback with PDF page-anchored comments. Existing typed-answer highlighting is preserved. Page comments validate that the referenced PDF belongs to that hand-in; they are shown to learners with the grade.

## Limits still visible in the tracker

- PDF feedback is anchored to a page; it does not draw highlights into the PDF itself. Word files do not have an in-browser annotation editor.
- `LMS-ASG-039` still uses the built-in classmate text-overlap check; connecting to an external plagiarism provider requires the institution to choose and configure that provider.
- Competency grading and moderation remain partial for assessments; assignment competency grading and moderation are already available.
- The feature-status CSV still contains rows that have not been audited. This batch updates only the rows whose implementation status changed.
