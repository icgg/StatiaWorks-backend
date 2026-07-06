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
 * @param {{ to: string, subject: string, html: string, text?: string }} msg
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!to) {
    console.warn('[email] skipped — no recipient')
    return { ok: false, skipped: true }
  }

  // No API key configured → log to the console (dev fallback).
  if (!resend) {
    console.log(
      `\n[email:dev] would send to ${to}\n  subject: ${subject}\n  (set RESEND_API_KEY to deliver for real)\n`,
    )
    return { ok: true, skipped: true }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: env.emailFrom,
      to,
      subject,
      html,
      text,
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
