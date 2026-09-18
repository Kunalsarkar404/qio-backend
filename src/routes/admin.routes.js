const { Router } = require('express');
const adminController = require('../controllers/admin.controller');
const { protect } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { uploadProductImages } = require('../middleware/upload');

const router = Router();
router.use(protect, requireAdmin);
router.get('/dashboard', adminController.dashboard);
router.post('/brands', adminController.createBrand);
router.get('/products', adminController.listAdminProducts);
router.get('/products/:id', adminController.getAdminProduct);
router.post('/products', uploadProductImages.array('images', 6), adminController.createProduct);
router.patch('/products/:id', uploadProductImages.array('images', 6), adminController.updateProduct);
router.delete('/products/:id', adminController.deleteProduct);
router.post('/products/:id/click', adminController.recordProductClick);

module.exports = router;

