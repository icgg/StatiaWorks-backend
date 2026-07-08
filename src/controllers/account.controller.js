// Account settings (`/me/*`, role-aware): login email, password change,
// notifications, employer billing, and danger-zone actions.
//
// Per the product decision, seeker notification preferences were dropped; the
// employer keeps a single "New applicant" toggle backed by employers.alerts_enabled.

import { db } from '../db/knex.js'
import { env } from '../config/env.js'
import { asyncHandler, badRequest, unauthorized } from '../middleware/error.js'
import { assertMinLength } from '../middleware/validate.js'
import { hashPassword, verifyPassword } from '../utils/password.js'
import { SESSION_COOKIE, cookieOptions } from '../utils/jwt.js'
import { shapeInvoice } from '../utils/invoices.js'
import { closeLockedEmployerListings } from '../utils/lockout.js'

async function employerOf(accountId) {
  return db('employers').where({ account_id: accountId }).first()
}

async function seekerOf(accountId) {
  return db('seekers').where({ account_id: accountId }).first()
}

// Plan pricing (matches /pricing). Sourced from config so app + admin agree.
const PRICE = env.pricing.monthlyDisplay

function displayDate(value) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
function trialDays(employer) {
  if (!employer?.trial_end_date) return 0
  return Math.max(0, Math.ceil((new Date(employer.trial_end_date) - Date.now()) / 86400000))
}

export const getAccount = asyncHandler(async (req, res) => {
  const { email, role, verified } = req.account
  // `name` gives the shared header/account menu one consistent identity across
  // every page: an employer's company, or a seeker's full name.
  const out = { email, role, verified, name: '' }
  if (role === 'employer') {
    const emp = await employerOf(req.account.id)
    out.name = emp.company || ''
    out.employer = {
      paid: emp.paid,
      trial: emp.trial,
      trial_end_date: displayDate(emp.trial_end_date),
      locked: !emp.paid && !emp.trial,
    }
  } else {
    const seeker = await seekerOf(req.account.id)
    out.name = seeker ? [seeker.fname, seeker.lname].filter(Boolean).join(' ') : ''
  }
  res.json(out)
})

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  assertMinLength(newPassword, 8, 'New password')
  const account = await db('accounts').where({ id: req.account.id }).first()
  const ok = await verifyPassword(currentPassword, account.password_hash)
  if (!ok) throw badRequest('Your current password is incorrect.')
  await db('accounts').where({ id: account.id }).update({ password_hash: await hashPassword(newPassword) })
  res.json({ ok: true })
})

export const getNotifications = asyncHandler(async (req, res) => {
  if (req.account.role === 'employer') {
    const emp = await employerOf(req.account.id)
    return res.json({ newApplicants: !!emp.alerts_enabled })
  }
  res.json({}) // seekers have no notification preferences
})

export const updateNotifications = asyncHandler(async (req, res) => {
  if (req.account.role === 'employer') {
    const value = !!req.body?.newApplicants
    await db('employers').where({ account_id: req.account.id }).update({ alerts_enabled: value })
    return res.json({ newApplicants: value })
  }
  res.json({})
})

export const getBilling = asyncHandler(async (req, res) => {
  if (req.account.role !== 'employer') throw badRequest('Billing is for employer accounts only.')
  const emp = await employerOf(req.account.id)
  const annual = emp.plan_interval === 'annual'
  const plan = emp.paid ? 'Subscription' : emp.trial ? 'Free trial' : 'Locked'
  const status = emp.paid
    ? 'Active'
    : emp.trial
      ? 'Trial — first month free'
      : 'Locked — add a payment method to reactivate'

  const rows = await db('invoices')
    .where({ employer_id: emp.id })
    .orderBy([{ column: 'created_at', order: 'desc' }, { column: 'id', order: 'desc' }])
  const invoices = rows.map(shapeInvoice)

  res.json({
    plan,
    status,
    // The employer's own id, surfaced so the billing panel can tell the employer
    // to write their `EMP-<id>` reference in the bank-transfer notes (this, not an
    // invoice number, is what the admin matches a payment against).
    employerId: emp.id,
    planInterval: emp.plan_interval,
    trialDaysRemaining: emp.trial ? trialDays(emp) : 0,
    renewsOn: displayDate(emp.next_payment_date),
    price: annual ? env.pricing.annualDisplay : env.pricing.monthlyDisplay,
    prices: { monthly: env.pricing.monthlyDisplay, annual: env.pricing.annualDisplay },
    card: null, // card-on-file (Stripe) deferred
    invoices,
    // Payment rails offered in the billing panel. MCB is live; Stripe deferred.
    paymentMethods: [
      { id: 'mcb', label: 'MCB Bank Transfer', active: true },
      { id: 'stripe', label: 'Card (Stripe)', active: false, note: 'Coming soon' },
    ],
    mcbAccount: env.mcbAccountNumber,
    paid: emp.paid,
    trial: emp.trial,
    locked: !emp.paid && !emp.trial,
  })
})

export const cancelSubscription = asyncHandler(async (req, res) => {
  if (req.account.role !== 'employer') throw badRequest('Only employer accounts have a subscription.')
  // Ending the subscription drops the account to the locked state, which also
  // force-closes the employer's active listings off the public board (they
  // auto-reopen if the account is later reactivated).
  await db('employers').where({ account_id: req.account.id }).update({ paid: false, trial: false })
  await closeLockedEmployerListings()
  res.json({ ok: true })
})

export const deactivate = asyncHandler(async (req, res) => {
  await db('accounts').where({ id: req.account.id }).update({ status: 'suspended' })
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined })
  res.json({ ok: true })
})

export const deleteAccount = asyncHandler(async (req, res) => {
  const accountId = req.account.id
  await db.transaction(async (trx) => {
    if (req.account.role === 'employer') {
      const emp = await trx('employers').where({ account_id: accountId }).first()
      if (emp) {
        const jobIds = (await trx('jobs').where({ employer_id: emp.id }).select('id')).map((j) => j.id)
        if (jobIds.length) await trx('applications').whereIn('job_id', jobIds).del()
        await trx('jobs').where({ employer_id: emp.id }).del()
        await trx('employers').where({ id: emp.id }).del()
      }
    } else {
      const seeker = await trx('seekers').where({ account_id: accountId }).first()
      if (seeker) {
        await trx('applications').where({ seeker_id: seeker.id }).del()
        await trx('seekers').where({ id: seeker.id }).del()
      }
    }
    await trx('accounts').where({ id: accountId }).del()
  })
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined })
  res.json({ ok: true })
})
