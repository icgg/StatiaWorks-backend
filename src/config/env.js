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
  // We use Supabase purely as a hosted Postgres (via Knex) — NOT its auth or
  // REST layer. Only `dbUrl` is required in production; the project URL / API
  // keys are optional placeholders kept for any future Supabase-SDK use.
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

  jwtSecret: required('JWT_SECRET', 'dev-insecure-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  adminEmail: (process.env.ADMIN_EMAIL || '').toLowerCase(),
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',

  uploadDir: path.resolve(ROOT, process.env.UPLOAD_DIR || 'uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 8),
}

if (isProd && !env.supabase.dbUrl) {
  console.warn('[env] NODE_ENV=production but SUPABASE_DB_URL is not set')
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
