// High-level email senders used by the controllers. Each builds an absolute
// link from APP_URL, renders the branded template, and hands it to the mailer
// (which never throws — see mailer.js).

import { env } from '../config/env.js'
import { sendEmail } from './mailer.js'
import { verificationEmail, passwordResetEmail, newApplicantEmail } from './templates.js'

const appLink = (path) => `${env.appUrl}${path}`

export function sendVerificationEmail({ email, name, token }) {
  const msg = verificationEmail({ name, link: appLink(`/verify-email?token=${token}`) })
  return sendEmail({ to: email, ...msg })
}

export function sendPasswordResetEmail({ email, name, token }) {
  const msg = passwordResetEmail({ name, link: appLink(`/reset-password?token=${token}`) })
  return sendEmail({ to: email, ...msg })
}

export function sendNewApplicantEmail({ email, company, jobId, jobTitle, applicantName, headline, appliedOn }) {
  const msg = newApplicantEmail({
    company,
    jobTitle,
    applicantName,
    headline,
    appliedOn,
    link: appLink(`/employer/posts/${jobId}/applicants`),
  })
  return sendEmail({ to: email, ...msg })
}
