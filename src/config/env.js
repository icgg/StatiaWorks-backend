// Centralised environment config. Loads .env once, validates the essentials,
// and exposes a typed-ish config object the rest of the app imports.

import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// server/ root is two levels up from src/config/
const ROOT = path.resolve(__dirname, '..', '..')

dotenv.config({ path: path.join(ROOT, '.env') })

function required(name, fallback) {
  const v = process.env[name] ?? fallback
  if (v === undefined || v === '') {
    // Don't hard-crash in dev for every missing var; warn loudly instead.
    console.warn(`[env] ${name} is not set`)
  }
  return v
}

// The environment toggle. NODE_ENV is the single source of truth for whether we
// run against the local Postgres (development) or Supabase (production) — it also
// drives the secure-cookie flag and which frontend origins CORS allows.
const nodeEnv = process.env.NODE_ENV || 'development'
const isProd = nodeEnv === 'production'

// The insecure fallback used for local dev only. Production must override it —
// see the hard-fail guard at the bottom of this file. A forgeable token secret
// would let anyone mint a valid session (any account, including admin).
const DEV_JWT_SECRET = 'dev-insecure-secret-change-me'

// Allowed browser origins for CORS (and the base for email links). Dev and prod
// keep separate lists so one .env can describe both; NODE_ENV picks the active
// one. In production these are the deployed frontend hostname(s).
const appOrigins = (
  isProd
    ? process.env.APP_ORIGINS_PROD || ''
    : process.env.APP_ORIGINS || 'http://localhost:5173,http://localhost:5174'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// Public app base URL (for links in emails). Prefers the env-specific override,
// else falls back to the first allowed origin.
const appUrl = (
  (isProd ? process.env.APP_URL_PROD : process.env.APP_URL) ||
  appOrigins[0] ||
  'http://localhost:5173'
).replace(/\/$/, '')

export const env = {
  root: ROOT,
  nodeEnv,
  isProd,
  port: Number(process.env.PORT || 3000),

  // --- Development database (local Postgres) ---
  databaseUrl: process.env.DATABASE_URL || null,
  pg: {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'statiaworks',
  },

  // --- Production database (Supabase Postgres) ---
  // We use Supabase as a hosted Postgres (via Knex) — NOT its auth — plus its
  // Storage for uploaded files in production (see `storage` below and
  // storage/index.js). `dbUrl` drives Knex; `url` + `serviceRoleKey` drive the
  // Storage client (the service-role key is server-only). `anonKey` is unused.
  supabase: {
    dbUrl: process.env.SUPABASE_DB_URL || null,
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  appOrigins,
  appUrl,

  // Email (Resend). Left blank in dev → the mailer logs to the console.
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || 'StatiaWorks <onboarding@resend.dev>',

  jwtSecret: required('JWT_SECRET', DEV_JWT_SECRET),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  adminEmail: (process.env.ADMIN_EMAIL || '').toLowerCase(),
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',

  uploadDir: path.resolve(ROOT, process.env.UPLOAD_DIR || 'uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 8),

  // --- File storage backend ---
  // Where uploads physically live. The DB always stores the same opaque
  // '/uploads/<sub>/<file>' URL; only the backend behind it changes:
  //   disk     → local filesystem under uploadDir (development)
  //   supabase → the Supabase Storage bucket below (production)
  // Driver derives from NODE_ENV (mirroring the DB toggle) but can be forced
  // with STORAGE_DRIVER to exercise the Supabase path locally. The bucket is
  // deliberately named 'uploads' — the same word as the URL prefix — so no
  // extra path mapping (or env var) is needed.
  storage: {
    driver: (process.env.STORAGE_DRIVER || (isProd ? 'supabase' : 'disk')).toLowerCase(),
    bucket: process.env.SUPABASE_STORAGE_BUCKET || 'uploads',
  },

  // Attachment retention: résumés/cover letters linked to an application become
  // unavailable this many months after the job posting closes (ToS clause).
  // The daily cleanup cron and the `attachmentsExpireOn` date the employer sees
  // both read this single value so the policy lives in one place.
  attachmentRetentionMonths: Number(process.env.ATTACHMENT_RETENTION_MONTHS || 6),

  // --- Payments / billing ---
  // The MCB (Maduro & Curiel's Bank) account employers transfer to. Single
  // source of truth surfaced in the app billing panel. TODO: replace the
  // placeholder with the real account number (or set MCB_ACCOUNT_NUMBER in .env).
  mcbAccountNumber: process.env.MCB_ACCOUNT_NUMBER || 'MCB-XXXX-XXXX-XXXX (TODO: fill real MCB account #)',
  // Plan pricing. `*Amount` is the numeric charge written onto an invoice;
  // `*Display` is the human string shown on /pricing and in billing.
  pricing: {
    monthlyAmount: Number(process.env.PRICE_MONTHLY || 5),
    annualAmount: Number(process.env.PRICE_ANNUAL || 50),
    monthlyDisplay: process.env.PRICE_MONTHLY_DISPLAY || '$5 / month',
    annualDisplay: process.env.PRICE_ANNUAL_DISPLAY || '$50 / year',
  },

  // Rate limiting (express-rate-limit). Windows in minutes, maxes are request
  // counts per window. `global` is a broad ceiling; the rest guard sensitive
  // endpoints (auth brute-force / email-send abuse, apply + upload spam, and
  // job-posting flooding — the posting limiter keys on account AND IP).
  rateLimit: {
    globalWindowMin: Number(process.env.RL_GLOBAL_WINDOW_MIN || 15),
    globalMax: Number(process.env.RL_GLOBAL_MAX || 600),
    authWindowMin: Number(process.env.RL_AUTH_WINDOW_MIN || 15),
    authMax: Number(process.env.RL_AUTH_MAX || 20),
    applyWindowMin: Number(process.env.RL_APPLY_WINDOW_MIN || 60),
    applyMax: Number(process.env.RL_APPLY_MAX || 30),
    uploadWindowMin: Number(process.env.RL_UPLOAD_WINDOW_MIN || 60),
    uploadMax: Number(process.env.RL_UPLOAD_MAX || 40),
    postingWindowMin: Number(process.env.RL_POSTING_WINDOW_MIN || 60),
    postingMax: Number(process.env.RL_POSTING_MAX || 10),
  },
}

// Fail fast in production on a missing/default JWT secret rather than booting
// with a forgeable one. In development the insecure fallback is allowed (with a
// warning from `required`) so local setup stays frictionless.
if (isProd && (!process.env.JWT_SECRET || env.jwtSecret === DEV_JWT_SECRET)) {
  throw new Error(
    'JWT_SECRET must be set to a strong, unique value in production (the dev fallback is not allowed).',
  )
}

if (isProd && !env.supabase.dbUrl) {
  console.warn('[env] NODE_ENV=production but SUPABASE_DB_URL is not set')
}

if (env.storage.driver === 'supabase' && (!env.supabase.url || !env.supabase.serviceRoleKey)) {
  console.warn(
    '[env] storage driver is "supabase" but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not both set',
  )
}

// The knex connection. In production we connect to Supabase, which requires SSL
// (its pooler presents a cert Node won't verify by default, hence
// `rejectUnauthorized: false`). In development we use the local Postgres —
// preferring a full DATABASE_URL, else the discrete PG* parts.
export const dbConnection = isProd
  ? {
      connectionString: env.supabase.dbUrl,
      ssl: { rejectUnauthorized: false },
    }
  : env.databaseUrl || {
      host: env.pg.host,
      port: env.pg.port,
      user: env.pg.user,
      password: env.pg.password,
      database: env.pg.database,
    }
