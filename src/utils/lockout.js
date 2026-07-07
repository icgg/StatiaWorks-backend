// Lockout listing lifecycle.
//
// When an employer becomes *locked* (neither `paid` nor `trial`) their active
// postings are force-closed off the public board; when the account is
// reactivated those same postings are auto-reopened. The `jobs.closed_by_lockout`
// flag distinguishes an involuntary lockout closure from a posting the employer
// closed on purpose, so reactivation only reopens the former.
//
// closed_at follows the codebase's set-once rule — stamped once on close
// (COALESCE) and preserved on reopen — matching manual close/reopen so the
// attachment-retention clock can't be reset by toggling a posting.
//
// Both helpers accept an optional connection (a Knex transaction) so they can run
// atomically inside a larger operation (e.g. invoice verification).

import { db } from '../db/knex.js'

// Force-close every still-active posting belonging to any currently-locked
// employer. Idempotent + cheap: a locked employer can't create new active
// postings (requireActiveEmployer), so repeat runs are no-ops. Returns the count.
export async function closeLockedEmployerListings(conn = db) {
  const closed = await conn('jobs')
    .where('status', 'active')
    .whereIn(
      'employer_id',
      conn('employers').select('id').where({ paid: false, trial: false }),
    )
    .update({
      status: 'closed',
      closed_by_lockout: true,
      closed_at: conn.raw('COALESCE(closed_at, now())'),
    })
  return closed
}

// Reopen the postings a lockout took down for one just-reactivated employer.
// Only touches lockout closures (closed_by_lockout) — postings the employer
// closed themselves stay closed. Preserves closed_at (set-once), mirroring a
// manual reopen. Returns the count.
export async function reopenLockedEmployerListings(employerId, conn = db) {
  const reopened = await conn('jobs')
    .where({ employer_id: employerId, status: 'closed', closed_by_lockout: true })
    .update({ status: 'active', closed_by_lockout: false })
  return reopened
}
