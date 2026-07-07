// Invoice shaping + billing-cycle helpers, shared by the billing controller
// (/me/billing), the invoice controller (proof upload / annual request), the
// admin console, and the cron jobs. Keeps the display strings and the
// overdue/cycle math in one place.

import { env } from '../config/env.js'

// Raw status -> customer-facing label.
export const INVOICE_STATUS_LABEL = {
  awaiting: 'Awaiting Bank Transfer',
  pending: 'Pending Verification',
  paid: 'Paid',
  void: 'Cancelled',
}

// 'YYYY-MM-DD' for a Date/string, or '' when absent. DATE columns come back from
// pg as either a Date (midnight) or a string depending on driver settings.
export function dateOnly(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

// Long US display date ("August 1, 2026"), matching the rest of billing.
export function displayDate(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// Overdue = an unpaid invoice whose due date has fully elapsed (today > due).
// Mirrors the enforcement cron's `DATE_TRUNC('day', NOW()) > due_date`.
export function isOverdue(row) {
  if (row.status !== 'awaiting' && row.status !== 'pending') return false
  const due = dateOnly(row.due_date)
  const today = new Date().toISOString().slice(0, 10)
  return !!due && today > due
}

// Money as a display string ("$5.00").
export function money(value) {
  return `$${Number(value).toFixed(2)}`
}

// One invoice row -> the shape the frontends consume.
export function shapeInvoice(row) {
  return {
    id: row.id,
    reference: `#${row.id}`,
    status: row.status,
    statusLabel: INVOICE_STATUS_LABEL[row.status] || row.status,
    planInterval: row.plan_interval,
    amount: money(row.amount),
    balance: money(row.balance),
    description: row.description || '',
    date: displayDate(row.created_at),
    dueDate: displayDate(row.due_date),
    dueDateIso: dateOnly(row.due_date),
    overdue: isOverdue(row),
    proofUrl: row.proof_url || null,
    hasProof: !!row.proof_url,
    paidOn: displayDate(row.paid_at),
  }
}

// The numeric charge for a plan interval.
export function amountFor(interval) {
  return interval === 'annual' ? env.pricing.annualAmount : env.pricing.monthlyAmount
}

// A human line description for a plan interval.
export function describe(interval) {
  return interval === 'annual'
    ? 'StatiaWorks Employer — annual'
    : 'StatiaWorks Employer — monthly'
}
