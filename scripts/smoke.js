// Ad-hoc API smoke test using global fetch (Node 18+). Run with the server up:
//   node scripts/smoke.js
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TMP_PDF = path.join(os.tmpdir(), 'sw-smoke-resume.pdf')
const B = 'http://localhost:3000/api'
const j = (r) => r.json()
async function login(email, password = 'password123') {
  const r = await fetch(`${B}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const d = await j(r)
  return d.token
}
const auth = (t) => ({ Authorization: `Bearer ${t}` })

const results = []
const ok = (label, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${label}  ${extra}`)

// --- Guardrail: bad sector ---
const eTok = await login('hiring@goldenrockdive.com')
{
  const r = await fetch(`${B}/me/posts`, {
    method: 'POST',
    headers: { ...auth(eTok), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'T', category: 'Bogus Sector', type: 'Full-time', salary: '$1 / hr' }),
  })
  const d = await j(r)
  ok('guardrail rejects bad sector', r.status === 400, `-> ${r.status} "${d.message}"`)
}

// --- Create post (valid) ---
let newPostId
{
  const r = await fetch(`${B}/me/posts`, {
    method: 'POST',
    headers: { ...auth(eTok), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Marketing Coordinator', category: 'Hospitality', type: 'Part-time',
      salary: '$18 – $22 / hr', deadline: '',
      description: 'Run our socials.', responsibilities: ['Post daily'], requirements: ['Camera phone'],
      apply: { requireCv: true, requireCoverLetter: false, allowCoverMessage: true, questions: [] },
    }),
  })
  const d = await j(r)
  newPostId = d.id
  ok('create post', r.status === 201 && d.title === 'Marketing Coordinator', `-> id ${d.id}, salary "${d.salary}"`)
}

// --- Apply flow with résumé upload ---
const seekerTok = await login('jerome.spanner@gmail.com')
let appId
{
  fs.writeFileSync(TMP_PDF, '%PDF-1.4 fake resume')
  const fd = new FormData()
  fd.set('jobId', String(newPostId))
  fd.set('message', 'Keen to help.')
  fd.set('screening', JSON.stringify({ workAuthorized: 'Yes', residesOnStatia: 'Yes', willingToRelocate: 'Not applicable' }))
  fd.set('resume', new Blob([fs.readFileSync(TMP_PDF)], { type: 'application/pdf' }), 'resume.pdf')
  const r = await fetch(`${B}/me/applications`, { method: 'POST', headers: auth(seekerTok), body: fd })
  const d = await j(r)
  appId = d.id
  ok('apply with résumé upload', r.status === 201 && d.status === 'active', `-> app ${d.id}, cover ${d.coverIncluded}`)
}

// --- Employer sees the new applicant, approves ---
{
  const r = await fetch(`${B}/me/posts/${newPostId}/applicants`, { headers: auth(eTok) })
  const list = await j(r)
  ok('employer sees new applicant', list.length === 1 && list[0].status === 'new', `-> ${list.length} applicant(s)`)
  const applicantId = list[0]?.id
  const r2 = await fetch(`${B}/me/posts/${newPostId}/applicants/${applicantId}`, {
    method: 'PATCH', headers: { ...auth(eTok), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'approved' }),
  })
  const d2 = await j(r2)
  ok('approve applicant', r2.status === 200 && d2.status === 'approved')
}

// --- Seeker now sees it under "reviewed" with the new-response dot ---
{
  const r = await fetch(`${B}/me/applications`, { headers: auth(seekerTok) })
  const apps = await j(r)
  const mine = apps.find((a) => a.id === appId)
  ok('seeker sees approved as reviewed+isNew', mine?.status === 'reviewed' && mine?.isNew === true, `-> stage "${mine?.stage}"`)
}

// --- Close / reopen / delete the test post ---
{
  const close = await fetch(`${B}/me/posts/${newPostId}`, { method: 'PATCH', headers: { ...auth(eTok), 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'close' }) })
  const cd = await j(close)
  ok('close post', cd.status === 'closed')
  const del = await fetch(`${B}/me/posts/${newPostId}`, { method: 'DELETE', headers: auth(eTok) })
  ok('delete post (+ its applications)', del.status === 200)
}

// --- Admin ---
{
  const aTok = await fetch(`${B}/admin/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@statiaworks.com', password: 'admin123' }),
  }).then(j).then((d) => d.token)
  ok('admin login', !!aTok)
  const stats = await fetch(`${B}/admin/stats`, { headers: auth(aTok) }).then(j)
  ok('admin stats', stats.accounts > 0 && stats.flaggedClusters === 3, `-> ${JSON.stringify(stats)}`)
  const accts = await fetch(`${B}/admin/accounts?role=employer`, { headers: auth(aTok) }).then(j)
  ok('admin accounts filter', Array.isArray(accts) && accts.every((a) => a.role === 'employer'))
  // unauthorised without token
  const noAuth = await fetch(`${B}/admin/stats`)
  ok('admin route rejects no token', noAuth.status === 401)
}

// --- Employer lockout: cancel subscription on a paying employer then check ---
{
  const payTok = await login('jobs@dugginssupermarket.com')
  await fetch(`${B}/me/billing/cancel`, { method: 'POST', headers: auth(payTok) })
  // now locked → creating a post should 403
  const r = await fetch(`${B}/me/posts`, {
    method: 'POST', headers: { ...auth(payTok), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'X', category: 'Retail', type: 'Full-time', salary: '$1 / hr' }),
  })
  ok('locked employer blocked from posting', r.status === 403, `-> ${r.status}`)
}

console.log('\n' + results.join('\n') + '\n')
const failed = results.filter((r) => r.startsWith('FAIL')).length
console.log(failed ? `${failed} FAILED` : 'ALL PASSED')
process.exit(failed ? 1 : 0)
