const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const Product = require('../models/Product');
const Review = require('../models/Review');
const { serializeProduct, FRONTEND_CATEGORIES } = Product;
const { serializeReview } = Review;

/**
 * Price bands from mobile filters.tsx:
 * all | under2k | 2k4k | over4k
 */
function applyPriceBand(filter, price) {
  if (!price || price === 'all') return;
  if (price === 'under2k') {
    filter.price = { $lt: 2000 };
  } else if (price === '2k4k') {
    filter.price = { $gte: 2000, $lte: 4000 };
  } else if (price === 'over4k') {
    filter.price = { $gt: 4000 };
  }
}

/**
 * Sort options from mobile filters.tsx:
 * Relevance | Price: Low-High | Price: High-Low | Newest
 */
function resolveSort(sort, hasTextSearch) {
  switch (sort) {
    case 'Price: Low-High':
      return { price: 1 };
    case 'Price: High-Low':
      return { price: -1 };
    case 'Newest':
      return { isNewProduct: -1, createdAt: -1 };
    case 'Relevance':
    default:
      return hasTextSearch ? { score: { $meta: 'textScore' } } : { createdAt: -1 };
  }
}

/**
 * GET /products
 * Query mirrors Home, Search, Filters:
 *   q, category, size, sort, price | minPrice/maxPrice, page, limit
 */
const listProducts = asyncHandler(async (req, res) => {
  const {
    category,
    q,
    size,
    sort = 'Relevance',
    price = 'all',
    minPrice,
    maxPrice,
    page = 1,
    limit = 20,
  } = req.query;

  const filter = { isActive: true };

  if (category && category !== 'All') {
    if (!Product.CATEGORIES.includes(category)) {
      throw new ApiError(400, `Invalid category. Use one of: ${Product.CATEGORIES.join(', ')}`);
    }
    filter.category = category;
  }

  if (size) {
    filter.sizes = size;
  }

  const queryText = typeof q === 'string' ? q.trim() : '';
  if (queryText) {
    // Match mobile search: name / brand / category contains (case-insensitive)
    filter.$or = [
      { name: { $regex: queryText, $options: 'i' } },
      { brand: { $regex: queryText, $options: 'i' } },
      { category: { $regex: queryText, $options: 'i' } },
    ];
  }

  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  } else {
    applyPriceBand(filter, price);
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;
  const sortSpec = resolveSort(sort, false);

  const [docs, total] = await Promise.all([
    Product.find(filter).sort(sortSpec).skip(skip).limit(limitNum),
    Product.countDocuments(filter),
  ]);

  res.json(
    new ApiResponse(200, {
      items: docs.map(serializeProduct),
      categories: FRONTEND_CATEGORIES,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    }),
  );
});

/**
 * GET /products/categories — chip list for Home / Search
 */
const listCategories = asyncHandler(async (_req, res) => {
  res.json(new ApiResponse(200, { categories: FRONTEND_CATEGORIES }));
});

/**
 * GET /products/:id — product detail
 */
const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product || !product.isActive) {
    throw new ApiError(404, 'Product not found');
  }
  res.json(new ApiResponse(200, { product: serializeProduct(product) }));
});

/**
 * GET /products/:id/reviews — reviews sheet on product detail
 */
const listReviews = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product || !product.isActive) {
    throw new ApiError(404, 'Product not found');
  }

  const docs = await Review.find({ product: product._id }).sort({ createdAt: -1 });
  res.json(
    new ApiResponse(200, {
      reviews: docs.map(serializeReview),
      rating: product.rating,
      reviewCount: product.reviewCount,
    }),
  );
});

/**
 * POST /products/:id/reviews — Leave Review (completed orders UI)
 * Body: { rating, text, name? }
 */
const createReview = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product || !product.isActive) {
    throw new ApiError(404, 'Product not found');
  }

  const rating = Number(req.body.rating);
  const text = String(req.body.text || '').trim();
  const name =
    String(req.body.name || '').trim() ||
    req.user?.fullName ||
    'Anonymous';

  if (!rating || rating < 1 || rating > 5) {
    throw new ApiError(400, 'rating must be between 1 and 5');
  }
  if (!text) {
    throw new ApiError(400, 'Review text is required');
  }

  const review = await Review.create({
    product: product._id,
    user: req.user?._id,
    name,
    rating,
    text,
    dateLabel: 'Just now',
  });

  const stats = await Review.aggregate([
    { $match: { product: product._id } },
    {
      $group: {
        _id: '$product',
        avg: { $avg: '$rating' },
        count: { $sum: 1 },
      },
    },
  ]);

  if (stats[0]) {
    product.rating = Math.round(stats[0].avg * 10) / 10;
    product.reviewCount = stats[0].count;
    await product.save();
  }

  res.status(201).json(
    new ApiResponse(201, { review: serializeReview(review) }, 'Review submitted'),
  );
});

module.exports = {
  listProducts,
  listCategories,
  getProduct,
  listReviews,
  createReview,
};
