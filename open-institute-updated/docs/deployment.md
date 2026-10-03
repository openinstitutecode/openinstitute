# Deployment

This project uses Prisma's standard PostgreSQL connector. Supabase Database is PostgreSQL, so it works with the existing Prisma schema, Prisma Client, migrations, and seed script. The app currently authenticates users itself; it does not use Supabase Auth, the Supabase JavaScript client, or the Data API.

## Recommended first deployment: Render + Supabase

Render can run this project as two Docker services: a private backend API and a public frontend service. Supabase provides managed PostgreSQL. Render's private network lets the frontend proxy `/api` requests to the API without making the API public.

Use Supabase's **Session pooler** connection string for the Render backend. It supports IPv4-only clients and persistent PostgreSQL sessions needed by this Prisma application. Do not use the **Transaction pooler** for the current Prisma setup or migrations.

The backend stores uploaded documents and media on its local filesystem. Render filesystems are ephemeral unless a persistent disk is attached. Attach a paid Render disk to the backend at `/app/uploads` and run one backend instance, or plan a separate migration to object storage before relying on uploads. A disk-backed service cannot be horizontally scaled.

## Build and run locally

From the repository root:

```sh
bash scripts/setup-env.sh
```

The setup script leaves an existing `.env` alone. Set private values for `POSTGRES_PASSWORD`, `JWT_SECRET`, `FRONTEND_ORIGIN`, `SEED_ADMIN_EMAIL`, and `SEED_ADMIN_PASSWORD` in `.env`. The seed password must be at least 8 characters; use a strong unique password. Do not commit `.env`.

To use the Compose-managed PostgreSQL:

```sh
docker compose build
docker compose up -d
docker compose ps
curl http://localhost:8080/api/ready
```

The API applies checked-in Prisma migrations and runs the idempotent seed at startup. The frontend serves the single-page app and proxies `/api` to the backend. Put a TLS-terminating reverse proxy in front before exposing the service publicly.

## Render setup

1. Push the project to a Git provider connected to Render. If the deployable project is in a subdirectory, set Render's **Root Directory** to that directory.
2. Create a Supabase project. In **Connect**, copy the **Session pooler** URI (not the transaction pooler). Replace its password placeholder with the database password, percent-encoding reserved characters.
3. In Render, create a **Private Service** for the backend using the repository and `backend/Dockerfile`. It listens on port `10000`. Set `PORT=10000`, `NODE_ENV=production`, `TRUST_PROXY=1`, and `UPLOAD_DIR=/app/uploads`. Add these secret/environment values: `DATABASE_URL` (Supabase session-pooler URI), `JWT_SECRET` (random, at least 32 characters), `FRONTEND_ORIGIN` (the final HTTPS frontend origin), `SEED_ADMIN_EMAIL`, and `SEED_ADMIN_PASSWORD`. Add a persistent disk mounted at `/app/uploads` if the application will store uploads. Keep the backend and frontend in the same Render region and workspace.
4. Get the backend's **internal address** from its Render **Connect** menu. Create a **Web Service** for the frontend using the same repository and `frontend/Dockerfile`. Set `API_UPSTREAM` to `http://<backend-internal-hostname>:10000`, using the actual internal hostname from Render. The frontend image listens on port `10000` and substitutes only this setting into its nginx proxy configuration.
5. Set the backend `FRONTEND_ORIGIN` to the frontend's Render HTTPS URL (or the custom domain after configuring it). Add the custom domain to the frontend service and update `FRONTEND_ORIGIN` to that exact `https://` origin.
6. Deploy the backend first, then the frontend. The backend container runs `prisma migrate deploy` and the idempotent seed before starting the API. Confirm the backend is healthy, then check `https://<frontend-hostname>/api/ready`.
7. Configure Supabase backups, Render persistent-disk backups, and email/integration credentials as required. Test a database and upload restore before onboarding real users.

The API is private; do not create a public backend web service unless there is a deliberate need for direct API access. Never expose Supabase credentials or any backend secret to frontend build variables.

## Local Docker Compose

For local smoke tests, the included Compose stack runs the API, nginx-served frontend, and PostgreSQL. From the repository root, run `bash scripts/setup-env.sh`, set private values in `.env`, then run:

```sh
docker compose build
docker compose up -d
docker compose ps
curl http://localhost:8080/api/ready
```

Compose configures the frontend proxy to use `http://backend:4000`; Render configures the same proxy with the backend's private address.

## Other hosting options

Any managed PostgreSQL provider that supports standard PostgreSQL and Prisma migrations can work, including Render Postgres and Neon. Supabase remains compatible; using Render Postgres instead can simplify network connectivity, but isn't required.

The Supabase connection string is a backend secret. Never use a database password or service credential in `VITE_*` variables. The app connects through Prisma on the backend and does not use Supabase Auth or the browser-facing Data API.

## Before production

- Set strong, unique production secrets in a secret manager or a private environment file with restrictive permissions.
- Use HTTPS and set `FRONTEND_ORIGIN` to the exact HTTPS origin.
- Confirm migrations and seed complete on the target database, then verify `/api/ready` through the public proxy.
- Configure and test database backups, upload backups, restore, monitoring, email, and any enabled external integrations.
- Do not import real student data until access controls, retention, privacy obligations, and recovery procedures have been reviewed.

Provider connection-mode guidance: [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres) and [Prisma with Supabase](https://www.prisma.io/docs/orm/overview/databases/supabase).
