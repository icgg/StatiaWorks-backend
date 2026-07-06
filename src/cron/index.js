// Scheduled maintenance. Daily sweep: expire employer free trials whose
// trial_end_date has passed (trial -> false). An employer with neither `paid`
// nor `trial` is then *locked* (enforced by requireActiveEmployer + the frontend
// router guard). Deadline-based job closing stays read-time, so it isn't here.

import cron from 'node-cron'
import { db } from '../db/knex.js'

export async function expireTrials() {
  const affected = await db('employers')
    .where('trial', true)
    .whereNotNull('trial_end_date')
    .where('trial_end_date', '<', db.fn.now())
    .update({ trial: false })
  if (affected) console.log(`[cron] expired ${affected} trial(s)`)
  return affected
}

export function startCron() {
  // Every day at 02:00 server time.
  cron.schedule('0 2 * * *', () => {
    expireTrials().catch((e) => console.error('[cron] expireTrials failed', e))
  })
  // Also run once shortly after boot so a long-running dev server catches up.
  expireTrials().catch((e) => console.error('[cron] initial expireTrials failed', e))
  console.log('[cron] scheduled: daily trial expiry (02:00)')
}
