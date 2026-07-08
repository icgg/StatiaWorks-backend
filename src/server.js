// Entry point: create the Express app, ensure upload folders exist, start the
// cron jobs, and listen.

import fs from 'node:fs'
import path from 'node:path'

import { createApp } from './app.js'
import { env } from './config/env.js'
import { startCron } from './cron/index.js'
import { ensureBucket } from './storage/index.js'

// Prepare the file storage backend. Disk: make sure the upload subfolders
// exist before multer needs them. Supabase: make sure the bucket exists.
if (env.storage.driver === 'supabase') {
  ensureBucket() // best-effort, async — logs and carries on
} else {
  for (const sub of ['resumes', 'cover-letters', 'logos', 'proofs']) {
    fs.mkdirSync(path.join(env.uploadDir, sub), { recursive: true })
  }
}

const app = createApp()

const server = app.listen(env.port, () => {
  console.log(`[statiaworks] API listening on http://localhost:${env.port}`)
  console.log(
    `[statiaworks] env=${env.nodeEnv}  storage=${env.storage.driver}` +
      (env.storage.driver === 'supabase'
        ? ` bucket=${env.storage.bucket}`
        : ` uploads=${env.uploadDir}`),
  )
  startCron()
})

// Graceful shutdown.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n[statiaworks] ${sig} received, shutting down`)
    server.close(() => process.exit(0))
  })
}
