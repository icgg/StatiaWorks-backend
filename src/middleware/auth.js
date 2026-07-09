// Authentication middleware. Resolves the current caller from either the
// httpOnly session cookie or an `Authorization: Bearer` header (the frontend
// sends both — cookie for refresh persistence, bearer from the login response).
//
// Populates `req.account = { id, role }` for user sessions, or `req.admin = true`
// for the env-admin. `requireAuth` / `requireAdminAuth` reject when absent.

import crypto from 'node:crypto'
import { verifyToken, SESSION_COOKIE, ADMIN_COOKIE } from '../utils/jwt.js'
import { env } from '../config/env.js'
import { unauthorized, forbidden, notFoundError } from './error.js'
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

// Pre-shared key gate for the whole admin surface (mounted ahead of the admin
// login). When env.adminApiKey is set, a request must present a matching
// `X-Admin-Key` header; a miss returns 404 (not 401) so the admin API is
// invisible — an anonymous probe can't even tell the surface exists. The
// comparison is constant-time. When the key is unset the gate is a no-op, so
// local dev and tests don't need it. This is defense-in-depth on top of the
// admin password/JWT, meaningful only while the admin client is private (runs on
// a trusted machine); a public admin SPA can't hold the secret. See env.js.
export function requireAdminKey(req, res, next) {
  const expected = env.adminApiKey
  if (!expected) return next() // gate disabled
  const got = req.get('X-Admin-Key') || ''
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b)
  if (!ok) return next(notFoundError())
  next()
}
