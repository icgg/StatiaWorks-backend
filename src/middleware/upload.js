// Multer configuration. Four upload kinds (resumes, cover-letters, logos,
// proofs). Files are held in memory (buffer) rather than written to disk here —
// the storage layer (storage/index.js) decides the physical backend (local disk
// in dev, the Supabase `uploads` bucket in prod) and assigns the random,
// extension-preserving name. Controllers persist the returned '/uploads/<sub>/
// <file>' URL on the DB row.

import multer from 'multer'
import path from 'node:path'
import { env } from '../config/env.js'
import { badRequest } from './error.js'

const MAX_BYTES = env.maxUploadMb * 1024 * 1024

const DOC_EXT = new Set(['.pdf', '.doc', '.docx'])
// NOTE: .svg is deliberately excluded. SVGs can carry inline <script>, and an
// uploaded logo is served same-origin — opening it directly would execute that
// script in the app's origin (stored XSS). Raster formats only.
const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])

function fileFilter(allowed) {
  return (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.has(ext)) return cb(null, true)
    cb(badRequest(`Unsupported file type: ${ext || 'unknown'}`))
  }
}

// Résumé + optional cover-letter (the apply drawer).
export const applicationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: fileFilter(DOC_EXT),
}).fields([
  { name: 'resume', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
])

// Résumé only (seeker profile).
export const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: fileFilter(DOC_EXT),
}).single('resume')

// Company logo (employer profile).
export const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: fileFilter(IMG_EXT),
}).single('logo')

// MCB payment-proof screenshot (billing). Deliberately NOT run through the
// dedup helper — a proof is tied to one invoice and must never be shared with
// (or garbage-collected alongside) a logo or another proof, so the controller
// stores it directly via the storage layer.
export const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: fileFilter(IMG_EXT),
}).single('proof')

// Translate multer errors (e.g. file too large) into clean 400s.
export function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const msg =
      err.code === 'LIMIT_FILE_SIZE'
        ? `File too large (max ${env.maxUploadMb} MB).`
        : err.message
    return next(badRequest(msg))
  }
  next(err)
}
