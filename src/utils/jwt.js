// JWT signing/verification + the cookie name used to persist the session.
// The token carries the minimum needed to identify the caller: the account id
// and role (or an `admin` flag for the env-admin).

import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export const SESSION_COOKIE = 'sw_session'
export const ADMIN_COOKIE = 'sw_admin'

export function signToken(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn })
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret)
  } catch {
    return null
  }
}

// Standard cookie options for the httpOnly session cookie.
export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  }
}
