const { Router } = require('express');
const { listBrands, getBrand } = require('../controllers/brand.controller');

const router = Router();

router.get('/', listBrands);
router.get('/:id', getBrand);

module.exports = router;
