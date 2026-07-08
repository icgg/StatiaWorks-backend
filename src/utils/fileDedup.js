// File deduplication. Multer holds each upload in memory (a buffer); this helper
// collapses byte-identical uploads onto a single stored object.
//
// Flow: hash the uploaded buffer (sha256), look it up in `file_hashes`.
//   - hit  → return the existing URL WITHOUT storing anything (the write is
//            skipped entirely — the DB row points at the already-stored file).
//   - miss → store the buffer via the storage layer, record
//            { hash, url, byte_size }, return the new URL.
// Callers use the returned URL exactly where they persist it on a DB row.

import crypto from 'node:crypto'
import { db } from '../db/knex.js'
import { putObject, removeObject, randomName } from '../storage/index.js'

// Given a multer file (or undefined) and its destination sub-folder, return the
// canonical public URL, deduplicating against previously stored files.
export async function dedupeStored(sub, file) {
  if (!file) return null

  const buffer = file.buffer
  const hash = crypto.createHash('sha256').update(buffer).digest('hex')

  const existing = await db('file_hashes').where({ hash }).first()
  if (existing) return existing.url

  const filename = randomName(file.originalname)
  const url = await putObject(sub, filename, buffer, file.mimetype)

  // Guard the race where two identical uploads land at once: first writer wins,
  // the loser re-reads the winning row and drops its now-duplicate object.
  await db('file_hashes')
    .insert({ hash, url, byte_size: buffer.length })
    .onConflict('hash')
    .ignore()

  const row = await db('file_hashes').where({ hash }).first()
  if (row && row.url !== url) {
    await removeObject(url)
    return row.url
  }
  return url
}
