// The signed-in surface (/api/me/*). Account settings are role-agnostic; the
// seeker and employer sub-surfaces gate on role. loadUser + requireAuth run for
// everything here.

import { Router } from 'express'
import { loadUser, requireAuth } from '../middleware/auth.js'
import { requireVerified } from '../middleware/requireVerified.js'
import { requireSeeker, requireEmployer } from '../middleware/requireRole.js'
import { loadEmployer, requireActiveEmployer } from '../middleware/requireActiveEmployer.js'
import { applicationUpload, resumeUpload, logoUpload, proofUpload, handleUploadError } from '../middleware/upload.js'
import { applyLimiter, uploadLimiter, postingIpLimiter, postingAccountLimiter } from '../middleware/rateLimit.js'
import * as seeker from '../controllers/seeker.controller.js'
import * as employer from '../controllers/employer.controller.js'
import * as account from '../controllers/account.controller.js'
import * as invoice from '../controllers/invoice.controller.js'

const router = Router()
router.use(loadUser, requireAuth)

// ---- Account settings (both roles) ----
router.get('/account', account.getAccount)
router.put('/password', account.changePassword)
router.get('/notifications', account.getNotifications)
router.put('/notifications', account.updateNotifications)
router.get('/billing', account.getBilling)
router.post('/deactivate', account.deactivate)
router.delete('/', account.deleteAccount)

// ---- Seeker portal ----
router.get('/applications', requireSeeker, seeker.listApplications)
// Applying reaches the employer (creates a record + emails them) → verified only.
router.post('/applications', requireSeeker, requireVerified, applyLimiter, applicationUpload, handleUploadError, seeker.apply)
router.patch('/applications/:id', requireSeeker, seeker.updateApplication)
router.delete('/applications/:id', requireSeeker, seeker.deleteApplication)
router.get('/profile', requireSeeker, seeker.getProfile)
router.put('/profile', requireSeeker, uploadLimiter, resumeUpload, handleUploadError, seeker.updateProfile)

// ---- Employer portal (loadEmployer populates req.employer) ----
const emp = Router()
emp.use(requireEmployer, loadEmployer)
emp.get('/posts', employer.listPosts)
// Job-posting flood guard: per-account AND per-IP (both limiters must pass).
// Placed after requireActiveEmployer so req.account is populated for the
// account-keyed limiter. requireVerified first — a listing goes on the public
// board, so an unverified employer must verify before publishing.
emp.post('/posts', requireVerified, requireActiveEmployer, postingIpLimiter, postingAccountLimiter, employer.createPost)
emp.put('/posts/:id', requireVerified, requireActiveEmployer, employer.updatePost)
emp.patch('/posts/:id', requireVerified, requireActiveEmployer, employer.patchPost)
emp.delete('/posts/:id', requireActiveEmployer, employer.deletePost)
emp.get('/posts/:id/applicants', employer.listApplicants)
// Deciding on an applicant emails the seeker → verified only.
emp.patch('/posts/:postId/applicants/:applicantId', requireVerified, requireActiveEmployer, employer.setApplicantStatus)
emp.get('/company', employer.getCompany)
// The company profile (incl. logo) shows on the public board → verified only.
emp.put('/company', requireVerified, requireActiveEmployer, uploadLimiter, logoUpload, handleUploadError, employer.updateCompany)
// Billing actions — intentionally WITHOUT requireActiveEmployer so a locked
// employer can still pay to reactivate.
emp.post('/billing/request-annual', invoice.requestAnnual)
emp.post('/billing/request-monthly', invoice.revertMonthly)
emp.post('/billing/invoices/:id/proof', uploadLimiter, proofUpload, handleUploadError, invoice.uploadProof)
emp.get('/billing/invoices/:id/invoice.pdf', invoice.downloadInvoicePdf)
router.use(emp)

export default router
