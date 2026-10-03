const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const config = require('../config/env');
const { User, Product, Order, Review, Brand, Wallet } = require('../models');
const { serializeProduct, CATEGORIES } = Product;

const formatINR = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(Number(value || 0));

const dashboard = asyncHandler(async (_req, res) => {
  const [users, products, orders, reviews, brands, wallets] = await Promise.all([
    User.find({ role: 'user' }).sort({ lastLoginAt: -1, createdAt: -1 }).limit(100).lean(),
    Product.find().sort({ clickCount: -1, createdAt: -1 }).limit(100).lean(),
    Order.find().populate('user', 'fullName email').sort({ createdAt: -1 }).limit(100).lean(),
    Review.find().populate('product', 'name').sort({ createdAt: -1 }).limit(100).lean(),
    Brand.find({ isActive: true }).sort({ name: 1 }).lean(),
    Wallet.find().lean(),
  ]);

  // Map wallets by user ID
  const walletMap = {};
  wallets.forEach((w) => {
    walletMap[String(w.user)] = w;
  });

  const revenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const orderCount = orders.length;
  const clickCount = products.reduce((sum, product) => sum + Number(product.clickCount || 0), 0);

  res.json(new ApiResponse(200, {
    metrics: {
      revenue: formatINR(revenue),
      orders: orderCount,
      users: users.length,
      clicks: clickCount,
      averageScreenTimeSeconds: users.length
        ? Math.round(users.reduce((sum, user) => sum + Number(user.screenTimeSeconds || 0), 0) / users.length)
        : 0,
    },
    users: users.map((user) => {
      const userId = String(user._id);
      const wallet = walletMap[userId];
      return {
        id: userId,
        name: user.fullName,
        email: user.email,
        phone: user.phone || '',
        screenTimeSeconds: user.screenTimeSeconds || 0,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        walletBalance: wallet?.balance || 0,
        streakCount: user.streak?.count || 0,
      };
    }),
    products: products.map((product) => ({
      id: String(product._id), name: product.name, brand: product.brand, category: product.category,
      price: formatINR(product.price), clicks: product.clickCount || 0, stock: product.isActive ? 'Live' : 'Inactive',
      image: product.image, rating: product.rating, reviewCount: product.reviewCount,
    })),
    orders: orders.map((order) => ({
      id: String(order._id), orderNumber: order.orderNumber, customer: order.user?.fullName || 'Unknown',
      email: order.user?.email || '', total: formatINR(order.total), status: order.status, createdAt: order.createdAt,
      itemCount: (order.items || []).reduce((sum, item) => sum + item.quantity, 0),
    })),
    reviews: reviews.map((review) => ({
      id: String(review._id), product: review.product?.name || 'Unknown product', customer: review.name,
      rating: review.rating, text: review.text, createdAt: review.createdAt,
    })),
    brands: brands.map((brand) => ({ id: String(brand._id), name: brand.name, website: brand.website, createdAt: brand.createdAt })),
  }));
});

const createBrand = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) throw new ApiError(400, 'Brand name is required');
  const brand = await Brand.create({ name, website: String(req.body.website || '').trim() });
  res.status(201).json(new ApiResponse(201, { brand }, 'Brand created'));
});

/** Accepts a JSON array, a newline/comma separated string, or undefined */
function parseStringList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    // not JSON — fall through to line splitting
  }
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

/** Accepts a JSON array of { size, stock } or a JSON string of the same */
function parseSizeStock(value) {
  if (!value) return [];
  const raw = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => ({ size: String(entry.size || '').trim(), stock: Math.max(0, Number(entry.stock) || 0) }))
    .filter((entry) => entry.size);
}

function buildProductPayload(body, uploadedUrls) {
  const sizeStock = parseSizeStock(body.sizeStock);
  const existingImages = parseStringList(body.existingImages);
  const images = [...existingImages, ...uploadedUrls];

  return {
    name: String(body.name || '').trim(),
    brand: String(body.brand || '').trim(),
    category: body.category,
    price: Number(body.price),
    ...(body.originalPrice ? { originalPrice: Number(body.originalPrice) } : { originalPrice: undefined }),
    description: String(body.description || '').trim(),
    details: parseStringList(body.details),
    materialAndFit: parseStringList(body.materialAndFit),
    colors: parseStringList(body.colors),
    sizeStock,
    images,
    image: images[0],
    isNewProduct: body.isNewProduct === true || body.isNewProduct === 'true',
  };
}

function toAbsoluteUrl(req, filename) {
  const base = config.publicUrl || `${req.protocol}://${req.get('host')}`;
  return `${base}/uploads/products/${filename}`;
}

/** GET /admin/products — full catalog for the admin table (not paginated) */
const listAdminProducts = asyncHandler(async (_req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  res.json(new ApiResponse(200, {
    products: products.map(serializeProduct),
    categories: CATEGORIES,
  }));
});

/** GET /admin/products/:id — full record for the edit form */
const getAdminProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');
  res.json(new ApiResponse(200, { product: serializeProduct(product) }));
});

/** POST /admin/products — multipart/form-data with optional `images` files */
const createProduct = asyncHandler(async (req, res) => {
  const required = ['name', 'brand', 'category', 'price'];
  for (const field of required) {
    if (req.body[field] === undefined || req.body[field] === '') throw new ApiError(400, `${field} is required`);
  }

  const uploadedUrls = (req.files || []).map((file) => toAbsoluteUrl(req, file.filename));
  const payload = buildProductPayload(req.body, uploadedUrls);
  if (!payload.image) throw new ApiError(400, 'At least one product image is required');

  const product = await Product.create(payload);
  res.status(201).json(new ApiResponse(201, { product: serializeProduct(product) }, 'Product created'));
});

/** PATCH /admin/products/:id — multipart/form-data, existing images passed as `existingImages` */
const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');

  const uploadedUrls = (req.files || []).map((file) => toAbsoluteUrl(req, file.filename));
  const payload = buildProductPayload(req.body, uploadedUrls);
  if (!payload.image) throw new ApiError(400, 'At least one product image is required');

  Object.assign(product, payload);
  await product.save();
  res.json(new ApiResponse(200, { product: serializeProduct(product) }, 'Product updated'));
});

/** DELETE /admin/products/:id */
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');
  res.json(new ApiResponse(200, { id: req.params.id }, 'Product deleted'));
});

const recordProductClick = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, { $inc: { clickCount: 1 } }, { new: true });
  if (!product) throw new ApiError(404, 'Product not found');
  res.json(new ApiResponse(200, { clicks: product.clickCount }));
});

// ==================== ORDERS ====================
const listAdminOrders = asyncHandler(async (req, res) => {
  const { status, startDate, endDate, userId } = req.query;
  const filter = {};

  if (status) filter.status = status;
  if (userId) filter.user = userId;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const orders = await Order.find(filter)
    .populate('user', 'fullName email phone')
    .sort({ createdAt: -1 })
    .limit(1000);

  res.json(new ApiResponse(200, { orders }));
});

const getAdminOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('user', 'fullName email phone');
  if (!order) throw new ApiError(404, 'Order not found');
  res.json(new ApiResponse(200, { order }));
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status) throw new ApiError(400, 'Status is required');

  const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true }).populate('user', 'fullName email');
  if (!order) throw new ApiError(404, 'Order not found');
  res.json(new ApiResponse(200, { order }, 'Order status updated'));
});

const getOrderStats = asyncHandler(async (_req, res) => {
  const orders = await Order.find();
  const totalOrders = orders.length;
  const completedOrders = orders.filter((o) => o.status === 'Delivered').length;
  const ongoingOrders = orders.filter((o) => ['Packing', 'Picked', 'In Transit'].includes(o.status)).length;
  const cancelledOrders = orders.filter((o) => o.status === 'Cancelled').length;
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  res.json(
    new ApiResponse(200, {
      totalOrders,
      completedOrders,
      ongoingOrders,
      cancelledOrders,
      totalRevenue: formatINR(totalRevenue),
      averageOrderValue: formatINR(averageOrderValue),
    })
  );
});

// ==================== REVIEWS ====================
const listAdminReviews = asyncHandler(async (req, res) => {
  const { productId, rating, status } = req.query;
  const filter = {};

  if (productId) filter.product = productId;
  if (rating) filter.rating = Number(rating);
  if (status) filter.status = status;

  const reviews = await Review.find(filter)
    .populate('product', 'name image')
    .populate('user', 'fullName email')
    .sort({ createdAt: -1 })
    .limit(1000);

  res.json(new ApiResponse(200, { reviews }));
});

const getAdminReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id)
    .populate('product', 'name image')
    .populate('user', 'fullName email');
  if (!review) throw new ApiError(404, 'Review not found');
  res.json(new ApiResponse(200, { review }));
});

const approveReview = asyncHandler(async (req, res) => {
  const review = await Review.findByIdAndUpdate(req.params.id, { status: 'approved' }, { new: true });
  if (!review) throw new ApiError(404, 'Review not found');
  res.json(new ApiResponse(200, { review }, 'Review approved'));
});

const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findByIdAndDelete(req.params.id);
  if (!review) throw new ApiError(404, 'Review not found');
  res.json(new ApiResponse(200, { id: req.params.id }, 'Review deleted'));
});

const getReviewStats = asyncHandler(async (req, res) => {
  const { productId } = req.query;
  const filter = productId ? { product: productId } : {};
  const reviews = await Review.find(filter);

  const totalReviews = reviews.length;
  const averageRating = totalReviews > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews : 0;
  const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((r) => {
    const rating = Math.round(r.rating);
    if (rating >= 1 && rating <= 5) ratingDistribution[rating]++;
  });

  res.json(
    new ApiResponse(200, {
      totalReviews,
      averageRating: averageRating.toFixed(2),
      ratingDistribution,
    })
  );
});

// ==================== USERS ====================
const listAdminUsers = asyncHandler(async (req, res) => {
  const { status, search, page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const filter = {};

  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const users = await User.find(filter)
    .select('-password')
    .skip(skip)
    .limit(Number(limit))
    .sort({ createdAt: -1 });

  const total = await User.countDocuments(filter);

  res.json(new ApiResponse(200, { users, total }));
});

const getAdminUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');
  if (!user) throw new ApiError(404, 'User not found');
  res.json(new ApiResponse(200, { user }));
});

const updateUserStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status) throw new ApiError(400, 'Status is required');

  const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true }).select('-password');
  if (!user) throw new ApiError(404, 'User not found');
  res.json(new ApiResponse(200, { user }, 'User status updated'));
});

const getUserStats = asyncHandler(async (_req, res) => {
  const users = await User.find();
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === 'active').length;
  const inactiveUsers = users.filter((u) => u.status === 'inactive').length;
  const suspendedUsers = users.filter((u) => u.status === 'suspended').length;

  res.json(
    new ApiResponse(200, {
      totalUsers,
      activeUsers,
      inactiveUsers,
      suspendedUsers,
      newUsersThisMonth: users.filter((u) => new Date(u.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length,
    })
  );
});

// ==================== WALLETS ====================
const listAdminWallets = asyncHandler(async (req, res) => {
  const { minBalance, maxBalance, search, page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const filter = {};

  if (minBalance) filter['balance'] = { $gte: Number(minBalance) };
  if (maxBalance) filter['balance'] = filter['balance'] || {};
  filter['balance'] = filter['balance'] || {};
  if (maxBalance) filter['balance'].$lte = Number(maxBalance);

  const wallets = await Wallet.find(filter)
    .populate('user', 'fullName email')
    .skip(skip)
    .limit(Number(limit))
    .sort({ balance: -1 });

  const total = await Wallet.countDocuments(filter);

  res.json(new ApiResponse(200, { wallets, total }));
});

const getAdminWallet = asyncHandler(async (req, res) => {
  const wallet = await Wallet.findOne({ user: req.params.id }).populate('user', 'fullName email');
  if (!wallet) throw new ApiError(404, 'Wallet not found');
  res.json(new ApiResponse(200, { wallet }));
});

const creditUserWallet = asyncHandler(async (req, res) => {
  const { amount, reason } = req.body;
  if (!amount || amount <= 0) throw new ApiError(400, 'Amount must be greater than 0');

  const wallet = await Wallet.findOne({ user: req.params.id });
  if (!wallet) throw new ApiError(404, 'Wallet not found');

  wallet.balance += Number(amount);
  wallet.transactions.push({
    title: reason || 'Admin Credit',
    amount: Number(amount),
    type: 'credit',
    date: new Date(),
  });
  await wallet.save();

  res.json(new ApiResponse(200, { wallet }, 'Wallet credited'));
});

const debitUserWallet = asyncHandler(async (req, res) => {
  const { amount, reason } = req.body;
  if (!amount || amount <= 0) throw new ApiError(400, 'Amount must be greater than 0');

  const wallet = await Wallet.findOne({ user: req.params.id });
  if (!wallet) throw new ApiError(404, 'Wallet not found');
  if (wallet.balance < amount) throw new ApiError(400, 'Insufficient wallet balance');

  wallet.balance -= Number(amount);
  wallet.transactions.push({
    title: reason || 'Admin Debit',
    amount: Number(amount),
    type: 'debit',
    date: new Date(),
  });
  await wallet.save();

  res.json(new ApiResponse(200, { wallet }, 'Wallet debited'));
});

const getWalletStats = asyncHandler(async (_req, res) => {
  const wallets = await Wallet.find();
  const totalActiveWallets = wallets.length;
  const totalBalance = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);
  const averageBalance = totalActiveWallets > 0 ? totalBalance / totalActiveWallets : 0;
  const totalTransactions = wallets.reduce((sum, w) => sum + (w.transactions || []).length, 0);

  res.json(
    new ApiResponse(200, {
      totalActiveWallets,
      totalBalance: formatINR(totalBalance),
      averageBalance: formatINR(averageBalance),
      totalTransactions,
    })
  );
});

// ==================== STREAKS (Placeholder) ====================
const listUserStreaks = asyncHandler(async (_req, res) => {
  // TODO: Implement when Streak model is available
  res.json(new ApiResponse(200, { streaks: [], total: 0 }));
});

const getUserStreak = asyncHandler(async (_req, res) => {
  // TODO: Implement when Streak model is available
  throw new ApiError(501, 'Not implemented');
});

const getStreakStats = asyncHandler(async (_req, res) => {
  // TODO: Implement when Streak model is available
  res.json(new ApiResponse(200, { totalUsers: 0, usersWithStreaks: 0 }));
});

const getStreakTrends = asyncHandler(async (_req, res) => {
  // TODO: Implement when Streak model is available
  res.json(new ApiResponse(200, { trends: [] }));
});

module.exports = {
  dashboard,
  createBrand,
  listAdminProducts,
  getAdminProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  recordProductClick,
  // Orders
  listAdminOrders,
  getAdminOrder,
  updateOrderStatus,
  getOrderStats,
  // Reviews
  listAdminReviews,
  getAdminReview,
  approveReview,
  deleteReview,
  getReviewStats,
  // Users
  listAdminUsers,
  getAdminUser,
  updateUserStatus,
  getUserStats,
  // Wallets
  listAdminWallets,
  getAdminWallet,
  creditUserWallet,
  debitUserWallet,
  getWalletStats,
  // Streaks
  listUserStreaks,
  getUserStreak,
  getStreakStats,
  getStreakTrends,
};
