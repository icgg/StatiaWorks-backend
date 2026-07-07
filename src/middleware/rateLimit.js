// Rate limiting (express-rate-limit v8). `app.set('trust proxy', 1)` in app.js
// lets these read the real client IP behind the Vite/reverse proxy.
//
// Layers:
//   globalLimiter   — broad ceiling on the whole /api surface.
//   authLimiter     — strict cap on auth + email-send endpoints (brute-force /
//                     verification-spam vectors), incl. admin login.
//   applyLimiter    — caps application submissions.
//   uploadLimiter   — caps profile/company upload writes.
//   postingLimiter  — job-posting flood guard, keyed per-ACCOUNT and per-IP
//                     (two limiters, both must pass — a single account can't
//                     flood from many IPs, and one IP can't drive many accounts).
//
// All windows are configured (minutes) in env.rateLimit; responses are 429s
// with a JSON body consistent with the app's error handler ({ message, code }).

import rateLimit from 'express-rate-limit'
import { env } from '../config/env.js'

const MIN = 60 * 1000

function limiter({ windowMin, max, message, keyGenerator }) {
  return rateLimit({
    windowMs: windowMin * MIN,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (req, res) => {
      res.status(429).json({
        message: message || 'Too many requests — please slow down and try again shortly.',
        code: 'RATE_LIMITED',
      })
    },
  })
}

const rl = env.rateLimit

export const globalLimiter = limiter({
  windowMin: rl.globalWindowMin,
  max: rl.globalMax,
})

export const authLimiter = limiter({
  windowMin: rl.authWindowMin,
  max: rl.authMax,
  message: 'Too many attempts. Please wait a few minutes before trying again.',
})

export const applyLimiter = limiter({
  windowMin: rl.applyWindowMin,
  max: rl.applyMax,
  message: 'Too many applications submitted. Please try again later.',
})

export const uploadLimiter = limiter({
  windowMin: rl.uploadWindowMin,
  max: rl.uploadMax,
  message: 'Too many uploads. Please try again later.',
})

// Job-posting flood guard — the two dimensions the user asked for.
// IP dimension (default IPv6-safe key):
export const postingIpLimiter = limiter({
  windowMin: rl.postingWindowMin,
  max: rl.postingMax,
  message: 'Too many job postings from this network. Please try again later.',
})
// Account dimension (mounted after loadUser/requireActiveEmployer, so
// req.account is present — keying on it alone avoids any IP in the key):
export const postingAccountLimiter = limiter({
  windowMin: rl.postingWindowMin,
  max: rl.postingMax,
  message: 'You have posted too many jobs recently. Please try again later.',
  keyGenerator: (req) => `acct:${req.account?.id ?? 'unknown'}`,
})
