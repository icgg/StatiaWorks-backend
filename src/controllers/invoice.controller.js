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

// POST /me/billing/request-annual — switch to the $50/year plan. Voids any open
// (awaiting/pending) invoice so there's no double charge, then issues a fresh
// annual invoice awaiting a bank transfer. The employer's authoritative
// plan_interval only flips to 'annual' when an admin verifies the payment.
export const requestAnnual = asyncHandler(async (req, res) => {
  const emp = req.employer
  const today = new Date().toISOString().slice(0, 10)
  // Due at the next renewal (or today if already past), so requesting the plan
  // never locks a paid-up employer sooner than their normal cycle.
  const nextDue = dateOnly(emp.next_payment_date)
  const dueDate = nextDue && nextDue > today ? nextDue : today

  const invoice = await db.transaction(async (trx) => {
    await trx('invoices')
      .where({ employer_id: emp.id })
      .whereIn('status', ['awaiting', 'pending'])
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
