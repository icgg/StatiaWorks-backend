// Soft-delete for the seeker's application list. Adds `applications.seeker_hidden`
// — set when a seeker "Deletes" an application from their own tracker. The row is
// kept (not physically removed) so:
//   1. the employer's decided-applicant record survives as their audit trail, and
//   2. the one-application-per-job re-apply lock still sees the row, so a seeker
//      can't dodge a rejection by deleting-then-reapplying. Only the employer
//      hard-deleting the application frees the seeker to apply again.
//
// The seeker's list filters out seeker_hidden rows; the employer already only
// sees non-`withdrawn` applications (see employer.controller.js), so a hidden
// row that was reviewed stays visible to the employer as their record.
// Existing rows backfill to false (default).

export async function up(knex) {
  await knex.raw(`
    ALTER TABLE applications
      ADD COLUMN IF NOT EXISTS seeker_hidden BOOLEAN NOT NULL DEFAULT false;
  `)
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE applications DROP COLUMN IF EXISTS seeker_hidden;
  `)
}
