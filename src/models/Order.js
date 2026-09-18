const mongoose = require('mongoose');

/**
 * Backend stores full multi-item orders.
 * My Orders UI (mobile/src/data/orders.ts) is flat per line:
 * { id, productId, name, size, price, image, status, rating? }
 */
const ORDER_STATUSES = ['Packing', 'Picked', 'In Transit', 'Delivered', 'Cancelled'];
const ONGOING = ['Packing', 'Picked', 'In Transit'];

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: { type: String, required: true },
    image: { type: String, required: true },
    size: { type: String, required: true },
    color: { type: String, default: '' },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    /** Per-line rating after delivery (completed tab) */
    rating: { type: Number, min: 0, max: 5 },
  },
  { _id: true },
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /** Display code e.g. PD-1042 — used in wallet txn titles */
    orderNumber: { type: String, required: true, unique: true, index: true },
    items: {
      type: [orderItemSchema],
      validate: [(v) => v.length > 0, 'Order must have items'],
    },
    shippingAddress: {
      label: String,
      fullName: String,
      phone: String,
      street: String,
      city: String,
      state: String,
      zip: String,
      country: String,
    },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'Packing',
    },
    paymentMethod: {
      type: String,
      enum: ['wallet'],
      default: 'wallet',
    },
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    vat: { type: Number, default: 0 },
    shippingFee: { type: Number, default: 0 },
    total: { type: Number, required: true },
  },
  { timestamps: true },
);

/** Matches mobile TRACK_STEPS — Delivered address filled from shippingAddress */
const DEFAULT_TRACK_STEPS = [
  {
    key: 'Packing',
    address: '2336 Jack Warren Rd, Delta Junction, Alaska 99737',
  },
  {
    key: 'Picked',
    address: '2417 Tongass Ave #111, Ketchikan, Alaska 99901',
  },
  {
    key: 'In Transit',
    address: '16 Rr 2, Ketchikan, Alaska 99901, USA',
  },
  {
    key: 'Delivered',
    address: '',
  },
];

function formatDeliveryLine(addr) {
  if (!addr) return '';
  if (addr.street) return addr.street;
  return [addr.city, addr.state, addr.zip].filter(Boolean).join(', ');
}

function serializeOrderLine(order, item) {
  return {
    id: String(item._id),
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    productId: String(item.product),
    name: item.name,
    size: item.size,
    color: item.color || '',
    quantity: item.quantity,
    price: item.price,
    image: item.image,
    status: order.status,
    ...(item.rating != null ? { rating: item.rating } : {}),
  };
}

function serializeOrder(order) {
  if (!order) return null;
  const o = typeof order.toObject === 'function' ? order.toObject() : { ...order };
  return {
    id: String(o._id),
    orderNumber: o.orderNumber,
    status: o.status,
    paymentMethod: o.paymentMethod,
    subtotal: o.subtotal,
    discount: o.discount || 0,
    vat: o.vat || 0,
    shippingFee: o.shippingFee || 0,
    total: o.total,
    shippingAddress: o.shippingAddress,
    items: (o.items || []).map((item) => serializeOrderLine(o, item)),
    createdAt: o.createdAt,
  };
}

function buildTrackSteps(order) {
  return DEFAULT_TRACK_STEPS.map((step) => {
    if (step.key === 'Delivered') {
      return {
        key: step.key,
        address: formatDeliveryLine(order.shippingAddress) || step.address,
      };
    }
    return { ...step };
  });
}

function generateOrderNumber() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `PD-${n}`;
}

module.exports = mongoose.model('Order', orderSchema);
module.exports.ORDER_STATUSES = ORDER_STATUSES;
module.exports.ONGOING = ONGOING;
module.exports.serializeOrder = serializeOrder;
module.exports.serializeOrderLine = serializeOrderLine;
module.exports.buildTrackSteps = buildTrackSteps;
module.exports.generateOrderNumber = generateOrderNumber;
module.exports.DEFAULT_TRACK_STEPS = DEFAULT_TRACK_STEPS;
