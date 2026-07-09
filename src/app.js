// Express application: middleware stack, API router, static uploads, and the
// central error handler. `server.js` imports this and starts listening.

import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'

import { env } from './config/env.js'
import apiRouter from './routes/index.js'
import { notFound, errorHandler } from './middleware/error.js'
import { globalLimiter } from './middleware/rateLimit.js'
import { loadUser, loadAdmin } from './middleware/auth.js'
import { authorizeUpload } from './middleware/uploadAccess.js'
import { serveUpload } from './storage/index.js'

export function createApp() {
  const app = express()

  // Behind the Vite dev proxy (and any future reverse proxy) so cookies/secure
  // flags resolve correctly.
  app.set('trust proxy', 1)

  // Security headers (nosniff, frameguard, HSTS in prod, no X-Powered-By, …).
  // Mounted first so it also covers the static/streamed /uploads responses.
  // This backend serves only JSON and user-uploaded files — never the frontend
  // HTML — so we can lock the CSP right down: `default-src 'none'` means that if
  // an HTML/SVG file is ever served from /uploads it can neither run script nor
  // load any subresource (defence-in-depth behind the SVG-upload block). The
  // frontend is hosted separately and carries its own CSP, so this never
  // constrains the app UI. NOTE: helmet's default Cross-Origin-Resource-Policy
  // is 'same-origin' — fine while the app and API share an origin (the current
  // deployment); if the API ever moves to a separate host, relax CORP so the
  // app can still embed /uploads/logos images.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  )

  // CORS with credentials so cookie sessions work from the Vite dev servers.
  // (In dev the requests are same-origin via the Vite proxy, but this is a
  // backstop for direct cross-origin calls.)
  app.use(
    cors({
      origin: env.appOrigins,
      credentials: true,
    }),
  )

  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: true }))
  app.use(cookieParser())

  // Serve uploaded files (résumés, cover letters, logos, proofs). Every request
  // is authorized first (authorizeUpload): logos are public, but résumés, cover
  // letters, and payment proofs are readable only by the seeker/employer/admin
  // who legitimately references them. loadUser + loadAdmin populate the caller
  // from the session cookie or bearer without rejecting. serveUpload then streams
  // the bytes from whichever backend the storage layer resolves (local disk in
  // dev, the Supabase bucket in prod), so the frontend's plain '/uploads/...'
  // links are unchanged either way. (Replaces the previous unauthenticated
  // express.static / open route.)
  app.get('/uploads/:sub/:file', loadUser, loadAdmin, authorizeUpload, serveUpload)

  // Health check.
  app.get('/api/health', (req, res) => res.json({ ok: true }))

  // All application routes live under /api. A broad rate-limit ceiling guards
  // the whole API surface (static /uploads and the health check stay unthrottled).
  app.use('/api', globalLimiter, apiRouter)

  // 404 + error handling (must be last).
  app.use(notFound)
  app.use(errorHandler)

  return app
}

export default createApp
