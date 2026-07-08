// Storage abstraction. Uploaded files (résumés, cover letters, logos, payment
// proofs) live under the canonical URL scheme '/uploads/<sub>/<file>' that is
// stored on the DB rows. That URL is an *opaque storage key*: this module is the
// one place that resolves it to a physical backend.
//
//   driver = 'disk'      → local filesystem under env.uploadDir (development)
//   driver = 'supabase'  → the Supabase Storage bucket `env.storage.bucket`
//                          ('uploads'), object key '<sub>/<file>' (production)
//
// Because the URL never changes, everything downstream — dedup (file_hashes),
// the retention cron, reference counting, the documents[] builder, and the
// frontend — is backend-agnostic. NODE_ENV picks the driver, mirroring the DB
// toggle (see config/env.js).

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { env } from '../config/env.js'

const PREFIX = '/uploads/'

// --- URL <-> key helpers ---------------------------------------------------

// Canonical public URL for a stored object.
export function urlFor(sub, filename) {
  return `${PREFIX}${sub}/${filename}`
}

// The bucket object key ('<sub>/<file>') for a '/uploads/...' URL, or null.
export function keyFromUrl(url) {
  if (!url || !url.startsWith(PREFIX)) return null
  return url.slice(PREFIX.length)
}

// A random, extension-preserving filename (mirrors the old multer naming).
export function randomName(originalname) {
  const ext = path.extname(originalname || '').toLowerCase()
  return crypto.randomBytes(12).toString('hex') + ext
}

const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

function contentTypeFor(nameOrUrl, fallback) {
  const ext = path.extname(nameOrUrl || '').toLowerCase()
  return MIME_BY_EXT[ext] || fallback || 'application/octet-stream'
}

// --- Supabase client (lazy) ------------------------------------------------
// Imported dynamically so the SDK is only required when the supabase driver is
// actually used — dev (disk driver) runs without the package installed.

let _client = null
async function supabaseBucket() {
  if (!_client) {
    if (!env.supabase.url || !env.supabase.serviceRoleKey) {
      throw new Error(
        'Supabase storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
      )
    }
    const { createClient } = await import('@supabase/supabase-js')
    // Service-role key: server-side access that bypasses RLS on the private
    // bucket. Never expose this key to the browser.
    _client = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _client.storage.from(env.storage.bucket)
}

const isSupabase = () => env.storage.driver === 'supabase'

// --- Public API ------------------------------------------------------------

// Store a buffer under '<sub>/<file>' and return its canonical '/uploads/...'
// URL. Callers use the returned URL exactly where they persist it on a DB row.
export async function putObject(sub, filename, buffer, contentType) {
  if (isSupabase()) {
    const bucket = await supabaseBucket()
    const { error } = await bucket.upload(`${sub}/${filename}`, buffer, {
      contentType: contentType || contentTypeFor(filename),
      upsert: true,
    })
    if (error) throw error
  } else {
    const full = path.join(env.uploadDir, sub, filename)
    await fsp.mkdir(path.dirname(full), { recursive: true })
    await fsp.writeFile(full, buffer)
  }
  return urlFor(sub, filename)
}

// Fetch a stored object as { buffer, contentType }, or null if absent. Used by
// the supabase serving route; the disk driver serves via express.static.
export async function readObject(url) {
  const key = keyFromUrl(url)
  if (!key) return null
  if (isSupabase()) {
    const bucket = await supabaseBucket()
    const { data, error } = await bucket.download(key)
    if (error || !data) return null
    const buffer = Buffer.from(await data.arrayBuffer())
    return { buffer, contentType: data.type || contentTypeFor(url) }
  }
  try {
    const full = path.join(env.uploadDir, key)
    const buffer = await fsp.readFile(full)
    return { buffer, contentType: contentTypeFor(url) }
  } catch {
    return null
  }
}

// Delete a stored object. Best-effort: returns true if a file was removed.
export async function removeObject(url) {
  const key = keyFromUrl(url)
  if (!key) return false
  if (isSupabase()) {
    try {
      const bucket = await supabaseBucket()
      const { error } = await bucket.remove([key])
      return !error
    } catch {
      return false
    }
  }
  try {
    fs.unlinkSync(path.join(env.uploadDir, key))
    return true
  } catch {
    return false
  }
}

// Synchronous best-effort byte size, for the cosmetic document size label.
// Disk-only: stats the file. On the supabase driver the file isn't local, so
// the label is simply omitted (the authoritative size lives in file_hashes).
export function objectSizeSync(url) {
  if (isSupabase()) return null
  const key = keyFromUrl(url)
  if (!key) return null
  try {
    return fs.statSync(path.join(env.uploadDir, key)).size
  } catch {
    return null
  }
}

// Ensure the target bucket exists (production boot). Best-effort: logs and
// carries on if the bucket can't be created (it may already exist, or the key
// may lack the privilege — the app still runs and surfaces upload errors).
export async function ensureBucket() {
  if (!isSupabase()) return
  try {
    if (!_client) await supabaseBucket() // force lazy client init
    const { data } = await _client.storage.getBucket(env.storage.bucket)
    if (data) return
    const { error } = await _client.storage.createBucket(env.storage.bucket, {
      public: false,
    })
    if (error && !/exists/i.test(error.message || '')) {
      console.warn(`[storage] could not create bucket "${env.storage.bucket}": ${error.message}`)
    } else {
      console.log(`[storage] created private bucket "${env.storage.bucket}"`)
    }
  } catch (e) {
    console.warn(`[storage] bucket check failed: ${e.message}`)
  }
}

// Express handler for GET /uploads/:sub/:file on the supabase driver — streams
// the object back through the API (same-origin, so the frontend is unchanged).
export async function serveUpload(req, res, next) {
  try {
    const url = urlFor(req.params.sub, req.params.file)
    const obj = await readObject(url)
    if (!obj) return res.status(404).end()
    res.type(obj.contentType)
    res.set('Cache-Control', 'private, max-age=3600')
    res.send(obj.buffer)
  } catch (err) {
    next(err)
  }
}
