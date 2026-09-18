const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const Order = require('../models/Order');
const Address = require('../models/Address');
const Product = require('../models/Product');
const {
  serializeOrder,
  serializeOrderLine,
  buildTrackSteps,
  generateOrderNumber,
  ONGOING,
} = Order;
const { getOrCreateCart } = require('./cart.controller');
const { applyWalletChange } = require('./wallet.controller');
const { updateStreak } = require('./streak.controller');

/** Matches mobile getOrderTotals — vat/shipping currently 0 */
function computeTotals(subtotal, discount = 0) {
  const vat = 0;
  const shippingFee = 0;
  const discountAmount = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal + vat + shippingFee - discountAmount);
  return { vat, shippingFee, discount: discountAmount, total };
}

async function findOrderByLineOrOrderId(userId, id) {
  let order = await Order.findOne({ _id: id, user: userId });
  if (order) return { order, item: null };

  order = await Order.findOne({ 'items._id': id, user: userId });
  if (!order) return null;

  const item = order.items.id(id);
  return { order, item };
}

/**
 * GET /orders?status=ongoing|completed
 * Returns flat lines matching mobile Order type for My Orders tabs.
 */
const listOrders = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = { user: req.user._id };

  if (status === 'ongoing') {
    filter.status = { $in: ONGOING };
  } else if (status === 'completed') {
    filter.status = 'Delivered';
  }

  const docs = await Order.find(filter).sort({ createdAt: -1 });
  const orders = [];
  for (const order of docs) {
    for (const item of order.items) {
      orders.push(serializeOrderLine(order, item));
    }
  }

  res.json(new ApiResponse(200, { orders }));
});

/**
 * GET /orders/:id — full order or single line (id can be order or item _id)
 */
const getOrder = asyncHandler(async (req, res) => {
  const found = await findOrderByLineOrOrderId(req.user._id, req.params.id);
  if (!found) throw new ApiError(404, 'Order not found');

  const { order, item } = found;
  if (item) {
    res.json(
      new ApiResponse(200, {
        order: serializeOrderLine(order, item),
        parent: serializeOrder(order),
      }),
    );
    return;
  }

  res.json(new ApiResponse(200, { order: serializeOrder(order) }));
});

/**
 * GET /orders/:id/track — Track Order screen
 */
const trackOrder = asyncHandler(async (req, res) => {
  const found = await findOrderByLineOrOrderId(req.user._id, req.params.id);
  if (!found) throw new ApiError(404, 'Order not found');

  const { order, item } = found;
  const line = item || order.items[0];
  const statusOrder = ['Packing', 'Picked', 'In Transit', 'Delivered'];
  const currentIndex = Math.max(0, statusOrder.indexOf(order.status));

  res.json(
    new ApiResponse(200, {
      order: serializeOrderLine(order, line),
      status: order.status,
      currentIndex,
      trackSteps: buildTrackSteps(order),
      shippingAddress: order.shippingAddress,
    }),
  );
});

/**
 * POST /orders
 * Body preferred (checkout): { addressId } — uses current cart + coupon
 * Or: { addressId, items: [{ productId, size, color, quantity }], discount? }
 */
const createOrder = asyncHandler(async (req, res) => {
  const addressId = String(req.body.addressId || '').trim();
  if (!addressId) throw new ApiError(400, 'addressId is required');

  const address = await Address.findOne({ _id: addressId, user: req.user._id });
  if (!address) throw new ApiError(400, 'Valid addressId is required');

  let lineItems = [];
  let subtotal = 0;
  let discountAmount = Math.max(0, Number(req.body.discount) || 0);
  let cart = null;

  if (Array.isArray(req.body.items) && req.body.items.length > 0) {
    for (const item of req.body.items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isActive) {
        throw new ApiError(400, `Invalid product: ${item.productId}`);
      }
      const quantity = Math.max(1, Number(item.quantity) || 1);
      subtotal += product.price * quantity;
      lineItems.push({
        product: product._id,
        name: product.name,
        image: product.image,
        size: item.size || product.sizes?.[0] || 'M',
        color: item.color || product.colors?.[0] || '#1A1A1A',
        price: product.price,
        quantity,
      });
    }
  } else {
    cart = await getOrCreateCart(req.user._id);
    if (!cart.items.length) {
      throw new ApiError(400, 'Cart is empty');
    }

    for (const item of cart.items) {
      const product = await Product.findById(item.product);
      if (!product || !product.isActive) {
        throw new ApiError(400, `Invalid product in cart: ${item.product}`);
      }
      subtotal += product.price * item.quantity;
      lineItems.push({
        product: product._id,
        name: product.name,
        image: product.image,
        size: item.size,
        color: item.color,
        price: product.price,
        quantity: item.quantity,
      });
    }
    discountAmount = Math.min(cart.appliedDiscount || 0, subtotal);
  }

  const { vat, shippingFee, discount, total } = computeTotals(subtotal, discountAmount);

  let orderNumber = generateOrderNumber();
  // rare collision retry
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await Order.exists({ orderNumber });
    if (!exists) break;
    orderNumber = generateOrderNumber();
  }

  await applyWalletChange(req.user._id, {
    amount: total,
    type: 'debit',
    title: `Order #${orderNumber}`,
  });

  // Update streak for successful order
  await updateStreak(req.user._id);

  const order = await Order.create({
    user: req.user._id,
    orderNumber,
    items: lineItems,
    shippingAddress: {
      label: address.label,
      fullName: address.fullName,
      phone: address.phone,
      street: address.street,
      city: address.city,
      state: address.state,
      zip: address.zip,
      country: address.country,
    },
    paymentMethod: 'wallet',
    subtotal,
    discount,
    vat,
    shippingFee,
    total,
    status: 'Packing',
  });

  if (cart) {
    cart.items = [];
    cart.couponCode = '';
    cart.appliedDiscount = 0;
    await cart.save();
  }

  res.status(201).json(
    new ApiResponse(
      201,
      {
        order: serializeOrder(order),
        orders: order.items.map((item) => serializeOrderLine(order, item)),
      },
      'Order placed',
    ),
  );
});

/**
 * POST /orders/:id/rate — Leave Review rating on completed line
 * Body: { rating }
 */
const rateOrderItem = asyncHandler(async (req, res) => {
  const rating = Number(req.body.rating);
  if (!rating || rating < 1 || rating > 5) {
    throw new ApiError(400, 'rating must be between 1 and 5');
  }

  const found = await findOrderByLineOrOrderId(req.user._id, req.params.id);
  if (!found) throw new ApiError(404, 'Order not found');

  const { order, item } = found;
  if (order.status !== 'Delivered') {
    throw new ApiError(400, 'Only delivered orders can be rated');
  }

  const target = item || order.items[0];
  if (!target) throw new ApiError(404, 'Order item not found');

  target.rating = rating;
  await order.save();

  res.json(
    new ApiResponse(200, { order: serializeOrderLine(order, target) }, 'Rating saved'),
  );
});

/**
 * PATCH /orders/:id/status — admin/dev helper to advance tracking
 * Body: { status }
 */
const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!Order.ORDER_STATUSES.includes(status) || status === 'Cancelled') {
    throw new ApiError(400, `status must be one of: ${ONGOING.join(', ')}, Delivered`);
  }

  const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
  if (!order) throw new ApiError(404, 'Order not found');

  order.status = status;
  await order.save();

  res.json(new ApiResponse(200, { order: serializeOrder(order) }, 'Status updated'));
});

module.exports = {
  listOrders,
  getOrder,
  trackOrder,
  createOrder,
  rateOrderItem,
  updateStatus,
};
