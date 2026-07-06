import { Router } from 'express'
import * as auth from '../controllers/auth.controller.js'

const router = Router()

router.post('/login', auth.login)
router.post('/signup/seeker', auth.signupSeeker)
router.post('/signup/employer', auth.signupEmployer)
router.post('/logout', auth.logout)

router.post('/verify-email', auth.verifyEmail)
router.post('/verify-email/resend', auth.resendVerification)

router.post('/password/forgot', auth.requestPasswordReset)
router.post('/password/reset', auth.resetPassword)

export default router
