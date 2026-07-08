// Authentication: login, the two signup flows, logout, email verification, and
// password reset. JWTs are issued and set as an httpOnly cookie AND returned in
// the body (the frontend keeps a bearer copy). Verification/reset emails are sent
// via Resend (see ../email); tokens are real and verified.

import crypto from 'node:crypto'
import { db } from '../db/knex.js'
import { asyncHandler, badRequest, unauthorized, notFoundError } from '../middleware/error.js'
import { requireFields, assertEmail, assertMinLength } from '../middleware/validate.js'
import { hashPassword, verifyPassword } from '../utils/password.js'
import { signToken, cookieOptions, SESSION_COOKIE } from '../utils/jwt.js'
import { sendVerificationEmail, sendPasswordResetEmail } from '../email/index.js'

const token = () => crypto.randomBytes(24).toString('hex')
const hoursFromNow = (h) => new Date(Date.now() + h * 3600000).toISOString()

// Which role owns an account (checks the child tables). Fallback only — the
// role now lives on accounts.account_type; this covers any un-backfilled row.
async function roleOf(accountId) {
  const emp = await db('employers').where({ account_id: accountId }).first()
  if (emp) return 'employer'
  const seeker = await db('seekers').where({ account_id: accountId }).first()
  if (seeker) return 'seeker'
  return null
}

// The person's first name (for a warmer email greeting). Falls back to '' —
// the templates handle a missing name gracefully.
async function firstName(account) {
  const table = account.account_type === 'employer' ? 'employers' : 'seekers'
  const row = await db(table).where({ account_id: account.id }).first('fname')
  return row?.fname || ''
}

// `remember` controls session persistence (the login "Remember me" toggle):
// true → a persistent cookie + matching long-lived token (survives a browser
// restart); false → a session cookie the browser drops when it closes. New
// signups always issue a remembered session.
function issueSession(res, account, role, remember = true) {
  const jwt = signToken({ sub: account.id, role }, { remember })
  res.cookie(SESSION_COOKIE, jwt, cookieOptions({ remember }))
  return {
    token: jwt,
    user: { id: account.id, email: account.email, role, verified: account.verified },
  }
}

export const login = asyncHandler(async (req, res) => {
  const { email, password, remember } = req.body || {}
  requireFields(req.body, ['email', 'password'])
  const account = await db('accounts').whereRaw('lower(email) = lower(?)', [email]).first()
  if (!account) throw unauthorized('Invalid email or password.')
  if (account.status === 'suspended') throw unauthorized('This account has been suspended.')
  const ok = await verifyPassword(password, account.password_hash)
  if (!ok) throw unauthorized('Invalid email or password.')

  // account_type tells us the role directly (set at signup, backfilled for
  // legacy rows) — no need to probe both child tables on every login.
  const role = account.account_type || (await roleOf(account.id))
  if (!role) throw unauthorized('This account is not set up correctly.')

  await db('accounts').where({ id: account.id }).update({ last_logged_in: db.fn.now() })
  // Default remembered when the flag is absent, preserving prior persistent behaviour.
  res.json(issueSession(res, account, role, remember !== false))
})

export const signupSeeker = asyncHandler(async (req, res) => {
  const b = req.body || {}
  requireFields(b, ['email', 'password', 'fname', 'lname'])
  assertEmail(b.email)
  assertMinLength(b.password, 8, 'Password')

  const existing = await db('accounts').whereRaw('lower(email) = lower(?)', [b.email]).first()
  if (existing) throw badRequest('An account with that email already exists.')

  const verifyToken = token()
  const [account] = await db('accounts')
    .insert({
      email: b.email,
      password_hash: await hashPassword(b.password),
      verified: false,
      status: 'pending',
      account_type: 'seeker',
      verify_token: verifyToken,
      verify_expires: hoursFromNow(48),
    })
    .returning('*')

  await db('seekers').insert({
    fname: b.fname,
    lname: b.lname,
    phone: b.phone || null,
    city: b.city || null,
    country: b.country || null,
    island: b.island || null,
    account_id: account.id,
  })

  await sendVerificationEmail({ email: b.email, name: b.fname, token: verifyToken })
  res.status(201).json(issueSession(res, account, 'seeker'))
})

export const signupEmployer = asyncHandler(async (req, res) => {
  const b = req.body || {}
  requireFields(b, ['email', 'password', 'company', 'fname', 'lname'])
  assertEmail(b.email)
  assertMinLength(b.password, 8, 'Password')

  const existing = await db('accounts').whereRaw('lower(email) = lower(?)', [b.email]).first()
  if (existing) throw badRequest('An account with that email already exists.')

  const verifyToken = token()
  const [account] = await db('accounts')
    .insert({
      email: b.email,
      password_hash: await hashPassword(b.password),
      verified: false,
      status: 'pending',
      account_type: 'employer',
      verify_token: verifyToken,
      verify_expires: hoursFromNow(48),
    })
    .returning('*')

  // Start the first-month free trial.
  await db('employers').insert({
    company: b.company,
    fname: b.fname,
    lname: b.lname,
    phone: b.phone || null,
    account_id: account.id,
    paid: false,
    trial: true,
    flagged: false,
    alerts_enabled: true,
  })

  await sendVerificationEmail({ email: b.email, name: b.fname, token: verifyToken })
  res.status(201).json(issueSession(res, account, 'employer'))
})

export const logout = asyncHandler(async (req, res) => {
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined })
  res.json({ ok: true })
})

export const verifyEmail = asyncHandler(async (req, res) => {
  const { token: t } = req.body || {}
  if (!t) throw badRequest('Missing verification token.')
  const account = await db('accounts').where({ verify_token: t }).first()
  if (!account) throw badRequest('This verification link is invalid.')
  if (account.verify_expires && new Date(account.verify_expires) < new Date()) {
    throw badRequest('This verification link has expired.')
  }
  await db('accounts').where({ id: account.id }).update({
    verified: true,
    status: 'active',
    verify_token: null,
    verify_expires: null,
  })
  res.json({ ok: true, verified: true })
})

export const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body || {}
  const account = email
    ? await db('accounts').whereRaw('lower(email) = lower(?)', [email]).first()
    : null
  if (account && !account.verified) {
    const verifyToken = token()
    await db('accounts').where({ id: account.id }).update({
      verify_token: verifyToken,
      verify_expires: hoursFromNow(48),
    })
    await sendVerificationEmail({ email: account.email, name: await firstName(account), token: verifyToken })
  }
  res.json({ ok: true })
})

export const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body || {}
  const account = email
    ? await db('accounts').whereRaw('lower(email) = lower(?)', [email]).first()
    : null
  if (account) {
    const resetToken = token()
    await db('accounts').where({ id: account.id }).update({
      reset_token: resetToken,
      reset_expires: hoursFromNow(2),
    })
    await sendPasswordResetEmail({ email: account.email, name: await firstName(account), token: resetToken })
  }
  // Always resolve — no account enumeration.
  res.json({ ok: true })
})

export const resetPassword = asyncHandler(async (req, res) => {
  const { token: t, password } = req.body || {}
  if (!t) throw badRequest('Missing reset token.')
  assertMinLength(password, 8, 'Password')
  const account = await db('accounts').where({ reset_token: t }).first()
  if (!account) throw badRequest('This reset link is invalid.')
  if (account.reset_expires && new Date(account.reset_expires) < new Date()) {
    throw badRequest('This reset link has expired.')
  }
  await db('accounts').where({ id: account.id }).update({
    password_hash: await hashPassword(password),
    reset_token: null,
    reset_expires: null,
  })
  res.json({ ok: true })
})
