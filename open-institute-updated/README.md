MEASUR BUSINESS COLLEGE

An institutional student information system and learning management platform for a Kenyan business college. The project includes student, trainer, administrator, employer, and alumni portals; an Express/Prisma API; and an optional Moodle integration.

## Project layout

- `backend/` — Express API, Prisma schema, background jobs, and Moodle integration.
- `frontend/` — React and Vite web application.
- `moodle/` — Moodle container and provisioning helpers.
- `docs/` — architecture, operations, integration, feature status, and development notes.
- `docker-compose.yml` — local Postgres, API, and frontend services.

## Run locally

1. Copy `.env.compose.example` to `.env` and replace every example value, including the database password, JWT secret, administrator email, and administrator password.
2. Run `docker compose up --build` from the repository root.
3. Open the frontend at the configured HTTP port. The API health endpoint is `/api/health`.

The first backend start applies the checked-in Prisma migration and seeds the configured administrator account. Seeding is idempotent and will not reset an existing administrator password. The bundled database is suitable for local evaluation only.

## Production deployment

This repository is a production deployment candidate, not a turnkey production service. Before accepting real students or payments, deploy with a managed PostgreSQL service, TLS, durable encrypted backups, monitoring, and institution-owned secrets. Use a fresh database for this initial migration; existing databases previously created with `prisma db push` need a reviewed migration baseline before `migrate deploy` can manage them.

Set a unique `JWT_SECRET`, `SEED_ADMIN_EMAIL`, and `SEED_ADMIN_PASSWORD` in a private environment file or secret manager. Set `FRONTEND_ORIGIN` to the exact HTTPS origin. Configure and verify external systems (payment merchant accounts, outbound email, Moodle, and any AI or library providers) against their live environments. The corresponding screens return configuration or connection status where credentials are absent; they do not simulate successful external actions. Follow `docs/operations-runbook.md`, `docs/roadmap.md`, and `docs/MEASUR_LMS_Moodle_Feature_Status.csv` to review the deployment-specific checks and remaining feature audit.

## Development

Install dependencies in `backend/` and `frontend/` separately, then use their `dev` and `build` scripts. The backend provides unit and database test scripts. Schema changes belong in reviewed Prisma migrations; do not use `prisma db push` against a production database.

## Integration and deployment notes

The application includes explicit setup and operational guidance in `docs/`. External integrations such as Moodle, payments, email, and repository connectors require institution-owned credentials and must be configured and checked against the real service before use.

See `docs/production-readiness.md` for checks completed, known limits, and the steps still required before production.
