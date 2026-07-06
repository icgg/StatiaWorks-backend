// Admin console routes (/api/admin/*). The login endpoint is public; everything
// else requires the env-admin token (loadAdmin + requireAdminAuth).

import { Router } from 'express'
import { loadAdmin, requireAdminAuth } from '../middleware/auth.js'
import * as admin from '../controllers/admin.controller.js'

const router = Router()

// Auth (public).
router.post('/auth/login', admin.login)
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

export default router
