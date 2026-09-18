const { Router } = require('express');
const addressController = require('../controllers/address.controller');
const { protect } = require('../middleware/auth');

const router = Router();

router.use(protect);

router.get('/', addressController.listAddresses);
router.post('/', addressController.createAddress);
router.patch('/:id', addressController.updateAddress);
router.post('/:id/default', addressController.setDefault);
router.delete('/:id', addressController.deleteAddress);

module.exports = router;
