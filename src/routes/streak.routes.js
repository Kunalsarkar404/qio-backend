const express = require('express');
const { getStreak, recordActivity } = require('../controllers/streak.controller');
const { protect } = require('../middleware/auth');

const router = express.Router();

/**
 * Streak routes
 * - GET /streak — get current user streak
 * - POST /streak/record — record activity and update streak
 */

router.use(protect);

router.get('/', getStreak);
router.post('/record', recordActivity);

module.exports = router;
