# StatiaWorks API (backend)

Node/Express + Knex (PostgreSQL) backend for the StatiaWorks job board. Serves both
the public app (`../app`, :5173) and the admin panel (`../admin`, :5174) under `/api`,
plus uploaded files under `/uploads`.

## Stack
Express · Knex · pg · multer (uploads) · node-cron (daily trial expiry) · bcryptjs
(password hashing) · jsonwebtoken (JWT session, httpOnly cookie + bearer).

## Setup

```bash
cd backend
npm install
cp .env.example .env      # then edit DATABASE_URL + JWT_SECRET + admin creds
npm run migrate           # additive migrations against the existing schema
npm run seed              # demo data (all accounts share password: password123)
npm run dev               # http://localhost:3000  (node --watch)
```

Generate the admin password hash for `.env`:

```bash
npm run hash -- "your-admin-password"    # → ADMIN_PASSWORD_HASH
```

### Running the whole stack (three terminals)
```bash
cd backend && npm run dev     # API   :3000
cd app    && npm run dev     # app   :5173  (proxies /api + /uploads → :3000)
cd admin  && npm run dev     # admin :5174  (same proxy)
```

## Demo logins (after seeding)
- **Seeker:** `maria.rijsdijk@gmail.com` / `password123`
- **Employer (trial):** `hiring@goldenrockdive.com` / `password123`
- **Employer (lapsed/locked):** `build@windwardconstruction.com` / `password123`
- **Admin:** `admin@statiaworks.com` / `admin123` (at :5174)

## Layout
```
src/
  app.js server.js          # express app + entry (starts cron)
  config/env.js  db/knex.js  knexfile.js
  db/migrations/  db/seeds/  # additive schema + demo data
  middleware/                # auth, roles, lockout, multer upload, validate, error
  utils/                     # jwt, password, salary, status, documents, similarity, shape
  validators/enums.js        # allowed values (mirror the DB CHECK constraints)
  controllers/  routes/      # auth · jobs · sectors · me (seeker/employer/account) · admin
  cron/                      # daily trial-expiry sweep

scripts/
  hash.js                    # bcrypt hash for the admin password
  smoke.js                   # API smoke test (server up)
  verify-flows.js            # end-to-end flow test through the Vite proxy
```

## Notes
- **Environments / Supabase:** `NODE_ENV` toggles the DB — `development` uses the local
  Postgres (`DATABASE_URL`/`PG*`), `production` uses **Supabase** (`SUPABASE_DB_URL`, SSL)
  and the `*_PROD` frontend hostnames (`APP_ORIGINS_PROD`, `APP_URL_PROD`). Supabase is
  used only as hosted Postgres (via Knex) — not its auth. See **`SUPABASE.md`**.
- **Auth:** JWT signed with `JWT_SECRET`, delivered as an httpOnly `SameSite=Lax`
  cookie *and* in the login response body. Cookie survives refresh; the client also
  keeps a bearer copy. Middleware accepts either. `loadUser` re-reads the account on
  every `/me/*` request, so a **suspended** account (status flipped from the admin
  console) is rejected mid-session with a distinct `403 ACCOUNT_SUSPENDED` that the
  app reacts to centrally — see **`app/SESSION_INVALIDATION.md`**.
- **Email (Resend):** transactional email is sent via [Resend](https://resend.com)
  (`src/email/`) — verification & password-reset links plus new-applicant alerts to
  employers (respecting `employers.alerts_enabled`). Set `RESEND_API_KEY` + `EMAIL_FROM`
  in `.env`; links use `APP_URL`. With no key set, emails are **logged to the console**
  instead (dev fallback), and delivery failures never block the request.
- **Guardrails:** predefined-choice fields (sector, employment type, statuses) are
  validated in the controllers *and* enforced by DB CHECK constraints.
- **Uploads:** `uploads/{resumes,cover-letters,logos}/`; the stored URL
  (`/uploads/...`) goes in the DB. Uploads are **content-deduplicated** (a
  `file_hashes` table) and application attachments are **retained for 6 months
  after a job closes**, then swept by a daily cron.
- **Storage / retention / rate limiting:** file dedup, the attachment-retention
  cron, the `closed_at`-set-once rule, and app-wide rate limiting are documented
  in **`STORAGE_RETENTION.md`**.
