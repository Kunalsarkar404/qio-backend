const { Router } = require('express');
const orderController = require('../controllers/order.controller');
const { protect } = require('../middleware/auth');

const router = Router();

router.use(protect);

router.get('/', orderController.listOrders);
router.post('/', orderController.createOrder);
router.get('/:id/track', orderController.trackOrder);
router.post('/:id/rate', orderController.rateOrderItem);
router.patch('/:id/status', orderController.updateStatus);
router.get('/:id', orderController.getOrder);

module.exports = router;
