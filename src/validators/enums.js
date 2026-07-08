// Allowed values for predefined-choice fields. The single source of truth for
// both the backend validation layer (validate.js) and the DB CHECK constraints
// (migration 04). Keep this in sync with the frontend <select> options.

// Employment types offered by the job creator (JobCreateView `TYPES`).
export const EMPLOYMENT_TYPES = [
  'Full-time',
  'Part-time',
  'Contract',
  'Internship',
  'Volunteership',
  'Apprenticeship',
]

// Island job sectors (src/data/sectors.js `name`s). `category` on a post === one
// of these.
export const SECTORS = [
  'Tourism & Dive',
  'Hospitality',
  'Trades & Construction',
  'Marine & Port',
  'Government',
  'Healthcare',
  'Retail',
  'Education',
]

// Canonical application status stored in `applications.status`. Two views are
// derived from it (see utils/status.js): the employer pill (new/approved/
// rejected) and the seeker tab (active/reviewed/archived).
export const APPLICATION_STATUS = ['submitted', 'approved', 'rejected', 'withdrawn']

// Account moderation status (accounts.status). `pending` = email not yet
// verified; `active` after verification; `suspended` by an admin.
export const ACCOUNT_STATUS = ['active', 'suspended', 'pending']

// Salary period suffixes the job creator offers.
export const SALARY_PERIODS = ['mo', 'hr', 'yr']

// What an employer may set an applicant to (maps to canonical status). Screening
// is a one-time terminal decision — there is no revert to "new", so the only
// valid actions are the two final outcomes.
export const APPLICANT_ACTIONS = ['approved', 'rejected']

// Admin post-moderation actions.
export const POST_MODERATION = ['active', 'flagged', 'removed']

// Invoice lifecycle (invoices.status). `awaiting` = issued, waiting on a bank
// transfer; `pending` = the employer uploaded proof, waiting on admin
// verification; `paid` = admin verified; `void` = superseded/cancelled. There is
// no persisted `overdue` — it's a time-derived flag (unpaid + past due_date).
export const INVOICE_STATUS = ['awaiting', 'pending', 'paid', 'void']

// Payment rails. Only MCB bank transfer is live; Stripe is deferred (shown as
// "Coming soon" in the UI) — kept here so the CHECK allows it when it lands.
export const INVOICE_METHOD = ['mcb', 'stripe']

// Billing cadence (employers.plan_interval + invoices.plan_interval).
export const PLAN_INTERVAL = ['monthly', 'annual']
