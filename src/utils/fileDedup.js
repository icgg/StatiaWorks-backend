// File deduplication. Multer writes each upload to disk under a random name
// before the controller runs; this helper runs *after* that write to collapse
// byte-identical uploads onto a single stored file.
//
// Flow: hash the just-written file (sha256), look it up in `file_hashes`.
//   - hit  → delete the duplicate we just wrote, return the existing URL.
//   - miss → record { hash, url, byte_size }, return the new URL.
// Callers use the returned URL exactly where they used publicUrl() before.

import fs from 'node:fs'
import crypto from 'node:crypto'
import { db } from '../db/knex.js'
import { publicUrl } from '../middleware/upload.js'

function sha256File(fullPath) {
  const buf = fs.readFileSync(fullPath) // uploads are capped at env.maxUploadMb
  return crypto.createHash('sha256').update(buf).digest('hex')
}

// Best-effort unlink — a leftover duplicate is wasted space, never a failure.
function removeQuietly(fullPath) {
  try {
    fs.unlinkSync(fullPath)
  } catch {
    /* ignore */
  }
}

// Given a multer file (or undefined) and its destination sub-folder, return the
// canonical public URL, deduplicating against previously stored files.
export async function dedupeStored(sub, file) {
  if (!file) return null

  let hash
  try {
    hash = sha256File(file.path)
  } catch {
    // If we somehow can't read the file back, fall back to the plain URL rather
    // than losing the upload.
    return publicUrl(sub, file)
  }

  const existing = await db('file_hashes').where({ hash }).first()
  if (existing) {
    removeQuietly(file.path)
    return existing.url
  }

  const url = publicUrl(sub, file)
  // Guard the race where two identical uploads land at once: first writer wins,
  // the loser re-reads the winning row and drops its now-duplicate file.
  await db('file_hashes')
    .insert({ hash, url, byte_size: file.size })
    .onConflict('hash')
    .ignore()

  const row = await db('file_hashes').where({ hash }).first()
  if (row && row.url !== url) {
    removeQuietly(file.path)
    return row.url
  }
  return url
}
