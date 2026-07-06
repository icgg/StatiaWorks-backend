// Role gates for the /me surfaces. `loadUser` + `requireAuth` must run first.

import { forbidden } from './error.js'

export function requireSeeker(req, res, next) {
  if (req.account?.role !== 'seeker') return next(forbidden('Seeker account required'))
  next()
}

export function requireEmployer(req, res, next) {
  if (req.account?.role !== 'employer') return next(forbidden('Employer account required'))
  next()
}
