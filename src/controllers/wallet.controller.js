const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const Wallet = require('../models/Wallet');
const { serializeWallet } = Wallet;

async function getOrCreateWallet(userId) {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) {
    wallet = await Wallet.create({ user: userId, balance: 5000, transactions: [] });
  }
  return wallet;
}

/**
 * Check if monthly bonus can be applied (only once per calendar month)
 * and add 1000 to wallet if eligible
 */
async function applyMonthlyBonus(userId) {
  const wallet = await getOrCreateWallet(userId);
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Check if bonus was already applied this month
  if (
    wallet.lastMonthlyBonusDate &&
    new Date(wallet.lastMonthlyBonusDate).getTime() >= currentMonthStart.getTime()
  ) {
    return wallet; // Already applied this month
  }

  // Add monthly bonus
  wallet.balance += 1000;
  wallet.lastMonthlyBonusDate = now;
  wallet.transactions.push({
    title: 'Monthly Bonus',
    amount: 1000,
    type: 'credit',
    dateLabel: 'Just now',
  });
  await wallet.save();
  return wallet;
}

/**
 * Credit or debit helper used by checkout / refunds.
 * Throws ApiError on insufficient funds for debits.
 */
async function applyWalletChange(userId, { amount, type, title }) {
  const wallet = await getOrCreateWallet(userId);
  const value = Number(amount);

  if (!value || value <= 0) {
    throw new ApiError(400, 'amount must be a positive number');
  }
  if (type !== 'credit' && type !== 'debit') {
    throw new ApiError(400, 'type must be credit or debit');
  }
  if (type === 'debit' && wallet.balance < value) {
    throw new ApiError(400, 'Insufficient wallet balance');
  }

  wallet.balance = type === 'credit' ? wallet.balance + value : wallet.balance - value;
  wallet.transactions.push({
    title: title || (type === 'credit' ? 'Top up' : 'Purchase'),
    amount: value,
    type,
    dateLabel: 'Just now',
  });
  await wallet.save();
  return wallet;
}

/**
 * GET /wallet — balance + activity (mobile wallet/index.tsx)
 */
const getWallet = asyncHandler(async (req, res) => {
  const wallet = await getOrCreateWallet(req.user._id);
  res.json(new ApiResponse(200, serializeWallet(wallet)));
});

/**
 * POST /wallet/top-up — matches topUp(amount)
 * Body: { amount }
 */
const topUp = asyncHandler(async (req, res) => {
  const wallet = await applyWalletChange(req.user._id, {
    amount: req.body.amount,
    type: 'credit',
    title: 'Top up',
  });
  res.json(new ApiResponse(200, serializeWallet(wallet), 'Wallet topped up'));
});

/**
 * Apply monthly bonus to all users (run on 1st of month via cron)
 */
async function applyMonthlyBonusToAll() {
  const User = require('../models/User');
  const users = await User.find({ role: 'user' });
  let successCount = 0;

  for (const user of users) {
    try {
      await applyMonthlyBonus(user._id);
      successCount++;
    } catch (err) {
      console.error(`Failed to apply monthly bonus for user ${user._id}:`, err);
    }
  }

  return { successCount, totalUsers: users.length };
}

module.exports = {
  getWallet,
  topUp,
  getOrCreateWallet,
  applyWalletChange,
  applyMonthlyBonus,
  applyMonthlyBonusToAll,
};
