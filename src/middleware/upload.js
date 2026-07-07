// Multer configuration. Three destinations under uploads/: resumes,
// cover-letters, logos. Files are stored with a random, extension-preserving
// name; the stored public URL ('/uploads/<sub>/<file>') goes in the DB.

import multer from 'multer'
import path from 'node:path'
import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { badRequest } from './error.js'

const MAX_BYTES = env.maxUploadMb * 1024 * 1024

const DOC_EXT = new Set(['.pdf', '.doc', '.docx'])
const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg'])

function storageFor(sub) {
  return multer.diskStorage({
    destination(req, file, cb) {
      cb(null, path.join(env.uploadDir, sub))
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase()
      const name = crypto.randomBytes(12).toString('hex') + ext
      cb(null, name)
    },
  })
}

function fileFilter(allowed) {
  return (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.has(ext)) return cb(null, true)
    cb(badRequest(`Unsupported file type: ${ext || 'unknown'}`))
  }
}

// Public URL for a stored upload, from the multer file object.
export function publicUrl(sub, file) {
  return file ? `/uploads/${sub}/${file.filename}` : null
}

// Résumé + optional cover-letter (the apply drawer).
export const applicationUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const sub = file.fieldname === 'cover' ? 'cover-letters' : 'resumes'
      cb(null, path.join(env.uploadDir, sub))
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase()
      cb(null, crypto.randomBytes(12).toString('hex') + ext)
    },
  }),
  limits: { fileSize: MAX_BYTES },
  fileFilter: fileFilter(DOC_EXT),
}).fields([
  { name: 'resume', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
])

// Résumé only (seeker profile).
export const resumeUpload = multer({
  storage: storageFor('resumes'),
  limits: { fileSize: MAX_BYTES },
  fileFilter: fileFilter(DOC_EXT),
}).single('resume')

// Company logo (employer profile).
export const logoUpload = multer({
  storage: storageFor('logos'),
  limits: { fileSize: MAX_BYTES },
  fileFilter: fileFilter(IMG_EXT),
}).single('logo')

// MCB payment-proof screenshot (billing). Deliberately NOT run through the
// dedup helper — a proof is tied to one invoice and must never be shared with
// (or garbage-collected alongside) a logo or another proof, so we store its
// publicUrl directly.
export const proofUpload = multer({
  storage: storageFor('proofs'),
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
