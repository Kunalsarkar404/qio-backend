const { Router } = require('express');
const wishlistController = require('../controllers/wishlist.controller');
const { protect } = require('../middleware/auth');

const router = Router();

router.use(protect);

router.get('/', wishlistController.getWishlist);
router.post('/toggle', wishlistController.toggleWishlist);
router.put('/:productId', wishlistController.addToWishlist);
router.delete('/:productId', wishlistController.removeFromWishlist);

module.exports = router;
