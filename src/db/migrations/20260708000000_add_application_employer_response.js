// Additive: an employer's decision message to the applicant, attached when a
// candidate is approved/rejected and shown to the seeker on their reviewed
// application. Employer-authored review metadata — it lives beside reviewed_at /
// seeker_seen, NOT inside form_data (that jsonb is the seeker's own submission).

export async function up(knex) {
  await knex.raw(`
    ALTER TABLE applications
      ADD COLUMN IF NOT EXISTS employer_response TEXT;
  `)
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE applications DROP COLUMN IF EXISTS employer_response;
  `)
}
