// Denormalisers: turn joined DB rows into the exact shapes the frontend
// components already consume (the dummy shapes in app/src/data/*). Keeping this
// in one place means the API contract lives next to the data model.

import { daysSince, isoDate, isoAddMonths } from './dates.js'
import { formatSalary } from './salary.js'
import { buildDocuments } from './documents.js'
import { employerPill, seekerTab, seekerStage } from './status.js'
import { env } from '../config/env.js'

// Resolve a job's salary display string: prefer the stored verbatim string
// (round-trip fidelity incl. "not disclosed"), else format from columns.
function salaryOf(row, fd) {
  if (fd && typeof fd.salary === 'string') return fd.salary
  return formatSalary({
    min: row.salary_min,
    max: row.salary_max,
    period: fd?.salaryPeriod || 'mo',
    disclosed: fd?.salaryDisclosed !== false && (row.salary_min != null || row.salary_max != null),
  })
}

// Public job-detail / board card. `row` = jobs row joined with employers.company.
export function shapeJob(row) {
  const fd = row.form_data || {}
  const job = {
    id: row.id,
    title: row.title,
    company: row.company,
    type: row.employment_type,
    category: row.sector,
    salary: salaryOf(row, fd),
    postedDaysAgo: daysSince(row.date_posted),
    deadline: isoDate(row.deadline),
    logo: row.logo_url || '',
  }
  // Optional rich fields (JobView guards each with v-if).
  if (fd.description) job.description = fd.description
  if (fd.responsibilities) job.responsibilities = fd.responsibilities
  if (fd.requirements) job.requirements = fd.requirements
  if (fd.aboutCompany) job.aboutCompany = fd.aboutCompany
  if (fd.sections) job.sections = fd.sections
  if (fd.apply) job.apply = fd.apply
  if (fd.blurb) job.blurb = fd.blurb
  return job
}

// Employer portal post card. `row` = jobs row; `applicantCount`/`newCount` from
// aggregate; `applicants` optional (full list for the dialog/detail).
export function shapeEmployerPost(row, { applicants } = {}) {
  const fd = row.form_data || {}
  const post = {
    id: row.id,
    title: row.title,
    category: row.sector,
    type: row.employment_type,
    salary: salaryOf(row, fd),
    postedDaysAgo: daysSince(row.date_posted),
    status: row.status === 'closed' ? 'closed' : 'active',
    deadline: isoDate(row.deadline),
  }
  if (row.status === 'closed') {
    post.closedDaysAgo = daysSince(row.closed_at)
    // When the attachments for this closed job are scheduled to be removed
    // (closed_at + retention window). Drives the employer's download-before
    // notice. Only meaningful once closed_at is set.
    if (row.closed_at) {
      post.attachmentsExpireOn = isoAddMonths(row.closed_at, env.attachmentRetentionMonths)
    }
  }
  if (fd.description) post.description = fd.description
  if (fd.responsibilities) post.responsibilities = fd.responsibilities
  if (fd.requirements) post.requirements = fd.requirements
  if (fd.aboutCompany) post.aboutCompany = fd.aboutCompany
  if (fd.sections) post.sections = fd.sections
  if (fd.apply) post.apply = fd.apply
  if (applicants) post.applicants = applicants
  return post
}

// One applicant, from the employer's perspective. `row` = applications row.
export function shapeApplicant(row) {
  const fd = row.form_data || {}
  return {
    id: row.id,
    fname: fd.fname,
    lname: fd.lname,
    email: fd.email,
    phone: fd.phone,
    address: fd.address,
    appliedDaysAgo: daysSince(row.date_applied),
    status: employerPill(row.status),
    headline: fd.headline,
    coverMessage: fd.coverMessage || '',
    screening: fd.screening || {},
    customAnswers: fd.customAnswers || {},
    employerResponse: row.employer_response || '', // the note sent on approve/reject
    documents: buildDocuments(row),
  }
}

// One application, from the seeker's perspective. `row` = applications row joined
// with its job (title/company/type/salary/job status).
export function shapeSeekerApplication(row) {
  const jobLive = row.job_status === 'active'
  const fd = row.form_data || {}
  const app = {
    id: row.id,
    jobId: jobLive ? row.job_id : null,
    title: row.job_title,
    company: row.company,
    type: row.employment_type,
    salary: row.job_form_data ? salaryOf({ salary_min: row.salary_min, salary_max: row.salary_max }, row.job_form_data) : '',
    status: seekerTab(row.status, jobLive),
    stage: seekerStage(row.status, jobLive),
    submittedDaysAgo: daysSince(row.date_applied),
    coverIncluded: !!row.cover_url,
  }
  if (row.reviewed_at) {
    app.reviewedDaysAgo = daysSince(row.reviewed_at)
    if (!row.seeker_seen) app.isNew = true
    // The employer's decision message + a contact for the "Reply by email" seam.
    app.employerResponse = row.employer_response || ''
    app.employerEmail = row.employer_email || ''
  }
  return app
}
