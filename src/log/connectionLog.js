// In-memory connection log — a ring buffer of the last N requests to the site,
// surfaced in the admin console as a live traffic monitor. Deliberately NOT
// persisted: it lives only in the running process, so it resets on restart /
// redeploy. That's the accepted trade-off for a zero-migration, zero-per-request
// -DB-write feature (see the connectionLog middleware). The cap comes from
// env.connectionLog.max (default 400).

import { env } from '../config/env.js'

const entries = []
let seq = 0

// Append one connection record, stamping a monotonic id and trimming the oldest
// entry once the buffer is full. O(n) shift is fine at this size (≤ a few hundred).
export function record(entry) {
  entry.id = ++seq
  entries.push(entry)
  while (entries.length > env.connectionLog.max) entries.shift()
}

// The buffer newest-first (what the admin wants to read). Returns a shallow copy
// so callers can't mutate the live buffer.
export function list() {
  return entries.slice().reverse()
}
