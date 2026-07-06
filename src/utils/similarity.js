// Company-name similarity — the admin abuse-detection core, ported verbatim
// from admin/src/utils/similarity.js so the server computes the same flag
// clusters the frontend prototyped. Pure/framework-free.
//
// The one difference from the frontend copy: accounts here come from the DB, so
// `createdDaysAgo` is derived by the caller from `created_at`.

const STOPWORDS = new Set([
  'the', 'co', 'inc', 'llc', 'ltd', 'nv', 'bv', 'company', 'center', 'centre',
  'services', 'service', 'group', 'holdings', 'enterprise', 'enterprises',
  'st', 'saint', 'statia', 'eustatius', 'and', 'of',
])

export function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  let curr = new Array(b.length + 1)

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

export function charRatio(a, b) {
  if (!a && !b) return 1
  const max = Math.max(a.length, b.length)
  if (max === 0) return 1
  return 1 - levenshtein(a, b) / max
}

export function normalizeCompany(name) {
  const cleaned = (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/['’]/g, '') // drop apostrophes
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const tokens = cleaned.split(' ').filter((t) => t && !STOPWORDS.has(t))
  const finalTokens = tokens.length ? tokens : cleaned.split(' ').filter(Boolean)
  return { tokens: finalTokens, joined: finalTokens.join('') }
}

function tokenSetSimilarity(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0
  const bestFor = (tokens, others) =>
    tokens.map((t) => Math.max(...others.map((o) => charRatio(t, o))))
  const bests = [...bestFor(tokensA, tokensB), ...bestFor(tokensB, tokensA)]
  return bests.reduce((s, v) => s + v, 0) / bests.length
}

export function similarity(a, b) {
  const na = normalizeCompany(a)
  const nb = normalizeCompany(b)
  if (!na.joined && !nb.joined) return 0
  const whole = charRatio(na.joined, nb.joined)
  const tokens = tokenSetSimilarity(na.tokens, nb.tokens)
  return 0.5 * whole + 0.5 * tokens
}

export function sharedTokens(a, b) {
  const setB = new Set(normalizeCompany(b).tokens)
  return normalizeCompany(a).tokens.filter((t) => setB.has(t))
}

// accounts: [{ id, role, companyName, status, createdDaysAgo }]
export function findFlaggedClusters(accounts, { threshold = 0.7 } = {}) {
  const employers = accounts.filter(
    (a) => a.role === 'employer' && a.companyName && a.status !== 'removed',
  )

  const parent = employers.map((_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (i, j) => {
    parent[find(i)] = find(j)
  }

  for (let i = 0; i < employers.length; i++) {
    for (let j = i + 1; j < employers.length; j++) {
      const score = similarity(employers[i].companyName, employers[j].companyName)
      if (score >= threshold) union(i, j)
    }
  }

  const groups = new Map()
  employers.forEach((_, i) => {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(i)
  })

  const clusters = []
  for (const members of groups.values()) {
    if (members.length < 2) continue

    const sorted = [...members].sort(
      (a, b) => employers[b].createdDaysAgo - employers[a].createdDaysAgo,
    )
    const established = employers[sorted[0]]

    const suspects = sorted
      .slice(1)
      .map((idx) => ({
        account: employers[idx],
        score: similarity(established.companyName, employers[idx].companyName),
        matched: sharedTokens(established.companyName, employers[idx].companyName),
      }))
      .sort((a, b) => b.score - a.score)

    clusters.push({
      id: established.id,
      established,
      suspects,
      maxScore: suspects.length ? suspects[0].score : 0,
    })
  }

  return clusters.sort((a, b) => b.maxScore - a.maxScore)
}
