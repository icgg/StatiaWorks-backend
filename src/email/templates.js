// Email content — StatiaWorks-branded HTML (+ plain-text) for each transactional
// message. Every template returns { subject, html, text }. Styles are inlined
// and the layout is table-based for broad email-client compatibility.

const OCEAN = '#103D5D'
const TEAL = '#0E7C7B'
const GOLD = '#E3A11A'
const SAND = '#F4EFE4'
const PAPER = '#FBF8F1'
const INK = '#1c2b36'
const MUTED = '#5b6b77'

// Default footer for transactional mail (account-activity messages).
const DEFAULT_FOOTER = `<p style="margin:0 0 4px;">StatiaWorks — the local job board for Sint Eustatius.</p>
                <p style="margin:0;">You received this email because of activity on your StatiaWorks account.</p>`

// Footer for admin-composed broadcasts — no "account activity" claim.
const BROADCAST_FOOTER = `<p style="margin:0 0 4px;">StatiaWorks — the local job board for Sint Eustatius.</p>
                <p style="margin:0;">Sent by the StatiaWorks team.</p>`

// Shared shell: brand header bar, content card, footer. `body` is trusted HTML;
// `footer` defaults to the transactional footer.
function layout({ heading, body, preheader = '', footer = DEFAULT_FOOTER }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <title>${heading}</title>
  </head>
  <body style="margin:0;padding:0;background:${SAND};color:${INK};font-family:'Hanken Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SAND};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
            <!-- Brand bar -->
            <tr>
              <td style="padding:0 4px 20px;">
                <span style="font-family:'Archivo',Arial,sans-serif;font-weight:800;font-size:22px;letter-spacing:-0.01em;">
                  <span style="color:${OCEAN};">Statia</span><span style="color:${TEAL};">Works</span>
                </span>
              </td>
            </tr>
            <!-- Card -->
            <tr>
              <td style="background:${PAPER};border:1px solid #e7ddc9;border-radius:14px;padding:36px 34px;">
                <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;color:${OCEAN};font-weight:600;">${heading}</h1>
                ${body}
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="padding:22px 6px 0;color:${MUTED};font-size:12px;line-height:1.6;">
                ${footer}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

// A primary call-to-action button.
function button(label, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
    <tr>
      <td style="border-radius:10px;background:${OCEAN};">
        <a href="${href}" style="display:inline-block;padding:13px 26px;font-family:'Space Grotesk',Arial,sans-serif;font-weight:600;font-size:15px;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
      </td>
    </tr>
  </table>`
}

const p = (html) =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${INK};">${html}</p>`

const fallbackLink = (href) =>
  `<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:${MUTED};">If the button doesn't work, copy and paste this link into your browser:<br /><a href="${href}" style="color:${TEAL};word-break:break-all;">${href}</a></p>`

// Escape user-supplied text before interpolating it into HTML.
const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

// Turn a plain-text message into branded paragraphs: blank lines split
// paragraphs; single newlines within a block become <br>.
function textToParagraphs(message) {
  return String(message ?? '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => p(escapeHtml(block).replace(/\n/g, '<br />')))
    .join('')
}

// ---- Templates -----------------------------------------------------------

export function verificationEmail({ name, link }) {
  const hi = name ? `Hi ${name},` : 'Welcome!'
  const body =
    p(hi) +
    p('Thanks for joining StatiaWorks. Confirm your email address to activate your account and get started.') +
    button('Verify my email', link) +
    p(`<span style="font-size:13px;color:${MUTED};">This link expires in 48 hours.</span>`) +
    fallbackLink(link)
  return {
    subject: 'Confirm your StatiaWorks email',
    html: layout({ heading: 'Confirm your email', body, preheader: 'Verify your email to activate your StatiaWorks account.' }),
    text: `${hi}\n\nThanks for joining StatiaWorks. Confirm your email address to activate your account:\n\n${link}\n\nThis link expires in 48 hours.\n\n— StatiaWorks`,
  }
}

export function passwordResetEmail({ name, link }) {
  const hi = name ? `Hi ${name},` : 'Hi,'
  const body =
    p(hi) +
    p('We received a request to reset your StatiaWorks password. Click below to choose a new one.') +
    button('Reset my password', link) +
    p(`<span style="font-size:13px;color:${MUTED};">This link expires in 2 hours. If you didn't request a reset, you can safely ignore this email — your password won't change.</span>`) +
    fallbackLink(link)
  return {
    subject: 'Reset your StatiaWorks password',
    html: layout({ heading: 'Reset your password', body, preheader: 'Choose a new StatiaWorks password.' }),
    text: `${hi}\n\nWe received a request to reset your StatiaWorks password. Use this link to choose a new one:\n\n${link}\n\nThis link expires in 2 hours. If you didn't request a reset, you can ignore this email.\n\n— StatiaWorks`,
  }
}

export function applicationResponseEmail({ name, company, jobTitle, message, link }) {
  const hi = name ? `Hi ${name},` : 'Hi,'
  const who = company || 'The employer'
  const quote = message
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;">
        <tr><td style="border-left:3px solid ${TEAL};background:${SAND};border-radius:0 8px 8px 0;padding:12px 16px;font-size:15px;line-height:1.6;color:${INK};font-style:italic;">${message}</td></tr>
      </table>`
    : ''
  const body =
    p(hi) +
    p(`<strong>${who}</strong> has responded to your application for <strong>${jobTitle}</strong>.`) +
    quote +
    button('View in your portal', link) +
    p(`<span style="font-size:13px;color:${MUTED};">Open your StatiaWorks portal to see the full update.${message ? ' You can reply to the employer by email from your applications.' : ''}</span>`) +
    fallbackLink(link)
  return {
    subject: `Update on your application for ${jobTitle}`,
    html: layout({
      heading: 'You have a response',
      body,
      preheader: `${who} responded to your application for ${jobTitle}.`,
    }),
    text: `${hi}\n\n${who} has responded to your application for "${jobTitle}".${message ? `\n\n"${message}"` : ''}\n\nView it in your portal:\n${link}\n\n— StatiaWorks`,
  }
}

export function newApplicantEmail({ company, jobTitle, applicantName, headline, appliedOn, link }) {
  const who = applicantName || 'A new candidate'
  const body =
    p(company ? `Hi ${company} team,` : 'Hi,') +
    p(`<strong>${who}</strong> just applied to your posting <strong>${jobTitle}</strong>.`) +
    (headline ? p(`<span style="color:${MUTED};">"${headline}"</span>`) : '') +
    (appliedOn ? p(`<span style="font-size:13px;color:${MUTED};">Applied on ${appliedOn}.</span>`) : '') +
    button('Review the application', link) +
    fallbackLink(link)
  return {
    subject: `New applicant for ${jobTitle}`,
    html: layout({
      heading: 'You have a new applicant',
      body,
      preheader: `${who} applied to ${jobTitle}.`,
    }),
    text: `${who} just applied to your posting "${jobTitle}".${headline ? `\n\n"${headline}"` : ''}${appliedOn ? `\nApplied on ${appliedOn}.` : ''}\n\nReview the application:\n${link}\n\n— StatiaWorks`,
  }
}

// Admin-composed custom email. `message` is plain text (line breaks preserved);
// an optional call-to-action button is appended when both label and URL are set.
// Uses the neutral broadcast footer, not the transactional one.
export function broadcastEmail({ subject, heading, message, ctaLabel, ctaUrl }) {
  const hasCta = Boolean(String(ctaLabel || '').trim() && String(ctaUrl || '').trim())
  const body = textToParagraphs(message) + (hasCta ? button(ctaLabel.trim(), ctaUrl.trim()) : '')
  const title = String(heading || '').trim() || String(subject || '').trim() || 'A message from StatiaWorks'
  const text =
    `${String(message ?? '').trim()}` +
    (hasCta ? `\n\n${ctaLabel.trim()}: ${ctaUrl.trim()}` : '') +
    `\n\n— StatiaWorks`
  return {
    subject: String(subject || '').trim() || 'A message from StatiaWorks',
    html: layout({ heading: title, body, preheader: '', footer: BROADCAST_FOOTER }),
    text,
  }
}
