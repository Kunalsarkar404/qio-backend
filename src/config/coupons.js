/**
 * Coupons used by mobile cart.tsx / faqs.tsx
 * QIO10 → flat $100 off
 */
const COUPONS = {
  QIO10: {
    code: 'QIO10',
    discount: 100,
    description: '$100 off your order',
  },
};

function resolveCoupon(rawCode) {
  const code = String(rawCode || '')
    .trim()
    .toUpperCase();
  if (!code) return null;
  return COUPONS[code] || null;
}

module.exports = { COUPONS, resolveCoupon };
