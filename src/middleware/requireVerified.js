// Email-verification gate. `loadUser` + `requireAuth` must run first.
//
// Applied to the actions that publish content or reach other users (applying to
// a job, posting/editing a listing, deciding on an applicant, changing the
// public company profile). Reads and personal account management stay open so a
// still-pending user can navigate, manage their account, and reach the verify
// flow. `req.account.verified` is read fresh from the DB on every request by
// loadUser, so the moment the user clicks the emailed link the next call passes.
//
// Rejects with a distinct 403 code (EMAIL_UNVERIFIED) — separate from the
// session-teardown ACCOUNT_SUSPENDED — so the frontend can prompt the user to
// verify (and offer a resend) rather than logging them out.

import { forbidden } from './error.js'

export function requireVerified(req, res, next) {
  if (req.account?.verified) return next()
  const err = forbidden(
    'Please verify your email address to continue. Check your inbox for the verification link.',
  )
  err.code = 'EMAIL_UNVERIFIED'
  next(err)
}
