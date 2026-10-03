const { Router } = require('express');
const adminController = require('../controllers/admin.controller');
const { protect } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { uploadProductImages } = require('../middleware/upload');

const router = Router();
router.use(protect, requireAdmin);

// Dashboard
router.get('/dashboard', adminController.dashboard);

// Brands
router.post('/brands', adminController.createBrand);

// Products
router.get('/products', adminController.listAdminProducts);
router.get('/products/:id', adminController.getAdminProduct);
router.post('/products', uploadProductImages.array('images', 6), adminController.createProduct);
router.patch('/products/:id', uploadProductImages.array('images', 6), adminController.updateProduct);
router.delete('/products/:id', adminController.deleteProduct);
router.post('/products/:id/click', adminController.recordProductClick);

// Orders
router.get('/orders/stats', adminController.getOrderStats);
router.get('/orders', adminController.listAdminOrders);
router.get('/orders/:id', adminController.getAdminOrder);
router.patch('/orders/:id', adminController.updateOrderStatus);

// Reviews
router.get('/reviews/stats', adminController.getReviewStats);
router.get('/reviews', adminController.listAdminReviews);
router.get('/reviews/:id', adminController.getAdminReview);
router.patch('/reviews/:id', adminController.approveReview);
router.delete('/reviews/:id', adminController.deleteReview);

// Users
router.get('/users/stats', adminController.getUserStats);
router.get('/users', adminController.listAdminUsers);
router.get('/users/:id', adminController.getAdminUser);
router.patch('/users/:id', adminController.updateUserStatus);

// Wallets
router.get('/wallets/stats', adminController.getWalletStats);
router.get('/wallets', adminController.listAdminWallets);
router.get('/wallets/:id', adminController.getAdminWallet);
router.post('/wallets/:id/credit', adminController.creditUserWallet);
router.post('/wallets/:id/debit', adminController.debitUserWallet);

// Streaks
router.get('/streaks/stats', adminController.getStreakStats);
router.get('/streaks/trends', adminController.getStreakTrends);
router.get('/streaks', adminController.listUserStreaks);
router.get('/streaks/:id', adminController.getUserStreak);

module.exports = router;

