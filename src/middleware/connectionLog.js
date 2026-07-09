// Connection-logging middleware. Records every request into the in-memory ring
// buffer (log/connectionLog.js) so the admin console can show recent site
// traffic: IP, time, method, path, response status, a friendly "action" label,
// and — when a session token is present — which account made the request.
//
// Mounted app-wide right after cookieParser so it captures *every* connection
// (including 404s and rate-limited responses), regardless of route. Account
// attribution decodes the JWT inline with verifyToken (no DB query) so this adds
// negligible overhead per request. `req.ip` is trustworthy because app.js sets
// `trust proxy`.

import { verifyToken, SESSION_COOKIE, ADMIN_COOKIE } from '../utils/jwt.js'
import { record } from '../log/connectionLog.js'

// Requests we never want cluttering the log: CORS preflight, the health probe,
// and the admin's own polling of this very log (would otherwise self-pollute).
function isNoise(req) {
  if (req.method === 'OPTIONS') return true
  const p = req.path
  return p === '/api/health' || p === '/api/admin/connections'
}

function bearer(req) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

// Best-effort caller identity from the session/admin cookie or bearer token.
// Never throws and never hits the DB — a malformed/expired token just yields an
// anonymous entry.
function identify(req) {
  const token = req.cookies?.[SESSION_COOKIE] || req.cookies?.[ADMIN_COOKIE] || bearer(req)
  if (!token) return {}
  const payload = verifyToken(token)
  if (!payload) return {}
  if (payload.role === 'admin') return { adminEmail: payload.sub }
  if (payload.sub && payload.role) return { accountId: payload.sub, role: payload.role }
  return {}
}

// Map a request to a human-readable action. Ordered — the first match wins.
const ACTIONS = [
  { re: /^\/api\/auth\/login$/, method: 'POST', label: 'Logged in' },
  { re: /^\/api\/auth\/logout$/, method: 'POST', label: 'Logged out' },
  { re: /^\/api\/auth\/signup/, method: 'POST', label: 'Signed up' },
  { re: /^\/api\/auth\/verify-email$/, method: 'POST', label: 'Verified email' },
  { re: /^\/api\/auth\/password\/(forgot|reset)/, label: 'Password recovery' },
  { re: /^\/api\/admin\/auth\/login$/, method: 'POST', label: 'Admin login' },
  { re: /^\/api\/admin\//, label: 'Admin action' },
  { re: /^\/api\/me\/applications/, method: 'POST', label: 'Submitted application' },
  { re: /^\/api\/me\/posts/, method: 'POST', label: 'Posted a job' },
  { re: /^\/api\/me\//, label: 'Portal activity' },
  { re: /^\/api\/jobs\/[^/]+$/, method: 'GET', label: 'Viewed a job' },
  { re: /^\/api\/jobs\/?$/, method: 'GET', label: 'Browsed jobs' },
  { re: /^\/api\/sectors/, method: 'GET', label: 'Viewed sectors' },
  { re: /^\/j\//, label: 'Opened share link' },
  { re: /^\/uploads\//, label: 'Downloaded a file' },
]

function deriveAction(method, path) {
  for (const a of ACTIONS) {
    if (a.method && a.method !== method) continue
    if (a.re.test(path)) return a.label
  }
  return `${method} ${path}`
}

export function logConnection(req, res, next) {
  if (isNoise(req)) return next()

  const ts = new Date().toISOString()
  const ip = req.ip
  const method = req.method
  const path = req.originalUrl
  const action = deriveAction(method, req.path)
  const userAgent = req.headers['user-agent'] || ''
  const who = identify(req)

  // Record once the response is done so we capture the final status code.
  res.on('finish', () => {
    record({ ts, ip, method, path, action, status: res.statusCode, userAgent, ...who })
  })

  next()
}
