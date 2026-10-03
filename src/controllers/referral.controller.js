const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const { User, Wallet } = require('../models');

// Generate a unique referral code for user
const generateReferralCode = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // If user already has a referral code, return it
  if (user.referralCode) {
    return res.json(new ApiResponse(200, { code: user.referralCode }));
  }

  // Generate unique referral code: first 3 letters of name + random 6 digit code
  const namePart = user.fullName.split(' ')[0].substring(0, 3).toUpperCase();
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  const referralCode = `${namePart}${randomPart}`;

  user.referralCode = referralCode;
  await user.save();

  res.json(new ApiResponse(200, { code: referralCode }));
});

// Get user's referral code
const getReferralCode = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const user = await User.findById(userId).select('referralCode');

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // If no code exists, generate one
  let code = user.referralCode;
  if (!code) {
    const namePart = user.fullName?.split(' ')[0]?.substring(0, 3)?.toUpperCase() || 'USR';
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    code = `${namePart}${randomPart}`;
    user.referralCode = code;
    await user.save();
  }

  res.json(new ApiResponse(200, { code }));
});

// Apply referral code on signup/login
const applyReferralCode = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const userId = req.user._id;

  if (!code || typeof code !== 'string') {
    throw new ApiError(400, 'Referral code is required');
  }

  // Check if user already has a referrer
  const user = await User.findById(userId);
  if (user.referredBy) {
    throw new ApiError(400, 'You already have a referrer');
  }

  // Find the referrer
  const referrer = await User.findOne({ referralCode: code.toUpperCase() });
  if (!referrer) {
    throw new ApiError(404, 'Invalid referral code');
  }

  if (String(referrer._id) === String(userId)) {
    throw new ApiError(400, 'Cannot use your own referral code');
  }

  // Apply referral bonus to referrer (5000)
  const referrerWallet = await Wallet.findOne({ user: referrer._id });
  if (!referrerWallet) {
    throw new ApiError(500, 'Referrer wallet not found');
  }

  referrerWallet.balance += 5000;
  referrerWallet.transactions.push({
    title: `Referral bonus from ${user.fullName}`,
    amount: 5000,
    type: 'credit',
  });
  await referrerWallet.save();

  // Update referrer reward count
  referrer.referralRewardsEarned = (referrer.referralRewardsEarned || 0) + 5000;
  await referrer.save();

  // Update user's referrer
  user.referredBy = referrer._id;
  await user.save();

  res.json(
    new ApiResponse(200, { success: true, message: 'Referral code applied successfully' }),
  );
});

// Get user's referral statistics
const getReferralStats = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const referrals = await User.find({ referredBy: userId })
    .select('fullName email createdAt')
    .lean();

  const user = await User.findById(userId).select('referralRewardsEarned');

  res.json(
    new ApiResponse(200, {
      totalReferred: referrals.length,
      totalEarned: user?.referralRewardsEarned || 0,
      referrals: referrals.map((ref) => ({
        id: String(ref._id),
        name: ref.fullName,
        earnedAt: ref.createdAt,
      })),
    }),
  );
});

module.exports = {
  generateReferralCode,
  getReferralCode,
  applyReferralCode,
  getReferralStats,
};
