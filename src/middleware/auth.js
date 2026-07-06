// Authentication middleware. Resolves the current caller from either the
// httpOnly session cookie or an `Authorization: Bearer` header (the frontend
// sends both — cookie for refresh persistence, bearer from the login response).
//
// Populates `req.account = { id, role }` for user sessions, or `req.admin = true`
// for the env-admin. `requireAuth` / `requireAdminAuth` reject when absent.

import { verifyToken, SESSION_COOKIE, ADMIN_COOKIE } from '../utils/jwt.js'
import { unauthorized } from './error.js'
import { db } from '../db/knex.js'

function bearer(req) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

// Attach req.account if a valid user session is present (does not reject).
export async function loadUser(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE] || bearer(req)
  if (token) {
    const payload = verifyToken(token)
    if (payload && payload.sub && payload.role && payload.role !== 'admin') {
      // Confirm the account still exists and isn't suspended.
      const acct = await db('accounts').where({ id: payload.sub }).first()
      if (acct && acct.status !== 'suspended') {
        req.account = { id: acct.id, role: payload.role, email: acct.email, verified: acct.verified }
      }
    }
  }
  next()
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
