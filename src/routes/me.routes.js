// The signed-in surface (/api/me/*). Account settings are role-agnostic; the
// seeker and employer sub-surfaces gate on role. loadUser + requireAuth run for
// everything here.

import { Router } from 'express'
import { loadUser, requireAuth } from '../middleware/auth.js'
import { requireSeeker, requireEmployer } from '../middleware/requireRole.js'
import { loadEmployer, requireActiveEmployer } from '../middleware/requireActiveEmployer.js'
import { applicationUpload, resumeUpload, logoUpload, handleUploadError } from '../middleware/upload.js'
import * as seeker from '../controllers/seeker.controller.js'
import * as employer from '../controllers/employer.controller.js'
import * as account from '../controllers/account.controller.js'

const router = Router()
router.use(loadUser, requireAuth)

// ---- Account settings (both roles) ----
router.get('/account', account.getAccount)
router.put('/password', account.changePassword)
router.get('/notifications', account.getNotifications)
router.put('/notifications', account.updateNotifications)
router.get('/billing', account.getBilling)
router.post('/billing/cancel', account.cancelSubscription)
router.post('/deactivate', account.deactivate)
router.delete('/', account.deleteAccount)

// ---- Seeker portal ----
router.get('/applications', requireSeeker, seeker.listApplications)
router.post('/applications', requireSeeker, applicationUpload, handleUploadError, seeker.apply)
router.patch('/applications/:id', requireSeeker, seeker.updateApplication)
router.delete('/applications/:id', requireSeeker, seeker.deleteApplication)
router.get('/profile', requireSeeker, seeker.getProfile)
router.put('/profile', requireSeeker, resumeUpload, handleUploadError, seeker.updateProfile)

// ---- Employer portal (loadEmployer populates req.employer) ----
const emp = Router()
emp.use(requireEmployer, loadEmployer)
emp.get('/posts', employer.listPosts)
emp.post('/posts', requireActiveEmployer, employer.createPost)
emp.put('/posts/:id', requireActiveEmployer, employer.updatePost)
emp.patch('/posts/:id', requireActiveEmployer, employer.patchPost)
emp.delete('/posts/:id', requireActiveEmployer, employer.deletePost)
emp.get('/posts/:id/applicants', employer.listApplicants)
emp.patch('/posts/:postId/applicants/:applicantId', requireActiveEmployer, employer.setApplicantStatus)
emp.get('/company', employer.getCompany)
emp.put('/company', requireActiveEmployer, logoUpload, handleUploadError, employer.updateCompany)
router.use(emp)

export default router
