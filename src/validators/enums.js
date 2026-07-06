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

// What an employer may set an applicant to (maps to canonical status).
export const APPLICANT_ACTIONS = ['new', 'approved', 'rejected']

// Admin post-moderation actions.
export const POST_MODERATION = ['active', 'flagged', 'removed']
