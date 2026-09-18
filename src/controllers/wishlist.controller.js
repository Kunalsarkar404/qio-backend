const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const { serializeProduct } = Product;

async function getOrCreateWishlist(userId) {
  let list = await Wishlist.findOne({ user: userId });
  if (!list) {
    list = await Wishlist.create({ user: userId, products: [] });
  }
  return list;
}

async function serializeWishlist(list) {
  const docs = await Product.find({
    _id: { $in: list.products },
    isActive: true,
  });
  const byId = new Map(docs.map((p) => [String(p._id), p]));

  // Preserve wishlist order
  const wishlist = [];
  const wishlistProducts = [];
  for (const id of list.products) {
    const pid = String(id);
    const product = byId.get(pid);
    if (!product) continue;
    wishlist.push(pid);
    wishlistProducts.push(serializeProduct(product));
  }

  return { wishlist, wishlistProducts };
}

/**
 * GET /wishlist
 */
const getWishlist = asyncHandler(async (req, res) => {
  const list = await getOrCreateWishlist(req.user._id);
  const data = await serializeWishlist(list);
  res.json(new ApiResponse(200, data));
});

/**
 * POST /wishlist/toggle
 * Body: { productId } — matches toggleWishlist
 */
const toggleWishlist = asyncHandler(async (req, res) => {
  const productId = String(req.body.productId || '').trim();
  if (!productId) {
    throw new ApiError(400, 'productId is required');
  }

  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    throw new ApiError(404, 'Product not found');
  }

  const list = await getOrCreateWishlist(req.user._id);
  const idx = list.products.findIndex((id) => String(id) === productId);
  let wishlisted;

  if (idx >= 0) {
    list.products.splice(idx, 1);
    wishlisted = false;
  } else {
    list.products.push(product._id);
    wishlisted = true;
  }

  await list.save();
  const data = await serializeWishlist(list);
  res.json(
    new ApiResponse(
      200,
      { ...data, wishlisted, isWishlisted: wishlisted },
      wishlisted ? 'Added to wishlist' : 'Removed from wishlist',
    ),
  );
});

/**
 * PUT /wishlist/:productId — add (idempotent)
 */
const addToWishlist = asyncHandler(async (req, res) => {
  const productId = String(req.params.productId || '').trim();
  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    throw new ApiError(404, 'Product not found');
  }

  const list = await getOrCreateWishlist(req.user._id);
  if (!list.products.some((id) => String(id) === productId)) {
    list.products.push(product._id);
    await list.save();
  }

  const data = await serializeWishlist(list);
  res.json(new ApiResponse(200, { ...data, wishlisted: true, isWishlisted: true }));
});

/**
 * DELETE /wishlist/:productId
 */
const removeFromWishlist = asyncHandler(async (req, res) => {
  const productId = String(req.params.productId || '').trim();
  const list = await getOrCreateWishlist(req.user._id);
  list.products = list.products.filter((id) => String(id) !== productId);
  await list.save();

  const data = await serializeWishlist(list);
  res.json(new ApiResponse(200, { ...data, wishlisted: false, isWishlisted: false }));
});

module.exports = {
  getWishlist,
  toggleWishlist,
  addToWishlist,
  removeFromWishlist,
  getOrCreateWishlist,
};
