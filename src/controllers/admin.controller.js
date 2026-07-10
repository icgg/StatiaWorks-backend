// Admin console (`/admin/*`). Authenticated by a single env-based admin
// (ADMIN_EMAIL + ADMIN_PASSWORD_HASH). Provides the dashboard stats, unified
// account management, post moderation, and the abuse-flagging clusters.

import crypto from 'node:crypto'
import { db } from '../db/knex.js'
import { env } from '../config/env.js'
import { asyncHandler, badRequest, unauthorized, notFoundError } from '../middleware/error.js'
import { intParam, assertEnum } from '../middleware/validate.js'
import { verifyPassword } from '../utils/password.js'
import { signToken, cookieOptions, ADMIN_COOKIE } from '../utils/jwt.js'
import { daysSince } from '../utils/dates.js'
import { findFlaggedClusters } from '../utils/similarity.js'
import { ACCOUNT_STATUS, POST_MODERATION } from '../validators/enums.js'
import { shapeInvoice } from '../utils/invoices.js'
import { reopenLockedEmployerListings } from '../utils/lockout.js'
import { list as listConnections } from '../log/connectionLog.js'
import { renderBroadcast, sendBroadcastEmail, sendBroadcastCopy } from '../email/index.js'

// ---- Auth ----------------------------------------------------------------

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {}
  if (!env.adminEmail || !env.adminPasswordHash) {
    throw badRequest('Admin login is not configured (set ADMIN_EMAIL / ADMIN_PASSWORD_HASH).')
  }
  const emailOk = String(email || '').toLowerCase() === env.adminEmail
  const passOk = await verifyPassword(password || '', env.adminPasswordHash)
  if (!emailOk || !passOk) throw unauthorized('Invalid admin credentials.')

  const token = signToken({ sub: env.adminEmail, role: 'admin' })
  res.cookie(ADMIN_COOKIE, token, cookieOptions())
  res.json({ token, admin: { email: env.adminEmail } })
})

export const logout = asyncHandler(async (req, res) => {
  res.clearCookie(ADMIN_COOKIE, { ...cookieOptions(), maxAge: undefined })
  res.json({ ok: true })
})

// ---- Unified account rows ------------------------------------------------

function planOf(emp) {
  if (emp.paid) return 'active'
  if (emp.trial) return 'trial'
  return 'lapsed'
}

async function buildAccountRows() {
  const [accounts, employers, seekers, postCounts, appCounts] = await Promise.all([
    db('accounts').select('*'),
    db('employers').select('*'),
    db('seekers').select('*'),
    db('jobs').whereNot('status', 'removed').groupBy('employer_id').select('employer_id').count({ n: '*' }),
    db('applications').groupBy('seeker_id').select('seeker_id').count({ n: '*' }),
  ])

  const empByAccount = new Map(employers.map((e) => [e.account_id, e]))
  const seekerByAccount = new Map(seekers.map((s) => [s.account_id, s]))
  const postCountByEmp = new Map(postCounts.map((r) => [r.employer_id, Number(r.n)]))
  const appCountBySeeker = new Map(appCounts.map((r) => [r.seeker_id, Number(r.n)]))

  return accounts.map((a) => {
    const emp = empByAccount.get(a.id)
    const seeker = seekerByAccount.get(a.id)
    const role = emp ? 'employer' : 'seeker'
    const row = {
      id: a.id,
      role,
      email: a.email,
      status: a.status,
      createdDaysAgo: daysSince(a.created_at),
      lastActiveDaysAgo: a.last_logged_in ? daysSince(a.last_logged_in) : null,
    }
    if (emp) {
      row.fname = emp.fname
      row.lname = emp.lname
      row.companyName = emp.company
      row.plan = planOf(emp)
      row.flagged = !!emp.flagged
      if (emp.trial && emp.trial_end_date) {
        row.trialEndsInDays = Math.max(0, Math.ceil((new Date(emp.trial_end_date) - Date.now()) / 86400000))
      }
      row.postCount = postCountByEmp.get(emp.id) || 0
    } else if (seeker) {
      row.fname = seeker.fname
      row.lname = seeker.lname
      row.applicationCount = appCountBySeeker.get(seeker.id) || 0
    }
    return row
  })
}

// ---- Dashboard -----------------------------------------------------------

export const getStats = asyncHandler(async (req, res) => {
  const rows = await buildAccountRows()
  const employers = rows.filter((r) => r.role === 'employer')
  const seekers = rows.filter((r) => r.role === 'seeker')
  const [{ n: activeJobs }] = await db('jobs').where('status', 'active').count({ n: '*' })
  const [{ n: applications }] = await db('applications').count({ n: '*' })
  const [{ n: pendingInvoices }] = await db('invoices').where('status', 'pending').count({ n: '*' })
  const clusters = findFlaggedClusters(
    employers.map((e) => ({ id: e.id, role: 'employer', companyName: e.companyName, status: e.status, createdDaysAgo: e.createdDaysAgo })),
  )

  res.json({
    accounts: rows.length,
    employers: employers.length,
    seekers: seekers.length,
    activeJobs: Number(activeJobs),
    applications: Number(applications),
    pendingAccounts: rows.filter((r) => r.status === 'pending').length,
    suspendedAccounts: rows.filter((r) => r.status === 'suspended').length,
    lapsedEmployers: employers.filter((e) => e.plan === 'lapsed').length,
    pendingInvoices: Number(pendingInvoices),
    newSignups7d: rows.filter((r) => r.createdDaysAgo <= 7).length,
    flaggedClusters: clusters.length,
  })
})

// ---- Accounts ------------------------------------------------------------

export const listAccounts = asyncHandler(async (req, res) => {
  const { role, status, plan, q } = req.query
  let rows = await buildAccountRows()
  if (role) rows = rows.filter((r) => r.role === role)
  if (status) rows = rows.filter((r) => r.status === status)
  if (plan) rows = rows.filter((r) => r.plan === plan)
  if (q) {
    const needle = String(q).toLowerCase()
    rows = rows.filter((r) =>
      [r.email, r.fname, r.lname, r.companyName].filter(Boolean).some((v) => v.toLowerCase().includes(needle)),
    )
  }
  rows.sort((a, b) => a.createdDaysAgo - b.createdDaysAgo)
  res.json(rows)
})

export const getAccount = asyncHandler(async (req, res) => {
  const id = intParam(req.params.id)
  const rows = await buildAccountRows()
  const row = rows.find((r) => r.id === id)
  if (!row) throw notFoundError('Account not found.')
  res.json(row)
})

export const setAccountStatus = asyncHandler(async (req, res) => {
  const id = intParam(req.params.id)
  const status = req.body?.status
  assertEnum(status, ACCOUNT_STATUS, 'status')
  const count = await db('accounts').where({ id }).update({ status })
  if (!count) throw notFoundError('Account not found.')
  res.json({ ok: true, status })
})

export const resetPassword = asyncHandler(async (req, res) => {
  const id = intParam(req.params.id)
  const account = await db('accounts').where({ id }).first()
  if (!account) throw notFoundError('Account not found.')
  const token = crypto.randomBytes(24).toString('hex')
  await db('accounts').where({ id }).update({
    reset_token: token,
    reset_expires: new Date(Date.now() + 2 * 3600000).toISOString(),
  })
  console.log(`\n[email:reset] (admin-initiated) to ${account.email}\n  /reset-password?token=${token}\n`)
  res.json({ ok: true })
})

export const deleteAccount = asyncHandler(async (req, res) => {
  const id = intParam(req.params.id)
  await db.transaction(async (trx) => {
    const emp = await trx('employers').where({ account_id: id }).first()
    if (emp) {
      const jobIds = (await trx('jobs').where({ employer_id: emp.id }).select('id')).map((j) => j.id)
      if (jobIds.length) await trx('applications').whereIn('job_id', jobIds).del()
      await trx('jobs').where({ employer_id: emp.id }).del()
      // Invoices reference the employer (invoices.employer_id) and would block
      // the delete; clear them before the employer row.
      await trx('invoices').where({ employer_id: emp.id }).del()
      await trx('employers').where({ id: emp.id }).del()
    }
    const seeker = await trx('seekers').where({ account_id: id }).first()
    if (seeker) {
      await trx('applications').where({ seeker_id: seeker.id }).del()
      await trx('seekers').where({ id: seeker.id }).del()
    }
    await trx('accounts').where({ id }).del()
  })
  res.json({ ok: true })
})

// ---- Posts (moderation) --------------------------------------------------

export const listPosts = asyncHandler(async (req, res) => {
  const { status, q } = req.query
  let query = db('jobs')
    .join('employers', 'employers.id', 'jobs.employer_id')
    .select('jobs.*', 'employers.company as company', 'employers.account_id as employer_account_id')
  if (status) query = query.where('jobs.status', status)
  if (q) {
    const like = `%${String(q).trim()}%`
    query = query.where((b) => b.whereILike('jobs.title', like).orWhereILike('employers.company', like))
  }
  const jobs = await query.orderBy('jobs.date_posted', 'desc')

  const ids = jobs.map((j) => j.id)
  const counts = ids.length
    ? await db('applications').whereIn('job_id', ids).groupBy('job_id').select('job_id').count({ n: '*' })
    : []
  const countByJob = new Map(counts.map((r) => [r.job_id, Number(r.n)]))

  res.json(
    jobs.map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company,
      sector: j.sector,
      type: j.employment_type,
      status: j.status,
      postedDaysAgo: daysSince(j.date_posted),
      applicantCount: countByJob.get(j.id) || 0,
      employerAccountId: j.employer_account_id,
    })),
  )
})

export const getPost = asyncHandler(async (req, res) => {
  const id = intParam(req.params.id)
  const j = await db('jobs')
    .join('employers', 'employers.id', 'jobs.employer_id')
    .select('jobs.*', 'employers.company as company')
    .where('jobs.id', id)
    .first()
  if (!j) throw notFoundError('Post not found.')
  const [{ n }] = await db('applications').where({ job_id: id }).count({ n: '*' })
  res.json({
    id: j.id,
    title: j.title,
    company: j.company,
    sector: j.sector,
    type: j.employment_type,
    status: j.status,
    postedDaysAgo: daysSince(j.date_posted),
    applicantCount: Number(n),
    form_data: j.form_data,
  })
})

export const setPostStatus = asyncHandler(async (req, res) => {
  const id = intParam(req.params.id)
  const status = req.body?.status
  assertEnum(status, POST_MODERATION, 'status')
  // closed_by_lockout is cleared either way: an admin moderation action is never
  // a lockout closure, so the posting must not auto-reopen on a reactivation.
  const patch = { status, closed_by_lockout: false }
  // Stamp closed_at only on the first close (COALESCE keeps the original) so the
  // attachment-retention clock can't be reset by re-closing a posting.
  if (status === 'closed') patch.closed_at = db.raw('COALESCE(closed_at, now())')
  const count = await db('jobs').where({ id }).update(patch)
  if (!count) throw notFoundError('Post not found.')
  res.json({ ok: true, status })
})

// ---- Abuse flags ---------------------------------------------------------

export const listFlags = asyncHandler(async (req, res) => {
  const threshold = req.query.threshold ? Number(req.query.threshold) : 0.7
  const rows = await buildAccountRows()
  const employers = rows
    .filter((r) => r.role === 'employer')
    .map((e) => ({ id: e.id, role: 'employer', companyName: e.companyName, status: e.status, createdDaysAgo: e.createdDaysAgo, email: e.email }))
  const clusters = findFlaggedClusters(employers, { threshold })
  res.json(clusters)
})

export const resolveFlag = asyncHandler(async (req, res) => {
  const id = intParam(req.params.id)
  const action = req.body?.action
  if (action === 'dismiss') {
    await db('employers').where({ account_id: id }).update({ flagged: false })
  } else if (action === 'suspend') {
    await db('accounts').where({ id }).update({ status: 'suspended' })
  } else {
    throw badRequest("Unknown action. Expected 'dismiss' or 'suspend'.")
  }
  res.json({ ok: true })
})

// ---- Invoices (manual MCB verification) ----------------------------------

// Attach the employer's company + account id to a shaped invoice row.
function shapeAdminInvoice(row) {
  return {
    ...shapeInvoice(row),
    employerId: row.employer_id,
    company: row.company,
    employerAccountId: row.account_id,
  }
}

export const listInvoices = asyncHandler(async (req, res) => {
  const { status } = req.query
  let query = db('invoices')
    .join('employers', 'employers.id', 'invoices.employer_id')
    .select('invoices.*', 'employers.company as company', 'employers.account_id as account_id')
  if (status) {
    query = query.where('invoices.status', status)
  } else {
    // Default to the actionable queue: bank transfers awaiting / needing review.
    query = query.whereIn('invoices.status', ['awaiting', 'pending'])
  }
  // Proof-submitted (pending) first, then awaiting; newest within each.
  const rows = await query.orderByRaw(
    `CASE invoices.status WHEN 'pending' THEN 0 WHEN 'awaiting' THEN 1 ELSE 2 END, invoices.created_at DESC`,
  )
  res.json(rows.map(shapeAdminInvoice))
})

export const getInvoice = asyncHandler(async (req, res) => {
  const id = intParam(req.params.id)
  const row = await db('invoices')
    .join('employers', 'employers.id', 'invoices.employer_id')
    .select('invoices.*', 'employers.company as company', 'employers.account_id as account_id')
    .where('invoices.id', id)
    .first()
  if (!row) throw notFoundError('Invoice not found.')
  res.json(shapeAdminInvoice(row))
})

// Confirm a bank transfer arrived: mark the invoice paid and (re)activate the
// employer on the invoice's plan. Works regardless of the employer's current
// state, so verifying an overdue invoice UNLOCKS a locked employer. Advancing
// next_payment_date from GREATEST(current, today) preserves any remaining paid
// time / trial rather than shortening it. Reactivating also auto-reopens the
// listings the lockout force-closed (closed_by_lockout) — postings the employer
// closed themselves stay closed.
export const verifyInvoice = asyncHandler(async (req, res) => {
  const id = intParam(req.params.id)
  const invoice = await db('invoices').where({ id }).first()
  if (!invoice) throw notFoundError('Invoice not found.')
  if (invoice.status === 'paid') throw badRequest('This invoice is already paid.')
  if (invoice.status === 'void') throw badRequest('This invoice was cancelled.')

  const annual = invoice.plan_interval === 'annual'
  const step = annual ? "interval '1 year'" : "interval '30 days'"

  await db.transaction(async (trx) => {
    await trx('invoices').where({ id }).update({
      status: 'paid',
      balance: 0,
      paid_at: trx.fn.now(),
      verified_at: trx.fn.now(),
    })
    await trx('employers')
      .where({ id: invoice.employer_id })
      .update({
        paid: true,
        trial: false,
        plan_interval: invoice.plan_interval,
        next_payment_date: trx.raw(`(GREATEST(next_payment_date, CURRENT_DATE) + ${step})::date`),
      })
    // Bring back the listings the lockout took down (no-op if none / never locked).
    await reopenLockedEmployerListings(invoice.employer_id, trx)
  })
  res.json({ ok: true, status: 'paid' })
})

export const voidInvoice = asyncHandler(async (req, res) => {
  const id = intParam(req.params.id)
  const invoice = await db('invoices').where({ id }).first()
  if (!invoice) throw notFoundError('Invoice not found.')
  if (invoice.status === 'paid') throw badRequest('A paid invoice cannot be voided.')
  await db('invoices').where({ id }).update({ status: 'void' })
  res.json({ ok: true, status: 'void' })
})

// ---- Connection log ------------------------------------------------------

// Compose a display "actor" for a logged connection: the env-admin by email, a
// signed-in user as "employer #12" / "candidate #7", else an anonymous visitor.
function shapeLogEntry(e) {
  let actor = 'Guest'
  if (e.adminEmail) actor = `Admin (${e.adminEmail})`
  else if (e.accountId) actor = `${e.role === 'seeker' ? 'candidate' : e.role} #${e.accountId}`
  return {
    id: e.id,
    time: e.ts,
    actor,
    ip: e.ip,
    method: e.method,
    path: e.path,
    action: e.action,
    status: e.status,
    userAgent: e.userAgent,
  }
}

// The in-memory connection log (last N requests, newest first). Live traffic
// monitor — see middleware/connectionLog.js. Not persisted / not paginated.
export const listConnectionLog = asyncHandler(async (req, res) => {
  res.json(listConnections().map(shapeLogEntry))
})

// ---- Admin-composed email (broadcast) ------------------------------------
// The admin composes a custom message from the Email tab; it's rendered into
// the branded StatiaWorks shell and sent from the custom domain via Resend.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Split a free-form recipients field (commas, semicolons, or newlines) into a
// trimmed, de-duplicated list of addresses.
function parseRecipients(raw) {
  const seen = new Set()
  return String(raw || '')
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
}

// Validate the optional call-to-action button: both label and URL, or neither.
function normalizeCta({ ctaLabel, ctaUrl }) {
  const label = String(ctaLabel || '').trim()
  const url = String(ctaUrl || '').trim()
  if (!label && !url) return { ctaLabel: '', ctaUrl: '' }
  if (!url) throw badRequest('Add a URL for the button, or clear the button label.')
  if (!label) throw badRequest('Add a label for the button, or clear the button URL.')
  if (!/^https?:\/\//i.test(url)) throw badRequest('The button URL must start with http:// or https://')
  return { ctaLabel: label, ctaUrl: url }
}

// Render the branded email for the composer's live preview — no send, lenient
// (a half-filled button is simply omitted rather than rejected while typing).
export const previewEmail = asyncHandler(async (req, res) => {
  const { subject, heading, message, ctaLabel, ctaUrl } = req.body || {}
  const { html } = renderBroadcast({ subject, heading, message, ctaLabel, ctaUrl })
  res.json({ html })
})

// Send the composed email to one or more free-form recipients (strict).
export const sendAdminEmail = asyncHandler(async (req, res) => {
  const { to, cc, bcc, subject, heading, message } = req.body || {}
  const recipients = parseRecipients(to)
  if (!recipients.length) throw badRequest('Add at least one recipient email address.')
  if (recipients.length > 100) throw badRequest('Too many recipients (max 100 per send).')
  const invalid = recipients.find((r) => !EMAIL_RE.test(r))
  if (invalid) throw badRequest(`That doesn't look like a valid email address: ${invalid}`)
  if (!String(subject || '').trim()) throw badRequest('A subject is required.')
  if (!String(message || '').trim()) throw badRequest('A message is required.')
  const { ctaLabel, ctaUrl } = normalizeCta(req.body || {})

  // CC/BCC are observer copies — deduped against the primary recipients (and
  // each other) so nobody is emailed twice, then validated the same way.
  const primary = new Set(recipients.map((r) => r.toLowerCase()))
  const ccList = parseRecipients(cc).filter((r) => !primary.has(r.toLowerCase()))
  ccList.forEach((r) => primary.add(r.toLowerCase()))
  const bccList = parseRecipients(bcc).filter((r) => !primary.has(r.toLowerCase()))
  const badCopy = [...ccList, ...bccList].find((r) => !EMAIL_RE.test(r))
  if (badCopy) throw badRequest(`That doesn't look like a valid email address: ${badCopy}`)

  const content = { subject, heading, message, ctaLabel, ctaUrl }

  // One send per primary recipient (each gets a private To:, not a shared CC/BCC).
  const results = await Promise.all(
    recipients.map((r) => sendBroadcastEmail({ to: r, ...content })),
  )
  const sent = results.filter((r) => r.ok).length

  // A single extra send delivers one copy to all cc + bcc observers.
  let copied = 0
  if (ccList.length || bccList.length) {
    const copy = await sendBroadcastCopy({ cc: ccList, bcc: bccList, ...content })
    if (copy.ok) copied = ccList.length + bccList.length
  }

  res.json({
    total: recipients.length,
    sent,
    failed: recipients.length - sent,
    cc: ccList.length,
    bcc: bccList.length,
    copied,
  })
})
