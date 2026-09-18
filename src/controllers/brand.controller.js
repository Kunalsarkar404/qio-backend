const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const Brand = require('../models/Brand');

/**
 * GET /brands
 * List all active brands
 */
const listBrands = asyncHandler(async (req, res) => {
  const brands = await Brand.find({ isActive: true }).sort({ name: 1 });

  return res
    .status(200)
    .json(new ApiResponse(200, { brands }, 'Brands fetched successfully'));
});

/**
 * GET /brands/:id
 * Get single brand
 */
const getBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.findById(req.params.id);

  if (!brand) {
    throw new ApiError(404, 'Brand not found');
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { brand }, 'Brand fetched successfully'));
});

module.exports = {
  listBrands,
  getBrand,
};
