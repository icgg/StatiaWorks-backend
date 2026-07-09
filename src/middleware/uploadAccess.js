// Authorization gate for GET /uploads/:sub/:file.
//
// Uploaded files fall into two privacy classes:
//   logos                        → PUBLIC (shown on the public job board)
//   resumes / cover-letters      → PRIVATE (applicant PII)
//   proofs                       → PRIVATE (MCB bank-transfer screenshots)
//
// Private files are readable only by a party who legitimately references them:
//   - the seeker who uploaded it (their application, or their profile résumé),
//   - the employer whose job received the application that references it,
//   - an admin.
//
// Because uploads are content-addressed (dedup: identical bytes → one URL, see
// utils/fileDedup.js), a URL is not uniquely owned — so access is decided by
// "does a row the caller owns reference this exact URL", not by the filename.
//
// `loadUser` + `loadAdmin` must run before this (both populate without
// rejecting). Unauthorized/unknown → 404 (never 403), so the endpoint doesn't
// confirm a file exists to someone who can't see it.

import { db } from '../db/knex.js'
import { urlFor } from '../storage/index.js'

const PUBLIC_SUBS = new Set(['logos'])
const PRIVATE_SUBS = new Set(['resumes', 'cover-letters', 'proofs'])
// Stored names are randomName() output (hex + extension). This also blocks path
// traversal: a decoded '..' or a slash can never match.
const SAFE_NAME = /^[A-Za-z0-9._-]+$/

export async function authorizeUpload(req, res, next) {
  try {
    const { sub, file } = req.params

    // Shape + traversal guard. Unknown bucket or a crafted name → 404.
    const known = PUBLIC_SUBS.has(sub) || PRIVATE_SUBS.has(sub)
    if (!known || !SAFE_NAME.test(file) || file.includes('..')) {
      return res.status(404).end()
    }

    // Public class: no auth required.
    if (PUBLIC_SUBS.has(sub)) return next()

    // Private class from here down.
    if (req.admin) return next()
    if (!req.account) return res.status(404).end()

    const url = urlFor(sub, file)

    if (sub === 'proofs') {
      // Only the employer the invoice belongs to.
      const emp = await db('employers').where({ account_id: req.account.id }).first()
      if (emp) {
        const inv = await db('invoices').where({ employer_id: emp.id, proof_url: url }).first()
        if (inv) return next()
      }
      return res.status(404).end()
    }

    // resumes / cover-letters — the seeker who owns it, or the employer who
    // received an application that references it.
    const seeker = await db('seekers').where({ account_id: req.account.id }).first()
    if (seeker) {
      if (seeker.resume_url === url) return next()
      const app = await db('applications')
        .where({ seeker_id: seeker.id })
        .andWhere((b) => b.where('resume_url', url).orWhere('cover_url', url))
        .first()
      if (app) return next()
    }

    const emp = await db('employers').where({ account_id: req.account.id }).first()
    if (emp) {
      const row = await db('applications')
        .join('jobs', 'jobs.id', 'applications.job_id')
        .where('jobs.employer_id', emp.id)
        .andWhere((b) =>
          b.where('applications.resume_url', url).orWhere('applications.cover_url', url),
        )
        .first()
      if (row) return next()
    }

    return res.status(404).end()
  } catch (e) {
    next(e)
  }
}
