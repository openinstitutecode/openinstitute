# Supabase + Render Deployment Guide

This guide deploys the application as:

- **Supabase:** managed PostgreSQL database.
- **Render Private Service:** Node/Prisma backend API.
- **Render Web Service:** nginx-served frontend and same-origin `/api` proxy.

The project uses Prisma's standard PostgreSQL connector. It does **not** use Supabase Auth, the Supabase JavaScript client, or the Supabase Data API. The browser talks to this application's API; the backend connects to PostgreSQL.

> **Important:** You do not paste the Prisma schema or migration SQL into Supabase. On backend startup, this repository runs `prisma migrate deploy` and then its idempotent seed. That creates/updates the schema and initial records. Supabase is where you create the database and copy its connection URI; Render is where you deploy the application code.

## Before starting

Have these ready:

1. A GitHub repository connected to Render, containing the application folders `backend/` and `frontend/`.
2. A Render account and a Supabase account.
3. A domain name if you want a custom public URL. Render's `onrender.com` URL is sufficient for the initial smoke test.
4. A new, strong administrator password (use at least 14 characters; a unique password manager-generated password is recommended). Do not reuse the short development password previously used during setup; it has already been shared in chat.

Do not paste database passwords, API keys, or other secrets into GitHub, this document, Supabase SQL Editor, or chat. Enter secrets only into the relevant Render secret/environment fields or Supabase's own database password field.

## Part 1 — Create the Supabase project

1. Open [Supabase Dashboard](https://supabase.com/dashboard) and sign in.
2. Choose or create the organization that should own the institution's database.
3. Click **New project**.
4. Fill in:
   - **Name:** a recognizable production name, such as `openinstitute-prod`.
   - **Database Password:** generate a new, strong password and save it in an institution-approved password manager. This is the PostgreSQL password, not the administrator login password.
   - **Region:** choose a region close to the Render region you intend to use.
   - **Pricing Plan:** choose a plan suitable for production data, backups, and expected usage. Review the current Supabase plan limits and backup/restore terms before creating the production database.
5. Click **Create new project** and wait until the project is fully provisioned.

### Copy the correct PostgreSQL connection URI

1. In the new Supabase project, click **Connect** near the top of the project dashboard.
2. Select **Session pooler** as the connection method. This persistent Node backend uses Prisma and needs a session-capable connection. It is also the safer default for Render services that may have IPv4-only outbound connectivity.
3. Copy the PostgreSQL URI shown by Supabase. Use the exact host, port, username, and database name shown in your dashboard. The session-pooler URI typically resembles:

   ```text
   postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@[pooler-host]:5432/postgres
   ```

   This is only a shape/example. **Do not copy it literally** and do not guess the pooler hostname or username; copy your project's URI from **Connect**.
4. Replace `[YOUR-PASSWORD]` with the Supabase database password you saved. If the password contains URI-reserved characters such as `@`, `:`, `/`, `?`, `#`, `%`, or spaces, percent-encode those characters in the URI. Prefer a password manager's URI-encoding feature or generate a database password that is straightforward to encode.
5. Keep this full URI private. It will be entered in the backend's Render `DATABASE_URL` field in Part 3.

If a database password or connection URI has already been pasted into chat, email, an issue, or another shared system, treat it as exposed: reset the database password in Supabase **before** deploying, then copy the new session-pooler URI. Do not reuse the exposed password.

**Do not select Transaction pooler** for this setup. Do not use the Supabase Project URL, anon key, or service-role key as `DATABASE_URL`; this application needs the PostgreSQL URI.

### Supabase SQL Editor: what to do and not do

- Do **not** paste `schema.prisma`, migration files, `CREATE TABLE` statements, or seed records into **SQL Editor**. Mixing manually-created schema with Prisma migrations can cause migration drift.
- The backend deployment will apply the checked-in migrations and seed automatically.
- After deployment, you can optionally use **SQL Editor → New query** to run the read-only checks in Part 6. Those checks verify migration history and the admin row; they are not setup scripts.
- This application does not need Supabase API keys. Never add a database password, Supabase service-role key, or other secret to a `VITE_*` variable or frontend service.

## Part 2 — Prepare the Git repository

1. Confirm that the Git repository connected to Render contains `backend/Dockerfile`, `backend/package.json`, `backend/prisma/schema.prisma`, `backend/prisma/migrations/`, `frontend/Dockerfile`, and `frontend/nginx.conf.template`.
2. Commit and push the deployment changes to the branch you intend to deploy. Render builds the Dockerfiles from the Git repository; it cannot deploy uncommitted workspace changes.
3. If `backend/` and `frontend/` are directly at the repository root, use those exact paths below.
4. If they are inside another directory in the repository, include that parent directory in each Render **Root Directory** (for example, `open-institute-updated/backend` and `open-institute-updated/frontend`).
5. Do not add `.env`, passwords, database URIs, or local environment files to Git. The checked-in `.env.example` files are templates only.

## Part 3 — Create the public frontend service on Render

Create the frontend first so its public URL is available for the backend's allowed-origin setting.

1. Open [Render Dashboard](https://dashboard.render.com) and sign in.
2. Click **New → Web Service**.
3. Connect the GitHub account if prompted; select the repository containing this application.
4. In the service setup form, set:
   - **Name:** for example, `openinstitute-frontend`.
   - **Region:** select the same region you plan to use for the backend, preferably near the Supabase region.
   - **Root Directory:** `frontend` (or the repository-relative path determined in Part 2).
   - **Runtime/Language:** **Docker**.
   - **Dockerfile Path:** `Dockerfile` (relative to the frontend root directory).
   - **Docker Context Directory:** `.` / the frontend root directory. If Render displays a path relative to the repository instead, use the `frontend` directory. The frontend Dockerfile expects `package.json` and `package-lock.json` in its build context.
   - **Instance Type:** choose a plan that suits the deployment. Confirm current Render pricing and limitations; do not assume a free instance provides production uptime or persistent storage.
5. Under **Advanced → Environment Variables**, add:
   - `API_UPSTREAM` = `http://127.0.0.1:10000`

   This is a temporary valid upstream that allows the frontend to deploy before the backend exists. API requests will not work yet. You will replace this value with the Render private address in Part 4.
6. Under **Health Check Path**, if shown, set `/`. The frontend serves the SPA at `/`.
7. Click **Create Web Service** and wait for the first Docker build/deploy to finish.
8. Open the deployed service. Copy its public HTTPS URL, such as `https://openinstitute-frontend.onrender.com`. Keep it available; this is the initial value for backend `FRONTEND_ORIGIN`.

Do not share this temporary site with users yet. Its `/api` proxy is not connected until Part 4.

## Part 4 — Create the private backend service on Render

1. In Render Dashboard, click **New → Private Service**.
2. Select the same GitHub repository as the frontend.
3. Configure:
   - **Name:** for example, `openinstitute-backend`.
   - **Region:** exactly the same Render region as the frontend (Render private networking requires services in the same region and workspace).
   - **Root Directory:** `backend` (or the repository-relative path determined in Part 2).
   - **Runtime/Language:** **Docker**.
   - **Dockerfile Path:** `Dockerfile` (relative to the backend root directory).
   - **Docker Context Directory:** `.` / the backend root directory. The backend Dockerfile expects its package files and Prisma directory in this context.
   - **Instance Type:** choose a suitable plan. The API must stay available to serve the frontend.
4. Set the following backend environment variables in the Render service's **Environment** page. Add each as a separate key/value entry:

   | Key | Value |
   |---|---|
   | `PORT` | `10000` |
   | `NODE_ENV` | `production` |
   | `TRUST_PROXY` | `1` |
   | `UPLOAD_DIR` | `/app/uploads` |
   | `FRONTEND_ORIGIN` | The exact frontend HTTPS URL copied in Part 3, with no trailing slash |
   | `DATABASE_URL` | The complete Supabase **Session pooler** PostgreSQL URI from Part 1 |
   | `JWT_SECRET` | A new, random secret of at least 32 characters |
   | `SEED_ADMIN_EMAIL` | The administrator's email address |
   | `SEED_ADMIN_PASSWORD` | A new, unique administrator password, at least 14 characters recommended |

   Generate a JWT secret on your own trusted computer with:

   ```sh
   openssl rand -hex 32
   ```

   Paste the command's output into Render's `JWT_SECRET` field. Do not paste the output into chat, the repository, or the frontend service. Generate a strong admin password with a password manager and enter it directly in Render.

5. Mark `DATABASE_URL`, `JWT_SECRET`, and `SEED_ADMIN_PASSWORD` as secret/sensitive in Render if the UI offers that option. Render masks secret values in its dashboard and logs.
6. Add any additional integration variables only if you are enabling those integrations. For example, if a production VBL integration is configured, also set a strong `INTEGRATION_SECRET_ENCRYPTION_KEY` as required by the operations guide. Do not invent placeholder provider credentials.
7. Add a **Persistent Disk** to the backend service:
   - **Mount Path:** `/app/uploads`
   - **Size:** choose enough capacity for expected course materials, student documents, and media.

   Render's local filesystem is otherwise ephemeral. Uploaded files can be lost on redeploy/restart without this disk. Persistent disks require a paid plan and restrict the service to a single instance. If the dashboard does not offer a disk for the selected plan, do not launch with user uploads; choose a supported plan or implement object storage first.
8. Create/deploy the private service. The container's startup command runs Prisma migrations, runs the seed, then starts the API. Watch **Events/Deploys** and **Logs** until the service is running. The first migration can take time; do not repeatedly trigger deploys while it is applying.
9. In the backend service, open **Connect** and copy the **Internal Address** / private service address. It should identify the backend host and port `10000`. Use the exact value Render shows; do not use the backend's public URL (a private service should not have one).

The private service accepts Render's TCP health checks. The Docker image also includes a local health check against `/api/ready`.

## Part 5 — Connect the frontend to the private API

1. Return to the frontend **Web Service → Environment** page in Render.
2. Edit `API_UPSTREAM` to use the backend's actual Render **Internal Address**, with the `http://` scheme and port `10000`. For example:

   ```text
   http://openinstitute-backend:10000
   ```

   The example hostname is illustrative. Use the internal address copied from your backend's **Connect** menu exactly.
3. Save the environment change and let Render redeploy the frontend. The frontend nginx configuration uses `API_UPSTREAM` to proxy same-origin `/api/...` requests to the backend.
4. Wait for the frontend deployment to become live. The backend and frontend must remain in the same Render region and workspace for this private connection.

## Part 6 — Verify the deployment

### Check Render service status and logs

1. In Render, confirm the backend private service is **Live/Healthy** and the frontend web service is **Live**.
2. Inspect backend logs for all three startup stages:
   - Prisma migration deploy completed without an error.
   - Seed completed (`Seed complete.`).
   - API started listening on port `10000`.
3. Open the frontend's public HTTPS URL and confirm the application page loads.
4. Visit:

   ```text
   https://YOUR-FRONTEND-HOSTNAME/api/ready
   ```

   Replace the hostname with the actual Render URL. A successful response should be HTTP 200 with a JSON ready status. This request passes through frontend nginx to the backend.
5. Test the login page with the seeded admin email and the new password. Do not put the password in a URL or command history.

### Optional read-only checks in Supabase

After the backend has completed startup, you may confirm migrations in Supabase:

1. Open your Supabase project.
2. Select **SQL Editor** in the left navigation.
3. Click **New query**.
4. Paste and run this read-only migration-history query:

   ```sql
   SELECT migration_name, started_at, finished_at, rolled_back_at
   FROM public."_prisma_migrations"
   ORDER BY started_at;
   ```

   Successful migrations have a non-null `finished_at` and a null `rolled_back_at`.
5. To confirm that the admin row was seeded, replace the example address below with the configured admin email, then run:

   ```sql
   SELECT email, role::text, "isActive"
   FROM public."User"
   WHERE lower(email) = lower('admin@example.org')
   LIMIT 1;
   ```

   Expect one row with role `SUPER_ADMIN` and `isActive` true. These queries do not show password hashes. Do not run manual `CREATE TABLE`, `ALTER TABLE`, or seed `INSERT` statements; let Prisma own schema changes.

## Part 7 — Custom domain (optional)

1. In the Render frontend web service, open **Settings → Custom Domains** and add the domain you own.
2. Follow the DNS records Render displays for that exact domain. DNS record requirements depend on whether you use an apex domain or a subdomain; do not guess the target.
3. Wait for Render to verify the DNS and issue TLS. Confirm the custom domain loads over HTTPS.
4. Update backend `FRONTEND_ORIGIN` to the exact final origin, for example `https://portal.example.org` (scheme included; no path and no trailing slash).
5. Save the backend environment change and allow it to redeploy.
6. Re-test `https://portal.example.org/api/ready` and browser login. If retaining both the Render URL and custom domain, `FRONTEND_ORIGIN` can contain comma-separated exact origins; only include origins the institution actually uses.

## Part 8 — Supabase security and operations

- The backend's `DATABASE_URL` has database access and belongs only in the private backend service. Do not add it to frontend environment variables.
- This application does not need Supabase's anon or service-role API keys. Do not put either in the frontend. Because Prisma migrations create application tables in `public`, review Supabase's **Data API** exposure and grants. If the application will not use Supabase's REST/GraphQL APIs, disable the Data API if the project settings allow it. Otherwise, ensure no unintended `anon`/`authenticated` grants or policies expose application tables. RLS and grants are separate controls; do not assume that a private Render API automatically secures the Supabase Data API.
- Avoid adding an IP allowlist until you have confirmed how your Render plan exposes outbound IP addresses and that the chosen Supabase connection method can still be reached. An incorrect allowlist can make migrations and the API fail to connect.
- Configure database backups/point-in-time recovery appropriate to the Supabase plan. Confirm the retention period and practice a restore.
- Monitor Render's disk usage and arrange backups/export of uploaded files. A persistent disk is not a substitute for an off-provider backup.
- Keep Render backend and frontend in the same region. Keep Supabase reasonably close to reduce query latency.
- Do not import real student data until production secrets, TLS, backups, retention/privacy obligations, and account access have been reviewed.

## Important seed behavior

The seed is idempotent. It creates the super-admin on the first deployment if the email does not exist. For an existing email, the seed deliberately does not overwrite the stored password. Changing `SEED_ADMIN_PASSWORD` in Render after the account already exists will **not** reset that account's password. Use the application's approved password reset/admin recovery procedure instead.

## Troubleshooting

| Symptom | Check |
|---|---|
| Backend deploy fails with Prisma `P1001` or cannot reach database | Re-copy the Supabase **Session pooler** URI; verify host, port, username, encoded password, and that network restrictions are not blocking Render. |
| Backend fails environment validation | Ensure `NODE_ENV=production`, a valid `DATABASE_URL`, `FRONTEND_ORIGIN` with `https://`, and a random `JWT_SECRET` at least 32 characters long. |
| Prisma migration fails | Read the complete backend deploy log. Do not manually create tables in SQL Editor. Verify the database is new/managed by this Prisma migration history and that the database user can create/alter objects. |
| Backend is running but frontend `/api` returns 502 | Verify both services are in the same Render region/workspace and frontend `API_UPSTREAM` is the backend's exact internal address with `http://` and port `10000`; redeploy the frontend after changing it. |
| Frontend Docker deploy fails during nginx startup | Ensure `API_UPSTREAM` is set to a valid `http://host:10000` URL; it must not be blank. |
| Browser reports CORS errors | Set backend `FRONTEND_ORIGIN` to the exact browser origin (scheme + hostname, no path), save, and wait for backend redeploy. |
| Admin login fails after changing Render seed variables | The seed does not update an existing account's password. Use the password recovery procedure; do not expect a redeploy to reset it. |
| Uploads disappear or upload routes fail | Confirm a persistent disk is mounted at `/app/uploads`, the backend has disk capacity, and the selected plan supports persistent disks. |
| Service works on Render URL but not custom domain | Recheck Render's required DNS records, TLS status, and that backend `FRONTEND_ORIGIN` includes the custom origin. |

## Official references

- [Supabase: Connect to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase: Secure the Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Prisma: Supabase PostgreSQL](https://www.prisma.io/docs/orm/overview/databases/supabase)
- [Render: Web Services](https://render.com/docs/web-services)
- [Render: Private Services](https://render.com/docs/private-services)
- [Render: Private Network](https://render.com/docs/private-network)
- [Render: Persistent Disks](https://render.com/docs/disks)
- [Render: Health Checks](https://render.com/docs/health-checks)
