// JWT signing/verification + the cookie name used to persist the session.
// The token carries the minimum needed to identify the caller: the account id
// and role (or an `admin` flag for the env-admin).

import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export const SESSION_COOKIE = 'sw_session'
export const ADMIN_COOKIE = 'sw_admin'

// "Remember me" duration — a remembered login persists this long; the token
// lifetime matches the cookie so a persistent cookie is never silently
// invalidated by a shorter-lived token.
export const REMEMBER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const REMEMBER_EXPIRES_IN = '30d'

export function signToken(payload, { remember = true } = {}) {
  const expiresIn = remember ? REMEMBER_EXPIRES_IN : env.jwtExpiresIn
  return jwt.sign(payload, env.jwtSecret, { expiresIn })
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret)
  } catch {
    return null
  }
}

// Cookie options for the httpOnly session cookie. When `remember` is true (the
// default, and what admin/other callers use) the cookie is persistent — it
// carries a maxAge and survives a browser restart. When false it's a *session*
// cookie (no maxAge/expires), which the browser drops when it closes — the
// "Remember me: off" behaviour.
export function cookieOptions({ remember = true } = {}) {
  const opts = {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    path: '/',
  }
  if (remember) opts.maxAge = REMEMBER_MAX_AGE_MS
  return opts
}
