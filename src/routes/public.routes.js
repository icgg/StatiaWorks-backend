import { Router } from 'express'
import * as jobs from '../controllers/jobs.controller.js'
import * as sectors from '../controllers/sectors.controller.js'

const router = Router()

router.get('/jobs', jobs.list)
router.get('/jobs/:id', jobs.get)
router.get('/sectors', sectors.list)

export default router
