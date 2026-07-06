// API router — mounts every route group under /api (see app.js).

import { Router } from 'express'
import publicRoutes from './public.routes.js'
import authRoutes from './auth.routes.js'
import meRoutes from './me.routes.js'
import adminRoutes from './admin.routes.js'

const router = Router()

router.use(publicRoutes) // /jobs, /jobs/:id, /sectors
router.use('/auth', authRoutes)
router.use('/me', meRoutes)
router.use('/admin', adminRoutes)

export default router
