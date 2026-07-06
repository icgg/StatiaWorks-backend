// Authentication middleware. Resolves the current caller from either the
// httpOnly session cookie or an `Authorization: Bearer` header (the frontend
// sends both — cookie for refresh persistence, bearer from the login response).
//
// Populates `req.account = { id, role }` for user sessions, or `req.admin = true`
// for the env-admin. `requireAuth` / `requireAdminAuth` reject when absent.

import { verifyToken, SESSION_COOKIE, ADMIN_COOKIE } from '../utils/jwt.js'
import { unauthorized, forbidden } from './error.js'
import { db } from '../db/knex.js'

function bearer(req) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

// Attach req.account when a valid, active user session is present. Does not
// reject for a missing/invalid token (that falls through to requireAuth's 401),
// with one exception: a token that resolves to a *suspended* account is rejected
// here with a distinct 403 (code ACCOUNT_SUSPENDED). Suspension happens
// out-of-band (an admin flips accounts.status while the user is logged in), so
// this is the signal the frontend keys on to tear down the stale session and
// explain why — rather than the account silently going blank on its next call.
export async function loadUser(req, res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE] || bearer(req)
    if (!token) return next()

    const payload = verifyToken(token)
    if (!payload || !payload.sub || !payload.role || payload.role === 'admin') return next()

    const acct = await db('accounts').where({ id: payload.sub }).first()
    if (!acct) return next()

    if (acct.status === 'suspended') {
      const err = forbidden('Your account has been suspended. Contact support if you believe this is a mistake.')
      err.code = 'ACCOUNT_SUSPENDED'
      return next(err)
    }

    req.account = { id: acct.id, role: payload.role, email: acct.email, verified: acct.verified }
    next()
  } catch (e) {
    next(e)
  }
}

export function requireAuth(req, res, next) {
  if (!req.account) return next(unauthorized())
  next()
}

// Attach req.admin if a valid admin token is present (does not reject).
export function loadAdmin(req, res, next) {
  const token = req.cookies?.[ADMIN_COOKIE] || bearer(req)
  if (token) {
    const payload = verifyToken(token)
    if (payload && payload.role === 'admin') req.admin = { email: payload.sub }
  }
  next()
}

export function requireAdminAuth(req, res, next) {
  if (!req.admin) return next(unauthorized('Admin authentication required'))
  next()
}
