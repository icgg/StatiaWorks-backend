# Supabase (production database)

StatiaWorks uses **Supabase purely as a hosted Postgres** — accessed through Knex/`pg`,
exactly like the local DB. We do **not** use Supabase Auth, Storage, or its REST/JS SDK;
the app's own JWT auth and multer uploads are unchanged. Supabase is only the production
value of the same `pg` connection.

## How the switch works

`NODE_ENV` is the single toggle (`backend/src/config/env.js`):

| `NODE_ENV`    | Database                                   | Cookies | CORS origins        |
| ------------- | ------------------------------------------ | ------- | ------------------- |
| `development` | local Postgres (`DATABASE_URL` / `PG*`)    | plain   | `APP_ORIGINS`       |
| `production`  | Supabase (`SUPABASE_DB_URL`, SSL enforced) | secure  | `APP_ORIGINS_PROD`  |

`dbConnection` (consumed by both `knexfile.js` and the app's `db/knex.js`) is the one
place the choice is made, so migrations, seeds, and the running server all follow the
same rule.

## One-time setup

1. Create a Supabase project. In **Project Settings → Database → Connection string**,
   copy the **Session pooler** string (host `...pooler.supabase.com`, port `5432`).
   Use the session pooler — not the transaction pooler (`6543`) — for a long-running
   Node server with Knex.
2. Put it in `.env` as `SUPABASE_DB_URL`, replacing `[YOUR-PASSWORD]` with your DB
   password.
3. Set the production frontend hostnames: `APP_ORIGINS_PROD` (CORS allowlist) and
   `APP_URL_PROD` (email links).

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
