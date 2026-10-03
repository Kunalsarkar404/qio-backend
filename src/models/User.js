const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * User shape aligned with mobile auth + My Details screens:
 * fullName, email, password, phone, dob, gender
 * + notificationPrefs from Notifications screen
 */
const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Please enter your full name'],
      trim: true,
      minlength: [2, 'Please enter your full name'],
    },
    email: {
      type: String,
      required: [true, 'Please enter valid email address'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    firebaseUid: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password must be at least 6 characters'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    /** Frontend My Details field name is `dob` (e.g. "12/07/1990") */
    dob: {
      type: String,
      trim: true,
      default: '',
    },
    gender: {
      type: String,
      enum: {
        values: ['Male', 'Female', 'Other', ''],
        message: 'Gender must be Male, Female, or Other',
      },
      default: '',
    },
    notificationPrefs: {
      orders: { type: Boolean, default: true },
      promos: { type: Boolean, default: true },
      wishlist: { type: Boolean, default: false },
      system: { type: Boolean, default: true },
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    lastLoginAt: { type: Date, default: null },
    screenTimeSeconds: { type: Number, default: 0, min: 0 },
    wallet: {
      balance: {
        type: Number,
        default: 10000,
        min: 0,
      },
      lastMonthlyBonusDate: { type: Date, default: null },
    },
    streak: {
      count: { type: Number, default: 0, min: 0 },
      lastActivityDate: { type: Date, default: null },
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    referralRewardsEarned: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
