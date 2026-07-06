// Lightweight validation helpers — enough to enforce required fields, enum
// membership (the guardrails from plan §2.1), and basic shapes without pulling
// in a schema library. Controllers call these and let thrown HttpErrors bubble
// to the error handler.

import { badRequest } from './error.js'

export function requireFields(obj, fields) {
  const missing = fields.filter((f) => {
    const v = obj?.[f]
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
  })
  if (missing.length) {
    throw badRequest(`Missing required field(s): ${missing.join(', ')}`)
  }
}

// Throw unless `value` is one of `allowed`. Used for predefined-choice fields
// (sector, employment type, statuses) — the primary app-layer guardrail.
export function assertEnum(value, allowed, label = 'value') {
  if (!allowed.includes(value)) {
    throw badRequest(
      `Invalid ${label}: "${value}". Must be one of: ${allowed.join(', ')}.`,
    )
  }
}

// Optional enum: only checked when a value is present.
export function assertEnumOptional(value, allowed, label = 'value') {
  if (value === undefined || value === null || value === '') return
  assertEnum(value, allowed, label)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function assertEmail(email) {
  if (!EMAIL_RE.test(String(email || ''))) throw badRequest('A valid email is required.')
}

export function assertMinLength(value, min, label = 'value') {
  if (String(value || '').length < min) {
    throw badRequest(`${label} must be at least ${min} characters.`)
  }
}

// Coerce an id route param to a positive integer or throw 400.
export function intParam(value, label = 'id') {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`Invalid ${label}.`)
  return n
}

// Accept a JSON field that may arrive as an object (JSON body) or a string
// (multipart form field). Returns the parsed value or the fallback.
export function parseJsonField(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}
