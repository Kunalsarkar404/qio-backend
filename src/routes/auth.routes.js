const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');

const router = Router();

// Matches mobile auth screens
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/admin-login', authController.adminLogin);
router.post('/firebase', authController.loginWithFirebase);
router.post('/forgot-password', authController.forgotPassword);
router.post('/resend-otp', authController.resendOtp);
router.post('/request-otp', authController.requestOtp);
router.post('/verify-otp', authController.verifyOtp);
router.post('/login-otp', authController.loginOtp);
router.post('/reset-password', authController.resetPassword);
router.post('/logout', protect, authController.logout);

router.get('/me', protect, authController.me);
router.patch('/me', protect, authController.updateMe);

module.exports = router;
