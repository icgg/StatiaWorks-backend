// Public job-share landing (GET /j/:id). Renders a tiny HTML page carrying
// per-job OpenGraph / Twitter meta so a link pasted into WhatsApp, Facebook,
// LinkedIn, etc. unfurls into a rich preview card. Those crawlers do NOT run
// JavaScript, so the SPA's single static index.html can't give them per-job
// meta — this route can. A human visitor is redirected straight to the SPA job
// page (/jobs/:id) via a <meta refresh> (CSP-safe — the strict app CSP blocks an
// inline redirect script); only the crawler consumes the meta tags.
//
// Reached at the app root (not under /api). In dev the Vite proxy forwards /j to
// the API; in prod a static-site rewrite does (see app/DEPLOYMENT.md), so the
// shared link lives on the main domain (statiaworks.com/j/:id).

import { db } from '../db/knex.js'
import { asyncHandler } from '../middleware/error.js'
import { env } from '../config/env.js'
import { shapeJob } from '../utils/shape.js'

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function firstParagraph(text) {
  if (!text) return ''
  return String(text).split('\n\n')[0].trim()
}

function truncate(text, max = 200) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

function ogHtml({ title, description, image, canonical }) {
  const t = escapeHtml(title)
  const d = escapeHtml(description)
  const url = escapeHtml(canonical)
  const img = image ? escapeHtml(image) : ''
  const card = img ? 'summary_large_image' : 'summary'
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t}</title>
<meta name="description" content="${d}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="StatiaWorks" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:url" content="${url}" />
${img ? `<meta property="og:image" content="${img}" />\n` : ''}<meta name="twitter:card" content="${card}" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
${img ? `<meta name="twitter:image" content="${img}" />\n` : ''}<meta http-equiv="refresh" content="0; url=${url}" />
</head>
<body>
<p>Redirecting to <a href="${url}">${t}</a>…</p>
</body>
</html>`
}

export const jobShare = asyncHandler(async (req, res) => {
  const board = `${env.appUrl}/jobs`
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.redirect(302, board)

  const row = await db('jobs')
    .join('employers', 'employers.id', 'jobs.employer_id')
    .select('jobs.*', 'employers.company as company', 'employers.logo_url as logo_url')
    .where('jobs.id', id)
    .first()

  // Unknown or de-listed posting → bounce to the board (no stale preview card).
  if (!row || row.status === 'removed') return res.redirect(302, board)

  const job = shapeJob(row)
  const canonical = `${env.appUrl}/jobs/${id}`
  const title = job.company ? `${job.title} — ${job.company}` : job.title
  const description = truncate(
    job.blurb ||
      firstParagraph(job.description) ||
      [job.salary, job.type, job.company && `at ${job.company}`].filter(Boolean).join(' · ') ||
      'A local job opening on StatiaWorks.',
    200,
  )
  // Logos are served from /uploads (public in the upload gate); make the URL
  // absolute so a crawler can fetch it. /uploads resolves to the API on both the
  // dev proxy and the prod static-site rewrite, so appUrl is the right base.
  const image = row.logo_url ? `${env.appUrl}${row.logo_url}` : ''

  res.set('Content-Type', 'text/html; charset=utf-8')
  res.set('Cache-Control', 'public, max-age=300')
  res.send(ogHtml({ title, description, image, canonical }))
})
