const mongoose = require('mongoose');

/**
 * Matches product detail reviews sheet mock:
 * { id, name, rating, date, text }
 */
const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    name: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, required: true, trim: true },
    dateLabel: {
      type: String,
      default: '',
    },
  },
  { timestamps: true },
);

function serializeReview(doc) {
  if (!doc) return null;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  return {
    id: String(o._id),
    name: o.name,
    rating: o.rating,
    date: o.dateLabel || formatRelativeDate(o.createdAt),
    text: o.text,
  };
}

function formatRelativeDate(date) {
  if (!date) return '';
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  return `${Math.floor(days / 7)} weeks ago`;
}

module.exports = mongoose.model('Review', reviewSchema);
module.exports.serializeReview = serializeReview;
