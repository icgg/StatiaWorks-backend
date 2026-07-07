// Lockout auto-reopen support. Adds `jobs.closed_by_lockout` — a marker set when
// a posting is force-closed because its employer became *locked* (neither `paid`
// nor `trial`). It lets reactivation reopen exactly the postings the lockout took
// down, without resurrecting listings the employer had closed on purpose.
//
// Invariant: closed_by_lockout = true  ⟺  the posting is currently closed AND
// that closure was the lockout's doing. Only the lockout takedown sets it true;
// every other status change (manual close/reopen, admin moderation, reactivation
// reopen) sets it back to false. Existing rows backfill to false (default), so
// only future lockout closures are eligible for auto-reopen.

export async function up(knex) {
  await knex.raw(`
    ALTER TABLE jobs
      ADD COLUMN IF NOT EXISTS closed_by_lockout BOOLEAN NOT NULL DEFAULT false;

    -- Reactivation reopens by (employer_id, closed_by_lockout); index the flag.
    CREATE INDEX IF NOT EXISTS jobs_closed_by_lockout_idx
      ON jobs(employer_id) WHERE closed_by_lockout;
  `)
}

export async function down(knex) {
  await knex.raw(`
    DROP INDEX IF EXISTS jobs_closed_by_lockout_idx;
    ALTER TABLE jobs DROP COLUMN IF EXISTS closed_by_lockout;
  `)
}
