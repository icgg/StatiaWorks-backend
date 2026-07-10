// Low-level mail transport. Wraps the Resend SDK and degrades gracefully:
// when RESEND_API_KEY is unset (dev), it logs the message to the console
// instead of sending — so the auth/apply flows keep working without a key.
//
// sendEmail never throws: a delivery failure is logged and swallowed so that
// a flaky mail provider can't 500 a signup, reset, or job application.

import { Resend } from 'resend'
import { env } from '../config/env.js'

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null

/**
 * Send one email. Resolves to { ok, id? , skipped? , error? }.
 * `from` defaults to the transactional sender (`env.emailFrom`); pass it to
 * override (e.g. admin-composed mail sends from `env.adminEmailFrom`).
 * `cc`/`bcc` are optional (string or string[]) — used by the admin broadcast to
 * copy observers on a single send.
 * @param {{ to: string, subject: string, html: string, text?: string, from?: string, cc?: string|string[], bcc?: string|string[] }} msg
 */
export async function sendEmail({ to, subject, html, text, from, cc, bcc }) {
  if (!to) {
    console.warn('[email] skipped — no recipient')
    return { ok: false, skipped: true }
  }

  // No API key configured → log to the console (dev fallback).
  if (!resend) {
    const copies = [
      cc?.length ? `\n  cc: ${[].concat(cc).join(', ')}` : '',
      bcc?.length ? `\n  bcc: ${[].concat(bcc).join(', ')}` : '',
    ].join('')
    console.log(
      `\n[email:dev] would send to ${to}\n  subject: ${subject}${copies}\n  (set RESEND_API_KEY to deliver for real)\n`,
    )
    return { ok: true, skipped: true }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: from || env.emailFrom,
      to,
      subject,
      html,
      text,
      // Only include cc/bcc when present — Resend rejects empty arrays.
      ...(cc?.length ? { cc } : {}),
      ...(bcc?.length ? { bcc } : {}),
    })
    if (error) {
      console.error(`[email] delivery failed to ${to}:`, error)
      return { ok: false, error }
    }
    return { ok: true, id: data?.id }
  } catch (err) {
    console.error(`[email] send threw for ${to}:`, err)
    return { ok: false, error: err }
  }
}
