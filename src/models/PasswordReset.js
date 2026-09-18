const mongoose = require('mongoose');

/**
 * Password reset / email verification OTP.
 * Frontend uses a 4-digit code (OtpInput length = 4).
 */
const passwordResetSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
    verified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('PasswordReset', passwordResetSchema);
