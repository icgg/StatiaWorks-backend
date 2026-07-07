import { Router } from 'express'
import * as auth from '../controllers/auth.controller.js'
import { authLimiter } from '../middleware/rateLimit.js'

const router = Router()

// Strict limiter on the credential + email-send endpoints (brute-force and
// verification/reset-email abuse vectors). Logout is exempt.
router.post('/login', authLimiter, auth.login)
router.post('/signup/seeker', authLimiter, auth.signupSeeker)
router.post('/signup/employer', authLimiter, auth.signupEmployer)
router.post('/logout', auth.logout)

router.post('/verify-email', authLimiter, auth.verifyEmail)
router.post('/verify-email/resend', authLimiter, auth.resendVerification)

router.post('/password/forgot', authLimiter, auth.requestPasswordReset)
router.post('/password/reset', authLimiter, auth.resetPassword)

export default router
