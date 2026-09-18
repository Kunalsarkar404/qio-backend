const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mirrors mobile/src/lib/validation.ts */
function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_RE.test(value.trim());
}

function isValidPassword(value) {
  return typeof value === 'string' && value.trim().length >= 6;
}

function isValidName(value) {
  return typeof value === 'string' && value.trim().length >= 2;
}

function isValidOtp(value) {
  return typeof value === 'string' && /^\d{4}$/.test(value.trim());
}

function requireFields(body, fields) {
  const missing = fields.filter((f) => {
    const v = body[f];
    return v === undefined || v === null || (typeof v === 'string' && !v.trim());
  });
  return missing;
}

module.exports = {
  isValidEmail,
  isValidPassword,
  isValidName,
  isValidOtp,
  requireFields,
};
