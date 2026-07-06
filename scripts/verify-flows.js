// End-to-end flow verification driven through the Vite dev proxy (as the
// browser would), covering the flows not exercised by scripts/smoke.js:
// signup → email verification, a created post appearing on the public board,
// and admin moderation. Run with backend + `app` dev server (5173) up.
//
//   node scripts/verify-flows.js

import { db } from '../src/db/knex.js'

const B = 'http://localhost:5173/api' // through the Vite proxy
const j = (r) => r.json()
const results = []
const ok = (label, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${label}  ${extra}`)

// Cookie jar (so we exercise the same cookie-session path the browser uses).
function makeClient() {
  let cookie = ''
  return async (path, opts = {}) => {
    const headers = { ...(opts.headers || {}) }
    if (cookie) headers.Cookie = cookie
    if (opts.json) {
      headers['Content-Type'] = 'application/json'
      opts.body = JSON.stringify(opts.json)
    }
    const res = await fetch(`${B}${path}`, { ...opts, headers })
    const setC = res.headers.get('set-cookie')
    if (setC) cookie = setC.split(';')[0]
    return res
  }
}

const stamp = Date.now()

// --- 1. Employer signup → create a post → it appears on the public board ---
{
  const c = makeClient()
  const email = `newemployer_${stamp}@example.com`
  const su = await c('/auth/signup/employer', {
    method: 'POST',
    json: { email, password: 'password123', company: `Reef Runners ${stamp}`, fname: 'Tess', lname: 'Vega' },
  })
  ok('employer signup (trial starts)', su.status === 201)

  const post = await c('/me/posts', {
    method: 'POST',
    json: {
      title: `Snorkel Guide ${stamp}`, category: 'Tourism & Dive', type: 'Part-time',
      salary: '$15 – $20 / hr', deadline: '',
      description: 'Lead snorkel tours.', responsibilities: ['Guide guests'], requirements: ['Swim well'],
      apply: { requireCv: true, requireCoverLetter: false, allowCoverMessage: true, questions: [] },
    },
  }).then(j)
  ok('employer creates post', !!post.id, `-> id ${post.id}`)

  // Public board (no auth) should now include it.
  const board = await fetch(`${B}/jobs?q=Snorkel Guide ${stamp}`).then(j)
  const found = board.find((x) => x.id === post.id)
  ok('new post shows on public board', !!found, `-> ${found?.title} @ ${found?.company}`)

  // And the detail endpoint returns its rich fields.
  const detail = await fetch(`${B}/jobs/${post.id}`).then(j)
  ok('public job detail renders content', detail.responsibilities?.length === 1 && detail.salary === '$15 – $20 / hr')
}

// --- 2. Seeker signup → email verification (token read from the DB) ---
{
  const c = makeClient()
  const email = `newseeker_${stamp}@example.com`
  const su = await c('/auth/signup/seeker', {
    method: 'POST',
    json: { email, password: 'password123', fname: 'Sam', lname: 'Reed' },
  })
  ok('seeker signup (pending)', su.status === 201)

  const acct = await db('accounts').whereRaw('lower(email)=lower(?)', [email]).first()
  ok('account created as pending/unverified', acct.status === 'pending' && acct.verified === false)

  const verify = await c('/auth/verify-email', { method: 'POST', json: { token: acct.verify_token } })
  ok('verify-email activates the account', verify.status === 200)

  const after = await db('accounts').where({ id: acct.id }).first()
  ok('account now active + verified', after.status === 'active' && after.verified === true)
}

// --- 3. Password reset round-trip ---
{
  const c = makeClient()
  const email = `newseeker_${stamp}@example.com`
  await c('/auth/password/forgot', { method: 'POST', json: { email } })
  const acct = await db('accounts').whereRaw('lower(email)=lower(?)', [email]).first()
  ok('reset token issued', !!acct.reset_token)
  const reset = await c('/auth/password/reset', { method: 'POST', json: { token: acct.reset_token, password: 'newpassword123' } })
  ok('password reset succeeds', reset.status === 200)
  const login = await c('/auth/login', { method: 'POST', json: { email, password: 'newpassword123' } })
  ok('login with the new password', login.status === 200)
}

// --- 4. Admin moderation through the proxy ---
{
  const c = makeClient()
  const login = await c('/admin/auth/login', { method: 'POST', json: { email: 'admin@statiaworks.com', password: 'admin123' } })
  ok('admin login', login.status === 200)
  const accounts = await c('/admin/accounts').then(j)
  ok('admin lists accounts', Array.isArray(accounts) && accounts.length > 0, `-> ${accounts.length} accounts`)
  const flags = await c('/admin/flags').then(j)
  ok('admin flags cluster near-duplicates', flags.length === 3)
  const posts = await c('/admin/posts').then(j)
  const target = posts.find((p) => p.status === 'active')
  const mod = await c(`/admin/posts/${target.id}`, { method: 'PATCH', json: { status: 'flagged' } })
  ok('admin can flag a post', mod.status === 200)
  await c(`/admin/posts/${target.id}`, { method: 'PATCH', json: { status: 'active' } }) // restore
}

console.log('\n' + results.join('\n') + '\n')
const failed = results.filter((r) => r.startsWith('FAIL')).length
console.log(failed ? `${failed} FAILED` : 'ALL PASSED')
await db.destroy()
process.exit(failed ? 1 : 0)
