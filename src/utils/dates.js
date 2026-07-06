// Server-side date helpers. The frontend dummy data expressed ages as
// "postedDaysAgo" / "submittedDaysAgo" integers; controllers compute those from
// real timestamps so the shapes stay identical.

const DAY = 86400000

// Whole days between `date` (past) and now. null-safe → 0.
export function daysSince(date) {
  if (!date) return 0
  const then = new Date(date).getTime()
  if (Number.isNaN(then)) return 0
  return Math.max(0, Math.floor((Date.now() - then) / DAY))
}

// ISO calendar date ('YYYY-MM-DD') or undefined, for deadline fields the
// frontend passes to its dates util.
export function isoDate(date) {
  if (!date) return undefined
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString().slice(0, 10)
}
