// Additive, non-destructive extension of the hand-created schema (schema.txt).
// The base tables (accounts, employers, seekers, jobs, applications) already
// exist; this migration only ADDs the columns/constraints the frontend needs.
// Written idempotently (IF [NOT] EXISTS + DROP-then-ADD for constraints) so it
// is safe to run against the live DB.

export async function up(knex) {
  await knex.raw(`
    -- ===== accounts: moderation status + auth tokens ============================
    ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS verify_token   TEXT,
      ADD COLUMN IF NOT EXISTS verify_expires TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reset_token    TEXT,
      ADD COLUMN IF NOT EXISTS reset_expires  TIMESTAMPTZ;

    ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_status_check;
    ALTER TABLE accounts ADD  CONSTRAINT accounts_status_check
      CHECK (status IN ('active','suspended','pending'));

    -- ===== employers: address + city (company profile) =========================
    ALTER TABLE employers
      ADD COLUMN IF NOT EXISTS address TEXT,
      ADD COLUMN IF NOT EXISTS city    TEXT;

    -- ===== jobs: open/closed lifecycle + moderation ============================
    ALTER TABLE jobs
      ADD COLUMN IF NOT EXISTS status    TEXT NOT NULL DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

    ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
    ALTER TABLE jobs ADD  CONSTRAINT jobs_status_check
      CHECK (status IN ('active','closed','flagged','removed'));

    -- Guardrails (plan §2.1): predefined-choice fields.
    ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_employment_type_check;
    ALTER TABLE jobs ADD  CONSTRAINT jobs_employment_type_check
      CHECK (employment_type IS NULL OR employment_type IN
        ('Full-time','Part-time','Contract','Internship','Volunteership','Apprenticeship'));

    ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_sector_check;
    ALTER TABLE jobs ADD  CONSTRAINT jobs_sector_check
      CHECK (sector IS NULL OR sector IN
        ('Tourism & Dive','Hospitality','Trades & Construction','Marine & Port',
         'Government','Healthcare','Retail','Education'));

    -- ===== applications: surrogate id + review tracking + status guard =========
    -- Adding a SERIAL column fills existing rows via the sequence default.
    ALTER TABLE applications
      ADD COLUMN IF NOT EXISTS id SERIAL,
      ADD COLUMN IF NOT EXISTS reviewed_at  TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS seeker_seen  BOOLEAN NOT NULL DEFAULT false;

    -- Address applications individually by id (the composite PK stays as-is).
    CREATE UNIQUE INDEX IF NOT EXISTS applications_id_key ON applications(id);

    ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_status_check;
    ALTER TABLE applications ADD  CONSTRAINT applications_status_check
      CHECK (status IS NULL OR status IN
        ('submitted','approved','rejected','withdrawn'));
  `)
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_status_check;
    DROP INDEX IF EXISTS applications_id_key;
    ALTER TABLE applications
      DROP COLUMN IF EXISTS seeker_seen,
      DROP COLUMN IF EXISTS reviewed_at,
      DROP COLUMN IF EXISTS id;

    ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_sector_check;
    ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_employment_type_check;
    ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
    ALTER TABLE jobs DROP COLUMN IF EXISTS closed_at, DROP COLUMN IF EXISTS status;

    ALTER TABLE employers DROP COLUMN IF EXISTS city, DROP COLUMN IF EXISTS address;

    ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_status_check;
    ALTER TABLE accounts
      DROP COLUMN IF EXISTS reset_expires,
      DROP COLUMN IF EXISTS reset_token,
      DROP COLUMN IF EXISTS verify_expires,
      DROP COLUMN IF EXISTS verify_token,
      DROP COLUMN IF EXISTS status;
  `)
}
