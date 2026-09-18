const { Router } = require('express');
const productController = require('../controllers/product.controller');
const { protect } = require('../middleware/auth');

const router = Router();

router.get('/', productController.listProducts);
router.get('/categories', productController.listCategories);
router.get('/:id/reviews', productController.listReviews);
router.post('/:id/reviews', protect, productController.createReview);
router.get('/:id', productController.getProduct);

module.exports = router;
