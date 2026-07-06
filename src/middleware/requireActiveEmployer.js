// Employer-lockout enforcement. An employer keeps full access while `paid` OR
// `trial` is true; when BOTH are false the account is *locked* — barred from
// every employer write surface except account settings/billing. Mirrors the
// frontend `useEmployer().accountLocked` + router guard.
//
// Attaches `req.employer` (the employers row) for downstream handlers.

import { db } from '../db/knex.js'
import { forbidden } from './error.js'

export async function loadEmployer(req, res, next) {
  try {
    const employer = await db('employers').where({ account_id: req.account.id }).first()
    if (!employer) return next(forbidden('Employer profile not found'))
    req.employer = employer
    next()
  } catch (e) {
    next(e)
  }
}

export function requireActiveEmployer(req, res, next) {
  const e = req.employer
  const locked = !e?.paid && !e?.trial
  if (locked) {
    return next(
      forbidden('Your employer account is locked — add a payment method to continue.'),
    )
  }
  next()
}
