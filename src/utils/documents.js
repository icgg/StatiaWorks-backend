// Build the `documents[]` array the employer application-detail view expects
// from an application's stored file URLs. Mirrors the dummy shape in
// employer.js: { name, kind, type, sizeLabel, url }.

import path from 'node:path'
import { objectSizeSync } from '../storage/index.js'

function humanSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

// Best-effort human size label. Resolved synchronously by the storage layer:
// the disk driver stats the file; on the Supabase driver the file isn't local
// so the label is simply omitted (a minor cosmetic difference).
function sizeLabelFor(url) {
  const size = objectSizeSync(url)
  return size == null ? '' : humanSize(size)
}

function typeFromUrl(url) {
  const ext = path.extname(url || '').replace('.', '').toUpperCase()
  return ext || 'FILE'
}

export function buildDocuments({ resume_url, cover_url } = {}) {
  const docs = []
  if (resume_url) {
    docs.push({
      name: 'Resume/CV',
      kind: 'Resume/CV',
      type: typeFromUrl(resume_url),
      sizeLabel: sizeLabelFor(resume_url),
      url: resume_url,
    })
  }
  if (cover_url) {
    docs.push({
      name: 'Cover letter',
      kind: 'Cover letter',
      type: typeFromUrl(cover_url),
      sizeLabel: sizeLabelFor(cover_url),
      url: cover_url,
    })
  }
  return docs
}
