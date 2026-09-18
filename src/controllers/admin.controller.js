const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const config = require('../config/env');
const { User, Product, Order, Review, Brand } = require('../models');
const { serializeProduct, CATEGORIES } = Product;

const formatINR = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(Number(value || 0));

const dashboard = asyncHandler(async (_req, res) => {
  const [users, products, orders, reviews, brands] = await Promise.all([
    User.find({ role: 'user' }).sort({ lastLoginAt: -1, createdAt: -1 }).limit(100).lean(),
    Product.find().sort({ clickCount: -1, createdAt: -1 }).limit(100).lean(),
    Order.find().populate('user', 'fullName email').sort({ createdAt: -1 }).limit(100).lean(),
    Review.find().populate('product', 'name').sort({ createdAt: -1 }).limit(100).lean(),
    Brand.find({ isActive: true }).sort({ name: 1 }).lean(),
  ]);

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
    users: users.map((user) => ({
      id: String(user._id), name: user.fullName, email: user.email, phone: user.phone || '',
      screenTimeSeconds: user.screenTimeSeconds || 0, lastLoginAt: user.lastLoginAt, createdAt: user.createdAt,
      walletBalance: user.wallet?.balance || 10000,
      streakCount: user.streak?.count || 0,
    })),
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

module.exports = {
  dashboard,
  createBrand,
  listAdminProducts,
  getAdminProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  recordProductClick,
};
