// Seeker portal (`/me/*`, role=seeker): the application tracker + profile.

import path from 'node:path'
import { db } from '../db/knex.js'
import { asyncHandler, badRequest, notFoundError, conflict } from '../middleware/error.js'
import { intParam, parseJsonField } from '../middleware/validate.js'
import { dedupeStored } from '../utils/fileDedup.js'
import { shapeSeekerApplication } from '../utils/shape.js'
import { sendNewApplicantEmail } from '../email/index.js'

async function getSeeker(accountId) {
  return db('seekers').where({ account_id: accountId }).first()
}

// Join used to shape a seeker's applications (see utils/shape.js aliases).
function applicationsQuery(seekerId) {
  return db('applications')
    .join('jobs', 'jobs.id', 'applications.job_id')
    .join('employers', 'employers.id', 'jobs.employer_id')
    .join('accounts', 'accounts.id', 'employers.account_id')
    .where('applications.seeker_id', seekerId)
    .select(
      'applications.id',
      'applications.status',
      'applications.date_applied',
      'applications.reviewed_at',
      'applications.seeker_seen',
      'applications.employer_response',
      'applications.cover_url',
      'applications.form_data',
      'applications.job_id',
      'jobs.status as job_status',
      'jobs.title as job_title',
      'jobs.salary_min',
      'jobs.salary_max',
      'jobs.employment_type',
      'jobs.form_data as job_form_data',
      'employers.company as company',
      'accounts.email as employer_email', // for the seeker's "Reply by email" seam
    )
}

export const listApplications = asyncHandler(async (req, res) => {
  const seeker = await getSeeker(req.account.id)
  if (!seeker) throw notFoundError('Seeker profile not found.')
  // Soft-deleted (seeker_hidden) rows are kept for the employer's record + the
  // re-apply lock, but never shown back to the seeker.
  const rows = await applicationsQuery(seeker.id)
    .andWhere('applications.seeker_hidden', false)
    .orderBy('applications.date_applied', 'desc')
  res.json(rows.map(shapeSeekerApplication))
})

export const apply = asyncHandler(async (req, res) => {
  const seeker = await getSeeker(req.account.id)
  if (!seeker) throw notFoundError('Seeker profile not found.')

  const b = req.body || {}
  const jobId = intParam(b.jobId, 'jobId')
  const job = await db('jobs').where({ id: jobId }).first()
  if (!job || job.status !== 'active') throw badRequest('This posting is no longer open.')

  const already = await db('applications').where({ seeker_id: seeker.id, job_id: jobId }).first()
  if (already && already.status !== 'withdrawn') {
    throw conflict('You have already applied to this job.')
  }

  const applyCfg = job.form_data?.apply || {}
  const resumeFile = req.files?.resume?.[0]
  const coverFile = req.files?.cover?.[0]
  const account = await db('accounts').where({ id: req.account.id }).first()

  const resumeUrl = resumeFile ? await dedupeStored('resumes', resumeFile) : seeker.resume_url || null
  if (applyCfg.requireCv && !resumeUrl) throw badRequest('This job requires a résumé.')
  const coverUrl = coverFile ? await dedupeStored('cover-letters', coverFile) : null
  if (applyCfg.requireCoverLetter && !coverUrl) throw badRequest('This job requires a cover-letter document.')

  const formData = {
    fname: b.fname || seeker.fname,
    lname: b.lname || seeker.lname,
    email: b.email || account?.email,
    phone: b.phone || seeker.phone || '',
    address: b.address || [seeker.city, seeker.island, seeker.country].filter(Boolean).join(', '),
    headline: b.headline || '',
    coverMessage: b.message || b.coverMessage || '',
    screening: parseJsonField(b.screening, {}),
    customAnswers: parseJsonField(b.answers ?? b.customAnswers, {}),
  }

  const record = {
    seeker_id: seeker.id,
    job_id: jobId,
    status: 'submitted',
    date_applied: new Date().toISOString().slice(0, 10),
    reviewed_at: null,
    seeker_seen: true,
    seeker_hidden: false, // a fresh application is visible again to the seeker
    resume_url: resumeUrl,
    cover_url: coverUrl,
    form_data: formData,
  }

  // Re-applying to a previously withdrawn posting overwrites the old row.
  if (already) {
    await db('applications').where({ seeker_id: seeker.id, job_id: jobId }).update(record)
  } else {
    await db('applications').insert(record)
  }

  const [row] = await applicationsQuery(seeker.id).andWhere('applications.job_id', jobId)

  // Alert the employer of the new applicant (respecting their preference).
  await notifyEmployerOfApplicant(job, formData, record.date_applied)

  res.status(201).json(shapeSeekerApplication(row))
})

// Email the employer that owns `job` about a new application. Best-effort:
// gated on the employer's alerts_enabled flag and wrapped so a lookup/mail
// failure can never fail the application itself (sendEmail also never throws).
async function notifyEmployerOfApplicant(job, formData, appliedOn) {
  try {
    const employer = await db('employers')
      .join('accounts', 'accounts.id', 'employers.account_id')
      .where('employers.id', job.employer_id)
      .first('employers.company', 'employers.alerts_enabled', 'accounts.email')
    if (!employer || !employer.alerts_enabled || !employer.email) return

    const applicantName = [formData.fname, formData.lname].filter(Boolean).join(' ').trim()
    await sendNewApplicantEmail({
      email: employer.email,
      company: employer.company,
      jobId: job.id,
      jobTitle: job.title,
      applicantName,
      headline: formData.headline,
      appliedOn,
    })
  } catch (err) {
    console.error('[email] new-applicant alert failed:', err)
  }
}

export const updateApplication = asyncHandler(async (req, res) => {
  const seeker = await getSeeker(req.account.id)
  const id = intParam(req.params.id)
  const app = await db('applications').where({ id, seeker_id: seeker.id }).first()
  if (!app) throw notFoundError('Application not found.')

  const action = req.body?.action
  if (action === 'withdraw') {
    // Unsubmit is valid only on a still-pending application. Once the employer
    // has decided (approved/rejected) the outcome is terminal and read-only for
    // the seeker — this is what stops a withdraw→reapply round-trip from
    // silently undoing the employer's one-time decision (see status.js). A
    // withdrawn app is already gone.
    if (app.status !== 'submitted') {
      throw conflict('This application can no longer be unsubmitted.')
    }
    await db('applications').where({ id }).update({ status: 'withdrawn' })
  } else if (action === 'reapply') {
    // Re-apply only resurrects a withdrawn application, never a reviewed one.
    if (app.status !== 'withdrawn') {
      throw conflict('Only a withdrawn application can be re-submitted.')
    }
    const job = await db('jobs').where({ id: app.job_id }).first()
    if (!job || job.status !== 'active') throw badRequest('This posting is no longer open.')
    // Clear the stale decision fields so the resurrected row is genuinely fresh.
    await db('applications')
      .where({ id })
      .update({ status: 'submitted', reviewed_at: null, seeker_seen: true, employer_response: null, seeker_hidden: false })
  } else if (action === 'seen') {
    await db('applications').where({ id }).update({ seeker_seen: true })
  } else {
    throw badRequest("Unknown action. Expected 'withdraw', 'reapply', or 'seen'.")
  }

  const [row] = await applicationsQuery(seeker.id).andWhere('applications.id', id)
  res.json(shapeSeekerApplication(row))
})

// Seeker "Delete" is a SOFT delete — it hides the application from the seeker's
// own tracker but keeps the row, because (a) a reviewed application is the
// employer's decision record / audit trail, and (b) the one-app-per-job
// re-apply lock (see `apply`) reads this row, so hard-deleting would let a
// rejected candidate wipe the rejection and re-apply. Only the employer
// hard-deleting the application (deleteApplicant) truly removes it and frees a
// re-apply. A still-pending app is also withdrawn on delete so it leaves the
// employer's live queue (withdrawn apps are hidden from the employer).
export const deleteApplication = asyncHandler(async (req, res) => {
  const seeker = await getSeeker(req.account.id)
  const id = intParam(req.params.id)
  const app = await db('applications').where({ id, seeker_id: seeker.id }).first()
  if (!app) throw notFoundError('Application not found.')

  const patch = { seeker_hidden: true }
  if (app.status === 'submitted') patch.status = 'withdrawn'
  await db('applications').where({ id }).update(patch)
  res.json({ ok: true })
})

function shapeProfile(seeker, email) {
  return {
    fname: seeker.fname,
    lname: seeker.lname,
    email,
    phone: seeker.phone || '',
    city: seeker.city || '',
    country: seeker.country || '',
    island: seeker.island || '',
    resumeName: seeker.resume_url ? path.basename(seeker.resume_url) : '',
    resumeUrl: seeker.resume_url || '',
  }
}

export const getProfile = asyncHandler(async (req, res) => {
  const seeker = await getSeeker(req.account.id)
  if (!seeker) throw notFoundError('Seeker profile not found.')
  res.json(shapeProfile(seeker, req.account.email))
})

export const updateProfile = asyncHandler(async (req, res) => {
  const seeker = await getSeeker(req.account.id)
  if (!seeker) throw notFoundError('Seeker profile not found.')

  const b = req.body || {}
  const patch = {
    fname: b.fname ?? seeker.fname,
    lname: b.lname ?? seeker.lname,
    phone: b.phone ?? seeker.phone,
    city: b.city ?? seeker.city,
    country: b.country ?? seeker.country,
    island: b.island ?? seeker.island,
  }
  if (req.file) patch.resume_url = await dedupeStored('resumes', req.file)

  await db('seekers').where({ id: seeker.id }).update(patch)
  const updated = await getSeeker(req.account.id)
  res.json(shapeProfile(updated, req.account.email))
})
