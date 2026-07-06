// Island sectors + live open-role counts. Backs GET /sectors (landing tiles +
// board filter rail). Always returns the full canonical sector list (even with
// zero openings), with counts computed from active jobs.

import { db } from '../db/knex.js'
import { asyncHandler } from '../middleware/error.js'
import { SECTORS } from '../validators/enums.js'

// Canonical name → slug (mirrors app/src/data/sectors.js).
const SLUGS = {
  'Tourism & Dive': 'tourism',
  Hospitality: 'hospitality',
  'Trades & Construction': 'trades',
  'Marine & Port': 'marine',
  Government: 'government',
  Healthcare: 'healthcare',
  Retail: 'retail',
  Education: 'education',
}

export const list = asyncHandler(async (req, res) => {
  const rows = await db('jobs')
    .where('status', 'active')
    .whereNotNull('sector')
    .groupBy('sector')
    .select('sector')
    .count({ openings: '*' })

  const counts = new Map(rows.map((r) => [r.sector, Number(r.openings)]))
  res.json(
    SECTORS.map((name) => ({
      name,
      slug: SLUGS[name] || name.toLowerCase().replace(/\W+/g, '-'),
      openings: counts.get(name) || 0,
    })),
  )
})
