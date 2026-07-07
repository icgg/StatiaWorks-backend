// Employer-facing invoice actions (/me/billing/*): request the annual plan and
// upload an MCB bank-transfer proof screenshot. Both run behind loadEmployer but
// NOT requireActiveEmployer — a *locked* employer must still be able to pay.

import fs from 'node:fs'
import path from 'node:path'
import { db } from '../db/knex.js'
import { env } from '../config/env.js'
import { asyncHandler, badRequest, notFoundError } from '../middleware/error.js'
import { publicUrl } from '../middleware/upload.js'
import { shapeInvoice, amountFor, describe, dateOnly } from '../utils/invoices.js'

// Best-effort unlink of a stored '/uploads/<sub>/<file>' proof (on replacement).
function deleteStoredFile(url) {
  try {
    if (!url || !url.startsWith('/uploads/')) return
    fs.unlinkSync(path.join(env.uploadDir, url.replace('/uploads/', '')))
  } catch {
    /* ignore — orphan cleanup is non-critical */
  }
}

// POST /me/billing/request-annual — switch to the $50/year plan. Idempotent: an
// employer who already has an open annual invoice gets that same invoice back
// (no new one is spawned), so repeatedly hitting "Switch to annual" can't flood
// the account with invoices. Only an *awaiting* monthly invoice is superseded
// (voided) to avoid a double charge — a `pending` invoice (proof already
// uploaded, awaiting admin verification) is never touched. The employer's
// authoritative plan_interval only flips to 'annual' when an admin verifies.
export const requestAnnual = asyncHandler(async (req, res) => {
  const emp = req.employer

  // Already on the annual cycle — nothing to request.
  if (emp.plan_interval === 'annual') {
    throw badRequest('You are already on the annual plan.')
  }

  // The single open (unpaid) invoice, if any. There is at most one because we
  // supersede on every issue and the partial unique index guards duplicates.
  const open = await db('invoices')
    .where({ employer_id: emp.id })
    .whereIn('status', ['awaiting', 'pending'])
    .orderBy('id', 'desc')
    .first()

  if (open) {
    // Proof already submitted — awaiting verification. Don't wipe it or stack a
    // second invoice on top; the employer must wait for that one to resolve.
    if (open.status === 'pending') {
      throw badRequest(
        'You have a payment awaiting verification. Please wait for it to be confirmed before switching plans.',
      )
    }
    // An annual request is already open and unpaid — return it unchanged so a
    // repeat click is a no-op rather than a fresh invoice.
    if (open.plan_interval === 'annual') {
      return res.status(200).json({ ok: true, invoice: shapeInvoice(open) })
    }
    // Otherwise it's an awaiting monthly invoice — superseded in the txn below.
  }

  const today = new Date().toISOString().slice(0, 10)
  // Due at the next renewal (or today if already past), so requesting the plan
  // never locks a paid-up employer sooner than their normal cycle.
  const nextDue = dateOnly(emp.next_payment_date)
  const dueDate = nextDue && nextDue > today ? nextDue : today

  const invoice = await db.transaction(async (trx) => {
    // Only void an awaiting invoice — never a pending (proof-submitted) one.
    await trx('invoices')
      .where({ employer_id: emp.id, status: 'awaiting' })
      .update({ status: 'void' })
    const [row] = await trx('invoices')
      .insert({
        employer_id: emp.id,
        status: 'awaiting',
        payment_method: 'mcb',
        plan_interval: 'annual',
        amount: amountFor('annual'),
        balance: amountFor('annual'),
        description: describe('annual'),
        due_date: dueDate,
      })
      .returning('*')
    return row
  })

  res.status(201).json({ ok: true, invoice: shapeInvoice(invoice) })
})

// POST /me/billing/invoices/:id/proof — attach an MCB payment-proof screenshot.
// Uploading does NOT satisfy the invoice; it flips it to `pending` so the admin
// is prompted to verify the transfer.
export const uploadProof = asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) throw badRequest('Invalid invoice id.')
  if (!req.file) throw badRequest('A payment-proof image is required.')

  const invoice = await db('invoices').where({ id, employer_id: req.employer.id }).first()
  if (!invoice) throw notFoundError('Invoice not found.')
  if (invoice.status !== 'awaiting' && invoice.status !== 'pending') {
    throw badRequest('This invoice can no longer accept a proof of payment.')
  }

  const proofUrl = publicUrl('proofs', req.file)
  if (invoice.proof_url && invoice.proof_url !== proofUrl) deleteStoredFile(invoice.proof_url)

  const [row] = await db('invoices')
    .where({ id })
    .update({ status: 'pending', payment_method: 'mcb', proof_url: proofUrl })
    .returning('*')

  res.json({ ok: true, invoice: shapeInvoice(row) })
})
