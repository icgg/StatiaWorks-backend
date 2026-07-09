// Admin console routes (/api/admin/*). The login endpoint is public; everything
// else requires the env-admin token (loadAdmin + requireAdminAuth).

import { Router } from 'express'
import { loadAdmin, requireAdminAuth } from '../middleware/auth.js'
import * as admin from '../controllers/admin.controller.js'
import { authLimiter } from '../middleware/rateLimit.js'

const router = Router()

// Auth (public). The login endpoint is a brute-force target — rate-limited.
router.post('/auth/login', authLimiter, admin.login)
router.post('/auth/logout', admin.logout)

// Everything below requires an admin session.
router.use(loadAdmin, requireAdminAuth)

router.get('/stats', admin.getStats)

router.get('/accounts', admin.listAccounts)
router.get('/accounts/:id', admin.getAccount)
router.patch('/accounts/:id', admin.setAccountStatus)
router.post('/accounts/:id/reset-password', admin.resetPassword)
router.delete('/accounts/:id', admin.deleteAccount)

router.get('/posts', admin.listPosts)
router.get('/posts/:id', admin.getPost)
router.patch('/posts/:id', admin.setPostStatus)

router.get('/flags', admin.listFlags)
router.post('/flags/:id/resolve', admin.resolveFlag)

router.get('/connections', admin.listConnectionLog)

router.get('/invoices', admin.listInvoices)
router.get('/invoices/:id', admin.getInvoice)
router.post('/invoices/:id/verify', admin.verifyInvoice)
router.post('/invoices/:id/void', admin.voidInvoice)

export default router
