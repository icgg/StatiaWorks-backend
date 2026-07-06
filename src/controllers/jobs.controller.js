// Public job board — no auth. Backs GET /jobs (list + filters) and
// GET /jobs/:id (detail). Only 'active' postings are visible publicly.

import { db } from '../db/knex.js'
import { asyncHandler, notFoundError } from '../middleware/error.js'
import { intParam } from '../middleware/validate.js'
import { shapeJob } from '../utils/shape.js'

// select jobs joined with their employer (company name + logo).
function baseQuery() {
  return db('jobs')
    .join('employers', 'employers.id', 'jobs.employer_id')
    .select(
      'jobs.*',
      'employers.company as company',
      'employers.logo_url as logo_url',
    )
}

export const list = asyncHandler(async (req, res) => {
  const { q, sector, type } = req.query
  let query = baseQuery().where('jobs.status', 'active')

  if (sector) query = query.where('jobs.sector', sector)
  if (type) query = query.where('jobs.employment_type', type)
  if (q) {
    const like = `%${String(q).trim()}%`
    query = query.where((b) =>
      b.whereILike('jobs.title', like).orWhereILike('employers.company', like),
    )
  }

  const rows = await query.orderBy('jobs.date_posted', 'desc').orderBy('jobs.id', 'desc')
  res.json(rows.map(shapeJob))
})

export const get = asyncHandler(async (req, res) => {
  const id = intParam(req.params.id)
  const row = await baseQuery().where('jobs.id', id).first()
  if (!row || row.status === 'removed') throw notFoundError('Job not found.')
  res.json(shapeJob(row))
})
