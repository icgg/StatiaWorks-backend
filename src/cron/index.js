// Scheduled maintenance.
//
//  1. 02:00 — expire employer free trials whose trial_end_date has passed
//     (trial -> false). An employer with neither `paid` nor `trial` is then
//     *locked* (enforced by requireActiveEmployer + the frontend router guard).
//
//  2. 03:00 — attachment retention sweep. Per the ToS, résumés/cover letters
//     linked to an application become unavailable a fixed window (default 6
//     months, env.attachmentRetentionMonths) after the job posting closes. This
//     job auto-closes past-deadline postings (so they enter the countdown),
//     clears the file references on applications of long-closed jobs, and
//     deletes the physical files + hash rows once nothing else references them.

import cron from 'node-cron'
import fs from 'node:fs'
import path from 'node:path'
import { db } from '../db/knex.js'
import { env } from '../config/env.js'
import { isUrlReferenced } from '../utils/fileRefs.js'

export async function expireTrials() {
  const affected = await db('employers')
    .where('trial', true)
    .whereNotNull('trial_end_date')
    .where('trial_end_date', '<', db.fn.now())
    .update({ trial: false })
  if (affected) console.log(`[cron] expired ${affected} trial(s)`)
  return affected
}

// Resolve a stored '/uploads/<sub>/<file>' URL to its path on disk and unlink it
// (best-effort). Mirrors the resolution in utils/documents.js.
function deleteStoredFile(url) {
  try {
    if (!url || !url.startsWith('/uploads/')) return false
    const full = path.join(env.uploadDir, url.replace('/uploads/', ''))
    fs.unlinkSync(full)
    return true
  } catch {
    return false
  }
}

export async function expireAttachments() {
  const months = env.attachmentRetentionMonths

  // (a) Auto-close postings whose deadline has passed but were never manually
  //     closed, so they too enter the retention countdown. COALESCE preserves a
  //     pre-existing closed_at (the set-once rule).
  const autoClosed = await db('jobs')
    .where('status', 'active')
    .whereNotNull('deadline')
    .where('deadline', '<', db.raw('CURRENT_DATE'))
    .update({ status: 'closed', closed_at: db.raw('COALESCE(closed_at, now())') })

  // (b) Postings closed longer ago than the retention window.
  const expiredJobs = await db('jobs')
    .where('status', 'closed')
    .whereNotNull('closed_at')
    .where('closed_at', '<', db.raw(`now() - (? * interval '1 month')`, [months]))
    .select('id')
  const jobIds = expiredJobs.map((j) => j.id)
  if (!jobIds.length) {
    if (autoClosed) console.log(`[cron] attachment sweep: auto-closed ${autoClosed} past-deadline job(s)`)
    return { autoClosed, scrubbed: 0, filesDeleted: 0 }
  }

  // (c) Collect the distinct file URLs referenced by those jobs' applications,
  //     then null out the application references.
  const rows = await db('applications')
    .whereIn('job_id', jobIds)
    .select('resume_url', 'cover_url')

  const urls = new Set()
  for (const r of rows) {
    if (r.resume_url) urls.add(r.resume_url)
    if (r.cover_url) urls.add(r.cover_url)
  }

  const scrubbed = await db('applications')
    .whereIn('job_id', jobIds)
    .update({ resume_url: null, cover_url: null })

  // (d) For each freed URL, delete the physical file + hash row only if nothing
  //     else (a seeker profile, a newer application, an employer logo) still
  //     references it. Deduplication makes this reference check essential.
  let filesDeleted = 0
  for (const url of urls) {
    if (await isUrlReferenced(url)) continue
    if (deleteStoredFile(url)) filesDeleted += 1
    await db('file_hashes').where({ url }).del()
  }

  console.log(
    `[cron] attachment sweep: auto-closed ${autoClosed}, scrubbed ${scrubbed} application(s), deleted ${filesDeleted} file(s)`,
  )
  return { autoClosed, scrubbed, filesDeleted }
}

export function startCron() {
  // Every day at 02:00 server time.
  cron.schedule('0 2 * * *', () => {
    expireTrials().catch((e) => console.error('[cron] expireTrials failed', e))
  })
  // Every day at 03:00 server time (offset from trial expiry).
  cron.schedule('0 3 * * *', () => {
    expireAttachments().catch((e) => console.error('[cron] expireAttachments failed', e))
  })
  // Also run once shortly after boot so a long-running dev server catches up.
  expireTrials().catch((e) => console.error('[cron] initial expireTrials failed', e))
  expireAttachments().catch((e) => console.error('[cron] initial expireAttachments failed', e))
  console.log('[cron] scheduled: daily trial expiry (02:00) + attachment retention sweep (03:00)')
}
