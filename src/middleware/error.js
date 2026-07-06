// Central error handling. Controllers throw `HttpError` (or any Error); this
// normalises the response to `{ message }` — the shape the frontend's ofetch
// client reads (`body.message`) to build its `ApiError`.

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.details = details
  }
}

// Shorthands.
export const badRequest = (msg, details) => new HttpError(400, msg, details)
export const unauthorized = (msg = 'Not authenticated') => new HttpError(401, msg)
export const forbidden = (msg = 'Not allowed') => new HttpError(403, msg)
export const notFoundError = (msg = 'Not found') => new HttpError(404, msg)
export const conflict = (msg = 'Conflict') => new HttpError(409, msg)

// Wrap an async route handler so thrown/rejected errors reach the error handler.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next)

export function notFound(req, res, next) {
  next(new HttpError(404, `No route for ${req.method} ${req.originalUrl}`))
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Postgres CHECK / unique-violation → friendly 4xx.
  if (err && err.code === '23505') {
    return res.status(409).json({ message: 'That record already exists.' })
  }
  if (err && err.code === '23514') {
    return res.status(400).json({ message: 'A field has a value that is not allowed.' })
  }

  const status = err.status || 500
  if (status >= 500) {
    console.error('[error]', err)
  }
  const body = { message: err.message || 'Server error' }
  if (err.details) body.details = err.details
  // Machine-readable code for cases the frontend must branch on (e.g.
  // ACCOUNT_SUSPENDED — see middleware/auth.js). Only surfaced for our own
  // HttpErrors so raw driver codes never leak.
  if (err instanceof HttpError && err.code) body.code = err.code
  res.status(status).json(body)
}
