// Adds accounts.account_type ('employer' | 'seeker') and backfills it from the
// child tables. This denormalises the role onto the account so login can read
// it directly instead of probing both employers/seekers (see auth.controller).
// Additive + idempotent (IF NOT EXISTS / DROP-then-ADD), safe on the live DB.

export async function up(knex) {
  await knex.raw(`
    ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS account_type TEXT;

    -- Backfill legacy rows from the owning child table: an account with an
    -- employers row is an 'employer', one with a seekers row is a 'seeker'.
    UPDATE accounts a
      SET account_type = 'employer'
      FROM employers e
      WHERE e.account_id = a.id AND a.account_type IS NULL;

    UPDATE accounts a
      SET account_type = 'seeker'
      FROM seekers s
      WHERE s.account_id = a.id AND a.account_type IS NULL;

    ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_account_type_check;
    ALTER TABLE accounts ADD  CONSTRAINT accounts_account_type_check
      CHECK (account_type IS NULL OR account_type IN ('employer','seeker'));
  `)
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_account_type_check;
    ALTER TABLE accounts DROP COLUMN IF EXISTS account_type;
  `)
}
