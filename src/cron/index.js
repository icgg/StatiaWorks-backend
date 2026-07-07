// Scheduled maintenance.
//
//  1. 02:00 — expire employer free trials whose trial_end_date has passed
//     (trial -> false). An employer with neither `paid` nor `trial` is then
//     *locked* (enforced by requireActiveEmployer + the frontend router guard).
//     This and the 00:00 payment sweep both call closeLockedEmployerListings
//     (utils/lockout.js) to force-close the locked employer's active listings off
//     the public board — reactivation (admin verifyInvoice) auto-reopens them.
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
import { closeLockedEmployerListings } from '../utils/lockout.js'

export async function expireTrials() {
  const affected = await db('employers')
    .where('trial', true)
    .whereNotNull('trial_end_date')
    .where('trial_end_date', '<', db.fn.now())
    .update({ trial: false })
  if (affected) {
    console.log(`[cron] expired ${affected} trial(s)`)
    // A trial ending with no active plan locks the account — take its listings down.
    const closed = await closeLockedEmployerListings()
    if (closed) console.log(`[cron] force-closed ${closed} listing(s) for locked employer(s)`)
  }
  return affected
}

// Issue the next invoice ahead of its due date so the employer can pay before
// their service is cut off. Runs for any employer whose next_payment_date is
// within 2 days, unless they already have an open (awaiting/pending) invoice —
// so we never stack bills (a trial converting, a monthly renewal, or an
// outstanding annual request all resolve to at most one open invoice). The
// invoice snapshots the employer's current plan_interval + price. Idempotent:
// the NOT EXISTS guard plus the partial unique index (employer_id, due_date)
// stop a second run from creating a duplicate.
export async function generateInvoices() {
  const { monthlyAmount, annualAmount } = env.pricing
  const result = await db.raw(
    `
    INSERT INTO invoices (employer_id, status, payment_method, plan_interval, amount, balance, description, due_date)
    SELECT e.id, 'awaiting', 'mcb', e.plan_interval,
           (CASE WHEN e.plan_interval = 'annual' THEN :annual ELSE :monthly END)::numeric,
           (CASE WHEN e.plan_interval = 'annual' THEN :annual ELSE :monthly END)::numeric,
           CASE WHEN e.plan_interval = 'annual'
                THEN 'StatiaWorks Employer — annual'
                ELSE 'StatiaWorks Employer — monthly' END,
           e.next_payment_date
    FROM employers e
    WHERE e.next_payment_date IS NOT NULL
      AND e.next_payment_date <= CURRENT_DATE + INTERVAL '2 days'
      AND NOT EXISTS (
        SELECT 1 FROM invoices i
        WHERE i.employer_id = e.id AND i.status IN ('awaiting', 'pending')
      )
    ON CONFLICT DO NOTHING
    `,
    { monthly: monthlyAmount, annual: annualAmount },
  )
  const created = result.rowCount || 0
  if (created) console.log(`[cron] generated ${created} invoice(s)`)
  return created
}

// Cut off employers who let a bill lapse. Locks (paid -> false) any *paying*
// employer with an `awaiting` invoice whose due date has fully elapsed
// (DATE_TRUNC('day', NOW()) > due_date → they get the entire due day to pay).
// `pending` invoices (proof already uploaded, awaiting admin verification) are
// intentionally excluded so a customer who acted on time isn't cut off by
// verification latency. Trials (paid already false) are handled by expireTrials.
export async function enforcePayments() {
  const result = await db.raw(`
    UPDATE employers SET paid = false
    WHERE paid = true
      AND EXISTS (
        SELECT 1 FROM invoices i
        WHERE i.employer_id = employers.id
          AND i.status = 'awaiting'
          AND DATE_TRUNC('day', NOW()) > i.due_date
      )
  `)
  const locked = result.rowCount || 0
  if (locked) {
    console.log(`[cron] locked ${locked} employer(s) for non-payment`)
    // Newly-locked payers lose their public listings too.
    const closed = await closeLockedEmployerListings()
    if (closed) console.log(`[cron] force-closed ${closed} listing(s) for locked employer(s)`)
  }
  return locked
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
  // Every day at 00:00 — cut off employers whose bill lapsed (end of due date).
  cron.schedule('0 0 * * *', () => {
    enforcePayments().catch((e) => console.error('[cron] enforcePayments failed', e))
  })
  // Every day at 00:15 — issue invoices coming due within 2 days.
  cron.schedule('15 0 * * *', () => {
    generateInvoices().catch((e) => console.error('[cron] generateInvoices failed', e))
  })
  // Every day at 02:00 server time.
  cron.schedule('0 2 * * *', () => {
    expireTrials().catch((e) => console.error('[cron] expireTrials failed', e))
  })
  // Every day at 03:00 server time (offset from trial expiry).
  cron.schedule('0 3 * * *', () => {
    expireAttachments().catch((e) => console.error('[cron] expireAttachments failed', e))
  })
  // Also run once shortly after boot so a long-running dev server catches up.
  enforcePayments().catch((e) => console.error('[cron] initial enforcePayments failed', e))
  generateInvoices().catch((e) => console.error('[cron] initial generateInvoices failed', e))
  expireTrials().catch((e) => console.error('[cron] initial expireTrials failed', e))
  expireAttachments().catch((e) => console.error('[cron] initial expireAttachments failed', e))
  console.log(
    '[cron] scheduled: payment enforcement (00:00) + invoice generation (00:15) + trial expiry (02:00) + attachment retention sweep (03:00)',
  )
}
