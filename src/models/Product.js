const mongoose = require('mongoose');

/**
 * Matches mobile Product type (src/data/products.ts):
 * id, name, brand, price, originalPrice?, category, rating, reviewCount,
 * image, colors, sizes, description, isNew?
 *
 * DB stores `isNewProduct` (mongoose reserves `isNew`); API serializes as `isNew`.
 */
const CATEGORIES = ['Tshirts', 'Jeans', 'Shoes', 'Hoodie', 'Accessories'];

const sizeStockSchema = new mongoose.Schema(
  {
    size: { type: String, required: true, trim: true },
    stock: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false },
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    brand: { type: String, required: true, trim: true },
    /** Selling Price — what the customer pays */
    price: { type: Number, required: true, min: 0 },
    /** Marked Price (MRP) — shown struck-through when higher than price */
    originalPrice: { type: Number, min: 0 },
    category: {
      type: String,
      required: true,
      enum: CATEGORIES,
    },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    clickCount: { type: Number, default: 0, min: 0 },
    /** First image kept for backward compatibility with existing clients */
    image: { type: String, required: true },
    /** Full gallery — image mirrors images[0] */
    images: { type: [String], default: [] },
    colors: [{ type: String }],
    sizes: [{ type: String }],
    /** Stock count per size from the size chart */
    sizeStock: { type: [sizeStockSchema], default: [] },
    description: { type: String, default: '' },
    /** Bullet list — "Product Details" section on mobile */
    details: { type: [String], default: [] },
    /** Bullet list — "Material & Fit" section on mobile */
    materialAndFit: { type: [String], default: [] },
    isNewProduct: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

productSchema.index({ name: 'text', brand: 'text', category: 'text' });
productSchema.index({ category: 1, price: 1 });

productSchema.pre('validate', function deriveStockFields(next) {
  if (this.sizeStock && this.sizeStock.length) {
    this.sizes = this.sizeStock.map((entry) => entry.size);
  }
  if ((!this.images || !this.images.length) && this.image) {
    this.images = [this.image];
  } else if (this.images && this.images.length && !this.image) {
    this.image = this.images[0];
  }
  next();
});

function serializeProduct(doc) {
  if (!doc) return null;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const sizeStock = (o.sizeStock || []).map((entry) => ({ size: entry.size, stock: entry.stock }));
  const totalStock = sizeStock.reduce((sum, entry) => sum + entry.stock, 0);
  return {
    id: String(o._id),
    name: o.name,
    brand: o.brand,
    price: o.price,
    ...(o.originalPrice != null ? { originalPrice: o.originalPrice } : {}),
    category: o.category,
    rating: o.rating,
    reviewCount: o.reviewCount,
    image: o.image,
    images: o.images && o.images.length ? o.images : [o.image].filter(Boolean),
    colors: o.colors || [],
    sizes: o.sizes || [],
    sizeStock,
    stock: totalStock,
    clicks: o.clickCount || 0,
    description: o.description || '',
    details: o.details || [],
    materialAndFit: o.materialAndFit || [],
    ...(o.isNewProduct ? { isNew: true } : {}),
  };
}

module.exports = mongoose.model('Product', productSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.serializeProduct = serializeProduct;
module.exports.FRONTEND_CATEGORIES = ['All', ...CATEGORIES];
