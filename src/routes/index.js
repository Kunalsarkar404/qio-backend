const { Router } = require('express');
const authRoutes = require('./auth.routes');
const productRoutes = require('./product.routes');
const cartRoutes = require('./cart.routes');
const wishlistRoutes = require('./wishlist.routes');
const addressRoutes = require('./address.routes');
const walletRoutes = require('./wallet.routes');
const orderRoutes = require('./order.routes');
const adminRoutes = require('./admin.routes');
const brandRoutes = require('./brand.routes');
const streakRoutes = require('./streak.routes');
const referralRoutes = require('./referral.routes');

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, message: 'qio API is healthy' });
});

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/cart', cartRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/addresses', addressRoutes);
router.use('/wallet', walletRoutes);
router.use('/orders', orderRoutes);
router.use('/brands', brandRoutes);
router.use('/streak', streakRoutes);
router.use('/referral', referralRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
