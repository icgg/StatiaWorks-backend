// Employer portal (`/me/*`, role=employer): posts CRUD, applicants, and the
// company profile. `req.employer` is populated by loadEmployer; write routes
// also pass requireActiveEmployer (lockout enforcement).

import { db } from '../db/knex.js'
import { asyncHandler, badRequest, notFoundError, forbidden } from '../middleware/error.js'
import { intParam, assertEnum, assertEnumOptional } from '../middleware/validate.js'
import { dedupeStored } from '../utils/fileDedup.js'
import { parseSalary } from '../utils/salary.js'
import { shapeEmployerPost, shapeApplicant } from '../utils/shape.js'
import { canonicalFromApplicantAction } from '../utils/status.js'
import { EMPLOYMENT_TYPES, SECTORS, APPLICANT_ACTIONS } from '../validators/enums.js'

// ---- Posts ---------------------------------------------------------------

export const listPosts = asyncHandler(async (req, res) => {
  const jobs = await db('jobs')
    .where({ employer_id: req.employer.id })
    .whereNot('status', 'removed')
    .orderBy('date_posted', 'desc')
    .orderBy('id', 'desc')

  const ids = jobs.map((j) => j.id)
  const apps = ids.length
    ? await db('applications').whereIn('job_id', ids).orderBy('date_applied', 'desc')
    : []
  const byJob = new Map()
  for (const a of apps) {
    if (!byJob.has(a.job_id)) byJob.set(a.job_id, [])
    byJob.get(a.job_id).push(shapeApplicant(a))
  }

  res.json(jobs.map((j) => shapeEmployerPost(j, { applicants: byJob.get(j.id) || [] })))
})

// Build a job DB record from the JobCreateView payload (with guardrails).
function jobRecordFromPayload(b, employerId) {
  if (!b.title || !String(b.title).trim()) throw badRequest('A job title is required.')
  assertEnum(b.category, SECTORS, 'sector')
  assertEnum(b.type, EMPLOYMENT_TYPES, 'employment type')

  const { min, max, period, disclosed } = parseSalary(b.salary)
  const apply = b.apply || {
    requireCv: true,
    requireCoverLetter: false,
    allowCoverMessage: true,
    questions: [],
  }
  const form_data = {
    salary: b.salary || '',
    salaryPeriod: period,
    salaryDisclosed: disclosed,
    description: b.description || '',
    responsibilities: b.responsibilities || [],
    requirements: b.requirements || [],
    aboutCompany: b.aboutCompany || '',
    apply,
  }
  if (b.sections) form_data.sections = b.sections
  if (b.blurb) form_data.blurb = b.blurb

  return {
    title: String(b.title).trim(),
    sector: b.category,
    employment_type: b.type,
    salary_min: min,
    salary_max: max,
    deadline: b.deadline || null,
    employer_id: employerId,
    form_data,
  }
}

export const createPost = asyncHandler(async (req, res) => {
  const record = jobRecordFromPayload(req.body || {}, req.employer.id)
  record.status = 'active'
  record.date_posted = new Date().toISOString().slice(0, 10)
  const [row] = await db('jobs').insert(record).returning('*')
  res.status(201).json(shapeEmployerPost(row, { applicants: [] }))
})

async function ownedJob(employerId, id) {
  const job = await db('jobs').where({ id, employer_id: employerId }).first()
  if (!job) throw notFoundError('Job not found.')
  return job
}

export const updatePost = asyncHandler(async (req, res) => {
  const id = intParam(req.params.id)
  await ownedJob(req.employer.id, id)
  const record = jobRecordFromPayload(req.body || {}, req.employer.id)
  // Never change ownership; keep id/date_posted/status/applicants untouched.
  delete record.employer_id
  const [row] = await db('jobs').where({ id }).update(record).returning('*')
  res.json(shapeEmployerPost(row))
})

export const patchPost = asyncHandler(async (req, res) => {
  const id = intParam(req.params.id)
  const job = await ownedJob(req.employer.id, id)
  const action = req.body?.action
  if (action === 'close') {
    // closed_at is stamped only on the *first* close (COALESCE keeps the
    // original). This anchors the 6-month attachment-retention clock so it
    // can't be reset by toggling a posting closed → open → closed.
    // closed_by_lockout: false — this is a voluntary close, not a lockout, so it
    // must not auto-reopen on a later reactivation.
    await db('jobs')
      .where({ id })
      .update({ status: 'closed', closed_by_lockout: false, closed_at: db.raw('COALESCE(closed_at, now())') })
  } else if (action === 'reopen') {
    // Reopening keeps closed_at (the first-close timestamp) intact.
    await db('jobs').where({ id }).update({ status: 'active', closed_by_lockout: false })
  } else {
    throw badRequest("Unknown action. Expected 'close' or 'reopen'.")
  }
  const [row] = await db('jobs').where({ id }).select('*')
  res.json(shapeEmployerPost(row))
})

export const deletePost = asyncHandler(async (req, res) => {
  const id = intParam(req.params.id)
  await ownedJob(req.employer.id, id)
  // Applications reference the job (no cascade in schema) — remove them first.
  await db('applications').where({ job_id: id }).del()
  await db('jobs').where({ id }).del()
  res.json({ ok: true })
})

// ---- Applicants ----------------------------------------------------------

export const listApplicants = asyncHandler(async (req, res) => {
  const postId = intParam(req.params.id)
  await ownedJob(req.employer.id, postId)
  const rows = await db('applications').where({ job_id: postId }).orderBy('date_applied', 'desc')
  res.json(rows.map(shapeApplicant))
})

export const setApplicantStatus = asyncHandler(async (req, res) => {
  const postId = intParam(req.params.postId, 'postId')
  const applicantId = intParam(req.params.applicantId, 'applicantId')
  await ownedJob(req.employer.id, postId)

  const action = req.body?.status
  assertEnum(action, APPLICANT_ACTIONS, 'status')
  const canonical = canonicalFromApplicantAction(action)

  const app = await db('applications').where({ id: applicantId, job_id: postId }).first()
  if (!app) throw notFoundError('Applicant not found.')

  const patch = { status: canonical }
  if (canonical === 'approved' || canonical === 'rejected') {
    patch.reviewed_at = db.fn.now()
    patch.seeker_seen = false // surfaces the "new response" dot to the seeker
  } else {
    patch.reviewed_at = null
  }
  const [row] = await db('applications').where({ id: applicantId }).update(patch).returning('*')
  res.json(shapeApplicant(row))
})

// ---- Company profile -----------------------------------------------------

function displayDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function shapeCompany(employer, email) {
  const locked = !employer.paid && !employer.trial
  let billingNote = 'Account locked — add a payment method to reactivate.'
  if (employer.paid) billingNote = 'Active subscription.'
  else if (employer.trial) {
    const days = employer.trial_end_date
      ? Math.max(0, Math.ceil((new Date(employer.trial_end_date) - Date.now()) / 86400000))
      : 30
    billingNote = `Trial — first month free (${days} days remaining)`
  }
  return {
    company: employer.company,
    fname: employer.fname,
    lname: employer.lname,
    email,
    phone: employer.phone || '',
    address: employer.address || '',
    city: employer.city || '',
    logo: employer.logo_url || '',
    billingNote,
    paid: employer.paid,
    trial: employer.trial,
    trial_end_date: displayDate(employer.trial_end_date),
    locked,
  }
}

export const getCompany = asyncHandler(async (req, res) => {
  res.json(shapeCompany(req.employer, req.account.email))
})

export const updateCompany = asyncHandler(async (req, res) => {
  const b = req.body || {}
  const patch = {
    company: b.company ?? req.employer.company,
    fname: b.fname ?? req.employer.fname,
    lname: b.lname ?? req.employer.lname,
    phone: b.phone ?? req.employer.phone,
    address: b.address ?? req.employer.address,
    city: b.city ?? req.employer.city,
  }
  if (req.file) patch.logo_url = await dedupeStored('logos', req.file)

  await db('employers').where({ id: req.employer.id }).update(patch)
  const updated = await db('employers').where({ id: req.employer.id }).first()
  res.json(shapeCompany(updated, req.account.email))
})
