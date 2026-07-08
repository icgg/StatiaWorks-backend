# Supabase (production database + file storage)

StatiaWorks uses Supabase for two things in production: a **hosted Postgres**
(accessed through Knex/`pg`, exactly like the local DB) and **Storage** for uploaded
files (the `uploads` bucket). We do **not** use Supabase Auth or its REST layer — the
app's own JWT auth is unchanged. Both pieces are gated on `NODE_ENV=production`; in
development the DB is local Postgres and files are written to local disk.

## How the switch works

`NODE_ENV` is the single toggle (`backend/src/config/env.js`):

| `NODE_ENV`    | Database                                   | File storage            | Cookies | CORS origins        |
| ------------- | ------------------------------------------ | ----------------------- | ------- | ------------------- |
| `development` | local Postgres (`DATABASE_URL` / `PG*`)    | local disk (`UPLOAD_DIR`) | plain   | `APP_ORIGINS`       |
| `production`  | Supabase (`SUPABASE_DB_URL`, SSL enforced) | Supabase Storage (`uploads` bucket) | secure  | `APP_ORIGINS_PROD`  |

`dbConnection` (consumed by both `knexfile.js` and the app's `db/knex.js`) is the one
place the DB choice is made; `env.storage.driver` (`config/env.js`) is the one place
the storage choice is made — so migrations, seeds, the running server, and uploads all
follow the same rule. `STORAGE_DRIVER=disk|supabase` can force the storage backend
independently (e.g. to exercise the bucket locally).

## File storage (the `uploads` bucket)

Uploaded files — résumés, cover letters, logos, MCB payment proofs — are stored under
the same opaque URL `/uploads/<sub>/<file>` on the DB row regardless of backend. That
URL maps 1:1 to the bucket object `<sub>/<file>` (the bucket is named `uploads`, the
same word as the URL prefix, so there's no path mapping and no extra env var). The
storage layer (`src/storage/index.js`) resolves the URL to the physical backend:

- **Uploads** — multer holds each file in memory; `putObject` writes the buffer to
  disk (dev) or the bucket (prod). Résumés/covers/logos go through `dedupeStored`
  first (a dedup hit skips the write entirely).
- **Serving** — dev serves `/uploads` via `express.static`; prod streams each object
  back through the API route `GET /uploads/:sub/:file` (`serveUpload`), keeping the
  frontend's plain `/uploads/...` links same-origin. The bucket is **private**;
  the server reads it with the service-role key.
- **Deletes** — the retention cron and proof-replacement delete via `removeObject`.
  (Note: Supabase Storage CDN-caches downloads per the object's `cacheControl`, so a
  just-deleted file may still be fetchable for up to that TTL — default ~1h. Updates
  never hit this because each new upload gets a fresh random name.)

Config: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (server-only) authenticate the
Storage client; `SUPABASE_STORAGE_BUCKET` (default `uploads`) names the bucket. The
bucket is created automatically (private) on boot if it doesn't already exist.

## One-time setup

1. Create a Supabase project. In **Project Settings → Database → Connection string**,
   copy the **Session pooler** string (host `...pooler.supabase.com`, port `5432`).
   Use the session pooler — not the transaction pooler (`6543`) — for a long-running
   Node server with Knex.
2. Put it in `.env` as `SUPABASE_DB_URL`, replacing `[YOUR-PASSWORD]` with your DB
   password.
3. Set the production frontend hostnames: `APP_ORIGINS_PROD` (CORS allowlist) and
   `APP_URL_PROD` (email links).
4. For file storage, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Project
   Settings → API). The `uploads` bucket is created automatically on first boot if it
   doesn't exist; you can also create it manually (Storage → New bucket → `uploads`,
   private).

SSL is applied automatically in production (`ssl: { rejectUnauthorized: false }` — the
pooler presents a cert Node won't verify by default).

## Loading the schema/data

The DB dump into Supabase is handled manually (schema + data). If you instead want to
build the schema with the project's own migrations against Supabase, point `NODE_ENV`
at production and run the CLI — on Windows PowerShell:

```powershell
$env:NODE_ENV="production"; npm run migrate
$env:NODE_ENV="production"; npm run seed     # optional demo data
```

(bash: `NODE_ENV=production npm run migrate`)

## Verifying the connection

```powershell
$env:NODE_ENV="production"; npm run dev
```

Watch for a clean start with no `SUPABASE_DB_URL is not set` warning, then hit
`GET /api/health`. Because this connects to the live production DB, prefer a throwaway
check over pointing dev traffic at it.
