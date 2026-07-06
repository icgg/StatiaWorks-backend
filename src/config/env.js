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

export const env = {
  root: ROOT,
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),

  databaseUrl: process.env.DATABASE_URL || null,
  pg: {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'statiaworks',
  },

  appOrigins: (process.env.APP_ORIGINS || 'http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Public app base URL (for links in emails). Falls back to the first origin.
  appUrl: (
    process.env.APP_URL ||
    (process.env.APP_ORIGINS || 'http://localhost:5173').split(',')[0]
  ).replace(/\/$/, ''),

  // Email (Resend). Left blank in dev → the mailer logs to the console.
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || 'StatiaWorks <onboarding@resend.dev>',

  jwtSecret: required('JWT_SECRET', 'dev-insecure-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  adminEmail: (process.env.ADMIN_EMAIL || '').toLowerCase(),
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',

  uploadDir: path.resolve(ROOT, process.env.UPLOAD_DIR || 'uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 8),

  get isProd() {
    return this.nodeEnv === 'production'
  },
}

// The knex connection: prefer a full URL, else assemble from PG* parts.
export const dbConnection = env.databaseUrl || {
  host: env.pg.host,
  port: env.pg.port,
  user: env.pg.user,
  password: env.pg.password,
  database: env.pg.database,
}
