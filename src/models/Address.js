const mongoose = require('mongoose');

/**
 * Matches mobile Address type (src/store/address.tsx):
 * id, label (Home|Office|Other), fullName, phone, street, city, state, zip, country, isDefault?
 */
const addressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    label: {
      type: String,
      enum: ['Home', 'Office', 'Other'],
      default: 'Home',
    },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, default: '', trim: true },
    zip: { type: String, required: true, trim: true },
    country: { type: String, default: 'India', trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

function serializeAddress(doc) {
  if (!doc) return null;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  return {
    id: String(o._id),
    label: o.label,
    fullName: o.fullName,
    phone: o.phone,
    street: o.street,
    city: o.city,
    state: o.state || '',
    zip: o.zip,
    country: o.country || 'India',
    ...(o.isDefault ? { isDefault: true } : {}),
  };
}

module.exports = mongoose.model('Address', addressSchema);
module.exports.serializeAddress = serializeAddress;
