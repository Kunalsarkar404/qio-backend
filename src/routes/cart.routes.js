const { Router } = require('express');
const cartController = require('../controllers/cart.controller');
const { protect } = require('../middleware/auth');

const router = Router();

router.use(protect);

router.get('/', cartController.getCart);
router.delete('/', cartController.clearCart);
router.post('/items', cartController.addItem);
router.patch('/items', cartController.updateItem);
router.delete('/items', cartController.removeItem);
router.post('/coupon', cartController.applyCoupon);
router.delete('/coupon', cartController.removeCoupon);

module.exports = router;
