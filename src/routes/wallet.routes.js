const { Router } = require('express');
const walletController = require('../controllers/wallet.controller');
const { protect } = require('../middleware/auth');

const router = Router();

router.use(protect);

router.get('/', walletController.getWallet);
router.post('/top-up', walletController.topUp);

module.exports = router;
