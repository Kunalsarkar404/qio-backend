const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const { getAuth } = require('firebase-admin/auth');
const config = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const {
  isValidEmail,
  isValidPassword,
  isValidName,
  isValidOtp,
} = require('../utils/validators');
const { User, Wallet, PasswordReset, Cart, Wishlist } = require('../models');

const OTP_TTL_MS = 10 * 60 * 1000;

function getFirebaseAdmin() {
  const existingApps = admin.getApps?.() ?? [];

  if (existingApps.length) return existingApps[0];

  const { projectId, clientEmail, privateKey } = config.firebase;
  if (!projectId || !clientEmail || !privateKey) {
    throw new ApiError(503, 'Firebase server authentication is not configured');
  }

  return admin.initializeApp({
    credential: admin.cert({ projectId, clientEmail, privateKey }),
  });
}

function signToken(userId) {
  return jwt.sign({ id: userId }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

/** Response shape matches My Details / Account usage on mobile */
function sanitizeUser(user) {
  return {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    phone: user.phone || '',
    dob: user.dob || '',
    gender: user.gender || '',
    notificationPrefs: {
      orders: user.notificationPrefs?.orders ?? true,
      promos: user.notificationPrefs?.promos ?? true,
      wishlist: user.notificationPrefs?.wishlist ?? false,
      system: user.notificationPrefs?.system ?? true,
    },
    createdAt: user.createdAt,
  };
}

function generateOtp() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function upsertOtp(email) {
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await PasswordReset.deleteMany({ email });
  await PasswordReset.create({ email, code, expiresAt, verified: false });

  // Dev: log OTP so mobile can be tested without email provider
  if (config.env !== 'production') {
    console.log(`[OTP] ${email} → ${code}`);
  }

  return code;
}

/**
 * POST /auth/register
 * Body: { fullName, email, password?, phone? }
 * Password optional for OTP signup — a secure random one is assigned.
 */
const register = asyncHandler(async (req, res) => {
  const fullName = req.body.fullName?.trim() ?? '';
  const email = req.body.email?.trim() ?? '';
  const phone = req.body.phone?.trim() ?? '';
  let password = req.body.password?.trim() ?? '';

  if (!isValidName(fullName)) {
    throw new ApiError(400, 'Please enter your full name');
  }
  if (!isValidEmail(email)) {
    throw new ApiError(400, 'Please enter valid email address');
  }
  if (!password) {
    password = `qio-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
  if (!isValidPassword(password)) {
    throw new ApiError(400, 'Password must be at least 6 characters');
  }

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) {
    throw new ApiError(409, 'Email already registered');
  }

  const user = await User.create({ fullName, email, password, phone });
  await Promise.all([
    Wallet.create({ user: user._id, balance: 0, transactions: [] }),
    Cart.create({ user: user._id, items: [] }),
    Wishlist.create({ user: user._id, products: [] }),
  ]);

  await upsertOtp(email.toLowerCase());

  const token = signToken(user._id);

  res.status(201).json(
    new ApiResponse(201, { user: sanitizeUser(user), token }, 'Account created'),
  );
});
/**
 * POST /auth/login
 * Body: { email, password } — matches login.tsx
 */
const login = asyncHandler(async (req, res) => {
  const email = req.body.email?.trim() ?? '';
  const password = req.body.password?.trim() ?? '';

  if (!isValidEmail(email) || !password) {
    throw new ApiError(400, 'Please enter valid email address');
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const token = signToken(user._id);
  user.lastLoginAt = new Date();
  await user.save();

  res.json(new ApiResponse(200, { user: sanitizeUser(user), token }, 'Logged in'));
});

const adminLogin = asyncHandler(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  console.info('[admin auth] Login attempt:', { username, hasPassword: Boolean(password) });

  if (username !== config.admin.username || password !== config.admin.password) {
    console.warn('[admin auth] Rejected credentials for username:', username);
    throw new ApiError(401, 'Invalid admin credentials');
  }

  let user = await User.findOne({ email: `${config.admin.username}@qio.local` }).select('+password');
  if (!user) {
    user = await User.create({
      fullName: 'Kunal Sarkar',
      email: `${config.admin.username}@qio.local`,
      password,
      role: 'admin',
    });
  } else if (user.role !== 'admin') {
    user.role = 'admin';
  }
  user.lastLoginAt = new Date();
  await user.save();

  console.info('[admin auth] Login successful:', { userId: String(user._id), username });

  res.json(new ApiResponse(200, { token: signToken(user._id), user: sanitizeUser(user) }, 'Admin logged in'));
});

/**
 * POST /auth/firebase
 * Body: { idToken, fullName?, email? }
 * Firebase verifies the phone OTP; this endpoint links that identity to MongoDB.
 */
const loginWithFirebase = asyncHandler(async (req, res) => {
  const idToken = String(req.body.idToken || '').trim();
  const requestedName = String(req.body.fullName || '').trim();

  if (!idToken) throw new ApiError(400, 'Firebase ID token is required');

  const decoded = await getAuth(getFirebaseAdmin()).verifyIdToken(idToken);
  const phone = decoded.phone_number || '';
  if (!phone) throw new ApiError(400, 'A verified phone number is required');

  const firebaseEmail = decoded.email?.toLowerCase();
  const syntheticEmail = firebaseEmail || `${decoded.uid}@phone.qio`;
  let user = await User.findOne({ firebaseUid: decoded.uid });

  if (!user) {
    user = await User.findOne({ phone });
  }

  if (!user && firebaseEmail) {
    user = await User.findOne({ email: firebaseEmail });
  }

  if (!user) {
    user = await User.create({
      firebaseUid: decoded.uid,
      fullName: requestedName || decoded.name || 'QIO Guest',
      email: syntheticEmail,
      password: `firebase-${decoded.uid}-${Math.random().toString(36).slice(2)}`,
      phone,
    });
    await Promise.all([
      Wallet.create({ user: user._id, balance: 0, transactions: [] }),
      Cart.create({ user: user._id, items: [] }),
      Wishlist.create({ user: user._id, products: [] }),
    ]);
  } else {
    const updates = { firebaseUid: decoded.uid, phone };
    if (requestedName && user.fullName === 'QIO Guest') updates.fullName = requestedName;
    user = await User.findByIdAndUpdate(user._id, updates, {
      new: true,
      runValidators: true,
    });
  }

  const token = signToken(user._id);
  res.json(new ApiResponse(200, { user: sanitizeUser(user), token }, 'Logged in'));
});

/**
 * POST /auth/forgot-password
 * Body: { email } — matches forgot-password.tsx → then verification-code
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const email = req.body.email?.trim() ?? '';

  if (!isValidEmail(email)) {
    throw new ApiError(400, 'Please enter valid email address');
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  // Always succeed to avoid email enumeration; only send OTP if user exists
  if (user) {
    await upsertOtp(email.toLowerCase());
  }

  res.json(
    new ApiResponse(200, { email: email.toLowerCase() }, 'If that email exists, a code was sent'),
  );
});

/**
 * POST /auth/resend-otp
 * Body: { email } — matches Resend on verification-code.tsx
 */
const resendOtp = asyncHandler(async (req, res) => {
  const email = req.body.email?.trim() ?? '';

  if (!isValidEmail(email)) {
    throw new ApiError(400, 'Please enter valid email address');
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new ApiError(404, 'No account found for this email');
  }

  await upsertOtp(email.toLowerCase());

  res.json(new ApiResponse(200, { email: email.toLowerCase() }, 'Code resent'));
});

/**
 * POST /auth/verify-otp
 * Body: { email, code } — 4-digit OTP from verification-code.tsx
 */
const verifyOtp = asyncHandler(async (req, res) => {
  const email = req.body.email?.trim()?.toLowerCase() ?? '';
  const code = String(req.body.code ?? '').trim();

  if (!isValidEmail(email)) {
    throw new ApiError(400, 'Please enter valid email address');
  }
  if (!isValidOtp(code)) {
    throw new ApiError(400, 'Enter the 4-digit verification code');
  }

  const record = await PasswordReset.findOne({ email, code });
  if (!record || record.expiresAt < new Date()) {
    throw new ApiError(400, 'Invalid or expired code');
  }

  record.verified = true;
  await record.save();

  res.json(
    new ApiResponse(200, { email, verified: true }, 'Code verified'),
  );
});

/**
 * POST /auth/login-otp
 * Body: { email, code } — OTP login for the bottom-sheet auth flow
 */
const loginOtp = asyncHandler(async (req, res) => {
  const email = req.body.email?.trim()?.toLowerCase() ?? '';
  const code = String(req.body.code ?? '').trim();

  if (!isValidEmail(email)) {
    throw new ApiError(400, 'Please enter valid email address');
  }
  if (!isValidOtp(code)) {
    throw new ApiError(400, 'Enter the 4-digit verification code');
  }

  const record = await PasswordReset.findOne({ email, code });
  if (!record || record.expiresAt < new Date()) {
    throw new ApiError(400, 'Invalid Code. Try Again');
  }

  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(404, 'No account found for this email');
  }

  record.verified = true;
  await record.save();
  await PasswordReset.deleteMany({ email });

  const token = signToken(user._id);

  res.json(
    new ApiResponse(200, { user: sanitizeUser(user), token }, 'Logged in'),
  );
});

/**
 * POST /auth/request-otp
 * Body: { email } — send OTP for login sheet (requires existing account)
 */
const requestOtp = asyncHandler(async (req, res) => {
  const email = req.body.email?.trim()?.toLowerCase() ?? '';

  if (!isValidEmail(email)) {
    throw new ApiError(400, 'Please enter valid number');
  }

  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(404, 'Please enter valid number');
  }

  await upsertOtp(email);

  res.json(new ApiResponse(200, { email }, 'Code sent'));
});
/**
 * POST /auth/reset-password
 * Body: { email, password, confirm } — matches reset-password.tsx
 */
const resetPassword = asyncHandler(async (req, res) => {
  const email = req.body.email?.trim()?.toLowerCase() ?? '';
  const password = req.body.password?.trim() ?? '';
  const confirm = req.body.confirm?.trim() ?? req.body.confirmPassword?.trim() ?? '';

  if (!isValidEmail(email)) {
    throw new ApiError(400, 'Please enter valid email address');
  }
  if (!isValidPassword(password)) {
    throw new ApiError(400, 'Password must be at least 6 characters');
  }
  if (password !== confirm) {
    throw new ApiError(400, 'Passwords do not match');
  }

  const record = await PasswordReset.findOne({ email, verified: true });
  if (!record || record.expiresAt < new Date()) {
    throw new ApiError(400, 'Verify your email code before resetting password');
  }

  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw new ApiError(404, 'No account found for this email');
  }

  user.password = password;
  await user.save();
  await PasswordReset.deleteMany({ email });

  res.json(new ApiResponse(200, null, 'Password reset successfully'));
});

/**
 * GET /auth/me — current user for Account / My Details
 */
const me = asyncHandler(async (req, res) => {
  res.json(new ApiResponse(200, { user: sanitizeUser(req.user) }));
});

/**
 * PATCH /auth/me
 * Body fields from my-details.tsx: fullName, email, dob, gender, phone
 * (email change optional; kept unique if provided)
 */
const updateMe = asyncHandler(async (req, res) => {
  const updates = {};

  if (req.body.fullName !== undefined) {
    const fullName = String(req.body.fullName).trim();
    if (!isValidName(fullName)) {
      throw new ApiError(400, 'Please enter your full name');
    }
    updates.fullName = fullName;
  }

  if (req.body.email !== undefined) {
    const email = String(req.body.email).trim();
    if (!isValidEmail(email)) {
      throw new ApiError(400, 'Please enter valid email address');
    }
    const taken = await User.findOne({
      email: email.toLowerCase(),
      _id: { $ne: req.user._id },
    });
    if (taken) throw new ApiError(409, 'Email already registered');
    updates.email = email.toLowerCase();
  }

  if (req.body.dob !== undefined) {
    updates.dob = String(req.body.dob).trim();
  }

  if (req.body.phone !== undefined) {
    updates.phone = String(req.body.phone).trim();
  }

  if (req.body.gender !== undefined) {
    const gender = String(req.body.gender).trim();
    if (gender && !['Male', 'Female', 'Other'].includes(gender)) {
      throw new ApiError(400, 'Gender must be Male, Female, or Other');
    }
    updates.gender = gender;
  }

  if (req.body.notificationPrefs !== undefined) {
    const prefs = req.body.notificationPrefs;
    updates.notificationPrefs = {
      orders: Boolean(prefs.orders),
      promos: Boolean(prefs.promos),
      wishlist: Boolean(prefs.wishlist),
      system: Boolean(prefs.system),
    };
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  });

  res.json(new ApiResponse(200, { user: sanitizeUser(user) }, 'Profile updated'));
});

/**
 * POST /auth/logout — client should discard JWT; endpoint for symmetry with Account logout
 */
const logout = asyncHandler(async (_req, res) => {
  res.json(new ApiResponse(200, null, 'Logged out'));
});

module.exports = {
  register,
  login,
  adminLogin,
  loginWithFirebase,
  forgotPassword,
  resendOtp,
  verifyOtp,
  loginOtp,
  requestOtp,
  resetPassword,
  me,
  updateMe,
  logout,
  sanitizeUser,
};
