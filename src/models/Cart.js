const mongoose = require('mongoose');

/**
 * Matches mobile CartItem (src/store/cart.tsx):
 * { productId, quantity, size, color }
 * + appliedDiscount / coupon from cart.tsx (QIO10 → $100)
 * Cart document shape mirrors mobile CartContext.
 */
const cartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    size: { type: String, required: true, trim: true },
    color: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    items: { type: [cartItemSchema], default: [] },
    /** Applied coupon code, e.g. QIO10 — empty when none */
    couponCode: { type: String, default: '', uppercase: true, trim: true },
    /** Flat discount amount in currency units (mobile: 100 for QIO10) */
    appliedDiscount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

function itemKey(item) {
  return `${String(item.product)}:${item.size}:${item.color}`;
}

cartSchema.statics.itemKey = itemKey;

module.exports = mongoose.model('Cart', cartSchema);
module.exports.itemKey = itemKey;
