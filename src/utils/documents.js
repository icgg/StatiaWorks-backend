// Build the `documents[]` array the employer application-detail view expects
// from an application's stored file URLs. Mirrors the dummy shape in
// employer.js: { name, kind, type, sizeLabel, url }.

import fs from 'node:fs'
import path from 'node:path'
import { env } from '../config/env.js'

function humanSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

// A stored url is like '/uploads/resumes/abc.pdf'; resolve it to disk to stat
// the size (best-effort — returns '' if the file isn't found).
function sizeLabelFor(url) {
  try {
    if (!url || !url.startsWith('/uploads/')) return ''
    const rel = url.replace('/uploads/', '')
    const full = path.join(env.uploadDir, rel)
    const stat = fs.statSync(full)
    return humanSize(stat.size)
  } catch {
    return ''
  }
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
