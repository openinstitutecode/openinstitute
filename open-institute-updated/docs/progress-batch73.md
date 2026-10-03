# Batch 73 — 28 codes touched (quick-win pass 2)

Checklist: `docs/checklist-batch73.md`. **No schema change.** Frontend and backend edits are syntax-checked only — no npm/tsc/Postgres in the sandbox. Run `npx tsc --noEmit && npm test` (backend) and `npm run build` (frontend) first.

- Outbound fetches to admin-configured DSpace / Islandora / OAI-PMH URLs now go through `lib/safe-fetch.ts` (SSRF guard, no redirects, 10 s timeout).
- 41 hand-written "Loading…" lines in 33 pages replaced with `LoadingState` (announced to screen readers).
- New `useConfirm` hook; `window.confirm` replaced by the accessible dialog on: quiz delete, module delete, lesson delete, class cancel, transcript issue. Other `window.confirm` calls remain (unsaved-changes prompts, VBL credential revoke/mapping remove, delete-anyway, version restore).
- `?page=&pageSize=` (+ `X-Total-Count` header) on users, students and audit-log lists; without them nothing changes.
- `docs/operations-runbook.md` — install, env vars, backup/restore commands, troubleshooting, deploy/rollback, continuity, recovery log. Backups are **not** automated by the repo and nothing here has been test-restored.
