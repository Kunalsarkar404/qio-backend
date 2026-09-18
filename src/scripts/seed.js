const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { connectDB } = require('../config/db');
const Product = require('../models/Product');
const Review = require('../models/Review');

/** Exact catalog from mobile/src/data/products.ts */
const products = [
  {
    name: 'Regular Fit Slogan',
    brand: 'Nike',
    price: 1190,
    category: 'Tshirts',
    rating: 4.5,
    reviewCount: 128,
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=80',
    colors: ['#1A1A1A', '#808080', '#FFFFFF'],
    sizes: ['S', 'M', 'L', 'XL'],
    description:
      'The name says it all, the right size slightly snugs the body leaving enough room for comfort in the sleeves and waist.',
    details: ['Peach White', 'Fleece Texture', 'Great Print to the Front', 'Half Sleeves', 'Ribbed Cuffs and Hem'],
    materialAndFit: ['Regular Fit', '100% Cotton', 'Machine Wash'],
    isNewProduct: true,
  },
  {
    name: 'Regular Fit Polo',
    brand: 'Puma',
    price: 1100,
    originalPrice: 1300,
    category: 'Tshirts',
    rating: 4.2,
    reviewCount: 86,
    image: 'https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=600&q=80',
    colors: ['#1A1A1A', '#4A7C6F'],
    sizes: ['S', 'M', 'L', 'XL'],
    description: 'Classic polo with a soft cotton blend and clean collar finish.',
  },
  {
    name: 'Regular Fit Black',
    brand: 'Adidas',
    price: 1690,
    category: 'Tshirts',
    rating: 4.8,
    reviewCount: 210,
    image: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=600&q=80',
    colors: ['#1A1A1A'],
    sizes: ['S', 'M', 'L', 'XL'],
    description: 'Minimal black tee built for everyday layering.',
    isNewProduct: true,
  },
  {
    name: 'Regular Fit V-Neck',
    brand: 'H&M',
    price: 1290,
    category: 'Tshirts',
    rating: 4.0,
    reviewCount: 54,
    image: 'https://images.unsplash.com/photo-1562157873-818bc0726f68?w=600&q=80',
    colors: ['#E6E6E6', '#1A1A1A'],
    sizes: ['S', 'M', 'L'],
    description: 'Soft v-neck cut with a relaxed everyday silhouette.',
  },
  {
    name: 'Slim Fit Jeans',
    brand: "Levi's",
    price: 2490,
    category: 'Jeans',
    rating: 4.6,
    reviewCount: 172,
    image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=600&q=80',
    colors: ['#1A1A1A', '#3B5998'],
    sizes: ['28', '30', '32', '34'],
    description: 'Stretch denim with a modern slim taper.',
  },
  {
    name: 'Running Sneakers',
    brand: 'Nike',
    price: 4590,
    category: 'Shoes',
    rating: 4.7,
    reviewCount: 301,
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80',
    colors: ['#ED1010', '#1A1A1A'],
    sizes: ['7', '8', '9', '10', '11'],
    description: 'Lightweight runners with responsive cushioning.',
    isNewProduct: true,
  },
  {
    name: 'Oversized Hoodie',
    brand: 'Supreme',
    price: 3290,
    category: 'Hoodie',
    rating: 4.4,
    reviewCount: 95,
    image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=600&q=80',
    colors: ['#808080', '#1A1A1A'],
    sizes: ['M', 'L', 'XL'],
    description: 'Heavyweight fleece hoodie with an oversized drop shoulder.',
  },
  {
    name: 'Leather Cap',
    brand: 'New Era',
    price: 890,
    category: 'Accessories',
    rating: 4.1,
    reviewCount: 40,
    image: 'https://images.unsplash.com/photo-1588850561407-ed78cbaac84d?w=600&q=80',
    colors: ['#1A1A1A', '#8B4513'],
    sizes: ['One Size'],
    description: 'Structured cap with adjustable strap and soft brim.',
  },
];

/** Matches product/[id].tsx REVIEWS mock */
const seedReviewsForFirst = [
  {
    name: 'Alex M.',
    rating: 5,
    dateLabel: '2 days ago',
    text: 'Great quality fabric and the fit is exactly as described. Will buy again.',
  },
  {
    name: 'Sam K.',
    rating: 4,
    dateLabel: '1 week ago',
    text: 'Nice everyday piece. Shipping was fast and packaging was clean.',
  },
];

async function seed() {
  await connectDB();
  await Review.deleteMany({});
  await Product.deleteMany({});

  const withStock = products.map((product) => ({
    ...product,
    sizeStock: product.sizes.map((size) => ({ size, stock: 25 })),
  }));

  const created = await Product.insertMany(withStock);
  console.log(`Seeded ${created.length} products`);

  const first = created[0];
  await Review.insertMany(
    seedReviewsForFirst.map((r) => ({
      ...r,
      product: first._id,
    })),
  );
  console.log(`Seeded ${seedReviewsForFirst.length} reviews for ${first.name}`);

  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
