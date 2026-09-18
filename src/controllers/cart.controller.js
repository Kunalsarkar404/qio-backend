const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { serializeProduct } = Product;
const { resolveCoupon } = require('../config/coupons');
const { itemKey } = Cart;

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
  }
  return cart;
}

/**
 * Build response matching mobile useShop cart fields:
 * cart, cartProducts, cartCount, cartTotal, appliedDiscount, couponCode
 */
async function serializeCart(cart) {
  const productIds = cart.items.map((i) => i.product);
  const products = await Product.find({ _id: { $in: productIds }, isActive: true });
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const cartItems = [];
  const cartProducts = [];
  let cartTotal = 0;
  let cartCount = 0;

  for (const item of cart.items) {
    const pid = String(item.product);
    const product = byId.get(pid);
    if (!product) continue;

    const line = {
      productId: pid,
      quantity: item.quantity,
      size: item.size,
      color: item.color,
    };
    cartItems.push(line);
    cartProducts.push({ ...line, product: serializeProduct(product) });
    cartTotal += product.price * item.quantity;
    cartCount += item.quantity;
  }

  const discount = Math.min(cart.appliedDiscount || 0, cartTotal);

  return {
    cart: cartItems,
    cartProducts,
    cartCount,
    cartTotal,
    couponCode: cart.couponCode || '',
    appliedDiscount: discount,
  };
}

/**
 * GET /cart
 */
const getCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  const data = await serializeCart(cart);
  res.json(new ApiResponse(200, data));
});

/**
 * POST /cart/items
 * Body: { productId, size, color, quantity? } — matches addToCart
 */
const addItem = asyncHandler(async (req, res) => {
  const productId = String(req.body.productId || '').trim();
  const size = String(req.body.size || '').trim();
  const color = String(req.body.color || '').trim();
  const qty = Math.max(1, Number(req.body.quantity) || 1);

  if (!productId || !size || !color) {
    throw new ApiError(400, 'productId, size, and color are required');
  }

  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    throw new ApiError(404, 'Product not found');
  }
  if (product.sizes?.length && !product.sizes.includes(size)) {
    throw new ApiError(400, `Invalid size. Available: ${product.sizes.join(', ')}`);
  }
  if (product.colors?.length && !product.colors.includes(color)) {
    throw new ApiError(400, `Invalid color. Available: ${product.colors.join(', ')}`);
  }

  const cart = await getOrCreateCart(req.user._id);
  const key = itemKey({ product: product._id, size, color });
  const existing = cart.items.find((i) => itemKey(i) === key);

  if (existing) {
    existing.quantity += qty;
  } else {
    cart.items.push({ product: product._id, quantity: qty, size, color });
  }

  await cart.save();
  const data = await serializeCart(cart);
  res.status(201).json(new ApiResponse(201, data, 'Added to cart'));
});

/**
 * PATCH /cart/items
 * Body: { productId, size, color, quantity } — matches updateQuantity
 * quantity <= 0 removes the line
 */
const updateItem = asyncHandler(async (req, res) => {
  const productId = String(req.body.productId || '').trim();
  const size = String(req.body.size || '').trim();
  const color = String(req.body.color || '').trim();
  const quantity = Number(req.body.quantity);

  if (!productId || !size || !color || Number.isNaN(quantity)) {
    throw new ApiError(400, 'productId, size, color, and quantity are required');
  }

  const cart = await getOrCreateCart(req.user._id);
  const key = itemKey({ product: productId, size, color });

  if (quantity <= 0) {
    cart.items = cart.items.filter((i) => itemKey(i) !== key);
  } else {
    const existing = cart.items.find((i) => itemKey(i) === key);
    if (!existing) {
      throw new ApiError(404, 'Cart item not found');
    }
    existing.quantity = quantity;
  }

  // Clear coupon if cart emptied
  if (cart.items.length === 0) {
    cart.couponCode = '';
    cart.appliedDiscount = 0;
  }

  await cart.save();
  const data = await serializeCart(cart);
  res.json(new ApiResponse(200, data, 'Cart updated'));
});

/**
 * DELETE /cart/items
 * Body: { productId, size, color } — matches removeFromCart
 */
const removeItem = asyncHandler(async (req, res) => {
  const productId = String(req.body.productId || '').trim();
  const size = String(req.body.size || '').trim();
  const color = String(req.body.color || '').trim();

  if (!productId || !size || !color) {
    throw new ApiError(400, 'productId, size, and color are required');
  }

  const cart = await getOrCreateCart(req.user._id);
  const key = itemKey({ product: productId, size, color });
  const before = cart.items.length;
  cart.items = cart.items.filter((i) => itemKey(i) !== key);

  if (cart.items.length === before) {
    throw new ApiError(404, 'Cart item not found');
  }

  if (cart.items.length === 0) {
    cart.couponCode = '';
    cart.appliedDiscount = 0;
  }

  await cart.save();
  const data = await serializeCart(cart);
  res.json(new ApiResponse(200, data, 'Item removed'));
});

/**
 * DELETE /cart — matches clearCart
 */
const clearCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  cart.items = [];
  cart.couponCode = '';
  cart.appliedDiscount = 0;
  await cart.save();
  const data = await serializeCart(cart);
  res.json(new ApiResponse(200, data, 'Cart cleared'));
});

/**
 * POST /cart/coupon — Apply QIO10 etc.
 * Body: { code }
 */
const applyCoupon = asyncHandler(async (req, res) => {
  const coupon = resolveCoupon(req.body.code);
  if (!coupon) {
    throw new ApiError(400, 'Invalid coupon. Try QIO10.');
  }

  const cart = await getOrCreateCart(req.user._id);
  if (cart.items.length === 0) {
    throw new ApiError(400, 'Add items to cart before applying a coupon');
  }

  cart.couponCode = coupon.code;
  cart.appliedDiscount = coupon.discount;
  await cart.save();

  const data = await serializeCart(cart);
  res.json(new ApiResponse(200, data, `Coupon applied (−$${coupon.discount})`));
});

/**
 * DELETE /cart/coupon — remove applied discount
 */
const removeCoupon = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  cart.couponCode = '';
  cart.appliedDiscount = 0;
  await cart.save();
  const data = await serializeCart(cart);
  res.json(new ApiResponse(200, data, 'Coupon removed'));
});

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  applyCoupon,
  removeCoupon,
  getOrCreateCart,
  serializeCart,
};
