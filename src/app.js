// Express application: middleware stack, API router, static uploads, and the
// central error handler. `server.js` imports this and starts listening.

import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'

import { env } from './config/env.js'
import apiRouter from './routes/index.js'
import { notFound, errorHandler } from './middleware/error.js'

export function createApp() {
  const app = express()

  // Behind the Vite dev proxy (and any future reverse proxy) so cookies/secure
  // flags resolve correctly.
  app.set('trust proxy', 1)

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

  // Serve uploaded files (résumés, cover letters, logos) statically.
  app.use('/uploads', express.static(env.uploadDir))

  // Health check.
  app.get('/api/health', (req, res) => res.json({ ok: true }))

  // All application routes live under /api.
  app.use('/api', apiRouter)

  // 404 + error handling (must be last).
  app.use(notFound)
  app.use(errorHandler)

  return app
}

export default createApp
