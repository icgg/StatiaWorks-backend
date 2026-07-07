// Payments/invoices (Stage 9). Adds the `invoices` table backing the MCB
// bank-transfer flow (manual admin verification) plus the monthly/annual plan
// column on employers. Additive + idempotent (IF [NOT] EXISTS + DROP-then-ADD
// for constraints) to match the rest of the migration set.
//
//   invoices.status:        awaiting -> pending -> paid  (+ void)   (INVOICE_STATUS)
//   invoices.payment_method: mcb | stripe                           (INVOICE_METHOD)
//   invoices.plan_interval / employers.plan_interval: monthly|annual (PLAN_INTERVAL)
//
// `balance` is what's still owed (= amount while unpaid, 0 once paid); `amount`
// is the immutable line price ($5 / $50). The partial unique index guarantees at
// most one open (non-void) invoice per employer per due date, so the daily
// generation cron can't create duplicates.

export async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS invoices(
      id             SERIAL PRIMARY KEY,
      employer_id    INT NOT NULL REFERENCES employers(id),
      status         TEXT NOT NULL DEFAULT 'awaiting',
      payment_method TEXT NOT NULL DEFAULT 'mcb',
      plan_interval  TEXT NOT NULL DEFAULT 'monthly',
      amount         NUMERIC(8,2) NOT NULL,
      balance        NUMERIC(8,2) NOT NULL,
      description    TEXT,
      due_date       DATE NOT NULL,
      proof_url      TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      paid_at        TIMESTAMPTZ,
      verified_at    TIMESTAMPTZ
    );

    ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
    ALTER TABLE invoices ADD  CONSTRAINT invoices_status_check
      CHECK (status IN ('awaiting','pending','paid','void'));

    ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_method_check;
    ALTER TABLE invoices ADD  CONSTRAINT invoices_method_check
      CHECK (payment_method IN ('mcb','stripe'));

    ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_interval_check;
    ALTER TABLE invoices ADD  CONSTRAINT invoices_interval_check
      CHECK (plan_interval IN ('monthly','annual'));

    -- At most one OPEN (non-void) invoice per employer per due date. The
    -- generation cron relies on this to stay idempotent; a superseded invoice is
    -- set to 'void' so it drops out of the index and a replacement can be issued.
    CREATE UNIQUE INDEX IF NOT EXISTS invoices_emp_due_uidx
      ON invoices(employer_id, due_date) WHERE status <> 'void';

    -- Admin console lists by status (awaiting/pending needing attention).
    CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices(status);

    -- ===== employers: billing cadence =========================================
    -- Which plan the employer is on, so the crons know whether to bill $5/$50 and
    -- advance next_payment_date by 30 days or 1 year.
    ALTER TABLE employers
      ADD COLUMN IF NOT EXISTS plan_interval TEXT NOT NULL DEFAULT 'monthly';

    ALTER TABLE employers DROP CONSTRAINT IF EXISTS employers_interval_check;
    ALTER TABLE employers ADD  CONSTRAINT employers_interval_check
      CHECK (plan_interval IN ('monthly','annual'));
  `)
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE employers DROP CONSTRAINT IF EXISTS employers_interval_check;
    ALTER TABLE employers DROP COLUMN IF EXISTS plan_interval;

    DROP INDEX IF EXISTS invoices_status_idx;
    DROP INDEX IF EXISTS invoices_emp_due_uidx;
    DROP TABLE IF EXISTS invoices;
  `)
}
