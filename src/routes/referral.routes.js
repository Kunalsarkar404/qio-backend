const { Router } = require('express');
const referralController = require('../controllers/referral.controller');
const { protect } = require('../middleware/auth');

const router = Router();

// All referral routes require authentication
router.use(protect);

// Get or generate user's referral code
router.get('/code', referralController.getReferralCode);

// Apply a referral code (typically called during onboarding or first login)
router.post('/apply', referralController.applyReferralCode);

// Get referral statistics for current user
router.get('/stats', referralController.getReferralStats);

module.exports = router;
